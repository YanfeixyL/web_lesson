import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, User, Region, HelpRequest, Response, Success, Op, sequelize } from './models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.mkdirSync(path.join(root, 'uploads'), { recursive: true });
const app = express();
// Express 4 does not forward rejected async handlers automatically.
for (const method of ['get','post','put','delete']) {
 const original = app[method].bind(app);
 app[method] = (route, ...handlers) => original(route, ...handlers.map(fn => fn.constructor.name === 'AsyncFunction' ? (req,res,next) => Promise.resolve(fn(req,res,next)).catch(next) : fn));
}
let writeQueue = Promise.resolve();
// Serialize writes in this single-process course demo. The acceptance transaction
// and unique success keys also prevent partial and duplicate success records.
app.use((req,res,next)=>{
 if (!['POST','PUT','DELETE'].includes(req.method)) return next();
 const previous = writeQueue;
 writeQueue = new Promise(resolve => { res.once('finish',resolve);res.once('close',resolve); });
 previous.then(next);
});
const JWT_SECRET = process.env.JWT_SECRET || 'haobangshou-course-secret';
const uploadDir = process.env.UPLOAD_DIR || path.join(root, 'uploads');
fs.mkdirSync(uploadDir, {recursive:true});
const upload = multer({ dest: uploadDir, limits:{fileSize:20*1024*1024}, fileFilter(req,file,cb){ if(!/\.(txt|pdf|png|jpe?g|gif|webp|mp4|webm)$/i.test(file.originalname)) { const error = new Error('附件格式不支持'); error.status = 400; return cb(error); } cb(null,true); } });
// A rejected form must not leave its newly uploaded file on disk.
app.use((req, res, next) => {
  res.once('finish', () => {
    if (req.file && res.statusCode >= 400) fs.unlink(req.file.path, () => {});
  });
  next();
});
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir, {setHeaders(res){res.setHeader("Content-Disposition", "attachment");res.setHeader("X-Content-Type-Options", "nosniff");}}));
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'haobangshou' }));
app.use(express.static(path.join(root, 'public'), { maxAge: 0 }));

function safeUser(u) { return { id: u.id, username: u.username, role: u.role, name: u.name, phone: u.phone, bio: u.bio, createdAt: u.createdAt, updatedAt: u.updatedAt }; }
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ message: '登录已失效，请重新登录' }); }
}
function adminOnly(req, res, next) { return req.user.role === 'admin' ? next() : res.status(403).json({ message: '仅管理员可执行此操作' }); }
function validatePassword(p) { return typeof p === 'string' && p.length >= 6 && (p.match(/\d/g) || []).length >= 2 && !(p === p.toLowerCase() || p === p.toUpperCase()); }
function pageParams(req) { const page = Math.min(Math.max(Math.floor(Number(req.query.page)) || 1, 1), 1000000); const size = Math.min(Math.max(Math.floor(Number(req.query.size)) || 8, 1), 50); return { page, size, offset: (page - 1) * size }; }
function requestInclude() { return [{ model: User, as: 'publisher', attributes: ['id', 'username', 'name', 'phone', 'bio'] }, { model: Region, attributes: ['id', 'name', 'city', 'province'] }]; }

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, phone, bio = '' } = req.body;
    if (typeof username !== 'string' || !username.trim() || username.length > 30 || typeof name !== 'string' || !name.trim() || name.length > 30 || !/^\d{11}$/.test(phone)) return res.status(400).json({ message: '用户名、姓名和 11 位手机号必填，用户名和姓名最多 30 字' });
    if (typeof bio !== 'string' || bio.length > 500) return res.status(400).json({message:'简介最多 500 字'});
    if (!validatePassword(password)) return res.status(400).json({ message: '密码至少 6 位，至少包含两个数字，且不能全部为大写或小写' });
    if (await User.findOne({ where: { username } })) return res.status(400).json({ message: '用户名已存在' });
    const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 10), name, phone, bio });
    res.status(201).json({ user: safeUser(user) });
  } catch (e) { res.status(400).json({ message: e.name === 'SequelizeUniqueConstraintError' ? '用户名已存在' : e.message }); }
});
app.post('/api/auth/login', async (req, res) => {
  if (typeof req.body.username !== 'string' || typeof req.body.password !== 'string') return res.status(400).json({message:'请填写用户名和密码'});
  const user = await User.findOne({ where: { username: req.body.username } });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ message: '用户名或密码错误' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: safeUser(user) });
});
app.get('/api/auth/me', auth, async (req, res) => res.json({ user: safeUser(await User.findByPk(req.user.id)) }));
app.put('/api/users/me', auth, async (req, res) => {
  const user = await User.findByPk(req.user.id); const { phone, bio, password } = req.body;
  if (!user) return res.status(401).json({message:'用户不存在，请重新登录'});
  if (bio !== undefined && (typeof bio !== 'string' || bio.length > 500)) return res.status(400).json({message:'简介最多 500 字'});
  if (phone !== undefined && !/^\d{11}$/.test(phone)) return res.status(400).json({ message: '手机号必须为 11 位数字' });
  if (password !== undefined && password && !validatePassword(password)) return res.status(400).json({ message: '密码至少 6 位，至少包含两个数字，且不能全部为大写或小写' });
  await user.update({ phone: phone ?? user.phone, bio: bio ?? user.bio, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) });
  res.json({ user: safeUser(user) });
});

app.get('/api/regions', async (req, res) => res.json({ items: await Region.findAll({ order: [['province', 'ASC'], ['city', 'ASC'], ['name', 'ASC']] }) }));
app.get('/api/types', async (req, res) => res.json({ items: ['导游', '代购', '宠物代管', '绿植代培', '住院陪护', '搬家协助', '其他'] }));

app.get('/api/requests', auth, async (req, res) => {
  const { page, size, offset } = pageParams(req); const where = {};
  if (req.query.type) where.type = { [Op.like]: `%${req.query.type}%` };
  if (req.query.status !== undefined && req.query.status !== '') where.status = req.query.status;
  if (req.query.keyword) where[Op.or] = [{ title: { [Op.like]: `%${req.query.keyword}%` } }, { description: { [Op.like]: `%${req.query.keyword}%` } }];
  if (req.query.regionId) where.regionId = req.query.regionId;
  if (req.query.province || req.query.city || req.query.district) {
    const allRegions = await Region.findAll();
    const ids = allRegions.filter(r => (!req.query.province || r.province === req.query.province) && (!req.query.city || r.city === req.query.city) && (!req.query.district || r.name === req.query.district)).map(r => r.id);
    where.regionId = { [Op.in]: ids };
  }
  if (req.query.mine === '1') where.userId = req.user.id;
  const result = await HelpRequest.findAndCountAll({ where, include: requestInclude(), order: [['createdAt', 'DESC']], limit: size, offset, distinct: true });
  res.json({ items: result.rows, total: result.count, page, size, pages: Math.ceil(result.count / size) });
});
app.get('/api/requests/:id', auth, async (req, res) => {
  const item = await HelpRequest.findByPk(req.params.id, { include: [...requestInclude(), { model: Response, include: [{ model: User, as: 'responder', attributes: ['id', 'username', 'name', 'phone', 'bio'] }] }] });
  if (!item) return res.status(404).json({ message: '需求不存在' }); res.json({ item: { ...item.toJSON(), Response: item.Responses } });
});
async function requestError(body) {
 if (![body.type,body.title,body.description,body.address].every(x=>typeof x==='string'&&x.trim())) return '请填写完整的类型、标题、描述和具体地址';
 if (body.type.length>30 || body.title.length>100 || body.address.length>200) return '输入内容过长';
  if (!Number.isInteger(Number(body.regionId)) || !await Region.findByPk(body.regionId)) return '地域不存在';
}
app.post('/api/requests', auth, upload.single('attachment'), async (req, res) => {
  const error = await requestError(req.body); if(error) return res.status(400).json({message:error});
  const { type, title, description, regionId, address = '' } = req.body;
  if (!type || !title || !description || !regionId || !address.trim()) return res.status(400).json({ message: '请填写完整的服务类型、地域和具体地址' });
  const item = await HelpRequest.create({ type, title, description, regionId, address: address.trim(), userId: req.user.id, attachment: req.file?.filename || '' });
  res.status(201).json({ item });
});
app.put('/api/requests/:id', auth, upload.single('attachment'), async (req, res) => {
  const item = await HelpRequest.findByPk(req.params.id); if (!item || item.userId !== req.user.id) return res.status(404).json({ message: '需求不存在' });
  if (item.status !== 0) return res.status(400).json({message:'已归档需求不能修改或删除'});
  if (await Response.count({ where: { requestId: item.id } })) return res.status(400).json({ message: '已有响应的需求不能修改' });
  const error = await requestError(req.body); if(error) return res.status(400).json({message:error});
  await item.update({ type: req.body.type, title: req.body.title, description: req.body.description, regionId: req.body.regionId, address: (req.body.address || '').trim(), ...(req.file ? { attachment: req.file.filename } : {}) }); res.json({ item });
});
app.delete('/api/requests/:id', auth, async (req, res) => {
  const item = await HelpRequest.findByPk(req.params.id); if (!item || item.userId !== req.user.id) return res.status(404).json({ message: '需求不存在' });
  if (item.status !== 0) return res.status(400).json({message:'需求已归档或取消'});
  if (await Response.count({ where: { requestId: item.id } })) return res.status(400).json({ message: '已有响应的需求不能删除' }); await item.update({ status: -1 }); res.json({ message: '需求已删除' });
});

app.get('/api/responses', auth, async (req, res) => {
  const { page, size, offset } = pageParams(req); const where = req.query.mine === '0' && req.user.role==='admin' ? {} : { userId: req.user.id };
  if (req.query.status !== undefined && req.query.status !== '') where.status = req.query.status;
  const result = await Response.findAndCountAll({ where, include: [{ model: HelpRequest, include: requestInclude() }, { model: User, as: 'responder', attributes: ['id', 'username', 'name', 'phone', 'bio'] }], order: [['createdAt', 'DESC']], limit: size, offset });
  res.json({ items: result.rows, total: result.count, page, size, pages: Math.ceil(result.count / size) });
});
app.post('/api/requests/:id/responses', auth, upload.single('attachment'), async (req, res) => {
  const request = await HelpRequest.findByPk(req.params.id); if (!request || request.status !== 0) return res.status(404).json({ message: '需求不存在或已取消' });
  if (request.userId === req.user.id) return res.status(400).json({ message: '不能响应自己发布的需求' });
  if (await Response.findOne({ where: { requestId: request.id, userId: req.user.id, status: { [Op.in]: [0, 1] } } })) return res.status(400).json({ message: '你已经响应过该需求' });
  if (typeof req.body.description !== 'string' || !req.body.description.trim()) return res.status(400).json({message:'响应说明不能为空'});
  const item = await Response.create({ requestId: request.id, userId: req.user.id, description: req.body.description, attachment: req.file?.filename || '' }); res.status(201).json({ item });
});
app.put('/api/responses/:id', auth, upload.single('attachment'), async (req, res) => {
  const item = await Response.findByPk(req.params.id); if (!item || item.userId !== req.user.id || ![0,2].includes(item.status)) return res.status(400).json({ message: '只能修改自己尚未接受的响应' });
  if (typeof req.body.description !== 'string' || !req.body.description.trim()) return res.status(400).json({message:'响应说明不能为空'});
  if (item.status===2 && (await HelpRequest.findByPk(item.requestId)).status!==0) return res.status(400).json({message:'需求已归档'});
  await item.update({ status:0, description: req.body.description, ...(req.file ? { attachment: req.file.filename } : {}) }); res.json({ item });
});
app.delete('/api/responses/:id', auth, async (req, res) => {
  const item = await Response.findByPk(req.params.id); if (!item || item.userId !== req.user.id || ![0,2].includes(item.status)) return res.status(400).json({ message: '只能删除自己尚未接受的响应' }); await item.update({ status: 3 }); res.json({ message: '响应已取消' });
});
app.post('/api/responses/:id/decision', auth, async (req, res) => {
  const item = await Response.findByPk(req.params.id, { include: [HelpRequest] }); if (!item || item.HelpRequest.userId !== req.user.id) return res.status(404).json({ message: '响应不存在' });
  if (![1, 2].includes(Number(req.body.status)) || item.status !== 0) return res.status(400).json({ message: '当前响应不能操作' });
  if (item.HelpRequest.status !== 0) return res.status(400).json({message:'需求已归档'});
  await sequelize.transaction(async transaction => {
   await item.update({status:Number(req.body.status)}, {transaction});
   if(item.status===1){
    await Success.create({requestId:item.requestId,responseId:item.id,publisherId:req.user.id,responderId:item.userId}, {transaction});
    await HelpRequest.update({status:-1}, {where:{id:item.requestId},transaction});
    await Response.update({status:2},{where:{requestId:item.requestId,status:0},transaction});
   }
  });
  res.json({ item });
});

app.get('/api/stats', auth, async (req, res) => {
  const now = new Date();
  const month = d => d.toISOString().slice(0,7);
  const start = req.query.start || month(new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-5,1)));
  const end = req.query.end || month(now);
  if (![start,end].every(x=>/^\d{4}-(0[1-9]|1[0-2])$/.test(x)) || start>end || Number(end.slice(0,4))-Number(start.slice(0,4))>10) return res.status(400).json({message:'请输入有效年月，起始不能晚于终止，跨度不超过十年'});
  const lower=new Date(start+'-01T00:00:00Z'), upper=new Date(end+'-01T00:00:00Z'); upper.setUTCMonth(upper.getUTCMonth()+1);
  const range = {[Op.gte]:lower,[Op.lt]:upper};
  const regions=await Region.findAll();
  const ids=regions.filter(r=>(!req.query.regionId||r.id===Number(req.query.regionId))&&(!req.query.province||r.province===req.query.province)&&(!req.query.city||r.city===req.query.city)&&(!req.query.district||r.name===req.query.district)).map(r=>r.id);
  const where={regionId:{[Op.in]:ids},...(req.query.type?{type:req.query.type}:{})};
  const requests=await HelpRequest.findAll({where});
  const byId=new Map(requests.map(r=>[r.id,r]));
  const map=new Map();
  for(let d=new Date(lower);d<upper;d.setUTCMonth(d.getUTCMonth()+1)) map.set(month(d),{month:month(d),published:0,accepted:0,details:[]});
  function add(key,r,field){const entry=map.get(key);if(!entry)return;entry[field]++;let detail=entry.details.find(x=>x.type===r.type&&x.regionId===r.regionId);if(!detail){const region=regions.find(x=>x.id===r.regionId);detail={type:r.type,regionId:r.regionId,region:region.province+' '+region.city,published:0,accepted:0};entry.details.push(detail);}detail[field]++;}
  requests.forEach(r=>add(month(new Date(r.createdAt)),r,'published'));
  const successes=await Success.findAll({where:{acceptedAt:range}});
  successes.forEach(s=>{const r=byId.get(s.requestId);if(r)add(month(new Date(s.acceptedAt)),r,'accepted');});
  res.json({items:[...map.values()],start,end});
});
app.get('/api/admin/users', auth, adminOnly, async (req, res) => { const result = await User.findAll({ order: [['createdAt', 'DESC']] }); res.json({ items: result.map(safeUser) }); });
app.get('/api/admin/requests', auth, adminOnly, async (req, res) => { const result = await HelpRequest.findAll({ where:req.query.status!==undefined && req.query.status!==''?{status:req.query.status}:{}, include: requestInclude(), order: [['createdAt', 'DESC']] }); res.json({ items: result }); });

app.get('/api/admin/responses',auth,adminOnly,async(req,res)=>res.json({items:await Response.findAll({where:req.query.status!==undefined && req.query.status!==''?{status:req.query.status}:{},include:[{model:HelpRequest,include:requestInclude()},{model:User,as:'responder',attributes:['id','username','name','phone','bio']}]})}));
app.use('/api', (req,res)=>res.status(404).json({message:'接口不存在'}));
app.use((err,req,res,next)=>{console.error(err.message);const status=err instanceof multer.MulterError || err.type==='entity.parse.failed' ? 400 : err.status || 500;res.status(status).json({message:err instanceof multer.MulterError?'附件超过 20 MB 或格式不正确':status===400?err.message:'请求处理失败，请检查输入或稍后重试'});});
app.get('*', (req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
const port = Number(process.env.PORT || 3000);
initDatabase().then(() => app.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`好帮手已启动: http://localhost:${port}`))).catch(err => { console.error(err); process.exit(1); });
