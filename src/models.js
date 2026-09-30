/* 默认开发模式使用 JSON 持久化，部署到 MySQL 时可按 sql.txt 切换 Sequelize。 */
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
const dbPath = path.join(process.cwd(), 'data', 'haobangshou.json');
export const Op = { in: Symbol('in'), like: Symbol('like'), or: Symbol('or'), between: Symbol('between') };
const state = { users: [], regions: [], requests: [], responses: [], successes: [] }; let dirty = false;
function load(){try{Object.assign(state,JSON.parse(fs.readFileSync(dbPath,'utf8')));state.requests.forEach(x=>{if(x.status===undefined)x.status=0});state.responses.forEach(x=>{if(x.status===undefined)x.status=0});state.successes.forEach(x=>{if(!x.acceptedAt)x.acceptedAt=x.createdAt});dirty=true;save()}catch{}}
function save(){if(!dirty)return;fs.mkdirSync(path.dirname(dbPath),{recursive:true});fs.writeFileSync(dbPath,JSON.stringify(state,null,2));dirty=false}
const now=()=>new Date().toISOString();
function match(record,where={}){return Reflect.ownKeys(where).every(key=>{const expected=where[key];if(key===Op.or)return expected.some(x=>match(record,x));const actual=record[key];if(expected&&typeof expected==='object'){if(Op.in in expected)return expected[Op.in].map(Number).includes(Number(actual));if(Op.like in expected)return String(actual||'').toLowerCase().includes(String(expected[Op.like]).replaceAll('%','').toLowerCase());if(Op.between in expected)return new Date(actual)>=new Date(expected[Op.between][0])&&new Date(actual)<=new Date(expected[Op.between][1])}return String(actual)===String(expected)})}
const clone=x=>JSON.parse(JSON.stringify(x));
class BaseModel{
 constructor(table){this.table=table} get rows(){return state[this.table]}
 async count({where={}}={}){return this.rows.filter(x=>match(x,where)).length}
 async create(data){const t=now(),defaults=this.table==='requests'?{status:0}:this.table==='responses'?{status:0}:this.table==='successes'?{acceptedAt:t}:{};const row={id:this.rows.reduce((m,x)=>Math.max(m,x.id||0),0)+1,createdAt:t,updatedAt:t,...defaults,...data};this.rows.push(row);dirty=true;save();return this.wrap(row)}
 async bulkCreate(items){const out=[];for(const x of items)out.push(await this.create(x));return out}
 async findOne({where={}}={}){const row=this.rows.find(x=>match(x,where));return row?this.wrap(row):null}
 async findByPk(id){const row=this.rows.find(x=>Number(x.id)===Number(id));return row?this.wrap(row):null}
 async findAll({where={},order=[],limit,offset=0}={}){let rows=this.rows.filter(x=>match(x,where));if(order.length){const[f,d]=order[0];rows.sort((a,b)=>String(a[f]).localeCompare(String(b[f]))*(d==='DESC'?-1:1))}if(offset||limit)rows=rows.slice(offset,limit?offset+limit:undefined);return rows.map(x=>this.wrap(x))}
 async findAndCountAll(opts={}){const all=await this.findAll({...opts,limit:undefined,offset:0});const off=opts.offset||0;return{rows:all.slice(off,opts.limit?off+opts.limit:undefined),count:all.length}}
 async update(values,opts={}){const rows=this.rows.filter(x=>match(x,opts.where||{}));rows.forEach(row=>Object.assign(row,values,{updatedAt:now()}));if(rows.length){dirty=true;save()}return[rows.length]}
 wrap(row){const o={...clone(row)};o.update=async values=>{Object.assign(row,values,{updatedAt:now()});dirty=true;save();Object.assign(o,values);return o};return o}
}
const omitPassword=u=>{const{passwordHash,...safe}=u;return safe};
class UserModel extends BaseModel{constructor(){super('users')}wrap(row){return super.wrap(row)}}
class RegionModel extends BaseModel{constructor(){super('regions')}}
class RequestModel extends BaseModel{constructor(){super('requests')}wrap(row,withResponses=true){const o=super.wrap(row),u=state.users.find(x=>x.id===row.userId),r=state.regions.find(x=>x.id===row.regionId);o.publisher=u?omitPassword(u):null;o.Region=r?clone(r):null;if(withResponses){o.Responses=state.responses.filter(x=>x.requestId===row.id).map(x=>new ResponseModel().wrap(x));o.Response=o.Responses}return o}}
class ResponseModel extends BaseModel{constructor(){super('responses')}wrap(row){const o=super.wrap(row),q=state.requests.find(x=>x.id===row.requestId),u=state.users.find(x=>x.id===row.userId);o.HelpRequest=q?new RequestModel().wrap(q,false):null;o.responder=u?omitPassword(u):null;return o}}
class SuccessModel extends BaseModel{constructor(){super('successes')}}
export const User=new UserModel(),Region=new RegionModel(),HelpRequest=new RequestModel(),Response=new ResponseModel(),Success=new SuccessModel();
export const sequelize={async sync(){}};
export async function initDatabase(){load();if(state.users.length)return User.findOne({where:{username:'admin'}});const admin=await User.create({username:'admin',passwordHash:await bcrypt.hash('admin123',10),role:'admin',name:'系统管理员',phone:'13800000000',bio:'平台管理员'});const zhang=await User.create({username:'zhangsan',passwordHash:await bcrypt.hash('abc12345',10),role:'user',name:'张三',phone:'13900000001',bio:'喜欢旅行和帮助别人'});const li=await User.create({username:'lisi',passwordHash:await bcrypt.hash('abc12345',10),role:'user',name:'李四',phone:'13900000002',bio:'熟悉本地生活服务'});const rs=await Region.bulkCreate([{name:'鼓楼区',city:'南京市',province:'江苏省'},{name:'浦东新区',city:'上海市',province:'上海市'},{name:'西湖区',city:'杭州市',province:'浙江省'}]);const qs=await HelpRequest.bulkCreate([{userId:zhang.id,regionId:rs[0].id,type:'导游',title:'周末南京博物院导游',description:'希望熟悉历史的朋友带我参观南京博物院，时间半天。'},{userId:li.id,regionId:rs[1].id,type:'代购',title:'帮忙购买药品',description:'需要在附近药房代购常用药品，费用可当面结算。'},{userId:zhang.id,regionId:rs[2].id,type:'宠物代管',title:'出差期间照顾猫咪',description:'照顾一只温顺的猫咪，周期 5 天，有偿。'}]);await Response.create({requestId:qs[0].id,userId:li.id,description:'我对南京历史很熟悉，可以全程陪同。'});await Response.create({requestId:qs[1].id,userId:zhang.id,description:'我住在附近，今晚可以帮忙购买。'});return admin}
