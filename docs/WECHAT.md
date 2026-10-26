# 微信小程序部署教程

[返回中文 README](../README.md) · [English README](../README.en.md) · [日本語 README](../README.ja.md)

## 先确认源码版本

**当前 GitHub 仓库是网页版。它没有可直接部署的原生微信小程序目录。** 本教程适用于另行提供过的早期原生源码包 `together-house`，不是把本仓库网页转换成小程序的操作。

| 对比 | 当前网页模板 | 早期原生小程序源码 |
| :--- | :--- | :--- |
| 前端入口 | `site/index.html` | `miniprogram/app.js` 与 WXML / WXSS 页面 |
| 后端 | Supabase PostgreSQL / Storage / Edge Functions | 微信 CloudBase 文档数据库 / 云存储 / 云函数 |
| 登录 | 两个邮箱账号 | 两个微信身份 |
| 配置 | `site/config.js` | `project.config.json`、`miniprogram/config.js` |
| 同步范围 | 自己的 Supabase 项目 | 自己的 CloudBase 环境 |
| 邮件与新版功能 | 以本仓库实现为准 | 不包含当前 Supabase 邮件任务；月度心情、计划附件等新版能力未同步移植 |

没有早期原生源码包时，请先使用[网页版部署](DEPLOY.md)。仅凭本仓库不能完成下面的原生部署。两套数据不会自动互通；不要将 Supabase SQL 粘贴到 CloudBase 文档数据库中。

早期源码尚未完成微信开发者工具编译、上线与双真机验收。本教程是配置与验证步骤，不能把源码检查当作已经通过微信审核或真实设备测试。

## 1 · 准备小程序账号与 AppID

1. 在电脑浏览器打开[微信公众平台](https://mp.weixin.qq.com/)，进入小程序账号注册 / 登录入口，按主体类型和页面指引完成注册。
2. 在后台 **开发 → 开发管理 → 开发设置** 找到自己的小程序 AppID，通常以 `wx` 开头。不要使用公众号 AppID 或 AppSecret 代替。
3. 在成员管理中添加对方为体验成员；管理员与开发者使用自己的微信登录工具。
4. 按后台要求填写名称、服务类目和隐私保护指引，如实说明微信身份、日记与主动上传照片的用途。

账号资格、认证 / 备案 / 审核、可用云资源与费用以当前平台要求为准。游客 AppID 或测试号不能当作具备完整云开发与发布权限的正式账号；若后台没有相应权限，先解决账号资格，再继续配置。

## 2 · 在电脑导入原生项目

下载并安装[微信开发者工具稳定版](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，用具有开发权限的微信扫码登录。

点 **导入项目**，选择早期原生包中直接包含下列内容的 `together-house` 文件夹：

```text
together-house/
├─ project.config.json
├─ miniprogram/
│  ├─ app.js
│  ├─ app.json
│  ├─ config.js
│  └─ pages/
└─ cloudfunctions/
   └─ api/
      ├─ index.js
      ├─ domain.js
      └─ package.json
```

填自己的 AppID，确认 `project.config.json` 的 `appid` 已由 `touristappid` 替换为这个 AppID。已有配置应保留：

```json
{
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "compileType": "miniprogram"
}
```

上面只是字段示例，不要用它覆盖完整文件。不要导入 `site/`、`dist/`、网页 HTML 或原生包里的 `preview/` 目录。

## 3 · 创建关联的 CloudBase 环境

在开发者工具顶部点 **云开发**，完成服务开通，并创建与该小程序关联的环境。此早期源码使用文档数据库集合，**请选择支持文档数据库 / NoSQL 的模式，不要选择 PostgreSQL 模式**。两种模式的配置不能混用。

环境初始化完成后，复制**环境 ID**，打开 `miniprogram/config.js`：

```js
module.exports = { env: '替换为自己的环境ID' }
```

环境显示名称不是环境 ID。若使用已有腾讯云环境，先按[官方关联步骤](https://docs.cloudbase.net/quick-start/create-env)授权绑定，确认开发者工具能看到正确的环境。免费期与正式使用费用以控制台为准，不承诺永久免费。

## 4 · 创建数据库集合和访问规则

在同一个环境的数据库中新建 8 个集合，拼写保持一致：

```text
users
pairs
invites
entries
assets
products
notifications
signals
```

前 7 个集合的客户端自定义安全规则统一为：

```json
{ "read": false, "write": false }
```

只有 `signals` 使用下面的规则。它仅存当前用户的变更信号，供前端监听：

```json
{ "read": "doc._openid == auth.openid", "write": false }
```

日记业务由 `api` 云函数验证微信身份和绑定关系后处理。不要为了排错直接开放所有用户读写。

添加 4 个复合索引，字段次序与方向如下：

| 集合 | 索引字段 |
| :--- | :--- |
| `entries` | `pairId` 升序 → `kind` 升序 → `deleted` 升序 → `sortKey` 降序 |
| `entries` | `pairId` 升序 → `kind` 升序 → `deleted` 升序 → `status` 升序 → `date` 升序 |
| `products` | `pairId` 升序 → `deleted` 升序 → `createdAt` 升序 |
| `notifications` | `pairId` 升序 → `recipient` 升序 → `dismissed` 升序 → `createdAt` 降序 |

## 5 · 设置云存储并部署后端

在该环境的云存储设置客户端规则：

```json
{ "read": false, "write": false }
```

源码通过云函数上传照片，并在核验绑定关系后生成短期查看链接。

回到开发者工具，将 `cloudfunctions` 的当前环境设为刚创建的环境。右键 **`cloudfunctions/api` → 上传并部署：云端安装依赖**，函数名保持 **`api`**。运行时选择平台当前支持且满足 `package.json` Node.js 要求的版本，超时可先设 20 秒，完成后重新编译。

这里部署的是 CloudBase 后端，不是 Supabase 的 `diary_mail`。不要把 Gmail 密码填进 `miniprogram/config.js`。

## 6 · 上传体验版，取得两人的成员标识

1. 开发者工具点 **上传**，填写版本号与备注。
2. 到微信公众平台的 **版本管理 → 开发版本**，选择刚上传的版本并设为体验版。
3. 两人用自己的微信扫码打开，点击页面的“微信身份登录”。
4. 首次尚未配置名单时，页面会提供当前微信的**64 位成员标识**，分别复制。

该标识是源码对微信 OPENID 的 SHA-256 摘要，不是 Supabase UUID，也不是 AppID。请用两部真机取得，不能用模拟器身份代替。

## 7 · 将入口限制为固定的两人

在 CloudBase 控制台打开 **云函数 → api → 配置 / 环境变量**，新增：

| 名称 | 值 |
| :--- | :--- |
| `COUPLE_USER_IDS` | `第一人的64位标识,第二人的64位标识` |

中间用英文逗号，不加引号、不换行；顺序对应默认称呼。保存后按控制台提示应用配置或重新部署。两人退出小程序并重新进入，再登录。

一人生成邀请，另一人输入 / 接受邀请并绑定。邀请不能绕过固定的双人成员名单。

早期源码中的默认标题、称呼、纪念日和示例见面计划需要改成自己的内容。标题可在 `app.json`、页面配置、WXML 与分享标题中调整；云端默认称呼和绑定时的初始记录在 `cloudfunctions/api/index.js`，改动后需重新部署函数。已存在的数据不会因为改了默认值自动更新。

## 8 · 两部真机验收，再考虑发布

- 一方下单，另一方看到相同订单和时间；回复同步返回。
- 双方新增回忆、心情、计划、心愿，检查对方能读取。
- 上传照片后，双方都能打开；退出重进后仍能查看。
- 非名单内的第三个微信无法进入日记。
- 测试断网重连、前后台切换与四季背景，不只看模拟器效果。

检查通过后可继续使用符合平台要求的两人体验版；需要公开发布时，再按公众平台当前要求提交审核和发布。**上传源码、设为体验版、正式发布是不同步骤。**

## 更新和常见问题

| 情况 | 检查方向 |
| :--- | :--- |
| 找不到云开发环境 | AppID、工具登录微信、环境归属与账号关联是否一致 |
| 提示先配置两位成员标识 | `COUPLE_USER_IDS` 是否已保存到 `api` 云端，值是否为两个不同的 64 位标识 |
| 提示仅限两人进入 | 当前真机微信是否对应名单；不要发送或替换为邮箱用户 UUID |
| 集合 / 查询报错 | 8 个集合、复合索引、环境 ID 是否完全匹配 |
| 照片访问失败 | 云函数部署、绑定关系、存储配置；不要将云存储改成公开 |
| 修改了代码但手机没变化 | 后端重新部署 `api`；前端重新上传并更新体验版 |
| 想让网页版和小程序共用数据 | 需要额外设计接口、身份映射与迁移；本教程不自动完成 |
| 想在小程序中使用新版邮件 / 月度心情 / 计划附件 | 需要移植业务与界面，不能只复制网页脚本或 SQL |

## 官方参考

核对日期：2026-10-26。具体界面和账号条件可能调整，以本人后台及官方最新文档为准。

- [微信公众平台](https://mp.weixin.qq.com/)
- [微信开发者工具下载](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- [CloudBase：创建环境、环境模式与关联方式](https://docs.cloudbase.net/quick-start/create-env)
- [腾讯云：在开发者工具部署云函数](https://cloud.tencent.com/document/product/583/30936)

官方云开发流程与本教程的业务配置是两个层面：集合名、索引、成员摘要与 `api` 函数名来自配套的早期源码；它们不是任意小程序都通用的固定要求。
