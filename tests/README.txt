本地验证

需要 Node.js 24+、Python 3。在仓库根目录执行：
npm ci --ignore-scripts
npm test
python tools/build.py

package-lock.json 锁定 PGlite 及依赖。PGlite 仅用于合成数据与隔离数据库测试，不属于前端运行依赖。
GitHub 自动检查配置在 .github/workflows/checks.yml，说明在 docs/CI.md。

测试覆盖 SQL / RLS / 事务、登录与私密照片、商品 / 心愿 / 已读、24 小时心情与月度汇总、见面计划与附件、邮件队列 / 模拟 SMTP、离线配置向导。
模拟邮件测试不会实际发信；使用虚构账号不会连接真实私人日记。

网页部署前仍需在自己的 Supabase 与两部手机上验证账号配置、存储 HTTP 访问及日常网络可用性。
