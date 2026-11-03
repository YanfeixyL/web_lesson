import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const scratch=mkdtempSync(path.join(tmpdir(),'hb-sql-'));
process.env.DB_DIALECT='sqlite';process.env.DB_STORAGE=path.join(scratch,'source.sqlite');
const {sequelize,initDatabase,User,HelpRequest,Response,Success}=await import('../src/models.js');
test('数据库月汇总与导出恢复',async t=>{try{
 await initDatabase();
 const request=await HelpRequest.create({userId:2,regionId:1,type:'测试类型',title:"包含单引号 ' 的标题",description:'月底发布，下月接受',address:'测试地址',createdAt:new Date('2026-02-28T23:59:59Z')});
 const response=await Response.create({requestId:request.id,userId:3,description:'三月接受',status:1});
 await Success.create({requestId:request.id,responseId:response.id,publisherId:2,responderId:3,acceptedAt:new Date('2026-03-01T00:00:00Z')});
 await t.test('月汇总按发布和接受日期分别归属',async()=>{const [rows]=await sequelize.query("SELECT * FROM monthly_summary WHERE type='测试类型' ORDER BY month");assert.deepEqual(rows.map(x=>[x.month,x.published,x.accepted]),[['202602',1,0],['202603',0,1]]);});
 await t.test('成功明细唯一约束阻止重复记录',async()=>{await assert.rejects(()=>Success.create({requestId:request.id,responseId:response.id,publisherId:2,responderId:3}),{name:'SequelizeUniqueConstraintError'});});
 await t.test('真实 SQL 导出可恢复表数据与汇总视图',async()=>{const dump=path.join(scratch,'sql.txt'),target=path.join(scratch,'restored.sqlite');const exported=spawnSync(process.execPath,['scripts/export-db.js',dump],{encoding:'utf8',env:process.env});assert.equal(exported.status,0,exported.stderr);const restored=spawnSync(process.execPath,['scripts/restore-db.js',dump,target],{encoding:'utf8'});assert.equal(restored.status,0,restored.stderr);const {Sequelize}=await import('sequelize');const copy=new Sequelize({dialect:'sqlite',storage:target,logging:false});try{const [users]=await copy.query('SELECT username FROM users ORDER BY id');assert.equal(users.length,3);const [items]=await copy.query('SELECT title FROM help_requests WHERE id='+request.id);assert.equal(items[0].title,request.title);const [summary]=await copy.query("SELECT SUM(accepted) AS total FROM monthly_summary WHERE type='测试类型'");assert.equal(summary[0].total,1);}finally{await copy.close();}const refused=spawnSync(process.execPath,['scripts/restore-db.js',dump,target],{encoding:'utf8'});assert.notEqual(refused.status,0);});
 }finally{await sequelize.close();rmSync(scratch,{recursive:true,force:true});}});
