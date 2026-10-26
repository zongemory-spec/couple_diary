验证环境：Node.js，PGlite 0.5.11。
开发者如需重新运行：在源码目录执行 npm install，再执行 npm test。
PGlite 仅用于本地测试，不属于网页运行依赖；上传 site 目录即可，不上传 node_modules。

database.test.cjs 在实际 PostgreSQL/WASM 引擎内验证 SQL、权限、事务和存储行级规则。
它为 Supabase 的 auth / storage 表与函数建立最小测试夹具，并不代表已经连接真实 Supabase 项目。
cloud.test.cjs 验证 HTTP 接入层、登录状态、刷新、幂等重试和私密照片路径。

真实云环境还需要验证：账号配置、Storage HTTP 上传/签名、云服务的实际权限与两台手机网络可用性。

2026-10-22 升级：另有 journal-model.test.cjs 验证商品/分类/已读/心愿/滚动模型，mail-database.test.cjs 验证邮件队列与 05 升级，mail-worker.test.cjs 验证 Gmail 白名单、固定模板和 SMTP 模拟。合计 64 项。模拟测试不发送真实邮件。

新增状态模型检查：24小时边界、每人最新状态、过期历史保留、双人逐日汇总、闰月、跨年与自定义心情。
