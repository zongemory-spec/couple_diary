begin;
-- Multi-couple edition. Run in a NEW Supabase project, then configure Auth email confirmation.
-- Re-running this file preserves data. Legacy singleton databases require export and a new project.
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='diary_house' and column_name='id' and data_type<>'uuid') then
  raise exception 'Legacy database detected: export your diary and use a new Supabase project; no data was changed';
 end if;
end $$;
create table if not exists public.diary_house(
 id uuid primary key default gen_random_uuid(),revision bigint not null default 0,
 body jsonb not null,updated_at timestamptz not null default now());
create table if not exists public.diary_members(
 user_id uuid primary key references auth.users(id) on delete cascade,
 slot text not null check(slot in ('a','b')),
 couple_id uuid not null references public.diary_house(id) on delete cascade,
 unique(couple_id,slot));
create table if not exists public.diary_commits(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 couple_id uuid not null references public.diary_house(id) on delete cascade,created_at timestamptz not null default now());
create table if not exists public.diary_invites(
 id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.diary_house(id) on delete cascade,
 target_email text not null,token_hash text not null unique,created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',revoked_at timestamptz,accepted_by uuid references auth.users(id),accepted_at timestamptz);
create index if not exists diary_invites_room on public.diary_invites(couple_id,created_at);
alter table public.diary_house enable row level security;
alter table public.diary_members enable row level security;
alter table public.diary_commits enable row level security;
alter table public.diary_invites enable row level security;
revoke all on public.diary_house,public.diary_members,public.diary_commits,public.diary_invites from public,anon,authenticated;
create or replace function public.diary_role() returns text language sql stable security definer set search_path='' as $$
 select slot from public.diary_members where user_id=auth.uid() $$;
create or replace function public.diary_couple() returns uuid language sql stable security definer set search_path='' as $$
 select couple_id from public.diary_members where user_id=auth.uid() $$;
create or replace function public.diary_bound() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select (body->>'bound')::boolean from public.diary_house where id=public.diary_couple()),false) $$;
create or replace function public.diary_object_allowed(p_name text) returns boolean language sql stable security definer set search_path='' as $$
 select public.diary_bound() and exists(select 1 from public.diary_members where user_id::text=split_part(p_name,'/',1) and couple_id=public.diary_couple()) $$;
create or replace function public.diary_verified_email() returns text language plpgsql stable security definer set search_path='' as $$
declare v text;
begin
 select lower(email) into v from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v is null then raise exception 'DIARY_INVALID: 请先到邮箱确认注册，再登录'; end if;
 return v;
end $$;
create or replace function public.diary_check_profile(p_name text,p_partner text,p_since date) returns void language plpgsql stable set search_path='' as $$
begin
 if p_name is null or p_partner is null or length(trim(p_name)) not between 1 and 20 or length(trim(p_partner)) not between 1 and 20
 or p_since is null or p_since<'1900-01-01'::date or p_since>(now() at time zone 'UTC')::date+1 then raise exception 'DIARY_INVALID: 请填写两人称呼和有效的相恋日期'; end if;
end $$;
create or replace function public.diary_read(p_revision bigint default -1) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.diary_house; inv public.diary_invites; invitation text; r text:=public.diary_role();
begin
 perform public.diary_verified_email();
 if r is null then
  select q.payload->>'token' into invitation from public.diary_invites i join public.diary_mail_outbox q on q.invite_id=i.id
   where i.target_email=public.diary_verified_email() and i.revoked_at is null and i.accepted_at is null and i.expires_at>now()
   order by i.created_at desc limit 1;
  return jsonb_build_object('onboarding',true,'stage','create','invitation',invitation);
 end if;
 select * into strict h from public.diary_house where id=public.diary_couple();
 if not (h.body->>'bound')::boolean then
  select * into inv from public.diary_invites where couple_id=h.id and revoked_at is null and accepted_at is null and expires_at>now() order by created_at desc limit 1;
  return jsonb_build_object('onboarding',true,'stage','waiting','profile',h.body->'users','since',h.body->>'since','inviteEmail',inv.target_email,'expiresAt',inv.expires_at);
 end if;
 if p_revision=h.revision then return jsonb_build_object('revision',h.revision,'role',r,'unchanged',true); end if;
 return jsonb_build_object('revision',h.revision,'role',r,'state',h.body);
end $$;
create or replace function public.diary_create_house(p_name text,p_partner_name text,p_since date) returns jsonb language plpgsql security definer set search_path='' as $$
declare h uuid;
begin
 perform public.diary_verified_email();perform public.diary_check_profile(p_name,p_partner_name,p_since);
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 if public.diary_role() is not null then raise exception 'DIARY_INVALID: 你已经创建或加入了小屋'; end if;
 insert into public.diary_house(body) values(jsonb_build_object('version',3,'bound',false,'since',p_since,
 'users',jsonb_build_array(jsonb_build_object('id','a','name',trim(p_name)),jsonb_build_object('id','b','name',trim(p_partner_name),'city','')),
 'entries','[]'::jsonb,'products','[]'::jsonb,'notifications','[]'::jsonb)) returning id into h;
 insert into public.diary_members(user_id,slot,couple_id) values(auth.uid(),'a',h);
 return public.diary_read(-1);
end $$;
create or replace function public.diary_save(p_revision bigint, p_commit_id uuid, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r text := public.diary_role(); other_role text;
  h public.diary_house; x jsonb; old_x jsonb; item jsonb; ref text;
  old_user jsonb; new_user jsonb; old_set jsonb; new_set jsonb;
  author text; kind text; k text; allowed text[];
begin
  if r is null then raise exception 'DIARY_FORBIDDEN: 这个账号不在两人名单中'; end if;
  if not public.diary_bound() then raise exception 'DIARY_INVALID: 请先完成两人绑定'; end if;
  other_role := case when r='a' then 'b' else 'a' end;
  select * into strict h from public.diary_house where id=public.diary_couple() for update;
  if exists(select 1 from public.diary_commits where id=p_commit_id and user_id=auth.uid() and couple_id=h.id) then
    return jsonb_build_object('revision',h.revision,'role',r,'state',h.body);
  end if;
  if p_revision is distinct from h.revision then
    return jsonb_build_object('conflict',true,'revision',h.revision,'role',r,'state',h.body);
  end if;
  if p_commit_id is null or p_state is null or jsonb_typeof(p_state)<>'object'
     or octet_length(p_state::text)>2097152 then
    raise exception 'DIARY_INVALID: 内容过大或格式不正确';
  end if;
  if (p_state - array['users','entries','products','notifications','since']) <>
     (h.body - array['users','entries','products','notifications','since']) then
    raise exception 'DIARY_INVALID: 不允许改变小屋身份或结构';
  end if;
  if jsonb_typeof(p_state->'users') is distinct from 'array' or jsonb_array_length(p_state->'users')<>2
     or jsonb_typeof(p_state->'entries') is distinct from 'array'
     or jsonb_typeof(p_state->'products') is distinct from 'array'
     or jsonb_typeof(p_state->'notifications') is distinct from 'array' then
    raise exception 'DIARY_INVALID: 记录格式不正确';
  end if;
  if jsonb_array_length(p_state->'entries')>5000 or jsonb_array_length(p_state->'products')>200
     or jsonb_array_length(p_state->'notifications')>2000 then
    raise exception 'DIARY_LIMIT: 请先导出归档，再整理较早的记录';
  end if;
  if coalesce(p_state->>'since','') !~ '^\d{4}-\d{2}-\d{2}$'
     or (p_state->>'since')::date > (now() at time zone 'Asia/Shanghai')::date then
    raise exception 'DIARY_INVALID: 请填写有效纪念日';
  end if;
  foreach k in array array['a','b'] loop
    select value into old_user from jsonb_array_elements(h.body->'users') where value->>'id'=k;
    select value into new_user from jsonb_array_elements(p_state->'users') where value->>'id'=k;
    if new_user is null or (new_user-array['name'])<>(old_user-array['name'])
       or (k<>r and new_user<>old_user) or length(coalesce(new_user->>'name','')) not between 1 and 20 then
      raise exception 'DIARY_FORBIDDEN: 只能修改自己的称呼';
    end if;
  end loop;
  foreach k in array array['entries','products','notifications'] loop
    new_set := p_state->k; old_set := h.body->k;
    if exists(select 1 from jsonb_array_elements(new_set) group by value->>'id' having count(*)>1) then
      raise exception 'DIARY_INVALID: 记录编号重复';
    end if;
    for x in select value from jsonb_array_elements(new_set) loop
      if jsonb_typeof(x)<>'object' or coalesce(x->>'id','') !~ '^[A-Za-z0-9_-]{1,90}$' then
        raise exception 'DIARY_INVALID: 记录编号不正确';
      end if;
      select value into old_x from jsonb_array_elements(old_set) where value->>'id'=x->>'id';
      if k='notifications' then
        if old_x is null then
          if x->>'actor' is distinct from r or x->>'recipient' is distinct from other_role
             or x->>'type' is null or x->>'type' not in ('order','moment','reaction','wish','fulfilled','product','plan','shipment')
             or length(coalesce(x->>'reaction',''))>200 or length(coalesce(x->>'mood',''))>20
         or length(coalesce(x->>'category',''))>20 then
            raise exception 'DIARY_INVALID: 提示信息不正确';
          end if;
        elsif x<>old_x and (old_x->>'recipient'<>r or (x-'dismissed')<>(old_x-'dismissed')) then
          raise exception 'DIARY_FORBIDDEN: 只能收起自己的提示';
        end if;
        continue;
      end if;
      if k='products' then
        if old_x is null and x->>'author' is distinct from r then
          raise exception 'DIARY_FORBIDDEN: 不能冒用另一半发布商品';
        end if;
        if old_x is not null and (x-array['name','note','icon','category','amount','url','deleted','updatedAt','editedBy'])<>
                                  (old_x-array['name','note','icon','category','amount','url','deleted','updatedAt','editedBy']) then
          raise exception 'DIARY_FORBIDDEN: 不能更改商品的创建归属';
        end if;
        if old_x is not null and x<>old_x and x->>'editedBy' is distinct from r then
          raise exception 'DIARY_FORBIDDEN: 请记录这次商品修改的成员';
        end if;
        if length(coalesce(x->>'name','')) not between 1 and 60
           or length(coalesce(x->>'note',''))>200 or length(coalesce(x->>'icon',''))>16
           or length(coalesce(x->>'category','')) not between 1 and 20
           or (x ? 'amount' and x->'amount'<>'null'::jsonb and
                (jsonb_typeof(x->'amount')<>'number' or (x->>'amount')::numeric<0 or (x->>'amount')::numeric>10000000))
           or (x ? 'deleted' and jsonb_typeof(x->'deleted')<>'boolean') then
          raise exception 'DIARY_INVALID: 商品内容或参考金额不正确';
        end if;
        if coalesce(x->>'url','')<>'' and (length(x->>'url')>2048 or x->>'url' !~* '^https?://[^[:space:]]+$' or x->>'url' ~ '[<>]') then
          raise exception 'DIARY_INVALID: 商品链接需使用有效的 http 或 https 地址';
        end if;
        continue;
      end if;
      author := x->>'author'; kind := x->>'kind';
      if kind is null or kind not in ('order','memory','plan','wish','moment')
         or author is null or author not in ('a','b')
         or length(coalesce(x->>'title','')) not between 1 and 800
         or length(coalesce(x->>'content',''))>2000 or length(coalesce(x->>'place',''))>80
         or length(coalesce(x->>'reaction',''))>200 or length(coalesce(x->>'mood',''))>20
         or length(coalesce(x->>'category',''))>20 then
        raise exception 'DIARY_INVALID: 记录内容不正确';
      end if;
      if old_x is null and author<>r then raise exception 'DIARY_FORBIDDEN: 不能代替他发表记录'; end if;
      if old_x is not null and (x->'author' is distinct from old_x->'author'
         or x->'kind' is distinct from old_x->'kind' or x->'createdAt' is distinct from old_x->'createdAt') then
        raise exception 'DIARY_FORBIDDEN: 不允许修改记录归属';
      end if;
      if old_x is not null and author<>r and kind<>'plan' and x<>old_x then
        allowed := array['linkedId','status'];
        if kind in ('order','moment') then allowed := allowed || array['reaction','reactionAt','reactionBy','receivedAt']; end if;
        if kind='order' then allowed := allowed || array['shippedAt','shippedBy']; end if;
        if kind='wish' and x->>'wishType'='physical' then allowed := allowed || array['fulfilledBy','fulfilledAt']; end if;
        if (x-allowed)<>(old_x-allowed)
           or (x ? 'reactionBy' and x->>'reactionBy' is distinct from r)
           or (x ? 'fulfilledBy' and x->>'fulfilledBy' is distinct from r) then
          raise exception 'DIARY_FORBIDDEN: 不能改写他的记录，只能回应或实现心愿';
        end if;
      end if;
      if kind='order' then
        if x->>'recipient' is distinct from (case when author='a' then 'b' else 'a' end)
           or coalesce((x->>'total')::numeric,-1)<>0 or jsonb_typeof(x->'items') is distinct from 'array'
           or jsonb_array_length(x->'items') not between 1 and 30 then
          raise exception 'DIARY_INVALID: 订单必须是两人之间的零元心意';
        end if;
        for item in select value from jsonb_array_elements(x->'items') loop
          if coalesce((item->>'quantity')::integer,0) not between 1 and 9
             or coalesce((item->>'price')::numeric,-1)<>0 then
            raise exception 'DIARY_INVALID: 商品数量或价格不正确';
          end if;
        end loop;
        if old_x is not null and (x-array['reaction','reactionAt','reactionBy','receivedAt','status','shippedAt','shippedBy'])<>
                                  (old_x-array['reaction','reactionAt','reactionBy','receivedAt','status','shippedAt','shippedBy']) then
          raise exception 'DIARY_FORBIDDEN: 已发送订单不能更改内容';
        end if;
        -- Only the order recipient can mark the first shipment; it cannot be undone or restamped.
        if old_x is null then
          if x ? 'shippedAt' or x ? 'shippedBy' or x->>'status'='shipped' then
            raise exception 'DIARY_FORBIDDEN: 新订单不能直接标记发货';
          end if;
        else
          if x->'shippedAt' is distinct from old_x->'shippedAt' or x->'shippedBy' is distinct from old_x->'shippedBy' then
            if old_x ? 'shippedAt' or r is distinct from old_x->>'recipient'
               or x->>'shippedBy' is distinct from r or x->>'status' is distinct from 'shipped'
               or jsonb_typeof(x->'shippedAt') is distinct from 'number'
               or coalesce((x->>'shippedAt')::numeric,0)<=0
               or (x->>'shippedAt')::numeric>extract(epoch from now())*1000+300000 then
              raise exception 'DIARY_FORBIDDEN: 只有接单方可以确认发货，已发货记录不能改写';
            end if;
          end if;
          if (x->>'status'='shipped' and not (x ? 'shippedAt'))
             or (old_x ? 'shippedAt' and x->>'status' is distinct from 'shipped') then
            raise exception 'DIARY_INVALID: 请保留正确的发货状态';
          end if;
        end if;
      end if;
      if kind in ('memory','plan') then
        if coalesce(x->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'DIARY_INVALID: 请选择日期'; end if;
        if kind='memory' and (x->>'date')::date>(now() at time zone 'Asia/Shanghai')::date then
          raise exception 'DIARY_INVALID: 回忆不能使用未来日期';
        end if;
      end if;
      if kind='plan' and (coalesce(x->>'endDate',x->>'date') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(x->>'endDate',x->>'date')::date<(x->>'date')::date) then
        raise exception 'DIARY_INVALID: 结束日期不能早于开始日期';
      end if;
      if x ? 'attachments' then
        if jsonb_typeof(x->'attachments') is distinct from 'array' or jsonb_array_length(x->'attachments')>4
           or (kind not in ('plan','memory') and jsonb_array_length(x->'attachments')>0) then
          raise exception 'DIARY_INVALID: 见面计划或回忆最多保存4份附件';
        end if;
        for item in select value from jsonb_array_elements(x->'attachments') loop
          ref:=item->>'ref';
          if jsonb_typeof(item) is distinct from 'object' or ref is null
             or ref !~ '^document:[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|doc|docx)$'
             or length(coalesce(item->>'name','')) not between 1 and 160
             or item->>'name' ~ '[[:cntrl:]/\\]'
             or jsonb_typeof(item->'size') is distinct from 'number'
             or coalesce((item->>'size')::numeric,0) not between 1 and 20971520
             or coalesce(item->>'type','') is distinct from (case when ref like '%.pdf' then 'application/pdf' when ref like '%.doc' then 'application/msword' else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' end)
             or not exists(select 1 from storage.objects o join public.diary_members m on m.user_id::text=split_part(o.name,'/',1)
               where m.couple_id=h.id and o.bucket_id='diary-documents' and o.name=substring(ref from 10)) then
            raise exception 'DIARY_INVALID: 附件不属于这个小屋、格式不正确或未上传完成';
          end if;
        end loop;
      end if;
      if x ? 'budget' and ((x->>'budget')::numeric<0 or (x->>'budget')::numeric>10000000) then
        raise exception 'DIARY_INVALID: 预算不正确';
      end if;
      if x ? 'photos' then
        if jsonb_typeof(x->'photos') is distinct from 'array' or jsonb_array_length(x->'photos')>6 then
          raise exception 'DIARY_INVALID: 每条记录最多六张照片';
        end if;
        for ref in select jsonb_array_elements_text(x->'photos') loop
          if ref !~ '^storage:[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
             or not exists(select 1 from storage.objects o join public.diary_members m on m.user_id::text=split_part(o.name,'/',1)
               where m.couple_id=h.id and o.bucket_id='diary-photos' and o.name=substring(ref from 9)) then
            raise exception 'DIARY_INVALID: 照片不属于这个小屋或未上传完成';
          end if;
        end loop;
      end if;
    end loop;
    for old_x in select value from jsonb_array_elements(old_set) loop
      if not exists(select 1 from jsonb_array_elements(new_set) where value->>'id'=old_x->>'id') then
        if k='products' or (k='entries' and old_x->>'author'<>r and not (
             old_x->>'kind'='wish' and exists(select 1 from jsonb_array_elements(p_state->'entries') m
               where m->>'kind'='memory' and m->>'author'=r and m->>'fulfilledBy'=r
                 and m->>'sourceWishId'=old_x->>'id' and m->>'wishAuthor'=old_x->>'author'
                 and m->>'title'=old_x->>'title'
                 and coalesce(m->>'content','')=coalesce(old_x->>'content','')
                 and coalesce(m->>'place','')=coalesce(old_x->>'place','')
                 and coalesce(m->'photos','[]'::jsonb)=coalesce(old_x->'photos','[]'::jsonb))
           ))
           or (k='notifications' and (old_x->>'recipient'<>r or coalesce((old_x->>'expiresAt')::numeric,0)>extract(epoch from now())*1000)) then
          raise exception 'DIARY_FORBIDDEN: 不能删除他的记录或未过期提示';
        end if;
      end if;
    end loop;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_state->'entries') e
    where e->>'kind'='memory' and coalesce(e->>'sourceWishId','')<>''
    group by e->>'sourceWishId' having count(*)>1) then
    raise exception 'DIARY_INVALID: 一个心愿只能归档一次';
  end if;
  if exists(select 1 from jsonb_array_elements(p_state->'entries') e
    where e->>'kind'='memory' and coalesce(e->>'sourcePlanId','')<>''
    group by e->>'sourcePlanId' having count(*)>1) then
    raise exception 'DIARY_INVALID: 一次见面只能归档一次';
  end if;
  update public.diary_house set body=p_state,revision=revision+1,updated_at=now() where id=public.diary_couple() returning * into h;
  insert into public.diary_commits(id,user_id,couple_id) values(p_commit_id,auth.uid(),h.id);
  delete from public.diary_commits where created_at<now()-interval '30 days';
  return jsonb_build_object('revision',h.revision,'role',r,'state',h.body);
end $$;
revoke all on function public.diary_save(bigint,uuid,jsonb) from public;
grant execute on function public.diary_save(bigint,uuid,jsonb) to authenticated;


insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('diary-photos','diary-photos',false,2097152,array['image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=2097152,allowed_mime_types=array['image/jpeg'];

create or replace function public.diary_photo_in_use(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.diary_house h, jsonb_array_elements(h.body->'entries') e,
    jsonb_array_elements_text(coalesce(e->'photos','[]'::jsonb)) p where h.id=public.diary_couple() and p='storage:'||p_name)
$$;
revoke all on function public.diary_photo_in_use(text) from public;
grant execute on function public.diary_photo_in_use(text) to authenticated;
drop policy if exists diary_private_read on storage.objects;
create policy diary_private_read on storage.objects for select to authenticated
using (bucket_id='diary-photos' and public.diary_object_allowed(name));
drop policy if exists diary_private_insert on storage.objects;
create policy diary_private_insert on storage.objects for insert to authenticated
with check (bucket_id='diary-photos' and public.diary_bound()
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$');
drop policy if exists diary_private_delete on storage.objects;
create policy diary_private_delete on storage.objects for delete to authenticated
using (bucket_id='diary-photos' and public.diary_bound()
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and not public.diary_photo_in_use(name));
-- 不授予覆盖文件的 UPDATE 权限。照片链接只在登录后短时签发。

-- 私密行程附件：不使用公开链接；仅名单中的两个账号可以读取。
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('diary-documents','diary-documents',false,20971520,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.diary_document_in_use(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.diary_house h, jsonb_array_elements(h.body->'entries') e,
    jsonb_array_elements(coalesce(e->'attachments','[]'::jsonb)) a where h.id=public.diary_couple() and a->>'ref'='document:'||p_name)
$$;
revoke all on function public.diary_document_in_use(text) from public;
grant execute on function public.diary_document_in_use(text) to authenticated;
drop policy if exists diary_document_read on storage.objects;
create policy diary_document_read on storage.objects for select to authenticated
using(bucket_id='diary-documents' and public.diary_object_allowed(name));
drop policy if exists diary_document_insert on storage.objects;
create policy diary_document_insert on storage.objects for insert to authenticated
with check(bucket_id='diary-documents' and public.diary_bound()
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|doc|docx)$');
drop policy if exists diary_document_delete on storage.objects;
create policy diary_document_delete on storage.objects for delete to authenticated
using(bucket_id='diary-documents' and public.diary_bound()
  and (storage.foldername(name))[1]=(select auth.uid())::text and not public.diary_document_in_use(name));
-- 一次性提醒按观看账号记录，不改计划正文，也不会触发“更新计划”的邮件。
create table if not exists public.diary_meeting_receipts(
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null, event text not null check(event in ('celebrate','acknowledge')),
  created_at timestamptz not null default now(),primary key(user_id,plan_id,event)
);
alter table public.diary_meeting_receipts enable row level security;
revoke all on public.diary_meeting_receipts from public,anon,authenticated;
create or replace function public.diary_meeting_marks() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if public.diary_role() is null then raise exception 'DIARY_FORBIDDEN'; end if;
  return jsonb_build_object(
    'celebrated',coalesce((select jsonb_agg(plan_id) from public.diary_meeting_receipts where user_id=auth.uid() and event='celebrate'),'[]'::jsonb),
    'acknowledged',coalesce((select jsonb_agg(plan_id) from public.diary_meeting_receipts where user_id=auth.uid() and event='acknowledge'),'[]'::jsonb));
end $$;
create or replace function public.diary_meeting_seen(p_plan_id text,p_event text,p_today date) returns boolean
language plpgsql security definer set search_path='' as $$
declare p jsonb; n integer;
begin
  if public.diary_role() is null then raise exception 'DIARY_FORBIDDEN'; end if;
  -- Allow device local dates across timezones, not arbitrary client dates.
  if p_today is null or abs(p_today-(now() at time zone 'UTC')::date)>1 then raise exception 'DIARY_INVALID: 日期不正确'; end if;
  select e into p from public.diary_house h,jsonb_array_elements(h.body->'entries') e
    where h.id=public.diary_couple() and e->>'id'=p_plan_id and e->>'kind'='plan';
  if p is null or coalesce(p->>'linkedId','')<>'' then raise exception 'DIARY_INVALID: 这次见面已经更新'; end if;
  if p_event='celebrate' then
    if (p->>'date')::date<>p_today then return false; end if;
  elsif p_event='acknowledge' then
    if coalesce(p->>'endDate',p->>'date')::date>=p_today then return false; end if;
  else raise exception 'DIARY_INVALID: 提醒类型不正确'; end if;
  insert into public.diary_meeting_receipts(user_id,plan_id,event) values(auth.uid(),p_plan_id,p_event) on conflict do nothing;
  get diagnostics n=row_count;return n=1;
end $$;
revoke all on function public.diary_meeting_marks() from public;
revoke all on function public.diary_meeting_seen(text,text,date) from public;
grant execute on function public.diary_meeting_marks() to authenticated;
grant execute on function public.diary_meeting_seen(text,text,date) to authenticated;


-- 在现有项目的 SQL Editor 中运行一次；可重复运行。不补发已有历史，不清空记录。
create table if not exists public.diary_mail_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true
);
create table if not exists public.diary_mail_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  couple_id uuid not null references public.diary_house(id) on delete cascade,
  invite_id uuid references public.diary_invites(id) on delete cascade,
  entry_id text not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid references auth.users(id) on delete cascade,
  recipient_email text not null,
  payload jsonb not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease uuid,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  last_error text,
  check(actor_id<>recipient_id)
);
alter table public.diary_mail_outbox drop constraint if exists diary_mail_outbox_status_check;
alter table public.diary_mail_outbox add constraint diary_mail_outbox_status_check
  check(status in ('pending','processing','sending','sent','skipped','failed','expired','uncertain'));
create index if not exists diary_mail_due on public.diary_mail_outbox(status,available_at);
alter table public.diary_mail_preferences enable row level security;
alter table public.diary_mail_outbox enable row level security;
revoke all on public.diary_mail_preferences,public.diary_mail_outbox from public,anon,authenticated;

create or replace function public.diary_mail_preference(p_enabled boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r text:=public.diary_role(); v boolean;
begin
  if r is null then raise exception 'DIARY_FORBIDDEN: 这个账号不在两人名单中'; end if;
  insert into public.diary_mail_preferences(user_id,enabled) values(auth.uid(),coalesce(p_enabled,true))
    on conflict(user_id) do update set enabled=coalesce(p_enabled,diary_mail_preferences.enabled)
    returning enabled into v;
  if not v then
    update public.diary_mail_outbox set status='skipped',lease=null,locked_until=null
      where recipient_id=auth.uid() and status in ('pending','processing');
  end if;
  return jsonb_build_object('enabled',v);
end $$;
revoke all on function public.diary_mail_preference(boolean) from public;
grant execute on function public.diary_mail_preference(boolean) to authenticated;

create or replace function public.diary_mail_valid(q public.diary_mail_outbox) returns boolean language sql stable security definer set search_path='' as $$
 select case when q.invite_id is not null then exists(select 1 from public.diary_invites i where i.id=q.invite_id and i.couple_id=q.couple_id and i.target_email=q.recipient_email and i.revoked_at is null and i.accepted_at is null and i.expires_at>now())
 else exists(select 1 from public.diary_members a join public.diary_members b on a.couple_id=b.couple_id join auth.users u on u.id=b.user_id
 where a.user_id=q.actor_id and b.user_id=q.recipient_id and a.couple_id=q.couple_id and lower(u.email)=q.recipient_email and u.email_confirmed_at is not null)
 and not exists(select 1 from public.diary_mail_preferences p where p.user_id=q.recipient_id and not p.enabled) end $$;
revoke all on function public.diary_mail_valid(public.diary_mail_outbox) from public,anon,authenticated;
-- 事件和收件人从实际已验证的记录、成员名单、Auth 邮箱推导；不接受浏览器指定邮箱或正文。
create or replace function public.diary_mail_enqueue(p_couple uuid,p_key text,p_entry text,p_type text,p_actor text,p_recipient text,p_body jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid; address text;
begin
  select user_id into a from public.diary_members where couple_id=p_couple and slot=p_actor;
  select m.user_id,u.email into b,address from public.diary_members m join auth.users u on u.id=m.user_id where m.couple_id=p_couple and m.slot=p_recipient;
  if a is null or b is null or a=b or coalesce(address,'')='' then return; end if;
  if (select count(*) from public.diary_mail_outbox where couple_id=p_couple and created_at>now()-interval '24 hours')>=50 then return; end if;
  if exists(select 1 from public.diary_mail_preferences where user_id=b and not enabled) then return; end if;
  insert into public.diary_mail_outbox(couple_id,event_key,entry_id,actor_id,recipient_id,recipient_email,payload)
    values(p_couple,p_couple::text||':'||p_key,p_entry,a,b,address,p_body||jsonb_build_object('type',p_type)) on conflict(event_key) do nothing;
end $$;
revoke all on function public.diary_mail_enqueue(uuid,text,text,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.diary_mail_capture() returns trigger
language plpgsql security definer set search_path='' as $$
declare r text:=public.diary_role(); peer text; x jsonb; before_x jsonb; kind text; who text; payload jsonb;
begin
  -- 管理员迁移、历史导入不会触发邮件；只有两个成员的成功保存才处理。
  if r is null or new.id is distinct from public.diary_couple() or new.revision=old.revision then return new; end if;
  peer:=case when r='a' then 'b' else 'a' end;
  select left(coalesce(value->>'name',case when r='a' then '我' else '你' end),20)
    into who from jsonb_array_elements(new.body->'users') where value->>'id'=r;
  for x in select value from jsonb_array_elements(new.body->'entries') loop
    select value into before_x from jsonb_array_elements(old.body->'entries') where value->>'id'=x->>'id';
    kind:=x->>'kind';
    payload:=jsonb_build_object('actor',who,'mood',left(coalesce(x->>'mood',''),20));
    if before_x is null and x->>'author'=r and kind in ('order','moment','memory','wish','plan') then
      -- 实物订单已提醒，不为同一单自动生成的每个实物心愿重复发信。
      if not(kind='wish' and x ? 'orderId') then
        perform public.diary_mail_enqueue(new.id,'created:'||(x->>'id'),x->>'id',kind,r,peer,payload);
      end if;
    elsif before_x is not null then
      if kind='order' and before_x->>'shippedAt' is null and x->>'shippedAt' is not null
         and x->>'recipient'=r and x->>'shippedBy'=r and x->>'status'='shipped' then
        perform public.diary_mail_enqueue(new.id,'shipped:'||(x->>'id'),x->>'id','shipment',r,peer,payload);
      end if;
      if kind='plan' and (x-array['reaction','status','linkedId']) is distinct from (before_x-array['reaction','status','linkedId']) then
        perform public.diary_mail_enqueue(new.id,'plan:'||(x->>'id')||':'||new.revision,x->>'id','plan-update',r,peer,payload);
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.diary_mail_capture() from public,anon,authenticated;
drop trigger if exists diary_mail_after_save on public.diary_house;
create trigger diary_mail_after_save after update of body on public.diary_house
  for each row execute function public.diary_mail_capture();

-- 只有服务器 service_role 能领取和确认。租约防止同时运行的任务重复处理。
create or replace function public.diary_mail_claim(p_limit integer default 5) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; room integer;
begin
  perform pg_advisory_xact_lock(5202026);
  -- SMTP 不提供平台幂等。已开始提交但无法确认的任务不再自动重发。
  update public.diary_mail_outbox set status='uncertain',last_error='smtp_unconfirmed',lease=null,locked_until=null
    where status='sending' and locked_until<=now();
  update public.diary_mail_outbox set status='expired',lease=null,locked_until=null
    where status in ('pending','processing') and created_at<now()-interval '23 hours';
  update public.diary_mail_outbox q set status='skipped',lease=null,locked_until=null
    where q.status in ('pending','processing') and (
      not public.diary_mail_valid(q));
  update public.diary_mail_outbox set status='failed',lease=null,locked_until=null,last_error='retry_limit'
    where status in ('pending','processing') and attempts>=8 and coalesce(locked_until,now())<=now();
  -- 全站合计最多每滚动 24 小时 100 封；超出时暂缓，而不是拖慢日记保存。
  select greatest(0,100-count(*)::integer) into room from public.diary_mail_outbox
    where sent_at>now()-interval '24 hours' or (status in ('processing','sending') and locked_until>now())
      or (status='uncertain' and created_at>now()-interval '24 hours');
  with due as (
    select id from public.diary_mail_outbox
    where attempts<8 and available_at<=now()
      and (status='pending' or (status='processing' and locked_until<=now()))
    order by created_at,id limit least(greatest(coalesce(p_limit,5),1),5,room) for update skip locked
  ), claimed as (
    update public.diary_mail_outbox q set status='processing',attempts=attempts+1,
      lease=gen_random_uuid(),locked_until=now()+interval '3 minutes'
    from due where q.id=due.id
    returning q.id,q.lease,q.recipient_email,q.payload,q.attempts
  ) select coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) into result from claimed;
  return result;
end $$;
revoke all on function public.diary_mail_claim(integer) from public,anon,authenticated;
grant execute on function public.diary_mail_claim(integer) to service_role;

create or replace function public.diary_mail_finish(p_id uuid,p_lease uuid,p_result text,p_provider_id text default null,p_error text default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare matched integer;
begin
  if p_result not in ('sent','retry','failed','uncertain') then raise exception 'Invalid mail result'; end if;
  update public.diary_mail_outbox set
    status=case when p_result='sent' then 'sent' when p_result='uncertain' then 'uncertain' when p_result='failed' or attempts>=8 then 'failed' else 'pending' end,
    sent_at=case when p_result='sent' then now() else null end,
    provider_id=left(p_provider_id,200),last_error=left(p_error,80),lease=null,locked_until=null,
    available_at=now()+make_interval(secs=>least(3600,(60*power(2,greatest(attempts-1,0)))::integer))
    where id=p_id and lease=p_lease and status in ('processing','sending');
  get diagnostics matched=row_count;
  return matched=1;
end $$;
revoke all on function public.diary_mail_finish(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.diary_mail_finish(uuid,uuid,text,text,text) to service_role;

create or replace function public.diary_mail_smtp_begin(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare matched integer;
begin
  update public.diary_mail_outbox q set status='sending'
    where q.id=p_id and q.lease=p_lease and q.status='processing' and q.locked_until>now()
      and public.diary_mail_valid(q);
  get diagnostics matched=row_count;
  return matched=1;
end $$;
revoke all on function public.diary_mail_smtp_begin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.diary_mail_smtp_begin(uuid,uuid) to service_role;


-- Invites are targeted, expiring, one-use capabilities; the confirmed Auth email is authoritative.
create or replace function public.diary_invite_create(p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare h public.diary_house; token text; iid uuid; email text:=lower(trim(p_email));
begin
 if email=public.diary_verified_email() or email is null or length(email)>254 or email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'DIARY_INVALID: 请填写另一半的有效邮箱'; end if;
 select * into h from public.diary_house where id=public.diary_couple() for update;
 if h.id is null or public.diary_role()<>'a' or (h.body->>'bound')::boolean then raise exception 'DIARY_INVALID: 当前小屋不能创建邀请'; end if;
 if (select count(*) from public.diary_invites where couple_id=h.id and created_at>now()-interval '24 hours')>=5 then raise exception 'DIARY_LIMIT: 每天最多创建5次邀请'; end if;
 update public.diary_invites set revoked_at=now() where couple_id=h.id and accepted_at is null and revoked_at is null;
 token:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.diary_invites(couple_id,target_email,token_hash) values(h.id,email,encode(sha256(convert_to(token,'UTF8')),'hex')) returning id into iid;
 insert into public.diary_mail_outbox(couple_id,event_key,entry_id,actor_id,recipient_email,invite_id,payload)
 values(h.id,'invite:'||iid::text,iid::text,auth.uid(),email,iid,jsonb_build_object('type','invite','token',token,'actor',h.body->'users'->0->>'name'));
 return jsonb_build_object('token',token,'email',email,'expiresInDays',7,'mailQueued',true);
end $$;
create or replace function public.diary_invite_preview(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.diary_invites; h public.diary_house;
begin
 select * into i from public.diary_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and target_email=public.diary_verified_email() and revoked_at is null and expires_at>now() and accepted_at is null;
 if i.id is null then raise exception 'DIARY_INVALID: 邀请无效、已使用、已过期或与你的邮箱不匹配'; end if;
 if public.diary_role() is not null then raise exception 'DIARY_INVALID: 你已在一个小屋中，不能加入另一个'; end if;
 select * into h from public.diary_house where id=i.couple_id;
 return jsonb_build_object('users',h.body->'users','since',h.body->>'since');
end $$;
create or replace function public.diary_invite_accept(p_token text,p_name text,p_partner_name text,p_since date) returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.diary_invites; h public.diary_house; email text;
begin
 email:=public.diary_verified_email();perform public.diary_check_profile(p_name,p_partner_name,p_since);
 -- Same lock order as invitation creation: room first, then invitation. User lock prevents two rooms claiming the same account.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select * into i from public.diary_invites where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 if i.id is null or i.target_email<>email then raise exception 'DIARY_INVALID: 邀请无效或与你的邮箱不匹配'; end if;
 select * into h from public.diary_house where id=i.couple_id for update;
 select * into i from public.diary_invites where id=i.id for update;
 if i.accepted_by=auth.uid() and public.diary_couple()=h.id then return public.diary_read(-1); end if;
 if i.revoked_at is not null or i.expires_at<=now() or i.accepted_at is not null or (h.body->>'bound')::boolean or public.diary_role() is not null then raise exception 'DIARY_INVALID: 邀请已失效或账号已绑定'; end if;
 if not exists(select 1 from public.diary_members where couple_id=h.id and slot='a') then raise exception 'DIARY_INVALID: 邀请人账号已停用'; end if;
 insert into public.diary_members(user_id,slot,couple_id) values(auth.uid(),'b',h.id);
 update public.diary_house set body=body||jsonb_build_object('bound',true,'since',p_since,'users',jsonb_build_array(jsonb_build_object('id','a','name',trim(p_partner_name)),jsonb_build_object('id','b','name',trim(p_name),'city',''))),revision=revision+1,updated_at=now() where id=h.id;
 update public.diary_invites set accepted_by=auth.uid(),accepted_at=now() where id=i.id;
 update public.diary_invites set revoked_at=now() where couple_id=h.id and id<>i.id and revoked_at is null;
 return public.diary_read(-1);
end $$;
create or replace function public.diary_invite_revoke() returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.diary_house where id=public.diary_couple() for update;
 if public.diary_role() is distinct from 'a' or public.diary_bound() then raise exception 'DIARY_FORBIDDEN'; end if;
 update public.diary_invites set revoked_at=now() where couple_id=public.diary_couple() and accepted_at is null and revoked_at is null;
 return true;
end $$;
-- Private letters are separate from diary notifications; email only contains a generic reminder.
create table if not exists public.diary_letters(id uuid primary key, couple_id uuid not null references public.diary_house(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,recipient_id uuid not null references auth.users(id) on delete cascade,
 subject text not null,body text not null,created_at timestamptz not null default now(),read_at timestamptz);
alter table public.diary_letters enable row level security;
revoke all on public.diary_letters from public,anon,authenticated;
create or replace function public.diary_letters_list() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.diary_bound() then raise exception 'DIARY_FORBIDDEN'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) from
 (select id,subject,body,created_at,read_at,sender_id=auth.uid() as sent from public.diary_letters where couple_id=public.diary_couple() and auth.uid() in(sender_id,recipient_id) order by created_at desc limit 100) q);
end $$;
create or replace function public.diary_letter_send(p_id uuid,p_subject text,p_body text) returns boolean language plpgsql security definer set search_path='' as $$
declare peer uuid; address text; n integer;
begin
 if not public.diary_bound() then raise exception 'DIARY_FORBIDDEN'; end if;
 if p_id is null or p_subject is null or length(trim(p_subject)) not between 1 and 80 or p_body is null or length(trim(p_body)) not between 1 and 10000 then raise exception 'DIARY_INVALID: 标题1–80字，正文1–10000字'; end if;
 perform 1 from public.diary_house where id=public.diary_couple() for update;
 if exists(select 1 from public.diary_letters where id=p_id and sender_id=auth.uid() and couple_id=public.diary_couple()) then return true; end if;
 if (select count(*) from public.diary_letters where sender_id=auth.uid() and created_at>now()-interval '24 hours')>=50 then raise exception 'DIARY_LIMIT: 每天最多50封信'; end if;
 select m.user_id,lower(u.email) into peer,address from public.diary_members m join auth.users u on u.id=m.user_id where m.couple_id=public.diary_couple() and m.user_id<>auth.uid();
 if peer is null then raise exception 'DIARY_INVALID: 另一半账号已停用'; end if;
 insert into public.diary_letters values(p_id,public.diary_couple(),auth.uid(),peer,trim(p_subject),p_body,now(),null);
 perform public.diary_mail_enqueue(public.diary_couple(),'letter:'||p_id::text,p_id::text,'letter',public.diary_role(),case when public.diary_role()='a' then 'b' else 'a' end,'{}');
 return true;
end $$;
create or replace function public.diary_letter_read(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.diary_letters set read_at=coalesce(read_at,now()) where id=p_id and couple_id=public.diary_couple() and recipient_id=auth.uid();
 return found;
end $$;
revoke all on function public.diary_role() from public,anon;
grant execute on function public.diary_role() to authenticated;
revoke all on function public.diary_couple() from public,anon;
grant execute on function public.diary_couple() to authenticated;
revoke all on function public.diary_bound() from public,anon;
grant execute on function public.diary_bound() to authenticated;
revoke all on function public.diary_object_allowed(text) from public,anon;
grant execute on function public.diary_object_allowed(text) to authenticated;
revoke all on function public.diary_verified_email() from public,anon;
grant execute on function public.diary_verified_email() to authenticated;
revoke all on function public.diary_read(bigint) from public,anon;
grant execute on function public.diary_read(bigint) to authenticated;
revoke all on function public.diary_create_house(text,text,date) from public,anon;
grant execute on function public.diary_create_house(text,text,date) to authenticated;
revoke all on function public.diary_invite_create(text) from public,anon;
grant execute on function public.diary_invite_create(text) to authenticated;
revoke all on function public.diary_invite_preview(text) from public,anon;
grant execute on function public.diary_invite_preview(text) to authenticated;
revoke all on function public.diary_invite_accept(text,text,text,date) from public,anon;
grant execute on function public.diary_invite_accept(text,text,text,date) to authenticated;
revoke all on function public.diary_invite_revoke() from public,anon;
grant execute on function public.diary_invite_revoke() to authenticated;
revoke all on function public.diary_letters_list() from public,anon;
grant execute on function public.diary_letters_list() to authenticated;
revoke all on function public.diary_letter_send(uuid,text,text) from public,anon;
grant execute on function public.diary_letter_send(uuid,text,text) to authenticated;
revoke all on function public.diary_letter_read(uuid) from public,anon;
grant execute on function public.diary_letter_read(uuid) to authenticated;
revoke all on function public.diary_check_profile(text,text,date) from public,anon,authenticated;

commit;
