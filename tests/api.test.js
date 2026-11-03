import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
const dir=mkdtempSync(path.join(tmpdir(),'hb-test-'));
const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const base='http://127.0.0.1:'+port;let server;let logs='';
async function start(){server=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DB_DIALECT:'sqlite',DB_STORAGE:path.join(dir,'test.sqlite'),UPLOAD_DIR:path.join(dir,'uploads')}});server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error(logs);}
async function stop(){if(server.exitCode!==null)return;await new Promise(r=>{server.once('exit',r);server.kill();});}
async function call(url,method='GET',body,token){const r=await fetch(base+'/api'+url,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(body && !(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body?body instanceof FormData?body:JSON.stringify(body):undefined});return {status:r.status,data:await r.json()};}
async function login(username,password){const r=await call('/auth/login','POST',{username,password});assert.equal(r.status,200);return r.data.token;}
const q={type:'导游',title:'测试求助',description:'需要导游帮助',regionId:1,address:'南京市鼓楼区测试路 1 号'};
test('好帮手功能与持久化集成验证',async t=>{try{
 await start();let admin,owner,helper,third,id,rid;
 await t.test('管理员为 PDF 指定账号 admin/admin',async()=>{admin=await login('admin','admin');});
 await t.test('普通用户登录与错误密码',async()=>{owner=await login('zhangsan','Abc12345');helper=await login('lisi','Abc12345');assert.equal((await call('/auth/login','POST',{username:'admin',password:'bad'})).status,401);});
 await t.test('匿名访问被拦截',async()=>assert.equal((await call('/requests')).status,401));
 await t.test('密码和手机号校验',async()=>{for(const password of ['abc123','ABC123','Abcde1','Ab12'])assert.equal((await call('/auth/register','POST',{username:'bad',password,name:'测试',phone:'13800138000'})).status,400);assert.equal((await call('/auth/register','POST',{username:'bad',password:'Abc123',name:'测试',phone:'123'})).status,400);});
 await t.test('注册与用户名唯一',async()=>{const body={username:'tester',password:'Abc123',name:'测试用户',phone:'13800138000'};assert.equal((await call('/auth/register','POST',body)).status,201);assert.equal((await call('/auth/register','POST',body)).status,400);third=await login('tester','Abc123');});
 await t.test('仅允许修改电话简介密码',async()=>{const r=await call('/users/me','PUT',{phone:'13800138001',bio:'新的简介',name:'越权改名',role:'admin'},third);assert.equal(r.data.user.name,'测试用户');assert.equal(r.data.user.role,'user');assert.equal(r.data.user.bio,'新的简介');});
 await t.test('发布时校验地域及空字段',async()=>{assert.equal((await call('/requests','POST',{...q,regionId:999},owner)).status,400);assert.equal((await call('/requests','POST',{...q,title:' '},owner)).status,400);});
 await t.test('发布需求和上传文字附件',async()=>{const fd=new FormData();for(const[k,v]of Object.entries(q))fd.append(k,v);fd.append('attachment',new Blob(['附件测试'],{type:'text/plain'}),'intro.txt');const r=await call('/requests','POST',fd,owner);assert.equal(r.status,201);id=r.data.item.id;assert.ok(r.data.item.attachment);assert.equal((await fetch(base+'/uploads/'+r.data.item.attachment)).status,200);});
 await t.test('类型模糊搜索和分页',async()=>{const r=await call('/requests?type=导&size=1&page=1','GET',null,owner);assert.equal(r.data.items.length,1);assert.ok(r.data.total>=2);});
 await t.test('前端空状态筛选仍显示全部需求',async()=>{const r=await call('/requests?keyword=&type=&status=&province=&city=&district=','GET',null,owner);assert.equal(r.status,200);assert.equal(r.data.total,4);assert.equal(r.data.items.length,4);});
 await t.test('未响应需求允许修改',async()=>assert.equal((await call('/requests/'+id,'PUT',{...q,title:'已修改'},owner)).status,200));
 await t.test('阻止他人修改及自己响应',async()=>{assert.equal((await call('/requests/'+id,'PUT',q,helper)).status,404);assert.equal((await call('/requests/'+id+'/responses','POST',{description:'自己响应'},owner)).status,400);});
 await t.test('响应创建和重复检查',async()=>{const r=await call('/requests/'+id+'/responses','POST',{description:'我能帮助'},helper);assert.equal(r.status,201);rid=r.data.item.id;assert.equal((await call('/requests/'+id+'/responses','POST',{description:'重复'},helper)).status,400);});
 await t.test('已有响应的需求禁止修改和删除',async()=>{assert.equal((await call('/requests/'+id,'PUT',q,owner)).status,400);assert.equal((await call('/requests/'+id,'DELETE',null,owner)).status,400);});
 await t.test('响应支持附件修改和分页',async()=>{const fd=new FormData();fd.append('description','携带附件的响应');fd.append('attachment',new Blob(['响应附件']),'response.txt');const updated=await call('/responses/'+rid,'PUT',fd,helper);assert.equal(updated.status,200);assert.ok(updated.data.item.attachment);assert.equal((await fetch(base+'/uploads/'+updated.data.item.attachment)).status,200);const list=await call('/responses?status=&size=1&page=1','GET',null,helper);assert.equal(list.data.items.length,1);assert.equal(list.data.page,1);});
 await t.test('拒绝不支持的附件格式',async()=>{const fd=new FormData();for(const[k,v]of Object.entries(q))fd.append(k,v);fd.append('attachment',new Blob(['bad']),'test.exe');assert.equal((await call('/requests','POST',fd,owner)).status,400);});
 await t.test('响应详情包含介绍且不泄露密码',async()=>{const r=await call('/requests/'+id,'GET',null,owner);assert.equal(r.data.item.Responses[0].responder.name,'李四');assert.ok(!JSON.stringify(r.data).includes('passwordHash'));});
 await t.test('拒绝后可修改重提',async()=>{assert.equal((await call('/responses/'+rid+'/decision','POST',{status:2},owner)).status,200);assert.equal((await call('/responses/'+rid,'PUT',{description:'修改后重新响应'},helper)).data.item.status,0);});
 await t.test('接受并发幂等且其他响应自动拒绝',async()=>{assert.equal((await call('/requests/'+id+'/responses','POST',{description:'另一个响应'},third)).status,201);const results=await Promise.all([call('/responses/'+rid+'/decision','POST',{status:1},owner),call('/responses/'+rid+'/decision','POST',{status:1},owner)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);const r=await call('/requests/'+id,'GET',null,owner);assert.equal(r.data.item.status,-1);assert.deepEqual(r.data.item.Responses.map(r=>r.status).sort(),[1,2]);});
 await t.test('已接受响应禁止改删并可单独查询',async()=>{assert.equal((await call('/responses/'+rid,'PUT',{description:'改'},helper)).status,400);assert.equal((await call('/responses/'+rid,'DELETE',null,helper)).status,400);assert.ok((await call('/responses?status=1','GET',null,helper)).data.items.some(x=>x.id===rid));});
 await t.test('所有已发布需求包含归档记录',async()=>assert.ok((await call('/requests?mine=1','GET',null,owner)).data.items.some(x=>x.id===id&&x.status===-1)));
 await t.test('无响应需求取消及响应取消',async()=>{const r=await call('/requests','POST',q,owner);const x=r.data.item.id;assert.equal((await call('/requests/'+x,'DELETE',null,owner)).status,200);const n=await call('/requests','POST',q,owner);const resp=await call('/requests/'+n.data.item.id+'/responses','POST',{description:'随后取消'},helper);assert.equal((await call('/responses/'+resp.data.item.id,'DELETE',null,helper)).status,200);});
 await t.test('管理员权限和响应查询',async()=>{assert.equal((await call('/admin/users','GET',null,owner)).status,403);assert.equal((await call('/admin/responses?status=1','GET',null,admin)).data.items.length,1);});
 await t.test('地域统计和成功类型明细',async()=>{const r=await call('/stats?regionId=1','GET',null,admin);assert.equal(r.data.items.length,6);assert.equal(r.data.items.reduce((n,x)=>n+x.accepted,0),1);assert.ok(r.data.items.flatMap(x=>x.details).some(x=>x.type==='导游'&&x.accepted===1));assert.equal((await call('/stats?regionId=2','GET',null,admin)).data.items.reduce((n,x)=>n+x.accepted,0),0);});
 await t.test('月份边界与反向时间检查',async()=>{const r=await call('/stats?start=2026-02&end=2026-02','GET',null,admin);assert.equal(r.status,200);assert.equal(r.data.items.length,1);assert.equal((await call('/stats?start=2026-13','GET',null,admin)).status,400);assert.equal((await call('/stats?start=2026-03&end=2026-02','GET',null,admin)).status,400);});
 await t.test('重启后数据保留',async()=>{await stop();await start();const r=await call('/requests/'+id,'GET',null,owner);assert.equal(r.data.item.title,'已修改');assert.equal(r.data.item.Responses.find(x=>x.id===rid).status,1);});
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}});
