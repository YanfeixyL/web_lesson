# 好帮手原型系统

本项目是《Web 开发技术》平时实验作业原型，使用 Vue 3、Express 完成“请帮忙”“我来也”、用户管理与统计分析。当前运行版本使用 JSON 文件持久化；MySQL 的 SQL 脚本与 Sequelize 模型作为后续接入参考。Vue 已随工程保存在 public/vendor 中，运行时无需连接 CDN。

## 运行

```bash
npm install
npm start
```

浏览器打开 <http://localhost:3000>。

- 管理员：`admin` / `admin123`
- 测试普通用户：`zhangsan` / `abc12345`

默认 JSON 数据文件会在首次运行时创建并自动插入测试数据，适合课堂演示。`sql.txt` 和 `src/mysql-models.js` 提供了 MySQL 8.0 的生产适配结构；部署到 Linux 时可安装 MySQL 后按该结构接入。

## 目录

- `src/server.js`：Express 服务、认证、业务接口与统计接口
- `src/models.js`：Sequelize 数据模型与初始化数据
- `public/index.html`、`public/app.js`、`public/styles.css`：Vue 页面
- `sql.txt`：MySQL 建表和测试数据脚本
- `docs/`：作业报告与小组分工说明

## 阿里云部署

- SSH 别名：`yanfei_aliyun26`
- 工程目录：`/home/admin/Project/haobangshou`
- 公网入口：<http://39.105.85.88/haobangshou/>
- Node 服务：`127.0.0.1:3010`，通过 Nginx 的 `/haobangshou/` 转发
- systemd 服务：`haobangshou.service`，以 admin 用户运行，开机启动、异常重启
- 持久化数据：`data/haobangshou.json`；上传文件：`uploads/`
- 服务密钥：`.env.production`，在服务器生成，不提交到 Git

```bash
# 查看、重启和读取日志
ssh yanfei_aliyun26 'systemctl status haobangshou --no-pager'
ssh yanfei_aliyun26 'systemctl restart haobangshou'
ssh yanfei_aliyun26 'journalctl -u haobangshou -n 50 --no-pager'
# 检查公网入口
curl http://39.105.85.88/haobangshou/api/health
```

部署配置放在 `deploy/`。首次安装执行 `bash deploy/install.sh`；更新代码后执行 `npm ci --omit=dev` 和 `systemctl restart haobangshou`。更新前备份 data、uploads 与 .env.production，上传源码时不要覆盖这些文件。

本次迁移复制了旧服务器当前数据，两个服务器之后各自保存数据，不会自动同步。已有测试账号可用于验收。公网演示当前使用 HTTP，尚未绑定域名和 HTTPS。

界面增加卡片悬浮效果、页面与弹窗过渡、空状态提示和移动端导航，并遵循系统减少动态效果的设置。静态资源和 API 使用相对路径，可兼容本机根路径与 Nginx 子路径部署。
