import fs from 'node:fs';
import { initDatabase, sequelize, User, HelpRequest, Response, Success } from '../src/models.js';
await initDatabase();
if(sequelize.getDialect()!=='sqlite') throw Error('MySQL 请使用 mysqldump 导出');
const quote=v=>v===null?'NULL':typeof v==='number'?String(v):"'"+String(v).replaceAll("'","''")+"'";
const [objects]=await sequelize.query("SELECT name,sql,type FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type DESC,name");
let sql='-- 好帮手 SQLite 数据库实际导出文件\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n';
for(const o of objects.filter(x=>x.type==='table')){
 sql+=o.sql+';\n';const [rows]=await sequelize.query('SELECT * FROM "'+o.name+'"');
 for(const row of rows)sql+='INSERT INTO "'+o.name+'" ('+Object.keys(row).map(k=>'"'+k+'"').join(',')+') VALUES ('+Object.values(row).map(quote).join(',')+');\n';
}
for(const o of objects.filter(x=>x.type!=='table'))sql+=o.sql+';\n';
sql+='COMMIT;\nPRAGMA foreign_keys=ON;\n';
const output = process.argv[2] || 'sql.txt';
fs.writeFileSync(output,sql);await sequelize.close();console.log('已导出 '+output);
