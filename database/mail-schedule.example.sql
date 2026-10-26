-- 先部署 diary_mail Edge Function 和 03-邮件提醒.sql，再配置这里。
-- 在自己的电脑本地生成一个至少 32 字符的随机 secret，和 Edge Secrets 中完全一致。
-- 只替换下一段中的占位文本；不要把密钥发到聊天、写进网页或上传到 Cloudflare。
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$
declare v text:='替换为自己的随机DIARY_MAIL_WORKER_SECRET'; secret_id uuid;
begin
  if v like '替换%' or length(v)<32 then raise exception '请先替换随机邮件任务密钥'; end if;
  select id into secret_id from vault.secrets where name='diary_mail_worker_secret';
  if secret_id is null then perform vault.create_secret(v,'diary_mail_worker_secret');
  else perform vault.update_secret(secret_id,v,'diary_mail_worker_secret'); end if;
end $$;
select cron.schedule('diary-mail-every-minute','* * * * *',$job$
  select net.http_post(
    url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/diary_mail',
    headers:=jsonb_build_object('Content-Type','application/json','x-diary-mail-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='diary_mail_worker_secret')),
    body:='{}'::jsonb,timeout_milliseconds:=90000
  ) where exists(select 1 from public.diary_mail_outbox where available_at<=now()
      and (status='pending' or (status in ('processing','sending') and locked_until<=now())));
$job$);
commit;
