import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase, User, Region, HelpRequest, Response, Success, Op } from './models.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
fs.mkdirSync(path.join(root, 'data'), { recursive: true });
fs.mkdirSync(path.join(root, 'uploads'), { recursive: true });
const app = express();
const JWT_SECRET = process.env.JWT_SECRET || 'haobangshou-course-secret';
const upload = multer({ dest: path.join(root, 'uploads') });
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(root, 'uploads')));
app.use(express.static(path.join(root, 'public')));

function safeUser(u) { return { id: u.id, username: u.username, role: u.role, name: u.name, phone: u.phone, bio: u.bio, createdAt: u.createdAt }; }
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try { req.user = jwt.verify(token, JWT_SECRET); next(); } catch { res.status(401).json({ message: '登录已失效，请重新登录' }); }
}
function adminOnly(req, res, next) { return req.user.role === 'admin' ? next() : res.status(403).json({ message: '仅管理员可执行此操作' }); }
function validatePassword(p) { return typeof p === 'string' && p.length >= 6 && (p.match(/\d/g) || []).length >= 2 && !(p === p.toLowerCase() || p === p.toUpperCase()); }
function pageParams(req) { const page = Math.max(Number(req.query.page) || 1, 1); const size = Math.min(Math.max(Number(req.query.size) || 8, 1), 50); return { page, size, offset: (page - 1) * size }; }
function requestInclude() { return [{ model: User, as: 'publisher', attributes: ['id', 'username', 'name', 'phone', 'bio'] }, { model: Region, attributes: ['id', 'name', 'city', 'province'] }]; }

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, name, phone, bio = '' } = req.body;
    if (!username || !name || !/^\d{11}$/.test(phone)) return res.status(400).json({ message: '用户名、姓名和 11 位手机号不能为空' });
    if (!validatePassword(password)) return res.status(400).json({ message: '密码至少 6 位，至少包含两个数字，且不能全部为大写或小写' });
    if (await User.findOne({ where: { username } })) return res.status(400).json({ message: '用户名已存在' });
    const user = await User.create({ username, passwordHash: await bcrypt.hash(password, 10), name, phone, bio });
    res.status(201).json({ user: safeUser(user) });
  } catch (e) { res.status(400).json({ message: e.name === 'SequelizeUniqueConstraintError' ? '用户名已存在' : e.message }); }
});
app.post('/api/auth/login', async (req, res) => {
  const user = await User.findOne({ where: { username: req.body.username } });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ message: '用户名或密码错误' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, user: safeUser(user) });
});
app.get('/api/auth/me', auth, async (req, res) => res.json({ user: safeUser(await User.findByPk(req.user.id)) }));
app.put('/api/users/me', auth, async (req, res) => {
  const user = await User.findByPk(req.user.id); const { phone, bio, password } = req.body;
  if (phone !== undefined && !/^\d{11}$/.test(phone)) return res.status(400).json({ message: '手机号必须为 11 位数字' });
  if (password !== undefined && password && !validatePassword(password)) return res.status(400).json({ message: '密码至少 6 位，至少包含两个数字，且不能全部为大写或小写' });
  await user.update({ phone: phone ?? user.phone, bio: bio ?? user.bio, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) });
  res.json({ user: safeUser(user) });
});

app.get('/api/regions', async (req, res) => res.json({ items: await Region.findAll({ order: [['province', 'ASC'], ['city', 'ASC']] }) }));
app.get('/api/types', async (req, res) => res.json({ items: ['导游', '代购', '宠物代管', '绿植代培', '住院陪护', '搬家协助', '其他'] }));

app.get('/api/requests', auth, async (req, res) => {
  const { page, size, offset } = pageParams(req); const where = { status: 0 };
  if (req.query.type) where.type = req.query.type;
  if (req.query.keyword) where[Op.or] = [{ title: { [Op.like]: `%${req.query.keyword}%` } }, { description: { [Op.like]: `%${req.query.keyword}%` } }];
  if (req.query.regionId) where.regionId = req.query.regionId;
  if (req.query.mine === '1') where.userId = req.user.id;
  const result = await HelpRequest.findAndCountAll({ where, include: requestInclude(), order: [['createdAt', 'DESC']], limit: size, offset });
  res.json({ items: result.rows, total: result.count, page, size, pages: Math.ceil(result.count / size) });
});
app.get('/api/requests/:id', auth, async (req, res) => {
  const item = await HelpRequest.findByPk(req.params.id, { include: [...requestInclude(), { model: Response, include: [{ model: User, as: 'responder', attributes: ['id', 'username', 'name', 'phone', 'bio'] }] }] });
  if (!item) return res.status(404).json({ message: '需求不存在' }); res.json({ item });
});
app.post('/api/requests', auth, upload.single('attachment'), async (req, res) => {
  const { type, title, description, regionId } = req.body;
  if (!type || !title || !description || !regionId) return res.status(400).json({ message: '请填写完整需求信息' });
  const item = await HelpRequest.create({ type, title, description, regionId, userId: req.user.id, attachment: req.file?.filename || '' });
  res.status(201).json({ item });
});
app.put('/api/requests/:id', auth, upload.single('attachment'), async (req, res) => {
  const item = await HelpRequest.findByPk(req.params.id); if (!item || item.userId !== req.user.id) return res.status(404).json({ message: '需求不存在' });
  if (await Response.count({ where: { requestId: item.id } })) return res.status(400).json({ message: '已有响应的需求不能修改' });
  await item.update({ type: req.body.type, title: req.body.title, description: req.body.description, regionId: req.body.regionId, ...(req.file ? { attachment: req.file.filename } : {}) }); res.json({ item });
});
app.delete('/api/requests/:id', auth, async (req, res) => {
  const item = await HelpRequest.findByPk(req.params.id); if (!item || item.userId !== req.user.id) return res.status(404).json({ message: '需求不存在' });
  if (await Response.count({ where: { requestId: item.id } })) return res.status(400).json({ message: '已有响应的需求不能删除' }); await item.update({ status: -1 }); res.json({ message: '需求已删除' });
});

app.get('/api/responses', auth, async (req, res) => {
  const { page, size, offset } = pageParams(req); const where = req.query.mine === '0' ? {} : { userId: req.user.id };
  if (req.query.status !== undefined) where.status = req.query.status;
  const result = await Response.findAndCountAll({ where, include: [{ model: HelpRequest, include: requestInclude() }, { model: User, as: 'responder', attributes: ['id', 'username', 'name', 'phone', 'bio'] }], order: [['createdAt', 'DESC']], limit: size, offset });
  res.json({ items: result.rows, total: result.count, page, size, pages: Math.ceil(result.count / size) });
});
app.post('/api/requests/:id/responses', auth, upload.single('attachment'), async (req, res) => {
  const request = await HelpRequest.findByPk(req.params.id); if (!request || request.status !== 0) return res.status(404).json({ message: '需求不存在或已取消' });
  if (request.userId === req.user.id) return res.status(400).json({ message: '不能响应自己发布的需求' });
  if (await Response.findOne({ where: { requestId: request.id, userId: req.user.id, status: { [Op.in]: [0, 1] } } })) return res.status(400).json({ message: '你已经响应过该需求' });
  const item = await Response.create({ requestId: request.id, userId: req.user.id, description: req.body.description, attachment: req.file?.filename || '' }); res.status(201).json({ item });
});
app.put('/api/responses/:id', auth, upload.single('attachment'), async (req, res) => {
  const item = await Response.findByPk(req.params.id); if (!item || item.userId !== req.user.id || item.status !== 0) return res.status(400).json({ message: '只能修改自己待接受的响应' });
  await item.update({ description: req.body.description, ...(req.file ? { attachment: req.file.filename } : {}) }); res.json({ item });
});
app.delete('/api/responses/:id', auth, async (req, res) => {
  const item = await Response.findByPk(req.params.id); if (!item || item.userId !== req.user.id || item.status !== 0) return res.status(400).json({ message: '只能删除自己待接受的响应' }); await item.update({ status: 3 }); res.json({ message: '响应已取消' });
});
app.post('/api/responses/:id/decision', auth, async (req, res) => {
  const item = await Response.findByPk(req.params.id, { include: [HelpRequest] }); if (!item || item.HelpRequest.userId !== req.user.id) return res.status(404).json({ message: '响应不存在' });
  if (![1, 2].includes(Number(req.body.status)) || item.status !== 0) return res.status(400).json({ message: '当前响应不能操作' });
  await item.update({ status: Number(req.body.status) }); if (item.status === 1) { await Success.create({ requestId: item.requestId, responseId: item.id }); await HelpRequest.update({ status: -1 }, { where: { id: item.requestId } }); }
  res.json({ item });
});

app.get('/api/stats', auth, async (req, res) => {
  const end = req.query.end ? `${req.query.end}-31` : new Date().toISOString().slice(0, 7) + '-31';
  const start = req.query.start ? `${req.query.start}-01` : new Date(Date.now() - 155 * 86400000).toISOString().slice(0, 7) + '-01';
  const where = { createdAt: { [Op.between]: [new Date(start), new Date(end)] } }; if (req.query.regionId) where.regionId = req.query.regionId; if (req.query.type) where.type = req.query.type;
  const rows = await HelpRequest.findAll({ where });
  const accepted = await Success.findAll({ where: { acceptedAt: { [Op.between]: [new Date(start), new Date(end)] } } });
  const map = new Map();
  rows.forEach(r => { const k = new Date(r.createdAt).toISOString().slice(0, 7); if (!map.has(k)) map.set(k, { month: k, published: 0, accepted: 0, details: [] }); const entry = map.get(k); entry.published += 1; const d = entry.details.find(x => x.type === r.type); if (d) d.published += 1; else entry.details.push({ type: r.type, published: 1 }); });
  for (const s of accepted) { const request = await HelpRequest.findByPk(s.requestId); if (!request || (req.query.regionId && String(request.regionId) !== String(req.query.regionId)) || (req.query.type && request.type !== req.query.type)) continue; const k = new Date(s.acceptedAt).toISOString().slice(0, 7); if (!map.has(k)) map.set(k, { month: k, published: 0, accepted: 0, details: [] }); map.get(k).accepted += 1; }
  res.json({ items: [...map.values()].sort((a, b) => a.month.localeCompare(b.month)), start: req.query.start || '', end: req.query.end || '' });
});
app.get('/api/admin/users', auth, adminOnly, async (req, res) => { const result = await User.findAll({ order: [['createdAt', 'DESC']] }); res.json({ items: result.map(safeUser) }); });
app.get('/api/admin/requests', auth, adminOnly, async (req, res) => { const result = await HelpRequest.findAll({ include: requestInclude(), order: [['createdAt', 'DESC']] }); res.json({ items: result }); });

app.get('*', (req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
const port = Number(process.env.PORT || 3000);
initDatabase().then(() => app.listen(port, () => console.log(`好帮手已启动: http://localhost:${port}`))).catch(err => { console.error(err); process.exit(1); });
