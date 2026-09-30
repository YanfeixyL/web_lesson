# 好帮手原型系统

本项目是《Web 开发技术》平时实验作业的可运行实现，使用 Vue 3（CDN）、Express、Sequelize 和 SQLite/MySQL 完成“请帮忙”“我来也”、用户管理与统计分析。

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
