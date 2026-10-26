<div align="center">

<img src="docs/assets/readme-cover.svg" alt="Couple Diary：樱花、花火、红叶与雪夜，收藏两个人的日常" width="880">

# 我们的恋爱日记

**把想念、见面和日常，放进只属于两个人的小屋。**

**简体中文** · [English](README.en.md) · [日本語](README.ja.md)

[开始部署](#开始部署) · [功能一览](#功能一览) · [微信小程序](#微信小程序) · [邮件提醒](#邮件提醒) · [MIT 许可](LICENSE)

</div>

---

一份可以自行部署的双人私密日记。四季风景随机相遇，心意有人接住，回忆慢慢积攒。每对情侣拥有自己的数据库和两个登录账号。

**源码公开，日记私藏。** 本项目提供源码与配置向导，不提供所有情侣共用的账号或后台。README 支持中英日切换；应用界面与配置向导目前以中文为主。

## 功能一览

| 功能 | 两个人可以一起做什么 |
| :--- | :--- |
| 💌 想你小铺 | 0 元下单表达想念；接收、回复、发货。商品可新增、编辑、删除，选填金额与购买链接。 |
| 📷 共同回忆 | 写下标题、地点、事件与心情；展开详情、编辑记录、放大照片。 |
| 🗓️ 见面计划 | 设置起止日期、地点与行程；倒计时、首日庆祝、相聚状态与结束提醒；上传私密 Word / PDF 附件。 |
| ✨ 心愿清单 | 自定义分类，把期待安排进见面计划；实现后存入回忆。 |
| ☁️ 心情小屋 | 分享当下的心情与照片；状态展示 24 小时，历史保留在月度心情晴雨表。 |
| 📨 首页小纸条 | 看见对方的新消息、回应与已读记录，随时回到首页。 |
| 🌸 四季风景 | 樱花、花火、红叶、雪夜；启动时随机换景，停留时每 2 分钟柔和切换。 |
| 🔔 可选邮件 | 新订单、首次发货、新心情、新回忆、新心愿与计划变更提醒。 |

> 小铺的“0 元”表达的是心意，不接入真实支付。金额和链接是可选信息。

## 开始部署

**推荐路线：GitHub → Supabase → Cloudflare Pages。** 基础网站不依赖邮件，也不需要先注册微信小程序。

### 1 · 复制一份属于你们的仓库

点 **Use this template → Create a new repository**，名称自己起，Public 或 Private 均可。若还没有模板按钮，可先 Fork，或下载源码后上传到自己的新仓库。

### 2 · 创建后台与两位用户

在 [Supabase](https://supabase.com/dashboard) 创建自己的项目。进入 **Authentication → Users → Add user → Create new user**，创建两个不同邮箱的用户，勾选 **Auto Confirm User**，保管好密码，复制两位用户的 UUID。

在登录设置中关闭公开注册与匿名登录，**保留 Email 登录**。Project URL 与 Publishable key 可在项目首页 / Connect 与 API Keys 页面找到。

### 3 · 用离线向导生成配置

在自己的仓库点 **Code → Download ZIP**，解压，用电脑浏览器打开根目录的 `setup.html`。填写两个称呼、纪念日、Project URL、Publishable key 和两位 UUID，下载生成的 **`setup-private.sql`** 与 **`config.js`**。

向导在本机浏览器处理信息，不需要用户密码、数据库密码或邮件密码。

### 4 · 安装数据库，写入网页配置

将 `setup-private.sql` 完整复制到自己 Supabase 的 **SQL Editor → 新查询 → Run**。成功后应显示 a、b 两行成员结果。再用生成的 `config.js` 完整替换自己仓库的 **`site/config.js`** 并提交。

### 5 · 部署到 Cloudflare Pages

在 [Cloudflare](https://dash.cloudflare.com/) 进入 **Workers & Pages → Create application → Pages / Continue to Pages → Connect to Git / Import Git repository**，连接自己的 GitHub 仓库。

| 配置项 | 填写内容 |
| :--- | :--- |
| Production branch | `main`，或仓库实际默认分支 |
| Framework preset | `None` |
| Build command | `python3 tools/build.py` |
| Build output directory | `dist` |
| Root directory | 保持仓库根目录 |

保存并部署，使用分配的正式 HTTPS 地址。双方分别登录，测试一笔订单、一条心情和一张照片，确认彼此能同步看到。

之后提交到自己的已连接仓库，会触发重新构建；模板原仓库的更新不会自动合并到你的副本。

📖 [详细部署与常见问题](docs/DEPLOY.md) · [邮件设置](docs/MAIL.md) · [安全说明](SECURITY.md)

## 微信小程序

| 方式 | 当前状态 |
| :--- | :--- |
| 手机浏览器使用网页版 | 本仓库的完整部署路线；使用邮箱登录与 Supabase。 |
| 微信原生小程序 | 独立的早期源码方案，使用微信身份与 CloudBase；**未包含在本仓库，也未与当前网页版功能对齐**。 |

网页版的 HTML、样式和 Supabase 脚本不能直接作为原生小程序上传。若你持有早期原生源码包，请按 [微信小程序部署教程](docs/WECHAT.md) 配置 AppID、云开发、双人名单与体验版。该教程注明了所需源码、权限规则和真机检查步骤。

教程不是本仓库的“一键转小程序”功能。微信内打开网页也不等于安装了小程序；先在双方常用网络和浏览器实际验证访问。

## 邮件提醒

邮件是独立可选项。默认使用**成员 B 绑定的 Gmail**作为发件邮箱，需要该账号本人同意，并生成 Google 应用专用密码。收件范围限制为已绑定的两位用户。

- 会提醒：新订单、首次发货、新心情、新回忆、新心愿、见面计划新建 / 修改。
- 普通回复、阅读与商品维护不额外发信；启用后不会补发历史事件。
- 后台函数部署名为 **`diary_mail`**；源码目录为 `supabase/functions/diary-mail/`，注意下划线与短横线的区别。

完整配置见 [邮件提醒教程](docs/MAIL.md)。所有邮件密码和任务密钥只填自己的后台 Secrets。

## 数据与隐私

每对情侣使用独立的 Supabase 项目，访问由登录、双人成员名单和 RLS 权限共同保护。照片与附件存储桶保持 **Private**。不要把多对情侣放进同一个项目。

`site/config.js` 的 Project URL 与 Publishable key 是可公开的客户端配置。**数据库密码、SMTP / Gmail 应用专用密码、任务密钥、Secret key 和 service_role key 不可放进前端或仓库。**

登录页可能展示昵称，请勿把私密联系方式设为公开称呼。云平台的免费额度、可用性和后续费用以当时的控制台为准；源码本身不收费。

## 开发与构建

需要 Node.js 24+ 与 Python 3。构建仅用 Python 标准库，测试依赖通过 npm 安装。

```sh
npm install
npm test
python3 tools/build.py
```

输出为 `dist/index.html` 与 `dist/_headers`，包含内嵌的脚本、字体和风景素材。手动上传 Pages 时，ZIP 根目录应直接包含这两个文件，避免多套一层目录。

<details>
<summary>查看项目结构与可选环境变量</summary>

```text
site/                 网页源码、动效与四季素材
setup.html            本地配置向导
tools/                配置生成与构建工具
database/             数据库安装与邮件任务示例
supabase/functions/   可选邮件后台
tests/                使用虚构数据的自动测试
docs/                 部署、安全相关参考与小程序教程
```

也可在 Cloudflare 同时设置 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEY`，代替在 `site/config.js` 中填写连接值。只使用 Publishable key。此方式在登录前显示通用称呼，登录后读取数据库称呼。

</details>

## 开源与致谢

代码采用 [MIT](LICENSE)，允许免费使用、修改与商用；分发时保留许可及版权声明。字体单独遵循 [SIL OFL 1.1](FONT-LICENSE.txt)，素材说明见 [第三方声明](THIRD_PARTY_NOTICES.md)。

欢迎提交 Issue 与 Pull Request。反馈时请移除真实日记、邮箱、密码、密钥及私人照片。

<div align="center">

**愿普通的一天，也值得被两个人记住。**

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md)

</div>
