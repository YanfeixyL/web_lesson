import { Sequelize, DataTypes } from 'sequelize';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
export { Op } from 'sequelize';
const storage = process.env.DB_STORAGE || path.join(process.cwd(), 'data', 'haobangshou.sqlite');
fs.mkdirSync(path.dirname(storage), { recursive: true });
const sequelize = process.env.DB_DIALECT === 'mysql' ? new Sequelize(process.env.DB_NAME || 'haobangshou', process.env.DB_USER || 'root', process.env.DB_PASSWORD || '', { dialect: 'mysql', host: process.env.DB_HOST || '127.0.0.1', port: Number(process.env.DB_PORT || 3306), logging: false, define: { underscored: true, timestamps: true } }) : new Sequelize({ dialect: 'sqlite', storage, logging: false, define: { underscored: true, timestamps: true } });
export const User = sequelize.define('User', { id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }, username: { type: DataTypes.STRING(30), unique: true }, passwordHash: DataTypes.STRING(100), role: { type: DataTypes.ENUM('admin','user'), defaultValue: 'user' }, name: DataTypes.STRING(30), phone: DataTypes.STRING(11), bio: DataTypes.STRING(500) }, { tableName: 'users' });
export const Region = sequelize.define('Region', { id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }, name: DataTypes.STRING(50), city: DataTypes.STRING(50), province: DataTypes.STRING(50) }, { tableName: 'regions' });
export const HelpRequest = sequelize.define('HelpRequest', { id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }, userId: DataTypes.INTEGER, regionId: DataTypes.INTEGER, type: DataTypes.STRING(30), title: DataTypes.STRING(100), description: DataTypes.TEXT, address: DataTypes.STRING(200), attachment: DataTypes.STRING(255), status: { type: DataTypes.TINYINT, defaultValue: 0 } }, { tableName: 'help_requests' });
export const Response = sequelize.define('Response', { id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }, requestId: DataTypes.INTEGER, userId: DataTypes.INTEGER, description: DataTypes.TEXT, attachment: DataTypes.STRING(255), status: { type: DataTypes.TINYINT, defaultValue: 0 } }, { tableName: 'responses' });
export const Success = sequelize.define('Success', { id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true }, requestId: { type: DataTypes.INTEGER, unique: true }, publisherId: DataTypes.INTEGER, responderId: DataTypes.INTEGER, responseId: { type: DataTypes.INTEGER, unique: true }, acceptedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW } }, { tableName: 'successes' });
User.hasMany(HelpRequest, { foreignKey: 'userId' }); HelpRequest.belongsTo(User, { foreignKey: 'userId', as: 'publisher' }); Region.hasMany(HelpRequest, { foreignKey: 'regionId' }); HelpRequest.belongsTo(Region, { foreignKey: 'regionId' }); HelpRequest.hasMany(Response, { foreignKey: 'requestId' }); Response.belongsTo(HelpRequest, { foreignKey: 'requestId' }); User.hasMany(Response, { foreignKey: 'userId' }); Response.belongsTo(User, { foreignKey: 'userId', as: 'responder' }); Response.hasOne(Success, { foreignKey: 'responseId' }); Success.belongsTo(Response, { foreignKey: 'responseId' });
export { sequelize };

export async function initDatabase() {
 await sequelize.authenticate();
 await sequelize.sync();
 const monthExpr=sequelize.getDialect()==='mysql' ? "DATE_FORMAT(event_time, '%Y%m')" : "strftime('%Y%m', event_time)";
 await sequelize.query(`CREATE VIEW IF NOT EXISTS monthly_summary AS SELECT ${monthExpr} AS month, r.province, r.city, e.type, SUM(e.published) AS published, SUM(e.accepted) AS accepted FROM (SELECT created_at AS event_time, region_id, type, 1 AS published, 0 AS accepted FROM help_requests UNION ALL SELECT s.accepted_at, h.region_id, h.type, 0, 1 FROM successes s JOIN help_requests h ON h.id=s.request_id) e JOIN regions r ON r.id=e.region_id GROUP BY ${monthExpr}, r.province, r.city, e.type`);
 if (await User.count()) return;
 await sequelize.transaction(async transaction => {
 const users = await User.bulkCreate([
 {username:'admin',passwordHash:await bcrypt.hash('admin',10),role:'admin',name:'系统管理员',phone:'13800000000',bio:'平台管理员'},
 {username:'zhangsan',passwordHash:await bcrypt.hash('Abc12345',10),role:'user',name:'张三',phone:'13900000001',bio:'喜欢旅行和帮助别人'},
 {username:'lisi',passwordHash:await bcrypt.hash('Abc12345',10),role:'user',name:'李四',phone:'13900000002',bio:'熟悉本地生活服务'}
 ], {transaction});
 await Region.bulkCreate([{name:'鼓楼区',city:'南京市',province:'江苏省'},{name:'浦东新区',city:'上海市',province:'上海市'},{name:'西湖区',city:'杭州市',province:'浙江省'}], {transaction});
 await HelpRequest.bulkCreate([{userId:users[1].id,regionId:1,type:'导游',title:'周末南京博物院导游',description:'希望熟悉历史的朋友带我参观南京博物院。',address:'中山东路 321 号'},{userId:users[2].id,regionId:2,type:'代购',title:'帮忙购买生活用品',description:'希望附近的朋友协助采购。',address:'浦东南路 200 号'},{userId:users[1].id,regionId:3,type:'宠物代管',title:'出差期间照顾猫咪',description:'照顾一只温顺的猫咪，周期五天。',address:'西溪路 88 号'}], {transaction});
 });
}
