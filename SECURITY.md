# 安全说明

认证、邀请和房间隔离见 README。保持 Confirm email 开启；关闭会使邮箱归属无法证明。仅公开 Publishable/anon key，严禁提交 service_role、SMTP密码、任务密钥。房间、成员、邀请、信件和队列不允许客户端直接读写，必须走 RPC；Storage 为 private。维护者仍可访问后台，非端到端加密。发现问题请先私下联系仓库维护者，不在公开 issue 中上传日记、邮箱、令牌或截图。上线前按 docs/CHECKS.md 实测。
