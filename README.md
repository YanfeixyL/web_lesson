# 好帮手 Web 开发技术课程实验

项目实现用户管理、需求发布与响应、确认接受、附件和月度统计。前端使用 Vue 3.5.24，后台使用 Express 4 和 Sequelize 6，默认数据库为 SQLite。MySQL 可通过环境变量启用，不需要改动业务代码。

## 安装与运行

已在 Windows、Node.js v24.21.0 下验证。建议使用 Node.js 24。

```powershell
cd D:/Project/Web/web_lesson
npm ci
npm start
```

浏览器访问 http://localhost:3000/。首次启动自动建表并插入测试账号和需求；数据库位于 `data/haobangshou.sqlite`，附件位于 `uploads/`。

| 角色 | 用户名 | 密码 |
| --- | --- | --- |
| 管理员 | admin | admin |
| 普通用户 | zhangsan | Abc12345 |
| 普通用户 | lisi | Abc12345 |

管理员是题目要求的预置账号。新注册和修改密码要求至少六位、至少两个数字、同时含大小写字母。

复制 `.env.example` 为 `.env` 后，可使用 `npm run start:env` 加载配置；普通 `npm start` 读取当前进程的环境变量。

## 功能

- 注册、登录、基本信息展示；电话、简介和密码修改。
- 全部需求及本人需求查询，类型模糊查询、关键词、地域、状态筛选，分页。
- 发布、修改、取消需求；已有响应时禁止修改和取消；归档记录保留。
- 提交、查询、修改和取消响应；按已接受状态筛选；发布者查看响应者资料并接受或拒绝。
- 上传、替换和下载文字、图片、视频附件；单个附件上限20 MB。
- 接受响应时，事务同步更新响应、成功明细及需求状态，其他待接受响应转为拒绝。同一需求只能生成一条成功记录。
- 管理员查询用户、需求和响应；按状态筛选并查看关联用户。
- 近六个月统计，支持起止月份、地域、类型查询；趋势图与月度明细表同时展示，无数据月份补零。

响应状态为0待接受、1同意、2拒绝、3取消。拒绝的响应可以在需求仍开放时修改重提，也可以取消。接受后不能改删。需求状态依题目保存为0已发布、-1已取消或归档；成功明细区分接受归档与主动取消。

统计按创建月份计发布数，按接受月份计成功数，保留取消记录的历史发布量。月份以UTC为口径；范围为起始月首日到终止月次月首日，左闭右开。`monthly_summary` 视图按YYYYMM、省市、类型汇总。

## 自动化验证

```powershell
npm test
# 首次运行浏览器测试时安装 Chromium
npx playwright install chromium
npm run test:browser
```

若使用已安装的 Chrome，可在 PowerShell 中先执行 `$env:BROWSER_CHANNEL='chrome'`。

`npm test` 使用临时SQLite数据库和上传目录，覆盖账号校验、权限、需求与响应状态、附件、分页、重复接受、统计、重启持久化、月汇总、SQL导出及恢复。`test:browser` 自动启动独立服务，验证两名用户从发布需求、上传附件、提交和修改响应到接受的完整流程，并保存页面截图到 `tmp/qa/`。测试不会修改默认业务数据库。

## SQL 导出和恢复

验收用 `sql.txt` 从实际SQLite数据库导出，包含建表、索引、月汇总视图和测试数据。

```powershell
npm run db:export
# 恢复到一个尚不存在的新数据库文件
npm run db:restore -- sql.txt data/restored.sqlite
$env:DB_STORAGE='D:/Project/Web/web_lesson/data/restored.sqlite'
npm start
```

导出其他数据库文件时，通过 `DB_STORAGE` 指定来源；可将输出路径作为参数传给 `npm run db:export -- 备份文件.sql`。恢复脚本拒绝覆盖已有数据库。

## MySQL 配置

本机没有运行MySQL服务，本次验收测试使用SQLite。`database/mysql.sql` 为MySQL建表及测试数据脚本，导入会清空该库的同名业务表；应在新建的课程实验库执行。

```powershell
mysql -u root -p -e "source database/mysql.sql"
$env:DB_DIALECT='mysql'
$env:DB_NAME='haobangshou'
$env:DB_HOST='127.0.0.1'
$env:DB_USER='root'
$env:DB_PASSWORD='填写本机密码'
npm start
```

模型会建立月汇总视图。MySQL提交时应使用 `mysqldump` 导出实际建表与数据，再保存为 `sql.txt`。`W2-JDBC示例` 的数据库连接、执行SQL、读取结果思路用于对照理解；项目保持现有JavaScript栈，数据访问由Sequelize承担。

## 旧 JSON 数据迁移

原 `data/haobangshou.json` 不会被覆盖。若需要保留旧数据，先备份，再迁移到一个新的SQLite文件：

```powershell
$env:DB_STORAGE='D:/Project/Web/web_lesson/data/migrated.sqlite'
node scripts/migrate-json.js data/haobangshou.json
npm start
```

迁移保留原账号密码和业务记录。预置 `admin/admin` 只对首次初始化的新库有效，迁移旧数据不会重置账号密码。

## 目录与提交材料

- `src/server.js`：接口、权限、文件上传、统计和事务。
- `src/models.js`：Sequelize模型、关联、SQLite/MySQL连接与初始化。
- `public/`：Vue界面与本地静态资源。
- `tests/`：接口及数据库自动化测试。
- `scripts/`：SQL导出恢复、旧数据迁移、浏览器验收和报告生成。
- `docs/`：原需求和模板、填写后的五份Word报告、需求核对和验收记录。
- `database/mysql.sql`：可选MySQL脚本；根目录 `sql.txt`：本次SQLite实际导出。

报告中已填写李汉立、孔垂米、吴昊东及计算机科学与技术专业，学号和班级留空。贡献比例暂按40%、30%、30%安排，提交前需由成员核对。选做的统计排序和参与需求优先排序未实现。

`deploy/` 保留原Linux部署文件。运行新版之前，需将旧JSON数据按上述步骤迁移，并备份数据库、上传目录和环境配置；本次没有更新公网服务。
