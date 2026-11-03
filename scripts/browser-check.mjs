import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
const scratch=mkdtempSync(path.join(tmpdir(),'hb-ui-'));
const port=await new Promise(resolve=>{const socket=net.createServer();socket.listen(0,'127.0.0.1',()=>{const port=socket.address().port;socket.close(()=>resolve(port));});});
const base=`http://127.0.0.1:${port}`;
const output=process.env.SCREENSHOT_DIR || 'tmp/qa';mkdirSync(output,{recursive:true});
let log='';const server=spawn(process.execPath,['src/server.js'],{env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DB_DIALECT:'sqlite',DB_STORAGE:path.join(scratch,'demo.sqlite'),UPLOAD_DIR:path.join(scratch,'uploads')}});
server.stdout.on('data',s=>log+=s);server.stderr.on('data',s=>log+=s);
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}if(i===99)throw Error(log);await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),headless:true});
 const page=await browser.newPage({reducedMotion:'reduce',viewport:{width:1440,height:1050},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(base);
 await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
 const capture=async name=>{if(await page.locator('.toast').count())await page.locator('.toast').waitFor({state:'hidden'});await page.screenshot({path:path.join(output,name+'.png'),fullPage:true,animations:'disabled'});};
 async function login(username,password){await page.locator('input').nth(0).fill(username);await page.locator('input[type=password]').fill(password);await page.getByRole('button',{name:'登录平台'}).click();await page.locator('.page-head').waitFor();await page.waitForFunction(()=>document.querySelector('.request-card'));}
 async function logout(){await page.getByRole('button',{name:'退出',exact:true}).click();await page.getByRole('button',{name:'登录平台'}).waitFor();}
 const title='周末鼓楼区历史街区导游';
 await capture('login');await login('zhangsan','Abc12345');await capture('home');
 await page.getByRole('button',{name:'我的求助',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.list-meta')?.textContent.includes('2 条'));
 await page.getByRole('button',{name:'＋ 发布求助'}).click();
 const modal=page.locator('.modal');
 await modal.getByLabel('帮助类型').selectOption('导游');await modal.getByLabel('省份').selectOption('江苏省');await modal.getByLabel('城市').selectOption('南京市');await modal.getByLabel('区县').selectOption('鼓楼区');
 await modal.getByLabel('具体地址').fill('南京市鼓楼区中山北路 100 号');await modal.getByLabel('需求主题').fill(title);await modal.getByLabel('详细描述').fill('周六上午参观历史街区，希望熟悉本地历史的朋友带路，约两小时。');
 await modal.locator('input[type=file]').setInputFiles({name:'route.txt',mimeType:'text/plain',buffer:Buffer.from('行程：鼓楼至湖南路，约两小时。')});await capture('publish');
 await modal.getByRole('button',{name:'保存需求'}).click();await page.locator('.modal').waitFor({state:'hidden'});await page.locator('.request-card').filter({hasText:title}).waitFor();await logout();
 await login('lisi','Abc12345');await page.getByRole('button',{name:'浏览求助',exact:true}).click();
 await page.getByPlaceholder('搜索需求标题或描述').fill(title);await page.getByPlaceholder('搜索需求标题或描述').press('Enter');
 const card=page.locator('.request-card').filter({hasText:title});await card.waitFor();await page.waitForFunction(()=>document.querySelector('.list-meta')?.textContent.includes('共 1 条'));assert.equal(await page.locator('.request-card').count(),1);
 await card.getByRole('button',{name:'详情',exact:true}).click();await page.getByRole('button',{name:'发布者资料'}).click();await page.getByRole('heading',{name:'用户详细资料'}).waitFor();assert.ok((await page.locator('.modal').last().textContent()).includes('张三'));await page.locator('.modal').last().getByRole('button',{name:'×',exact:true}).click();
 await page.getByRole('button',{name:'我来也',exact:true}).click();await page.getByPlaceholder('介绍你能提供的帮助').fill('我熟悉鼓楼区历史街区，周六上午可以带路。');await page.locator('.modal input[type=file]').setInputFiles({name:'intro.txt',mimeType:'text/plain',buffer:Buffer.from('熟悉本地历史和交通。')});await page.getByRole('button',{name:'提交“我来也”'}).click();await page.locator('.modal').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'我的响应',exact:true}).click();await page.locator('.response-row').filter({hasText:title}).waitFor();await page.getByRole('button',{name:'编辑',exact:true}).click();await page.getByPlaceholder('介绍你能提供的帮助').fill('周六上午九点可以到达，也可提前协商行程。');await page.getByRole('button',{name:'提交“我来也”'}).click();await page.locator('.modal').waitFor({state:'hidden'});await capture('responses');await logout();
 await login('zhangsan','Abc12345');await page.getByRole('button',{name:'我的求助',exact:true}).click();await page.locator('.request-card').filter({hasText:title}).getByRole('button',{name:'详情',exact:true}).click();await page.getByRole('button',{name:'接受',exact:true}).waitFor();await capture('decision');await page.getByRole('button',{name:'接受',exact:true}).click();await page.locator('.modal').waitFor({state:'hidden'});await logout();
 await login('admin','admin');await page.getByRole('button',{name:'统计分析',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.bar-group').length===6);assert.equal(await page.locator('.stat-cards strong').nth(1).innerText(),'1');await capture('stats');
 await page.getByRole('button',{name:'管理后台',exact:true}).click();await page.getByRole('button',{name:'响应状态',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.admin tbody tr').length===1 && document.querySelector('.admin tbody')?.textContent.includes('已接受'));await capture('admin');
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'首页',exact:true}).click();await capture('mobile');
 await page.setViewportSize({width:1440,height:1050});
 await page.evaluate(async()=>{for(let i=0;i<9;i++){const result=await fetch('/api/requests',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+localStorage.getItem('hb_token')},body:JSON.stringify({type:'导游',title:'分页检查 '+i,description:'用于验证筛选后页码重置',regionId:1,address:'南京市鼓楼区测试地址'})});if(result.status!==201)throw Error('分页数据创建失败');}});
 await page.getByRole('button',{name:'浏览求助',exact:true}).click();await page.getByPlaceholder('搜索需求标题或描述').fill('');await page.getByPlaceholder('搜索需求标题或描述').press('Enter');await page.waitForFunction(()=>document.querySelector('.list-meta')?.textContent.includes('共 13 条'));
 await page.locator('.pager').getByRole('button',{name:'2',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.pager button.active')?.textContent==='2');
 await page.getByPlaceholder('输入其他类型名称模糊查询').fill('宠物');await page.getByPlaceholder('输入其他类型名称模糊查询').press('Enter');await page.waitForFunction(()=>document.querySelector('.list-meta')?.textContent.includes('共 1 条'));assert.equal(await page.locator('.request-card').count(),1);assert.ok((await page.locator('.request-card').innerText()).includes('猫咪'));
 assert.deepEqual(errors,[]);writeFileSync(path.join(output,'browser-results.txt'),'浏览器验收通过：双用户发布、附件上传、查询、用户详情、提交和修改响应、接受响应、统计图表、管理员响应列表、移动端及第二页筛选后重置页码。无 JavaScript 页面异常。\n');console.log('浏览器端到端验收通过');
}finally{
 if(browser)await browser.close();if(server.exitCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill();});rmSync(scratch,{recursive:true,force:true});
}

