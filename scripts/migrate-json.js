import fs from 'node:fs';
import path from 'node:path';
import {sequelize,User,Region,HelpRequest,Response,Success} from '../src/models.js';
// 迁移到新数据库，避免覆盖已有的 SQLite 文件。原 JSON 文件保持原样。
await sequelize.sync();
if(await User.count())throw Error('目标数据库非空，请用 DB_STORAGE 指向新的 SQLite 文件');
const old=JSON.parse(fs.readFileSync(process.argv[2]||'data/haobangshou.json','utf8'));
await sequelize.transaction(async transaction=>{
 for(const [key,model] of [['users',User],['regions',Region],['requests',HelpRequest],['responses',Response],['successes',Success]]){
  const rows=old[key].map(row=>{const clean={...row};if(key==='successes'){const req=old.requests.find(x=>x.id===row.requestId),resp=old.responses.find(x=>x.id===row.responseId);clean.publisherId=req.userId;clean.responderId=resp.userId;}return clean;});
  await model.bulkCreate(rows,{transaction});
 }
});await sequelize.close();console.log('迁移完成，原账号密码保留。');
