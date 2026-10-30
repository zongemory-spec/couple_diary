# 邮件：维护者配置一次，使用者只提供收件邮箱

## 两条独立链路

1. **注册确认、重发确认、密码找回**：Supabase Auth 自己投递，在后台 Authentication 配 Custom SMTP、邮箱确认开关和站点跳转地址。此配置是开放给其他用户注册的必需条件。建议 QQ/其他 SMTP；不强制 Gmail。
2. **邀请、来信、日记事件提醒**：数据库队列 → 每分钟调度 → `diary-mail` Edge Function → QQ SMTP / Resend / 可选 Gmail。该链路故障不会回滚已保存的日记。页面只提示“排队”，不宣称邮件已送达。

普通用户可使用 QQ、163、Outlook、Gmail 等合法邮箱注册，不需要给程序发件授权码。维护者选择的发件服务不限制用户的收件邮箱提供商。

## Edge Function

先安装 Supabase CLI 并登录、关联你自己的项目，在源码目录运行：

```sh
supabase functions deploy diary-mail --no-verify-jwt
```

函数用至少32字符的 `x-diary-mail-secret` 独立验证调度调用；必须配好 secret。服务器端需要：

| Secret | 用途 |
| --- | --- |
| SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY | Supabase Edge 环境提供，服务端专用 |
| DIARY_MAIL_WORKER_SECRET | 本地随机生成至少32字符，与调度 Vault 相同 |
| DIARY_SITE_URL | 正式 HTTPS 网站地址，允许子目录，不带 query/hash |
| MAIL_PROVIDER | `qq`（推荐个人体验）、`resend` 或 `gmail` |
| QQ_SMTP_USER / QQ_SMTP_AUTH_CODE | QQ/foxmail 发信地址与邮箱设置中的 SMTP 授权码；不是网页登录密码 |
| RESEND_API_KEY / DIARY_MAIL_FROM | 选择 resend 时填写，经验证域名的发件地址 |
| GMAIL_SMTP_USER / GMAIL_APP_PASSWORD | 仅选择 gmail 时填写，维护者独立发件账号；与情侣A/B无关 |

QQ 使用 smtp.qq.com:465，TLS；Gmail 使用 smtp.gmail.com:465，是否可达取决于运行区域。首次部署可在 Supabase Edge Secrets 界面填入，避免把真实密钥保存到仓库。

## 启用调度

打开 `database/mail-schedule.example.sql`，在**本地私有副本**替换项目域名和随机任务密钥，然后 SQL Editor 执行。脚本启用 pg_cron / pg_net，把任务密钥存入 Vault，每分钟调用一次 `/functions/v1/diary-mail`。先确认所选项目支持这些扩展。重复部署前可在 Cron 页面检查同名任务，避免人为重复新建。

## 行为与诊断

- 邀请7天过期，每屋每天最多5次；只能受邀的已确认邮箱接受，撤销/重发立即使旧链接失效。邀请码散列保存于邀请表；原始值仅在受保护邮件队列中用于发信和本人取回。
- 普通事件只向当前小屋另一半投递，发前再次校验成员/邮箱/偏好。每屋每天最多50个普通事件；全站滚动24小时发送预算100封，属于个人展示项目的保守默认值，可在 SQL 调整。
- 邮件只作提醒，不附日记正文、信件正文、照片或附件。站内信不受关闭邮箱提醒影响。
- `pending` 等待、`processing` 已领取、`sending` 提交中、`sent` 服务商确认、`skipped` 已取消、`expired` 超过23小时、`failed` 失败、`uncertain` 无法确认结果。`sent` 不等于保证进入收件箱。
- SMTP 提交后超时标 uncertain，避免自动重复发送；维护者核对服务商记录后处理。初次联调请先自己发一条测试事件，再看 outbox 和函数聚合结果，勿公开导出邮箱/token。
- 不设置业务发信时，复制链接完成邀请，站内功能正常；新用户注册确认仍要 Auth SMTP。

参考：[Supabase 自定义 SMTP](https://supabase.com/docs/guides/auth/auth-smtp)。
