-- 在现有项目的 SQL Editor 中运行一次；可重复运行。不补发已有历史，不清空记录。
begin;
create table if not exists public.diary_mail_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true
);
create table if not exists public.diary_mail_outbox (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  entry_id text not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
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

-- 事件和收件人从实际已验证的记录、成员名单、Auth 邮箱推导；不接受浏览器指定邮箱或正文。
create or replace function public.diary_mail_enqueue(p_key text,p_entry text,p_type text,p_actor text,p_recipient text,p_body jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid; b uuid; address text;
begin
  select user_id into a from public.diary_members where slot=p_actor;
  select m.user_id,u.email into b,address from public.diary_members m join auth.users u on u.id=m.user_id where m.slot=p_recipient;
  if a is null or b is null or a=b or coalesce(address,'')='' then return; end if;
  if exists(select 1 from public.diary_mail_preferences where user_id=b and not enabled) then return; end if;
  insert into public.diary_mail_outbox(event_key,entry_id,actor_id,recipient_id,recipient_email,payload)
    values(p_key,p_entry,a,b,address,p_body||jsonb_build_object('type',p_type)) on conflict(event_key) do nothing;
end $$;
revoke all on function public.diary_mail_enqueue(text,text,text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.diary_mail_capture() returns trigger
language plpgsql security definer set search_path='' as $$
declare r text:=public.diary_role(); peer text; x jsonb; before_x jsonb; kind text; who text; payload jsonb;
begin
  -- 管理员迁移、历史导入不会触发邮件；只有两个成员的成功保存才处理。
  if r is null or new.revision=old.revision then return new; end if;
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
        perform public.diary_mail_enqueue('created:'||(x->>'id'),x->>'id',kind,r,peer,payload);
      end if;
    elsif before_x is not null then
      if kind='order' and before_x->>'shippedAt' is null and x->>'shippedAt' is not null
         and x->>'recipient'=r and x->>'shippedBy'=r and x->>'status'='shipped' then
        perform public.diary_mail_enqueue('shipped:'||(x->>'id'),x->>'id','shipment',r,peer,payload);
      end if;
      if kind='plan' and (x-array['reaction','status','linkedId']) is distinct from (before_x-array['reaction','status','linkedId']) then
        perform public.diary_mail_enqueue('plan:'||(x->>'id')||':'||new.revision,x->>'id','plan-update',r,peer,payload);
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
      exists(select 1 from public.diary_mail_preferences p where p.user_id=q.recipient_id and not p.enabled)
      or not exists(select 1 from auth.users u where u.id=q.recipient_id and u.email=q.recipient_email)
      or not exists(select 1 from public.diary_members where user_id=q.recipient_id)
      or not exists(select 1 from public.diary_members where user_id=q.actor_id));
  update public.diary_mail_outbox set status='failed',lease=null,locked_until=null,last_error='retry_limit'
    where status in ('pending','processing') and attempts>=8 and coalesce(locked_until,now())<=now();
  -- 两人合计最多每滚动 24 小时 100 封；超出时暂缓，而不是拖慢日记保存。
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
      and not exists(select 1 from public.diary_mail_preferences p where p.user_id=q.recipient_id and not p.enabled)
      and exists(select 1 from auth.users u join public.diary_members m on m.user_id=u.id where u.id=q.recipient_id and u.email=q.recipient_email)
      and exists(select 1 from public.diary_members where user_id=q.actor_id);
  get diagnostics matched=row_count;
  return matched=1;
end $$;
revoke all on function public.diary_mail_smtp_begin(uuid,uuid) from public,anon,authenticated;
grant execute on function public.diary_mail_smtp_begin(uuid,uuid) to service_role;

-- 固定成员B（b）作为发件人。邮箱只能从两人绑定表对应的 Auth 账号读取。
create or replace function public.diary_mail_context() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('sender_slot','b',
    'sender_email',(select lower(u.email) from public.diary_members m join auth.users u on u.id=m.user_id where m.slot='b'),
    'allowed_emails',(select coalesce(jsonb_agg(lower(u.email) order by m.slot),'[]'::jsonb)
      from public.diary_members m join auth.users u on u.id=m.user_id))
$$;
revoke all on function public.diary_mail_context() from public,anon,authenticated;
grant execute on function public.diary_mail_context() to service_role;
commit;
