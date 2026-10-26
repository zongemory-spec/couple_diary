# 维护者首次发布到GitHub

本目录是通用开源模板，和原作者的私人站点分开。不要把私人站点的ZIP、配置文件、备份、真实截图或SMTP授权文件混进来。

1. GitHub右上角 + → New repository。
2. Repository name建议 `couple-diary`，Description可写“情侣专属日记：四季换景、心意小铺、回忆与见面计划，可自行部署。”
3. 选择Public。当前目录已经有README、LICENSE、.gitignore，创建空仓库即可，不需要再自动生成这些文件。
4. 本机解压模板包，把里面的文件内容上传到仓库。不要只上传模板ZIP，否则别人不能直接构建。推荐在电脑用GitHub Desktop：File → Add local repository，按提示创建本地仓库，再 Publish repository，确认Public和目标账号。也可在网页Add file → Upload files上传解压后的文件，确保根目录有README.md、LICENSE、setup.html、site和tools。
5. 仓库 Settings → General → 勾选 **Template repository**。此后别人可Use this template创建自己的副本。
6. About里补充说明与topics，例如 `couples`、`diary`、`supabase`、`cloudflare-pages`、`self-hosted`。
7. 可创建第一个Release，上传这个不含私人配置的源码ZIP。检查Release和README使用的是通用界面/虚构数据截图。
8. 发布后让另一位使用者从一个全新Supabase项目按README走通，再把步骤卡点补进文档。

发布并不是把所有使用者接进原作者后台。模板默认连接信息为空，每对情侣必须使用自己的项目与两位账号。模板副本后续不会自动拉取原模板更新，升级需按版本说明处理。

官方操作：https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-template-repository
