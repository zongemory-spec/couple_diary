# GitHub 检查与构建

推送 main 或发起 PR 后安装锁定依赖，执行 npm test，构建静态网页并上传 Actions artifact。工作流不公开发布网站。可用仓库 Variables 的 SUPABASE_URL 和 SUPABASE_PUBLISHABLE_KEY 覆盖公开配置。详见 [部署](DEPLOY.md)。
