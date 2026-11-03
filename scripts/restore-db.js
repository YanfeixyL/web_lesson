import sqlite3 from 'sqlite3';
import fs from 'node:fs';
import path from 'node:path';
const [source='sql.txt',target='data/restored.sqlite']=process.argv.slice(2);
if(fs.existsSync(target))throw Error('目标数据库已存在，请指定新的文件名，避免覆盖数据');
fs.mkdirSync(path.dirname(path.resolve(target)),{recursive:true});
const sql=fs.readFileSync(source,'utf8');
const db=new sqlite3.Database(target);
try{await new Promise((resolve,reject)=>db.exec(sql,error=>error?reject(error):resolve()));console.log('数据库已恢复到 '+path.resolve(target));}
finally{await new Promise((resolve,reject)=>db.close(error=>error?reject(error):resolve()));}
