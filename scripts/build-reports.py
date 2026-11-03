from pathlib import Path
from copy import deepcopy
from docx import Document
from docx.shared import Inches,Pt,RGBColor
from docx.enum.style import WD_STYLE_TYPE
from lxml import etree
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from PIL import Image,ImageDraw,ImageFont
import zipfile,sys
ROOT=Path(__file__).resolve().parents[1]; DOCS=ROOT/'docs'; QA=ROOT/'tmp/qa'
font='C:/Windows/Fonts/msyh.ttc'
def title(para):
 styles=para.part.styles
 if 'Title' not in styles:
  style=styles.add_style('Title',WD_STYLE_TYPE.PARAGRAPH)
  style.base_style=styles['Normal']
  style.font.color.rgb=RGBColor(0,0,0)
 para.style='Title'
 for run in para.runs:run.font.color.rgb=RGBColor(0,0,0)

def body(para):
 para.style='Normal'
 para.paragraph_format.space_after=Pt(6)
 para.paragraph_format.line_spacing=1.25
 para.paragraph_format.keep_with_next=False
 props=para._p.pPr
 if props is not None:
  for item in list(props):
   if item.tag in [qn('w:numPr'),qn('w:pageBreakBefore')]:props.remove(item)
 for run in para.runs:
  run.bold=False;run.font.size=Pt(12)
 return para
def diagram(name,kind):
 im=Image.new('RGB',(1500,900 if kind=='class' else 680),'white');dr=ImageDraw.Draw(im);f=ImageFont.truetype(font,32 if kind=='class' else 25);small=ImageFont.truetype(font,30 if kind=='class' else 22)
 if kind=='class':
  boxes=[(20,50,450,310,'User 用户','id  username\nname  phone  role\npasswordHash'),(535,50,965,310,'HelpRequest 需求','id  type  status\nuserId  regionId\ntitle  description'),(1050,50,1480,310,'Region 地域','id  name\ncity  province'),(20,560,450,830,'MonthlySummary 视图','month  type\nprovince  city\npublished  accepted'),(535,560,965,830,'Response 响应','id  status\nrequestId  userId\nattachment'),(1050,560,1480,830,'Success 成功明细','requestId  responseId\npublisherId  responderId\nacceptedAt')]
  for x,y,x2,y2,heading,text in boxes:
   dr.rectangle((x,y,x2,y2),outline='#333',width=3);dr.text((x+16,y+14),heading,font=f,fill='black');dr.line((x,y+65,x2,y+65),fill='#333',width=2);dr.multiline_text((x+16,y+92),text,font=small,fill='black',spacing=13)
  for pts,label,xy in [([(450,180),(535,180)],'1  *',(460,135)), ([(965,180),(1050,180)],'*  1',(975,135)), ([(750,310),(750,560)],'1\n\n*',(770,350)), ([(965,690),(1050,690)],'1 0..1',(970,645)), ([(235,310),(235,430),(495,430),(495,695),(535,695)],'1  *',(340,385))]:dr.line(pts,fill='#333',width=3);dr.text(xy,label,font=small,fill='black')
 else:
  xs=[160,550,940,1320]
  for x,title in zip(xs,['发布者','Vue 页面','Express 接口','Sequelize 数据库']):dr.rectangle((x-125,25,x+125,85),outline='#333',width=2);dr.text((x-105,40),title,font=small,fill='black');dr.line((x,85,x,640),fill='#888',width=2)
  arrows=[(0,1,150,'确认接受响应'),(1,2,230,'POST decision 及 JWT'),(2,3,310,'检查归属与状态 开启事务'),(2,3,390,'更新响应 写成功明细 归档需求'),(3,2,470,'提交事务 或异常回滚'),(2,1,550,'返回结果与提示'),(1,0,620,'刷新需求和响应状态')]
  for a,b,y,text in arrows:
   x1,x2=xs[a],xs[b];dr.line((x1,y,x2,y),fill='#222',width=3);direction=1 if x2>x1 else -1;dr.polygon([(x2,y),(x2-direction*14,y-7),(x2-direction*14,y+7)],fill='#222');dr.text((min(x1,x2)+20,y-35),text,font=small,fill='black')
 im.save(QA/name)
diagram('classes.png','class');diagram('sequence.png','sequence')
def settext(p,text):
 r=deepcopy(p.runs[0]._r.rPr) if p.runs and p.runs[0]._r.rPr is not None else None
 for child in list(p._p):
  if child.tag!=qn('w:pPr'):p._p.remove(child)
 run=p.add_run(text)
 if r is not None:run._r.insert(0,r)
 # Remove template placeholder highlighting.
 for h in p._p.findall('.//'+qn('w:highlight')):h.getparent().remove(h)
 return p
def after(p,text='',image=None,width=6):
 new=deepcopy(p._p);p._p.addnext(new)
 from docx.text.paragraph import Paragraph
 para=Paragraph(new,p._parent);settext(para,text);body(para)
 if not image:para.alignment=0
 if image:
  para.paragraph_format.keep_together=True
  para.paragraph_format.first_line_indent=Inches(0)
  para.add_run().add_picture(str(image),width=Inches(width));para.alignment=1
 return para
def remove(p):p._p.getparent().remove(p._p)
def save(d,template,name):
 if len(sys.argv)>1 and name not in sys.argv[1:]:return
 out=DOCS/name;d.save(out)
 # Restore all source package parts except intentionally edited body and image relationships.
 with zipfile.ZipFile(template) as z:original={n:z.read(n)for n in z.namelist()}
 with zipfile.ZipFile(out) as z:parts={n:z.read(n)for n in z.namelist()}
 allowed={'word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml','word/styles.xml'}
 # Append only the new Title definition; preserve every original style.
 original_styles=etree.fromstring(original['word/styles.xml'])
 final_styles=etree.fromstring(parts['word/styles.xml'])
 if not original_styles.xpath('./w:style[@w:styleId="Title"]',namespaces={'w':qn('w:styles').split('}')[0][1:]}):
  for style in final_styles:
   if style.get(qn('w:styleId'))=='Title':original_styles.append(deepcopy(style))
 parts['word/styles.xml']=etree.tostring(original_styles,xml_declaration=True,encoding='UTF-8',standalone=True)
 for n,b in original.items():
  if n not in allowed:parts[n]=b
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED)as z:
  for n,b in parts.items():z.writestr(n,b)
 print(out.name)
members='李汉立（组长）、孔垂米、吴昊东；专业均为计算机科学与技术；学号：________、________、________。'
template=next(DOCS.glob('*模板-小组*.docx'));d=Document(template);p=d.paragraphs
mapping={0:'《Web开发技术》实验作业报告',1:'小组成员：'+members,3:'开发语言：JavaScript、HTML、CSS、SQL。',4:'IDE：________（按实际使用填写）。',5:'OS：本次验证为 Windows；Node.js v24.21.0。',6:'数据库：SQLite，Sequelize 6 持久化；另提供 MySQL 连接配置。',7:'数据库表结构及测试数据备份导出文件名称：sql.txt（SQLite 实际导出）。',8:'开源框架：前端 Vue 3.5.24；后台 Express 4、Sequelize 6。',9:'其它关键技术：JWT、bcrypt、Multer、Node.js 内置测试运行器。',10:'工程名称：haobangshou 好帮手互助服务平台。',11:'访问 URL：http://localhost:3000/。',12:'管理员用户名、密码：admin / admin（题目指定的预置账号）。',13:'普通用户名、密码：zhangsan / Abc12345。',15:'1）package.json、package-lock.json：依赖版本、启动和测试命令。',16:'2）src/models.js：数据库模型；.env.example：数据库与服务配置示例。',18:'系统支持注册、登录、资料维护、需求和响应管理、管理员查询及月度统计。默认使用真实数据库，接受响应时通过事务写入成功明细。',19:'额外添加功能：关键词与状态筛选、20 MB附件限制、成功记录防重复、SQL导出恢复和旧JSON数据迁移。',20:'未实现功能说明',21:'必选功能已实现。本次验证使用 SQLite；MySQL 连接配置未在本机数据库服务上实测。',22:'选做的统计数值排序、已参与需求优先排序未实现。',23:'附件按文件上传和下载，未提供视频在线播放和转码。',25:'1、登录与首页：区分普通用户与管理员；错误密码通过页面文字提示。',26:'2、发布需求：选择省市区，填写地址、类型、标题与描述，可上传附件。',27:'3、统计分析：默认近六个月，支持月份、地域和类型条件，图表与明细表对应。',28:'五 安装运行步骤简要说明',29:'六 关键设计思路说明',30:'数据库参考 JDBC 示例的连接、执行和结果读取流程，项目沿用 JavaScript 技术栈，通过 Sequelize 实现同类持久化职责。前端提交 JSON 或 FormData，后台校验权限和状态后访问数据库。',31:'6.1 业务类图设计',32:'6.2 接受响应序列图设计',35:'分工安排见下表，贡献比例待三位成员核对。'}
for i,v in mapping.items():settext(p[i],v)
for i in [18,19,21,22,23,25,26,27,30,35]:body(p[i])
title(p[0])
features=[('1','注册 登录 资料维护','public/index.html 登录与资料页','src/server.js /auth /users'),('2','需求发布 查询 修改 取消 分页','public/index.html 我的求助','src/server.js /requests'),('3','响应提交 修改 取消 接受 拒绝','public/index.html 我的响应及详情','src/server.js /responses'),('4','附件及用户详情','public/index.html 弹窗','Multer 与关联查询'),('5','地域类型月统计 图表与明细','public/index.html 统计分析','src/server.js /stats；monthly_summary'),('6','管理员用户 需求 响应查询','public/index.html 管理后台','src/server.js /admin')]
t=d.tables[0]
while len(t.rows)<len(features)+1:t.add_row()
for row,vals in zip(t.rows[1:],features):
 for c,v in zip(row.cells,vals):c.text=v
for row,vals in zip(d.tables[1].rows[1:],[('李汉立','组长；后端业务、数据库设计与集成验收','40%'),('孔垂米','页面交互、表单、附件及界面验证','30%'),('吴昊东','统计分析、测试用例与文档整理','30%')]):
 for c,v in zip(row.cells,vals):c.text=v
p[17].paragraph_format.page_break_before=True
for table in d.tables:
 header=OxmlElement('w:tblHeader');table.rows[0]._tr.get_or_add_trPr().append(header)
 for row in table.rows:
  row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
# Keep each caption with its screenshot. Crop the publish dialog to its form.
Image.open(QA/'publish.png').crop((400,95,1040,1040)).save(QA/'publish-crop.png')
for idx,img,width in [(25,'home.png',5.1),(26,'publish-crop.png',2.55),(27,'stats.png',5.3)]:
 p[idx].paragraph_format.keep_with_next=True
 after(p[idx],image=QA/img,width=width)
cur=p[28]
for text in ['1）进入 web_lesson，执行 npm ci，随后执行 npm start。首次启动自动创建 data/haobangshou.sqlite 和测试数据。','2）打开 http://localhost:3000/，使用上述账号登录。新注册密码至少六位，包含两个数字及大小写字母。','3）执行 npm test 验证业务；执行 npm run db:export 导出当前 SQLite 表结构和数据。MySQL 使用 database/mysql.sql，设置 DB_DIALECT=mysql 及连接参数。','4）测试在临时数据库运行，不覆盖默认数据。原 JSON 数据可用 scripts/migrate-json.js 迁移到新的 SQLite 文件。']:cur=after(cur,text)
p[29].paragraph_format.page_break_before=True
p[31].paragraph_format.keep_with_next=True
class_image=after(p[31],image=QA/'classes.png',width=6)
p[32].paragraph_format.keep_with_next=True
sequence_image=after(p[32],image=QA/'sequence.png',width=6)
cur=after(sequence_image,'接受操作先校验发布者与响应状态，在同一事务中更新响应、写入成功明细、归档需求并拒绝其他待接受响应。成功明细对需求及响应设置唯一约束，防止重复计数。')
cur=after(cur,'测试结果：2026年11月3日，29个子用例全部通过（运行器共31项）。验证权限、附件、分页、并发接受、统计边界、重启及SQL恢复；浏览器跑通发布到接受的完整流程。')
after(cur,'统计口径：按创建月份计发布数，按接受月份计成功数，取消需求保留历史发布记录。区间采用起始月首日到终止月次月首日的左闭右开范围，无数据月份补零。')
save(d,template,'好帮手小组实验作业报告.docx')
template=next(DOCS.glob('*模板-平时*.docx'));d=Document(template);p=d.paragraphs
mapping={1:'小组组长姓名：李汉立；学号：________；专业：计算机科学与技术。',2:'小组其他成员姓名：孔垂米、吴昊东；学号：________、________；专业均为计算机科学与技术。',3:'任务分工安排：李汉立负责后端、数据库和集成验收（40%）；孔垂米负责界面、表单和附件（30%）；吴昊东负责统计、测试及文档（30%）。比例待成员核对。',4:'作业计划完成时间对应教学周：第14周完成联调，第15周检查与补漏，第16周整理材料，第17周演示验收。',6:'开发语言：JavaScript、HTML、CSS、SQL。',7:'IDE：________。',8:'OS：Windows；Node.js v24.21.0。',9:'数据库：SQLite；提供 MySQL 适配配置，未进行 MySQL 服务实测。',10:'开源框架：Vue 3.5.24、Express 4、Sequelize 6。',11:'其它关键技术：JWT、bcrypt、Multer、Node.js 测试运行器。',13:'1、完成用户注册、密码验证、登录、基本信息展示及受限字段修改。',14:'2、完成需求和响应的增查改删、分页、附件、接受拒绝及业务状态约束。',15:'3、完成月份、地域和类型统计，提供趋势图和明细表；补齐管理员三类查询。',16:'4、全部业务子用例通过；完成浏览器检查、SQL 导出与报告。验收前补填学号、班级、IDE，并核对分工比例。'}
for i,v in mapping.items():settext(p[i],v)
for blank in p[17:]:
 if not blank.text:remove(blank)
title(p[0]);save(d,template,'好帮手分组及进展情况说明.docx')
refs=[('[1] GONZAGA R. Node.js 24.0.0 (Current)[EB/OL]. 2025-05-06[2026-11-03]. https://nodejs.org/en/blog/release/v24.0.0.'),('[2] EXPRESS 团队. Express 5.1.0 Now the Default on npm with LTS Timeline[EB/OL]. 2025-03-31[2026-11-03]. https://expressjs.com/en/blog/2025-03-31-v5-1-latest-release.'),('[3] SQLITE 团队. SQLite Release 3.50.0[EB/OL]. 2025-05-29[2026-11-03]. https://sqlite.org/releaselog/3_50_0.html.'),('[4] SEQUELIZE 团队. Transactions[EB/OL]. [2026-11-03]. https://sequelize.org/docs/v6/other-topics/transactions/.'),('[5] VUE 团队. Reactivity Fundamentals[EB/OL]. [2026-11-03]. https://vuejs.org/guide/essentials/reactivity-fundamentals.html.')]
profiles=[('李汉立','Sequelize事务与数据持久化','后端持久化','重点分析数据库连接、业务约束和事务边界。','在接受响应的流程中，单独更新状态会留下半完成的数据。事务把响应状态、成功明细和需求归档放在一起，唯一约束再阻止重复记录。'),('孔垂米','Vue响应式表单设计','页面交互','重点分析页面状态、表单数据与接口结果的同步。','表单必填规则只能改善输入体验，不能代替后台校验。发布弹窗使用 FormData 携带文字和附件，收到成功结果后刷新列表，失败时保留输入并显示提示。'),('吴昊东','Web月度统计与测试设计','统计与验证','重点分析月份边界、地域筛选和可重复的功能测试。','统计最容易出现的问题是口径不一致。发布数按创建月份，成功数按接受月份，不能将一条需求的创建日期同时作为两个指标的日期。')]
for name,report_title,focus,intro,lesson in profiles:
 template=next(DOCS.glob('*模板-个人*.docx'));d=Document(template);p=d.paragraphs
 for i,text in {9:report_title,18:'学    号：________',19:'姓    名：'+name,20:'班    级：________',21:'提交日期：2026年11月3日'}.items():settext(p[i],text)
 settext(p[10],'调研分析报告');title(p[9])
 content={
 '李汉立':{
  25:'Sequelize是Node.js环境中的关系数据库映射框架。它用模型描述表，用关联描述外键关系，将JavaScript方法转换为SQL。本文结合好帮手的接受响应流程，分析持久化与事务设计。Node.js 24于2025年5月发布[1]，本项目在v24.21.0环境验证；后台沿用Express 4，数据库默认采用SQLite。页面使用Vue响应式状态[5]。Express 5.1于2025年成为默认版本[2]，工程仍用4.x。',
  28:'模型查询减少了字段映射和关联查询的重复代码，但不能自动保证业务正确。例如，只有发布者能接受响应，同一需求只能成功一次，这些规则仍须由接口和数据库约束共同实现。托管事务在回调成功时提交，抛出异常时回滚[4]。事务能避免状态只更新一半，也会增加锁等待和排错成本。',
  30:'Sequelize适用于JavaScript关系模型；直接SQL便于控制复杂查询，但需要自行维护映射和事务；JDBC为Java提供数据库访问接口，与本项目语言不同。W2示例展示了连接、执行、遍历结果和关闭资源的流程。项目保留Vue与Express，增加Sequelize作为持久化框架，避免为接入数据库重写整套后端。',
  32:'执行npm ci安装依赖，npm start启动服务。src/models.js定义用户、地域、需求、响应和成功明细。SQLite使用文件保存数据；配置DB_DIALECT=mysql可选择MySQL。SQLite在2025年的3.50.0版本继续改进锁等待等能力[3]，但本项目并未据此假定本机驱动内嵌版本。',
  34:'在社区互助、预约和任务协作中，多张表经常共同表示一次业务。好帮手接受响应时，先校验操作人和待接受状态，再在同一事务内更新响应、写入成功明细、归档需求。课程单进程使用写队列串行处理修改请求；多实例部署需要额外的数据库锁或条件更新。',
  36:'数据库集中保存姓名和手机号，方便关联查询，也扩大了泄露后的影响范围。密码使用bcrypt摘要保存，接口返回用户资料时排除密码字段。保留SQL备份有助于恢复，但备份同样需要控制访问。文件数据库便于课堂部署，本项目没有测量资源消耗，不能直接推断它比其他方案更节能。',
  38:'持久化改造的关键是把业务约束落到可验证的位置。只把JSON写入换成数据库写入，并不能解决重复接受和部分更新问题。成功记录唯一约束、事务和集成测试共同约束了这些情况。后续应补充MySQL服务实测、数据库迁移版本和多实例并发验证。'
 },
 '孔垂米':{
  25:'Vue通过响应式状态驱动页面更新。ref保存可变数据，computed从状态计算展示值，模板将结果映射到页面[5]。本文讨论好帮手的表单和弹窗交互：界面负责组织输入，Express负责验证与持久化。项目后端运行在Node.js v24.21.0；Node.js 24于2025年5月发布[1]。',
  28:'响应式写法能让分页、筛选和详情随接口结果刷新，减少手动操作DOM。代价是请求时序需要显式管理：用户切换管理标签后，旧请求可能晚于新请求返回。loadAdmin记录发起请求时的标签，只在当前标签仍相同时更新列表。表单required、文件选择限制和确认弹窗改善操作体验，业务校验仍在后台执行。',
  30:'Vue可直接在已有HTML中使用，本项目将Vue 3.5.24保存在public/vendor中，无需运行时下载。与手工DOM操作相比，Vue用统一状态管理表单和列表；与需要完整构建链的组件工程相比，单页脚本便于课程演示，但代码变大后应拆分组件。Express提供接口路由；2025年Express 5.1成为默认版本[2]，本项目未混用其异步异常行为。',
  32:'发布弹窗用v-model保存类型、地域、标题和描述。省份变化时清空城市、区县和地域标识，避免提交不匹配地址。文字与附件由FormData一起发送；请求成功后关闭弹窗并刷新列表，失败时保留输入。api方法将错误消息交给提示条。数据库操作由Sequelize完成，其事务能力用于接受确认[4]。',
  34:'校园互助与预约页面都需要录入、筛选、详情和状态反馈。好帮手将完整流程放在同一界面，减少页面跳转；管理员与普通用户共享基本组件，管理入口依据角色展示。SQLite满足本机演示，2025年的3.50.0发布记录展示了其持续维护情况[3]。界面不应通过隐藏按钮代替后台权限检查。',
  36:'清楚的状态和确认提示能减少误删、重复提交，但过多弹窗也会打断用户。联系电话仅在业务详情中展示，实际使用还需考虑用户同意和访问范围。页面提供移动端布局并响应减少动画的系统设置。未测量加载流量和能耗，不把动效或本地资源直接描述成节能效果。',
  38:'前端问题往往出在状态连接处：全部筛选的空值、切换标签时的旧请求、保存后的列表刷新。浏览器测试用两名用户跑通了发布、响应、修改和接受，补足了单测难以发现的页面问题。后续适合拆分组件，并为加载、空数据和失败状态增加更细的可访问性说明。'
 },
 '吴昊东':{
  25:'集成测试通过真实接口、数据库和运行进程检查业务结果，适合验证跨模块状态变化。本文结合好帮手的月度统计和响应确认，讨论可重复测试的设计。项目使用Node.js内置测试运行器，验证环境为v24.21.0。Node.js 24于2025年5月发布[1]，接口层使用Express 4。',
  28:'测试的价值来自明确的输入、结果和边界。临时数据库让每次运行从同一组数据开始；重启进程检查持久化，双请求同时接受检查重复成功。集成测试比纯函数测试更接近真实行为，但运行更慢，定位失败需要查看接口和数据库两层。Sequelize事务保证跨表提交，测试仍需断言业务状态[4]。',
  30:'接口测试直接发送HTTP请求，适合检查状态码、权限和数据；浏览器测试通过页面操作，适合发现筛选参数、弹窗和异步刷新问题。手工测试便于观察界面，却难以稳定重跑并发和日期边界。本项目组合三种方式。Express 5.1在2025年成为默认版本[2]，项目保留4.x时单独处理异步异常，避免测试将接口崩溃误判成普通错误。',
  32:'npm test创建临时SQLite数据库和上传目录，并启动独立服务；结束后关闭进程并清理临时数据。月份区间采用左闭右开范围：二月首日计入，三月首日不计入二月。monthly_summary视图将需求创建事件和响应接受事件分别汇总，月份格式为YYYYMM。SQLite 3.50.0发布于2025年5月[3]，其持续维护不替代项目自己的恢复测试。',
  34:'业务看板不仅需要画图，还要确定指标含义。本项目按需求创建时间统计发布量，按接受日期统计成功量，取消需求保留历史发布量。前端用Vue计算总数和柱形高度[5]，后端按月份补零。测试覆盖不同地域、不同事件月份、成功唯一性及SQL导出恢复，可用于相似的预约或协作原型。',
  36:'图表可以帮助识别需求变化，也可能让读者误将接受次数当作服务质量。报告明确每个指标的日期与计数口径，避免对效果作过度解释。自动化测试减少重复手工操作，但会消耗计算资源；用临时小库和有限用例覆盖关键规则即可，无需为同一实现堆积重复断言。',
  38:'统计和测试都依赖可复核的口径。空月份必须保留，不同月份的发布与接受不能混为同一日期，导出的SQL也需要实际恢复。现有接口与数据库验证共31项通过，浏览器业务流程通过。MySQL服务尚未实测，多进程并发与更大数据量是后续验证重点。'
 }}[name]
 for i,text in content.items():settext(p[i],text)
 # Keep headings with their complete short section to avoid one-line continuations.
 for i in [25,28,30,32,34,36,38]:p[i].paragraph_format.keep_together=True
 image=QA/('classes.png' if name=='李汉立' else 'publish-crop.png' if name=='孔垂米' else 'stats.png')
 after(p[28],image=image,width=5.7 if name!='孔垂米' else 2.2)
 if name=='李汉立':
  after(p[32],'核心写法为sequelize.transaction(async transaction => {...})；每次写操作显式传递transaction。成功明细对requestId和responseId设置唯一约束。31项接口及数据库验证通过，覆盖重复接受、状态限制与SQL恢复。')
 elif name=='孔垂米':
  after(p[32],'关键写法为const fd = new FormData()，依次追加表单字段和attachment；fetch携带JWT提交。新增、修改、删除均先确认。浏览器检查验证了文字附件、响应编辑和接受后统计更新。')
 else:
  after(p[32],'关键断言包括同一需求两次接受只允许一次成功、2月发布而3月接受分别进入两个统计月、SQL恢复后表数据与视图仍可查询。测试文件为tests/api.test.js和tests/database.test.js。')
 settext(p[40],refs[0]);
 for i in range(41,51):remove(p[i])
 cur=p[40]
 ref_paragraphs=[p[40]]
 for ref in refs[1:]:
  cur=after(cur,ref);ref_paragraphs.append(cur)
 for para in ref_paragraphs:
  para.paragraph_format.line_spacing=1.05
  para.paragraph_format.space_after=Pt(3)
  para.paragraph_format.keep_together=True
  for run in para.runs:run.font.size=Pt(10)
 save(d,template,f'个人期末技术报告_{name}.docx')
