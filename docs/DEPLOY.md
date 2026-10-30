# 维护者部署与普通用户使用

维护者只部署一个站点，普通情侣只需邮箱注册和接受邀请。上传源码到 GitHub 不会自动创建数据库或配置发信服务。

## 1. 创建后台

新建 Supabase 项目，SQL Editor 粘贴执行 `database/install.sql` 全文。它创建多房间表、私有照片和文档桶、邀请、信件、邮件队列及 RPC 权限。脚本可以重复运行；若已有旧单房间数据库，它会直接报错中止。不要把 service_role 或 SMTP 密码放进网页。

## 2. 开启注册和注册邮件

Authentication 设置中允许 Email 注册，开启 Confirm email，密码最短长度设10。保持默认 ConfirmationURL 邮件模板，使用邮箱链接验证和找回密码。前端使用 Auth 的 implicit 回调，获取并校验用户后清除地址中的 token。

配置 Custom SMTP。发件邮箱是维护者统一账号，推荐先用 QQ SMTP 做个人验证；面向更多用户时选择能满足配额的服务。默认 Supabase 测试 SMTP 不能用于向任意陌生邮箱发送注册邮件。供应商限额/风控可能造成投递失败。

URL Configuration 的 Site URL 填正式 HTTPS 网站根路径，Redirect URLs 加入同一完整地址，例如 `https://your-diary.pages.dev/`。若托管在 GitHub Pages 子目录，要填写含仓库目录的地址并以 `/` 结尾，邮件 DIARY_SITE_URL 也保持一致。测试域名应另行加入允许列表，发布后不要保留不需要的通配跳转规则。

官方说明：[SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[邮箱密码登录](https://supabase.com/docs/guides/auth/passwords)、[跳转地址](https://supabase.com/docs/guides/auth/redirect-urls)。

## 3. 生成公开配置

下载/克隆完整源码，本机双击 `setup.html`，填 Project URL 和 Publishable key，下载 `config.js` 后覆盖 `site/config.js`。配置工具离线运行。这里只放公开 key，不能用 `sb_secret_`、service_role、密码、SMTP 授权码。无需创建成员账号或手工绑定 UUID。

## 4. 构建与托管

Node.js 24+、Python 3.12+：`npm ci --ignore-scripts` → `npm test` → `npm run build`。网站产物是 `dist/index.html` 和 `_headers`，保留两者。

- Cloudflare Pages：连接仓库，构建命令 `npm run build`、输出 `dist`。也可本机构建后手动上传 dist 文件。
- GitHub：上传解压后的源码文件（不是把 ZIP 当作源码上传），Actions 自动测试并提供静态产物。若不想提交公开 config.js，可在仓库 Variables 设置 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`，工作流已读取。两者均为公开配置。
- GitHub Pages：从 Actions 下载构建产物发布到 Pages 分支或自行配置 Pages 部署。当前工作流不会替你公开发布。

不要发布仓库根目录；数据库 SQL、文档、测试和配置工具只留在仓库中。用正式域名重新检查注册确认、找回密码和邀请链接。

## 5. 业务邮件和使用验收

按 [MAIL.md](MAIL.md) 部署邮件后台与定时任务，然后按 [CHECKS.md](CHECKS.md) 用4个邮箱验证两对情侣。没有业务邮件服务时，注册确认仍需 Auth SMTP；复制邀请链接与站内日记/信件仍可工作。

## 更新与旧版

先备份数据库和 Storage。只对本版 UUID 多小屋数据库重复执行当前 install.sql，再重新部署前端。旧版整数 id=1 数据库不能原地升级；先保留旧站、导出备份和下载照片，在新项目新建小屋。当前不支持自动导入旧数据，也不提供解除绑定和换伴侣入口。
