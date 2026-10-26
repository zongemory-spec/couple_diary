# 新手部署：每对情侣独立一份

## 1. 复制模板

在公开仓库点 Use this template → Create a new repository。Owner选自己的账号，名称可用 `our-love-diary`，Public或Private均可。不要把仓库当作日记存储；日记保存在后续自己的Supabase中。

## 2. 创建后台与两位用户

到 https://supabase.com/dashboard 创建项目，按当时可用套餐选择。保存好数据库密码，后面不要填到网页配置。

进入 Authentication → Users → Add user → Create new user，分别为两人创建账号（邮箱不同），勾选Auto Confirm User，密码各自保管。复制各自User UID / UUID。
在 Authentication 的Sign In / Providers设置中保留Email登录，关闭 Allow new users to sign up 与 Allow anonymous sign-ins。

## 3. 用离线向导生成文件

从GitHub Code → Download ZIP，解压后用Chrome/Edge等浏览器打开根目录 `setup.html`。

7项输入：两位称呼、恋爱纪念日、Project URL、Publishable key、两位UUID。Project URL通常可在项目首页或Connect找到；Publishable key在API Keys中。

点击“生成我的配置”，分别下载初始化脚本和config.js。向导没有联网请求；不输入任何用户密码、数据库密码或SMTP密码。

打开 `setup-private.sql`，全选复制到Supabase SQL Editor的新查询中 → Run。最后应显示a、b两行。报错先按错误核对，不要删除已有表或改成公开权限。

## 4. 写入自己的前端连接配置

自己的GitHub仓库 → site → config.js → 编辑铅笔按钮，完整粘贴刚生成config.js的内容 → Commit changes。

config.js包含可公开的URL/Publishable key与显示称呼。生成的SQL只在你自己的后台运行，不必上传GitHub。

## 5. 自动部署网页

Cloudflare控制台 → Workers & Pages → Create application → 找到Pages入口（可能需要Continue to Pages）→ Connect to Git / Import Git repository → GitHub。
授权访问你要部署的仓库即可，选择刚复制的仓库，项目名自己起。

| 设置 | 填写 |
|---|---|
| Production branch | main（如果自己的默认分支不同，选实际默认分支） |
| Framework preset | None |
| Build command | python3 tools/build.py |
| Build output directory | dist |
| Root directory | 保持默认仓库根目录 |

保存并部署。访问分配的正式pages.dev地址，双方分别登录并验证照片、心情、订单同步。不要在URL后加源码目录或中文文件夹路径。

若走Direct Upload：本地运行Python构建，将dist里的两个文件压缩为ZIP，保持ZIP根目录直接是index.html和_headers，然后在Pages的Production中上传。首次配置后用Git集成能省掉每次重新上传。

## 常见问题

- 页面提示“请先配置”：config.js仍为空，或环境变量只填了一项；修正后重新部署。
- 登录账号“不在两人名单”：确认是在这个项目创建了两位Auth用户，向导内UUID正确，SQL已成功执行。
- 新邮箱无法登录：检查Auto Confirm User或后台确认状态，Email登录仍需开启。
- 相片/附件失败：检查初始化SQL是否完整执行、桶为Private、登录有效；不要改成Public来修复。
- 手机上网页不更新：先用无痕窗口访问正式地址，确认访问的是自己的项目。
- 首次绑定失败：修正信息后重跑生成SQL。它不会清空已有日记，也不会覆盖不同成员的现有绑定。
- 邮件没到：基础部署没有启用定时邮件；单独按MAIL.md配置后再验证。

先在双方日常网络实测。域名/流量/存储付费与访问情况依所用平台和所在地而定，模板本身不收取费用。
