# 我们的恋爱日记

每对情侣部署一个独立的小屋。四季风景、零元心意小铺、共同回忆、见面计划、心愿、24小时心情与月度晴雨表。

**代码开放，日记仍属于你们自己。** 每对使用者创建自己的 Supabase 项目和两个账号；本仓库不包含运营者的真实数据库配置，也不提供所有情侣共用的后台。

## 最短使用路线

1. 点击本仓库 **Use this template → Create a new repository**，复制到自己的 GitHub 账号。仓库可以设为 Private。
2. 创建自己的 Supabase 项目；在 Authentication → Users → Add user → Create new user 创建两个不同邮箱的用户，各自设置密码，勾选 Auto Confirm User，复制两人的 UUID。关闭公开注册和匿名登录，保留 Email 登录。
3. 在自己电脑下载本仓库 ZIP 并解压，双击根目录 **setup.html**。填写两个称呼、纪念日、Project URL、Publishable key 和两位用户 UUID，下载向导生成的 SQL 与 config.js。它在浏览器本地处理，不提交账号密码。
4. 把生成的 SQL 完整粘贴到自己 Supabase 的 SQL Editor → Run。脚本安装数据库、私密照片/附件存储、两人权限和邮件队列表，并绑定刚创建的两人。最后出现 a、b 两行结果。
5. 在自己的 GitHub 仓库打开 `site/config.js`，用向导生成的同名文件完整替换并提交。此文件只含公开客户端连接配置和显示称呼，不包含密码。
6. Cloudflare → Workers & Pages → Create application → Pages / Continue to Pages → **Connect to Git / Import Git repository**，连接自己的 GitHub 仓库。框架选 **None**，构建命令 **`python3 tools/build.py`**，输出目录 **`dist`**，仓库根目录保持默认。部署后获得自己的 HTTPS 网站地址。
7. 双方在手机浏览器登录自己的账号，发一笔订单，分别检查同步、上传照片和附件权限。以后修改自己仓库中的代码或 config.js，Cloudflare 会自动构建并部署。

首次仍需要两个平台账号、一个独立数据库项目和两个小屋用户。GitHub 模板不会代替你创建后台账号，也不会自动收到原模板后续更新。

详细步骤见 [新手部署](docs/DEPLOY.md)。邮件提醒不影响基础使用，可以后按 [邮件配置](docs/MAIL.md) 单独启用。

## 已有功能

- 想你小铺：情绪/陪伴商品、0元下单、回复、独立发货状态；两人共享自定义商品，可编辑、删除，支持选填金额和购买链接。
- 共同回忆：可展开详情、编辑、照片缩略图/放大。
- 见面计划：起止日期、倒计时、正在一起状态、首日一次性庆祝、结束后收藏回忆；私密 Word/PDF 附件可下载。
- 心愿：自定义分类、安排进计划、实现后存为回忆。
- 心情：展示最近24小时状态，历史保留在月度晴雨表。
- 首页小纸条、已读记录、日式四季换景、柔和动效、固定房子返回键。
- 可选邮件：新订单、首次发货、新心情、新回忆、新心愿、计划新建/修改；普通回复和商品修改不发邮件。

## 配置与隐私

- `site/config.js` 的 Project URL、Publishable key是客户端公开配置；访问保护依赖 Supabase Auth、绑定名单和RLS。
- 数据库密码、Google应用专用密码、任务密钥、Secret key、service_role key只保存在自己后台，不能放进仓库、Issue、网站配置或截图。
- 公开网页的登录页可能展示两人的称呼。不要把不想公开的联系方式填成昵称。
- 照片和附件桶必须保持 **Private**。只运行生成的初始化SQL，不要为了“能访问”将它们设为Public。
- 每个项目只有a/b两个角色；第三个账号即使注册也不能读写小屋。不要把多对情侣放进同一个项目。
- 免费套餐可作为起步，实际额度、停用和收费规则以供应商控制台为准；先用双方日常网络测试可访问性。

## 开发与构建

Node.js 24+、Python 3，构建仅使用Python标准库：

```sh
npm install
npm test
python3 tools/build.py
```

`dist/` 只生成 `index.html` 与 `_headers`，前端脚本、字体和四季素材已内嵌。它们可直接压缩后用于Cloudflare Pages Direct Upload，也可由Git集成自动构建。

若使用Cloudflare环境变量而不是提交config.js，需同时设置 `SUPABASE_URL` 与 `SUPABASE_PUBLISHABLE_KEY`；只支持公开Publishable key。此模式未登录前显示通用称呼，登录后从数据库显示你们的称呼。两种配置方式选一种。

## 项目结构

```text
site/                 应用源码与四季素材
setup.html            离线配置向导
tools/setup-model.js  配置/个性化初始化生成逻辑
tools/build.py        单文件构建脚本
database/install.sql  结构安装基础脚本（向导自动合并）
supabase/functions/   可选邮件后台
tests/                虚构数据的自动测试
docs/                 部署、发布、邮件说明
```

## 开源协议

项目代码采用 [MIT](LICENSE)，允许修改和商用，分发时保留许可与版权声明。字体另按 [SIL OFL 1.1](FONT-LICENSE.txt) 分发，详见 [第三方素材说明](THIRD_PARTY_NOTICES.md)。

官方参考：[GitHub模板](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository)、[Cloudflare GitHub集成](https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/)、[Supabase访问责任与RLS](https://supabase.com/docs/guides/deployment/shared-responsibility-model)。
