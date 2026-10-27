# 自动检查与网页构建

[中文 README](../README.md) · [English](../README.en.md) · [日本語](../README.ja.md)

工作流文件为 `.github/workflows/checks.yml`。向 `main` 提交、针对 `main` 创建 / 更新 PR，或手动执行 `workflow_dispatch` 时运行。

## 检查内容

| 步骤 | 作用 |
| :--- | :--- |
| Node.js 24、Python 3.12 | 提供项目已有测试与构建所需运行时 |
| `npm ci --ignore-scripts` | 按 `package-lock.json` 安装锁定的测试依赖 |
| `npm test` | 在合成账号与隔离数据库中测试功能、权限、照片、附件和配置向导 |
| `python tools/build.py` | 将网页、脚本、字体与风景素材构建为静态文件 |
| 上传 Artifact | 保存当前提交对应的 `index.html` 与 `_headers`，保留 14 天 |

测试不需要真实 Supabase 账号、数据库密码或 Gmail 密码。工作流不配置私人后台，也不会将测试数据写入你们真实使用的日记。

## 在 GitHub 查看结果

1. 打开仓库 **Actions → tests-and-build**，选择自己这次提交对应的运行。
2. 检查整体结论与各步骤结果；PR 页面也会显示检查状态。
3. 全部通过后，在该运行的 **Artifacts** 中下载 `couple-diary-web-提交SHA`。
4. 下载需要有效的 GitHub 登录；附件到期只删除该构建副本，不删除源码。

Artifact 的连接配置来自这次提交的前端配置。通用模板默认连接值为空，因此下载它不等于已经创建好双人网站；请按 [部署说明](DEPLOY.md) 配置你们自己的 Supabase。

## 手动上传到 Cloudflare Pages

Artifact 包应直接包含：

```text
index.html
_headers
```

在 Pages 的 Production 部署中上传这两个文件或保持此结构的 ZIP，不要多套一层目录。该操作只部署前端；两位账号、数据库与私密存储仍按原部署教程配置。

## 仓库设置仍需手动修改

Topics 和 Template repository 不属于 Git 跟踪文件，提交工作流不会自动修改它们。

- **Topics**：Code 首页右侧 About 齿轮中添加，保留已有合适的标签。
- **模板开关**：Settings → General → Template repository；开启后才出现 Use this template。

截至 2026-10-27 的核对，仓库已设置 `cloudflare-pages`、`memories`、`self-hosted`、`supabase`，可再补充 `couples`、`diary`、`japanese-themes`；模板开关尚未开启。后续以你实际后台为准。
