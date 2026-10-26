# 可选邮件提醒（先部署好基础网站再做）

初始化脚本已安装队列与权限，但不会自动发送邮件。基础功能不依赖邮件。

当前Gmail方案固定使用**成员B绑定的登录Gmail**作为发件人；A操作提醒B，B操作提醒A。只发送给两个绑定用户；只有接收者本人能关闭自己的接收开关。

1. 如果需要Gmail发信，请在创建两位Auth账号时让成员B使用本人同意作为发件人的Gmail。
2. 该Google账号开启两步验证，在 https://myaccount.google.com/apppasswords 生成16位应用专用密码，不能用登录密码替代。
3. Supabase → Edge Functions → Secrets 填写：`MAIL_PROVIDER=gmail`、`GMAIL_APP_PASSWORD=应用专用密码`、`DIARY_SITE_URL=你的正式HTTPS首页`、`DIARY_MAIL_WORKER_SECRET=自行生成的至少32字符随机值`。
4. Edge Functions → 创建名为 **diary_mail** 的函数，用 `supabase/functions/diary-mail/index.ts` 全部替换index.ts并Deploy。Verify JWT with legacy secret关闭；代码会校验单独的后台任务密钥。
5. 打开 `database/mail-schedule.example.sql`。把 `YOUR_PROJECT_REF` 替换为自己Project URL中 `.supabase.co` 前的项目编号；把中文密钥占位内容替换为同一份任务密钥，在自己的SQL Editor运行。
6. 不要提交填好密钥的SQL。它将任务密钥写入自己项目的Vault，并让后台每分钟检查队列。前端配置无需密码。
7. 下新订单，确认收件箱/垃圾箱。需要排查时运行：

```sql
select created_at,status,attempts,last_error
from public.diary_mail_outbox order by created_at desc limit 5;
```

`sent`是服务接受提交，仍需实际确认收到；`smtp_reply_535`是SMTP认证被拒绝。先核对应用专用密码与成员B邮箱一致。更改Google登录密码会撤销旧应用专用密码，需自行重建并替换Secret。

新订单、首次发货、新心情、新回忆、新心愿、新建/修改计划会提醒；普通回复、阅读和商品维护不额外发信。历史事件不会因启用邮件自动补发。不要批量重置uncertain/sent等邮件状态以免重复。

QQ/Resend适配代码也保留，但不是本新手路线；不要把其他服务密码填成Gmail应用专用密码。

官方参考：https://support.google.com/accounts/answer/185833 、 https://supabase.com/docs/guides/functions/quickstart-dashboard 、 https://supabase.com/docs/guides/functions/limits
