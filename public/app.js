const { createApp, ref, computed, onMounted, watch } = Vue;
const API = '/api';
const layoutFix = document.createElement('style');
layoutFix.textContent = '.auth-card form > label:not(:has(input, textarea, select)){display:none}';
document.head.appendChild(layoutFix);
const app = createApp({
  components: {
    RequestCard: { props: ['item','mine'], emits: ['open','edit','remove'], template: `<article class="request-card"><div><span class="tag">{{item.type}}</span><span v-if="item.status!==0" class="tag" style="margin-left:5px;background:#f1f3f5;color:#8895a5">已归档</span></div><h4>{{item.title}}</h4><p>{{item.description}}</p><div class="meta">{{item.Region?.province}} · {{item.Region?.city}} · {{item.Region?.name}}　{{item.publisher?.name}} <button class="link" style="float:right" @click="$emit('open',item)">详情</button></div><div v-if="mine && item.status===0" style="margin-top:11px"><button class="link" @click="$emit('edit',item)">编辑</button> <button class="link danger" @click="$emit('remove',item)">删除</button></div></article>` },
    Empty: { props: ['text'], template: '<div class="empty">{{text}}</div>' },
    Pager: { props: ['data'], emits: ['change'], template: `<div class="pager" v-if="data.pages>1"><button v-for="n in data.pages" :class="{active:n===data.page}" @click="$emit('change',n)">{{n}}</button></div>` }
  },
  setup() {
    const user = ref(JSON.parse(localStorage.getItem('hb_user') || 'null')); const token = ref(localStorage.getItem('hb_token') || ''); const view = ref('home'); const authMode = ref('login'); const message = ref(''); const toast = ref(''); let toastTimer;
    const form = ref({ username: '', password: '', name: '', phone: '', bio: '' }); const nav = computed(() => [{key:'home',label:'首页'},{key:'browse',label:'浏览求助'},{key:'requests',label:'我的求助'},{key:'responses',label:'我的响应'},{key:'stats',label:'统计分析'},{key:'profile',label:'个人资料'},...(user.value?.role==='admin'?[{key:'admin',label:'管理后台'}]:[])]); const regions=ref([]), types=ref([]), requests=ref([]), recent=ref([]), responses=ref([]), stats=ref([]), adminItems=ref([]); const filters=ref({keyword:'',type:'',regionId:''}); const pagination=ref({page:1,pages:1,total:0,size:8}); const responsePagination=ref({page:1,pages:1,total:0,size:8}); const responseFilter=ref(''); const statsFilter=ref({start:'',end:'',regionId:'',type:''}); const detail=ref(null), modal=ref(null), editingRequest=ref(null), requestForm=ref({}), responseForm=ref({description:''}), profile=ref({}), adminTab=ref('users');
    const greeting = computed(() => { const h=new Date().getHours(); return h<11?'GOOD MORNING':h<18?'GOOD AFTERNOON':'GOOD EVENING'; }); const pageTitle = computed(() => ({home:'欢迎回来，'+(user.value?.name||''),browse:'浏览求助',requests:'我的求助',responses:'我的响应',stats:'统计分析',profile:'个人资料',admin:'管理后台'}[view.value])); const maxChart=computed(()=>Math.max(1,...stats.value.flatMap(x=>[x.published,x.accepted]))); const barHeight=n=>`${Math.max(2,n/maxChart.value*200)}px`; const statsTotal=k=>stats.value.reduce((s,x)=>s+Number(x[k]||0),0); const conversion=computed(()=>statsTotal('published')?Math.round(statsTotal('accepted')/statsTotal('published')*100):0);
    async function api(path, opts={}) { const headers=opts.body instanceof FormData?{}:{'Content-Type':'application/json'}; if(token.value) headers.Authorization=`Bearer ${token.value}`; const r=await fetch(API+path,{...opts,headers:{...headers,...opts.headers}}); const d=await r.json().catch(()=>({})); if(!r.ok) throw Error(d.message||'请求失败'); return d; }
    function showToast(s){toast.value=s;clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.value='',2600)} function date(s){return s?new Date(s).toLocaleDateString('zh-CN'):''} function statusText(s){return ['待接受','已接受','已拒绝','已取消'][s]||'未知'}
    async function login(){try{const d=await api('/auth/login',{method:'POST',body:JSON.stringify(form.value)}); token.value=d.token;user.value=d.user;localStorage.setItem('hb_token',d.token);localStorage.setItem('hb_user',JSON.stringify(d.user));message.value='';await loadAll()}catch(e){message.value=e.message}}
    async function register(){try{await api('/auth/register',{method:'POST',body:JSON.stringify(form.value)});showToast('注册成功，请登录');authMode.value='login';form.value.password=''}catch(e){message.value=e.message}}
    function logout(){token.value='';user.value=null;localStorage.clear();view.value='home'}
    async function loadBase(){const [r,t]=await Promise.all([api('/regions'),api('/types')]);regions.value=r.items;types.value=t.items}
    async function loadRequests(keepPage=false){try{if(!keepPage)pagination.value.page=1;const qs=new URLSearchParams({page:pagination.value.page,size:8,...filters.value,...(view.value==='requests'?{mine:1}:{})});const d=await api('/requests?'+qs);requests.value=Array.isArray(d.items)?d.items:[];pagination.value={page:d.page,pages:d.pages,total:Number(d.total)||0,size:d.size}}catch(e){requests.value=[];pagination.value={page:1,pages:0,total:0,size:8};showToast(e.message)}}
    async function loadRecent(){const d=await api('/requests?size=3');recent.value=d.items}
    async function loadResponses(){const qs=new URLSearchParams({page:responsePagination.value.page,size:8,...(responseFilter.value?{status:responseFilter.value}:{})});const d=await api('/responses?'+qs);responses.value=d.items;responsePagination.value={page:d.page,pages:d.pages,total:d.total,size:d.size}}
    async function loadStats(){const q=Object.fromEntries(Object.entries(statsFilter.value).filter(([,v])=>v));const d=await api('/stats?'+new URLSearchParams(q));stats.value=d.items}
    async function loadAll(){await loadBase();await Promise.all([loadRecent(),loadRequests(),loadResponses(),loadStats()]);profile.value={phone:user.value.phone,bio:user.value.bio,password:''}}
    watch(view, next => {
      if (next === 'browse' || next === 'requests') { pagination.value.page = 1; loadRequests(); }
      if (next === 'responses') { responsePagination.value.page = 1; loadResponses(); }
      if (next === 'stats') loadStats();
      if (next === 'admin' && user.value?.role === 'admin') loadAdmin();
    });
    function openRequest(item=null){editingRequest.value=item;requestForm.value=item?{type:item.type,title:item.title,description:item.description,regionId:item.regionId}:{type:'',title:'',description:'',regionId:''};modal.value='request'}
    function openDetail(item){detail.value=item;api('/requests/'+item.id).then(d=>detail.value=d.item);modal.value='detail'}
    async function saveRequest(){try{const fd=new FormData();Object.entries(requestForm.value).forEach(([k,v])=>fd.append(k,v));await api(editingRequest.value?'/requests/'+editingRequest.value.id:'/requests',{method:editingRequest.value?'PUT':'POST',body:fd});modal.value=null;showToast('需求已保存');await loadRequests();await loadRecent()}catch(e){showToast(e.message)}}
    async function removeRequest(item){if(!confirm('确定删除这条需求吗？'))return;try{await api('/requests/'+item.id,{method:'DELETE'});showToast('需求已删除');await loadRequests()}catch(e){showToast(e.message)}}
    function editResponse(item){detail.value=item;responseForm.value={description:item.description};modal.value='response';editingRequest.value=item}
    async function saveResponse(){try{const fd=new FormData();fd.append('description',responseForm.value.description);const p=editingRequest.value?.requestId?'/responses/'+editingRequest.value.id:'/requests/'+detail.value.id+'/responses';await api(p,{method:editingRequest.value?.requestId?'PUT':'POST',body:fd});modal.value=null;editingRequest.value=null;showToast('响应已提交');await loadResponses()}catch(e){showToast(e.message)}}
    async function removeResponse(item){if(!confirm('确定取消这条响应吗？'))return;try{await api('/responses/'+item.id,{method:'DELETE'});showToast('响应已取消');await loadResponses()}catch(e){showToast(e.message)}}
    async function decide(item,status){if(!confirm(status===1?'接受后需求将归档，确定接受吗？':'确定拒绝这条响应吗？'))return;try{await api('/responses/'+item.id+'/decision',{method:'POST',body:JSON.stringify({status})});showToast(status===1?'已接受响应':'已拒绝响应');modal.value=null;await loadRecent()}catch(e){showToast(e.message)}}
    async function saveProfile(){try{const d=await api('/users/me',{method:'PUT',body:JSON.stringify(profile.value)});user.value=d.user;localStorage.setItem('hb_user',JSON.stringify(d.user));profile.value.password='';showToast('资料已更新')}catch(e){showToast(e.message)}}
    async function loadAdmin(){const d=await api('/admin/'+adminTab.value);adminItems.value=d.items}
    function changePage(n){pagination.value.page=n;loadRequests(true)} function changeResponsePage(n){responsePagination.value.page=n;loadResponses()}
    onMounted(async()=>{if(user.value){try{await api('/auth/me');await loadAll()}catch{logout()}}}); return {user,view,authMode,message,form,nav,greeting,pageTitle,regions,types,requests,recent,responses,stats,filters,pagination,responsePagination,responseFilter,statsFilter,detail,modal,editingRequest,requestForm,responseForm,profile,adminTab,adminItems,maxChart,barHeight,statsTotal,conversion,toast,login,register,logout,loadRequests,loadResponses,loadStats,loadAdmin,openRequest,openDetail,saveRequest,removeRequest,editResponse,saveResponse,removeResponse,decide,saveProfile,changePage,changeResponsePage,showToast,date,statusText};
  }
});
app.mount('#app');
