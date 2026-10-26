-- 已有项目仅运行本升级一次；可重跑，不清空照片、账号或日记。
begin;
create or replace function public.diary_save(p_revision bigint, p_commit_id uuid, p_state jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r text := public.diary_role(); other_role text;
  h public.diary_house; x jsonb; old_x jsonb; item jsonb; ref text;
  old_user jsonb; new_user jsonb; old_set jsonb; new_set jsonb;
  author text; kind text; k text; allowed text[];
begin
  if r is null then raise exception 'DIARY_FORBIDDEN: 这个账号不在两人名单中'; end if;
  other_role := case when r='a' then 'b' else 'a' end;
  select * into strict h from public.diary_house where id=1 for update;
  if exists(select 1 from public.diary_commits where id=p_commit_id and user_id=auth.uid()) then
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
             or x->>'type' is null or x->>'type' not in ('order','moment','reaction','wish','fulfilled','product','plan')
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
        if old_x is not null and (x-array['reaction','reactionAt','reactionBy','receivedAt','status'])<>
                                  (old_x-array['reaction','reactionAt','reactionBy','receivedAt','status']) then
          raise exception 'DIARY_FORBIDDEN: 已发送订单不能更改内容';
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
               where o.bucket_id='diary-documents' and o.name=substring(ref from 10)) then
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
               where o.bucket_id='diary-photos' and o.name=substring(ref from 9)) then
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
  update public.diary_house set body=p_state,revision=revision+1,updated_at=now() where id=1 returning * into h;
  insert into public.diary_commits(id,user_id) values(p_commit_id,auth.uid());
  delete from public.diary_commits where created_at<now()-interval '30 days';
  return jsonb_build_object('revision',h.revision,'role',r,'state',h.body);
end $$;
revoke all on function public.diary_save(bigint,uuid,jsonb) from public;
grant execute on function public.diary_save(bigint,uuid,jsonb) to authenticated;


-- 私密行程附件：不使用公开链接；仅名单中的两个账号可以读取。
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('diary-documents','diary-documents',false,20971520,array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;
create or replace function public.diary_document_in_use(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.diary_house h, jsonb_array_elements(h.body->'entries') e,
    jsonb_array_elements(coalesce(e->'attachments','[]'::jsonb)) a where a->>'ref'='document:'||p_name)
$$;
revoke all on function public.diary_document_in_use(text) from public;
grant execute on function public.diary_document_in_use(text) to authenticated;
drop policy if exists diary_document_read on storage.objects;
create policy diary_document_read on storage.objects for select to authenticated
using(bucket_id='diary-documents' and public.diary_role() is not null);
drop policy if exists diary_document_insert on storage.objects;
create policy diary_document_insert on storage.objects for insert to authenticated
with check(bucket_id='diary-documents' and public.diary_role() is not null
  and (storage.foldername(name))[1]=(select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|doc|docx)$');
drop policy if exists diary_document_delete on storage.objects;
create policy diary_document_delete on storage.objects for delete to authenticated
using(bucket_id='diary-documents' and public.diary_role() is not null
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
    where h.id=1 and e->>'id'=p_plan_id and e->>'kind'='plan';
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

commit;
