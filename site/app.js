/* 双人私密网页版：固定账号登录，云端事务保存，私密照片。 */
'use strict'
const $ = id => document.getElementById(id)
const escapeHTML = value => String(value == null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const esc = escapeHTML
const day = offset => { const d = new Date(); d.setDate(d.getDate()+offset); return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-') }
const dateTime = ts => new Date(ts).toLocaleString('zh-CN',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
const uid = () => Date.now().toString(36)+Math.random().toString(36).slice(2,11)
const tabs=[['home','⌂','我们的日常','',''],['order','♡','想你小铺','A LITTLE LOVE, ON THE MENU','想念也可以下单，每一份心意都是 0 元。'],['memory','▧','回忆相册','THE DAYS WE WERE TOGETHER','见面的日子，和一起做过的小事，都好好收藏。'],['plan','⌁','见面计划','UNTIL WE MEET AGAIN','把“好想见你”，写成一个有日期的约定。'],['wish','✧','心愿清单','SOMEDAY, WITH YOU','想去的远方，想拥有的好物，和一起期待的未来。'],['weather','◌','月度心情晴雨表','OUR MONTH IN MOODS','一起看看这个月的心情。'],['moment','☁','心情小屋','A LITTLE PIECE OF TODAY','开心可以分享，委屈也可以被好好接住。']]
let products=[
['miss','💌','想你啦～','想念','把这一刻的想念，轻轻送到你身边。'],['hug','🫂','想要一个抱抱','陪伴','先抱抱屏幕这头的我，下次见面再补上。'],['kiss','🐻','想和你贴贴','想念','攒一个贴贴，下次见面一起兑现。'],['chat','☁️','陪我聊聊天','陪伴','想把今天的小事慢慢说给你听。'],['game','🎮','陪我打游戏','陪伴','想和你组队，一起玩一会儿。'],['peace','🕊️','想和好但不好意思说','小情绪','等我们都准备好了，再好好聊聊。'],['sad','🥺','今天有一点委屈','小情绪','如果可以，想被温柔地接住。'],['call','☎️','今晚一起打电话','陪伴','如果你有空，想听听你的声音。'],['night','🌙','晚安亲亲','想念','今天也有好好想你，晚安。'],['listen','🌧️','今天想被听见','小情绪','不用急着给建议，陪我说说就好。'],['space','🌿','需要一点自己的时间','小情绪','让我先整理心情，准备好了再来找你。'],['date','🎬','云约会邀请','陪伴','一起看电影、吃饭，或什么也不做。']
].map(([id,icon,name,category,note])=>({id,icon,name,category,note})); const baseProducts=[...products,...[
['tea','🧋','想喝奶茶','陪伴','今天想喝一杯甜甜的奶茶。'],['redpacket','🧧','想要红包','想念','想收一份带着心意的小惊喜。'],['flirt','💗','想看瑟瑟','想念','只属于我们的小小心思，等你愿意的时候。'],['comfort','🐱','今天想被哄哄','小情绪','先抱抱我，再慢慢说。'],['praise','✨','想听你夸夸我','陪伴','今天也想被你肯定。'],['voice','🎧','想听一条语音','想念','听到你的声音，心情会变好一点。'],['walk','🌙','一起散散步吧','陪伴','开着语音，一起看看各自的风景。'],['movie','🍿','一起看部电影','陪伴','把今晚留给同一部电影。'],['breakfast','🥐','提醒我好好吃饭','陪伴','想被你惦记一下。'],['apology','🌷','有句话想认真说','小情绪','我们慢一点，把彼此听懂。'],['tired','🛋️','今天好累，陪陪我','小情绪','陪我待一会儿就很好。'],['surprise','🎁','想要一个小惊喜','想念','是什么都好，因为是你。']
].map(([id,icon,name,category,note])=>({id,icon,name,category,note}))]
function rebuildProducts(){products=DiaryUIModel.catalog(baseProducts,state.products);for(const id of Object.keys(cart||{}))if(!products.some(p=>p.id===id))delete cart[id]}

const moods=['开心','想念','平静','愤怒','沮丧','抱怨','委屈','害羞','期待','疲惫','焦虑','感动','幸福','安心'],needs=['想要陪伴','只需倾听','想听建议','需要一点空间']
let state=DiaryBrand.emptyState()
let viewer='a',revision=-1,cloud=null,authenticated=false,cloudBusy=false,saveQueue=Promise.resolve(),pollTimer=0,polling=false,authEpoch=0
products=[...baseProducts]
function notify(s,type,entry,actor=s.current,extra={}){s.notifications.push({id:uid(),type,entryId:entry.id,actor,recipient:s.users.find(u=>u.id!==actor).id,createdAt:Date.now(),expiresAt:Date.now()+7*86400000,title:entry.title||entry.name||'',entryKind:entry.kind||'product',...extra})}
function activeInbox(){return DiaryUIModel.inbox(state.notifications,state.current).unread}
async function dismiss(id){if(await commit(s=>{const n=s.notifications.find(n=>n.id===id);if(n)n.dismissed=true}))toast('已标为已读，可以在“展开已读”里再看。')}
let tab='home',category='全部',orderView=false,moodView='moment',cart={},draft=null,toastTimer,photoBusy=false
const ui={query:'',searchOpen:false,layout:'list',shopLayout:'list',recordLayouts:{},month:day(0).slice(0,7),open:{},productId:'',readInbox:false};let submitBusy=false,pendingClose=false,executingSubmit=false,modalCloseTimer=0,modalEpoch=0
let draftUploads=[],productDraft=null;
let activeSeason='spring'
const themeController=DiarySeasons.controller({readLast:()=>localStorage.getItem('couple-diary-last-season'),writeLast:value=>localStorage.setItem('couple-diary-last-season',value),onChange:value=>{activeSeason=value;renderTheme()},setInterval:(fn,ms)=>setInterval(fn,ms),clearInterval:id=>clearInterval(id)})
function renderTheme(){
  if(document.body.dataset.season!==activeSeason)document.body.dataset.season=activeSeason
  $('season-label').textContent={spring:'春 · 桜の小径',summer:'夏 · 花火の夜',autumn:'秋 · 京都の紅葉',winter:'冬 · 雪あかり'}[activeSeason]
  $('season-picker').innerHTML=[['spring','春 · 樱花'],['summer','夏 · 花火'],['autumn','秋 · 红叶'],['winter','冬 · 雪夜']].map(([id,name])=>`<button class="${activeSeason===id?'active':''}" data-action="theme" data-theme="${id}">${name}</button>`).join('')
}
const me=()=>state.users.find(u=>u.id===state.current)
const partner=()=>state.users.find(u=>u.id!==state.current)
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200)}
function commit(change){
  const work=async()=>{
    if(!authenticated||!cloud){showAuth('请先登录，再打开我们的小屋。');return false}
    const epoch=authEpoch;cloudBusy=true;connection('saving','正在同步…')
    try{
      if(!navigator.onLine)throw new Error('网络已断开，填写的内容会保留，请联网后重试。')
      const next=JSON.parse(JSON.stringify(state));change(next)
      delete next.current
      const previousDocs=new Set(state.entries.flatMap(x=>(x.attachments||[]).map(a=>a.ref))),nextDocs=new Set(next.entries.flatMap(x=>(x.attachments||[]).map(a=>a.ref)));const previousRefs=new Set(state.entries.flatMap(x=>x.photos||[]));const nextRefs=new Set(next.entries.flatMap(x=>x.photos||[]));if(!cloud.pending&&JSON.stringify(next)===JSON.stringify({...state,current:undefined})){connection('online','已同步');return true}const packet=await cloud.save(revision,next);if(!authenticated||epoch!==authEpoch)return false;applyPacket(packet);cloud.removeDocuments([...previousDocs].filter(ref=>!nextDocs.has(ref)));cloud.removeUnused([...previousRefs].filter(ref=>!nextRefs.has(ref)));connection('online','已同步');return true
    }catch(e){if(epoch!==authEpoch)return false;if(e.packet)applyPacket(e.packet);connection('error','未同步 · 点击重试');toast(e.message||'没有保存成功，请重试。');return false}
    finally{cloudBusy=false}
  }
  const task=saveQueue.then(work,work);saveQueue=task.catch(()=>{});return task
}
function bound(){if(authenticated)return true;showAuth('请先登录我们的小屋。');return false}
function go(id){ui.query='';ui.searchOpen=false;tab=id;orderView=false;const types={wish:['wish'],order:['product'],plan:['plan']}[id]||[];if(types.length)commit(s=>s.notifications.filter(n=>n.recipient===s.current&&types.includes(n.type)).forEach(n=>n.dismissed=true));render();window.scrollTo({top:0,behavior:'instant'})}
function render(){
  if(!authenticated)return
  DiaryBrand.render(state.users)
  document.body.classList.toggle('feature-active',tab!=='home');document.body.dataset.view=tab;document.body.dataset.mode=tab==='order'&&!orderView?'shop':'records';rebuildProducts();renderTheme()
  $('account-name').textContent=me().name;$('avatar-letter').textContent=Array.from(me().name)[0]
  $('greeting').textContent=tab==='home'?`${me().name}，おかえり。`:tabs.find(t=>t[0]===tab)[2]
  const days=Math.floor((Date.parse(day(0)+'T00:00:00')-Date.parse(state.since+'T00:00:00'))/86400000)+1
  $('together-days').textContent=state.since?`相恋第 ${days} 天`:''
  $('home-view').hidden=tab!=='home';$('feature-view').hidden=tab==='home';$('home-button').hidden=tab==='home'
  $('home-menu').innerHTML=tabs.filter(t=>t[0]!=='home').map(([id,icon,name])=>{const hint={order:'想要什么，告诉你',memory:'收藏我们的片刻',plan:'下一次，一起去',wish:'留给未来的期待',moment:'此刻的状态，想让你知道',weather:'把每天的心情，留在这里'}[id];const count=id==='order'?state.entries.filter(x=>x.kind==='order'&&x.recipient===state.current&&x.status==='sent').length:0;return `<button class="menu-tile tile-${id}" data-action="tab" data-id="${id}"><span class="tile-icon">${icon}</span><span><b>${name}${count?`<i>${count}</i>`:''}</b><small>${hint}</small></span><span class="tile-arrow">↗</span></button>`}).join('')
  const nextMeeting=DiaryUIModel.meetingFocus(state.entries,day(0)).focus;
  $('countdown').innerHTML=nextMeeting?`<span>⌁ ${nextMeeting.phase==='together'?'你们现在正在一起！':nextMeeting.phase==='ended'?'把见面收藏起来':'下一次见面'} · ${esc(nextMeeting.plan.place||nextMeeting.plan.title)}</span><span>${nextMeeting.phase==='upcoming'?nextMeeting.days+' 天后 ↗':nextMeeting.phase==='together'?'好好享受彼此陪伴的日子 ♡':'存入回忆 ↗'}</span>`:'<span>⌁ 下一次见面</span><span>写一个新计划 ↗</span>';
  const inbox=DiaryUIModel.inbox(state.notifications,state.current),notes=inbox.unread;
  $('inbox-count').textContent=notes.length?notes.length:'';
  $('inbox-tools').innerHTML=`${notes.length?'<button data-action="clear-inbox">全部已读</button>':''}${inbox.read.length?`<button data-action="toggle-read-inbox" aria-expanded="${ui.readInbox}">${ui.readInbox?'收起已读':'展开已读'} · ${inbox.read.length}</button>`:''}`;
  $('inbox').innerHTML=(notes.length?notes.map(n=>inboxHTML(n)).join(''):'<div class="inbox-empty"><span>✉</span>新的心意、心情和回应，会在这里等你。</div>')+(inbox.read.length?`<div id="read-inbox-panel" class="read-inbox-panel ${ui.readInbox?'is-open':''}" ${ui.readInbox?'':'inert'}><div class="read-inbox-inner"><p class="read-inbox-label">已经读过的小纸条</p>${inbox.read.map(n=>inboxHTML(n,true)).join('')}</div></div>`:'');
  if(tab!=='home'){
    const t=tabs.find(t=>t[0]===tab);$('section-title').textContent=t[2];$('section-desc').textContent={order:orderView?'每一份心意都有回音':'',memory:'',plan:'把期待，写成我们一起的日程',wish:'想去的地方 · 想拥有的小东西',moment:'',weather:'每天的状态，慢慢汇成这个月的天气'}[tab]
    $('section-action').textContent=tab==='weather'?'回到本月':tab==='moment'?'＋ 设置状态':tab==='order'?(orderView?'返回小铺':'订单'):'＋ '+({memory:'回忆',plan:'计划',wish:'心愿',moment:moodView==='memory'?'回忆':'心情'}[tab]);$('add-product').hidden=tab!=='order'||orderView
    paintContent();syncToolbar()
  }
  renderCart();DiaryMotion.afterRender(tab+(tab==='order'&&orderView?'-records':''));hydratePhotos();if(tab==='plan')meetingAfterRender()
}
function paintContent(){const top=$('content').querySelector('.product-grid')?.scrollTop||0;DiaryMotion.reflow($('content'),()=>{$('content').innerHTML=tab==='order'&&!orderView?shopHTML():recordsHTML()});const grid=$('content').querySelector('.product-grid');if(grid)grid.scrollTop=top}
function syncToolbar(){
  const shop=tab==='order'&&!orderView;
  $('search-shell').hidden=!shop;$('record-search').disabled=!shop;
  $('search-shell').classList.toggle('is-open',shop&&ui.searchOpen);$('search-toggle').setAttribute('aria-expanded',String(shop&&ui.searchOpen));$('search-toggle').setAttribute('aria-label',ui.searchOpen?'收起商品搜索':'展开商品搜索');$('record-search').tabIndex=shop&&ui.searchOpen?0:-1;
  if(document.activeElement!==$('record-search'))$('record-search').value=shop?ui.query:'';
  const record=['memory','wish'].includes(tab)||(tab==='order'&&orderView);
  $('view-toggle').hidden=!shop;$('record-view-toggle').hidden=!record;
  document.querySelector('.feature-toolbar').hidden=!shop&&!record;
  const layout=viewLayout();
  $('view-toggle').classList.toggle('is-grid',layout==='grid');$('view-toggle').setAttribute('aria-pressed',String(layout==='grid'));$('view-toggle').setAttribute('aria-label',layout==='grid'?'切换商品为列表':'切换商品为网格');$('view-toggle-label').textContent=layout==='grid'?'列表':'网格';
  const name={memory:'回忆',wish:'心愿',plan:'计划',order:'订单'}[tab]||'记录';
  $('record-view-toggle').classList.toggle('is-grid',layout==='grid');$('record-view-toggle').setAttribute('aria-pressed',String(layout==='grid'));$('record-view-toggle').setAttribute('aria-label',`切换${name}为${layout==='grid'?'列表':'网格'}`);$('record-view-label').textContent=layout==='grid'?'列表':'网格';
  const count=shop?DiaryUIModel.products(products,category,ui.query).length:tab==='weather'?DiaryUIModel.moodMonth(state.entries,ui.month,state.users).records.length:tab==='moment'?DiaryUIModel.activeStatuses(state.entries).length:state.entries.filter(x=>x.kind===tab).length;
  $('context-tip').hidden=['moment','weather','plan'].includes(tab);
  $('context-tip').innerHTML=`<span>${esc(DiaryUIModel.tip(count,shop?category:'',shop?ui.query:'',shop?'products':'records'))}</span>${shop&&ui.query?'<button data-action="clear-search">清除搜索</button>':''}`;

}
function productLinks(p){const link=DiaryUIModel.safeLink(p.url);return `${p.amount!=null&&p.amount!==''?`<span class="reference-amount">参考金额 ¥${esc(p.amount)}</span>`:''}${link?`<a class="purchase-link" href="${esc(link)}" target="_blank" rel="noopener noreferrer">打开购买链接 ↗</a>`:''}`}
function openProductDetail(id){const p=products.find(p=>p.id===id);if(!p)return;ui.productId=id;openModal('这一份，想送给你',`<div class="product-detail-hero"><div class="product-detail-emoji">${esc(p.icon)}</div><div><h3>${esc(p.name)}</h3><span class="tag">${esc(p.category)}</span></div></div><div class="product-detail-copy">${esc(p.note||'一份只想送给你的心意。')}</div><div class="product-reference">${productLinks(p)}</div><div class="product-detail-controls"><span class="price">心意 ¥0</span>${stepper(id)}</div><p class="product-detail-note">选好后送到另一半的小屋。参考金额和链接也会随订单一起送达，方便他购买或发红包。</p><div class="actions"><button class="outline" data-action="edit-product" data-id="${id}">编辑商品</button><button class="text-button" data-action="delete-product" data-id="${id}">删除商品</button></div><button class="primary wide" data-action="close-panel">选好了，继续逛逛</button>`,'product-detail')}
function inboxHTML(n,read=false){
  const x=state.entries.find(x=>x.id===n.entryId)||{id:n.entryId,title:n.title||'这条记录已经归档或移除',kind:n.entryKind||'',photos:[]},author=state.users.find(u=>u.id===n.actor)||{name:'另一半'}
  let headline='',body='',actions='';const name=esc(author.name)
  if(n.type==='order'){headline=`${name} 送来一份心意`;body=esc(x.title);actions=(x.status==='sent'?replyButtons(x.id):`<span class="soft-status">${x.shippedAt?'已发货 ♡':'已回应 ♡'}</span>`)+shipmentButton(x)}
  else if(n.type==='shipment'){headline=`${name} 为你的订单发货啦`;body=esc(x.title);actions='<button class="outline" data-action="open-orders">查看订单 ↗</button>'}
  else if(n.type==='moment'){headline=`${name} 分享了${esc(x.mood||'此刻的心情')}`;body=esc(x.title)+(x.content?`<p>${esc(x.content)}</p>`:'');actions=replyButtons(x.id,true)}
  else if(n.type==='reaction'){headline=`${name} 回应了你`;body=`<span class="reply-bubble">${esc(n.reaction)}</span><small>回应「${esc(x.title)}」</small>`}
  else if(n.type==='wish'){headline=`${name} 有了一个新心愿`;body=esc(x.title);actions=`<button class="outline" data-action="notice-open" data-id="${n.id}" data-tab="wish">去看看 ↗</button>`}
  else if(n.type==='fulfilled'){headline=x.wishAuthor===n.actor?`${name} 实现了一个心愿`:`${name} 帮你实现了心愿`;body=`✧ ${esc(x.title)}`}
  else if(n.type==='product'){headline=`${name} 添了新商品`;body=esc(n.title);actions=`<button class="outline" data-action="notice-open" data-id="${n.id}" data-tab="order">去小铺看看 ↗</button>`}
  else {headline=`${name} 更新了见面计划`;body=esc(x.title);actions=`<button class="outline" data-action="notice-open" data-id="${n.id}" data-tab="plan">查看计划 ↗</button>`}
  const photos=x&&(x.photos||[]).slice(0,2).map((src,i)=>`<img ${photoAttrs(src)} alt="分享的照片" data-action="photo" data-id="${x.id}" data-index="${i}">`).join('')
  return `<article class="note-card ${read?'is-read':''}"><div class="note-meta"><span>${headline}</span><button data-action="dismiss" data-id="${n.id}" aria-label="标为已读" ${read?'hidden':''}>×</button>${read?'<span class="read-badge">已读</span>':''}</div><div class="note-body">${body}</div>${photos?`<div class="note-photos">${photos}</div>`:''}<div class="note-actions">${actions}</div><time>${dateTime(n.createdAt)}</time></article>`
}
function replyButtons(id,moment=false){return `<div class="reactions">${(moment?['抱抱你','我在听','为你开心']:['收到啦 ♡','抱抱你','马上来']).map(r=>`<button data-action="reply" data-id="${id}" data-reaction="${r}">${r}</button>`).join('')}<button data-action="custom-reply" data-id="${id}">写回复</button></div>`}
async function replyTo(id,reaction){const x=state.entries.find(x=>x.id===id);if(!x||x.author===state.current)return false;const saved=await commit(s=>{const e=s.entries.find(x=>x.id===id);e.reaction=reaction;e.reactionAt=Date.now();e.reactionBy=s.current;if(e.kind==='order'){if(!e.shippedAt)e.status='received';e.receivedAt=e.receivedAt||Date.now()}s.notifications.filter(n=>n.entryId===id&&n.recipient===s.current&&['order','moment'].includes(n.type)).forEach(n=>n.dismissed=true);notify(s,'reaction',e,s.current,{reaction})});if(saved)toast('回应送到他的首页了 ♡');return saved}
function shipmentButton(x){return x.kind==='order'&&x.recipient===state.current&&!x.shippedAt?`<button class="outline ship-order" data-action="ship-order" data-id="${x.id}">确认发货 ↗</button>`:''}
async function shipOrder(id){
  const x=state.entries.find(x=>x.id===id&&x.kind==='order');if(!x||x.recipient!==state.current||x.shippedAt)return false;
  const saved=await commit(s=>{const e=s.entries.find(x=>x.id===id&&x.kind==='order');if(!e||e.recipient!==s.current)throw new Error('只有接单的另一半可以确认发货。');if(e.shippedAt)return;e.shippedAt=Date.now();e.shippedBy=s.current;e.status='shipped';s.notifications.filter(n=>n.entryId===id&&n.recipient===s.current&&n.type==='order').forEach(n=>n.dismissed=true);notify(s,'shipment',e,s.current)});
  if(saved)toast('已标记发货，另一半会收到提醒 ♡');return saved;
}
function shopHTML(){return `<div class="shop"><aside class="categories">${['全部','想念','陪伴','小情绪'].map(x=>`<button class="${category===x?'active':''}" data-action="category" data-name="${x}">${x}</button>`).join('')}</aside><div class="product-grid ${viewLayout()==='grid'?'layout-grid':''}" tabindex="0" aria-label="商品列表，可上下滚动">${DiaryUIModel.products(products,category,ui.query).map(p=>`<article class="product" data-key="${p.id}"><button class="product-open" data-action="product-detail" data-id="${p.id}" aria-label="查看${esc(p.name)}详情"><div class="product-art"><span class="emoji">${esc(p.icon)}</span></div></button><div class="product-copy"><div class="product-name-row"><h3><button class="product-title" data-action="product-detail" data-id="${p.id}">${esc(p.name)}</button></h3><button class="product-mini-edit" data-action="edit-product" data-id="${p.id}" aria-label="编辑${esc(p.name)}">✎</button><button class="product-mini-edit" data-action="delete-product" data-id="${p.id}" aria-label="删除${esc(p.name)}">×</button></div><p>${esc(p.note)}</p>${p.amount!=null?`<small class="reference-amount">参考 ¥${esc(p.amount)}</small>`:''}<div class="price-row"><span class="price">¥0</span>${stepper(p.id)}</div></div></article>`).join('')||'<div class="shop-search-empty">没有找到匹配的商品，换一个词试试。</div>'}</div></div>`}
function stepper(id){return `<div class="stepper">${cart[id]?`<button class="minus" data-action="cart" data-id="${id}" data-delta="-1" aria-label="减少一份">−</button><span>${cart[id]}</span>`:''}<button data-action="cart" data-id="${id}" data-delta="1" aria-label="添加一份">＋</button></div>`}
function renderCart(){const count=Object.values(cart).reduce((s,x)=>s+x,0);$('cartbar').classList.toggle('hidden',tab!=='order'||orderView);$('cartbar').innerHTML=`<button class="bag-summary" data-action="bag"><span class="bag-icon">♡${count?`<b>${count}</b>`:''}</span><div><strong>¥0</strong><small>${count?`选好了 ${count} 份心意`:'挑一份送给他'}</small></div></button><button class="primary" data-action="checkout" ${!count?'disabled':''}>0元下单 →</button>`}
function openProduct(id){
  const p=typeof id==='string'?products.find(x=>x.id===id):null;
  productDraft=p?{...p,snapshot:JSON.stringify(state.products.find(x=>x.id===id)||null)}:null;
  openModal(p?'编辑小铺商品':'给小铺添一件商品',`<form id="product-form">${field('商品名','name',p?.name||'','text','比如：想看瑟瑟/想要红包/想喝奶茶')}${choices('分类','product-category',['想念','陪伴','小情绪'],p?.category||'想念')}<input type="hidden" name="category" value="${esc(p?.category||'想念')}">${field('表情','icon',p?.icon||'💌','text','一个喜欢的表情')}${field('补充一句（选填）','note',p?.note||'','text','想让他知道什么')}${field('参考金额（选填）','amount',p?.amount??'','number','例如 18.00')}${field('购买链接（选填）','url',p?.url||'','url','粘贴商品或点单链接')}<p class="form-note">商品会保留在两个人的小铺，之后还可以再选。金额仅作参考，订单仍是 0 元心意。</p><button class="primary wide" type="submit">${p?'保存商品修改':'加入我们的小铺'}</button></form>`,'product-editor')
}
async function saveProduct(event){
  const f=new FormData(event.target),name=String(f.get('name')||'').trim(),amount=String(f.get('amount')||'').trim(),rawUrl=String(f.get('url')||'').trim(),url=DiaryUIModel.safeLink(rawUrl),editing=productDraft;
  if(!name||name.length>60)return toast('商品名请控制在 1—60 字');
  if(amount!==''&&(!Number.isFinite(Number(amount))||Number(amount)<0||Number(amount)>10000000))return toast('请填写有效参考金额');
  if(rawUrl&&!url)return toast('购买链接请以 http:// 或 https:// 开头');
  const values={name,icon:String(f.get('icon')||'💌').slice(0,8),category:String(f.get('category')||'想念'),note:String(f.get('note')||'').slice(0,200),amount:amount===''?null:Number(amount),url};
  if(await commit(s=>{const old=editing&&s.products.find(p=>p.id===editing.id);if(editing&&JSON.stringify(old||null)!==editing.snapshot)throw new Error('商品刚被另一半更新，请重新打开再修改。');const p={...(old||editing||{}),...values,id:editing?.id||'custom-'+uid(),author:old?.author||s.current,createdAt:old?.createdAt||Date.now(),updatedAt:Date.now(),editedBy:s.current,deleted:false};delete p.snapshot;const i=s.products.findIndex(x=>x.id===p.id);if(i>=0)s.products[i]=p;else s.products.push(p);if(!editing)notify(s,'product',p,s.current,{title:p.name})})) {category=values.category;closeModal();render();toast(editing?'商品修改已同步':'新商品会一直留在两个人的小铺')}
}
async function deleteProduct(id){const p=products.find(p=>p.id===id);if(!p||!confirm(`删除“${p.name}”？已有订单记录会保留。`))return;const snapshot=JSON.stringify(state.products.find(x=>x.id===id)||null);if(await commit(s=>{const old=s.products.find(p=>p.id===id);if(JSON.stringify(old||null)!==snapshot)throw new Error('商品刚被更新，请同步后再试。');const archived={...(old||p),author:old?.author||s.current,createdAt:old?.createdAt||Date.now(),deleted:true,updatedAt:Date.now(),editedBy:s.current};const i=s.products.findIndex(p=>p.id===id);if(i>=0)s.products[i]=archived;else s.products.push(archived)})){delete cart[id];if($('modal').open)closeModal();toast('已从两个人的小铺移除')}}
function recordsHTML(){
  if(tab==='plan')return meetingHTML();if(tab==='moment')return statusHTML();if(tab==='weather')return weatherHTML();
  const kind=tab
  let html=tab==='moment'?`<div class="segmented"><button class="${moodView==='moment'?'active':''}" data-action="mood-view" data-value="moment">☁ 分享当下</button><button class="${moodView==='memory'?'active':''}" data-action="mood-view" data-value="memory">▧ 添加共同回忆</button></div>`:''
  if(tab==='moment' && moodView==='memory')return html+`<div class="card memory-cta"><span class="empty-icon">▧</span><h3>把今天，留给以后的我们</h3><p>一起经历的事、当时的心情和照片，都会收藏到「回忆相册」。</p><button class="primary" data-action="add" data-kind="memory">＋ 添加一段共同回忆</button></div>`
  const entries=state.bound?state.entries.filter(x=>x.kind===kind).sort((a,b)=>b.createdAt-a.createdAt):[]
  return html+`<div class="records ${viewLayout()==='grid'?'layout-grid':''}">${entries.length?entries.map(cardHTML).join(''):`<div class="card empty"><span class="empty-icon">${tab==='order'?'💌':tab==='memory'?'📷':tab==='plan'?'🗓️':tab==='wish'?'✨':'☁️'}</span><h3>${ui.query?'没有找到匹配的记录':tab==='order'?'第一份想念，从你开始':'等你写下属于我们的一页'}</h3><p>${ui.query?'清除搜索，或换一个关键词。':tab==='order'?'在想你小铺挑选心意，0 元送给另一半。':'点击右上角，慢慢记录，另一半会看到。'}</p></div>`}</div>`
}
function cardHTML(x){
  const author=state.users.find(u=>u.id===x.author),mine=x.author===state.current,expanded=!!ui.open[x.id],canEdit=mine||x.kind==='plan';
  const photo=(x.photos||[])[0],labels={memory:'回忆',plan:'计划',wish:'心愿',moment:'心情',order:'订单'};
  let detail=`<dl class="record-details"><dt>标题</dt><dd>${esc(x.title)}</dd>${x.date?`<dt>日期</dt><dd>${esc(x.date)}${x.sourcePlanId&&x.endDate&&x.endDate!==x.date?' — '+esc(x.endDate):''}</dd>`:''}${x.place?`<dt>地点</dt><dd>${esc(x.place)}</dd>`:''}<dt>${x.kind==='plan'?'行程与约定':'事件与感受'}</dt><dd>${esc(x.content||'这一刻，也值得好好收藏。')}</dd>${x.completionNotes?`<dt>实现时记下</dt><dd>${esc(x.completionNotes)}</dd>`:''}${x.mood?`<dt>心情</dt><dd>${esc(x.mood)}</dd>`:''}${x.kind==='wish'?`<dt>类别</dt><dd>${esc(x.category||'心愿')}</dd>`:''}${x.budget?`<dt>参考金额</dt><dd>¥${esc(x.budget)}</dd>`:''}</dl>`;
  detail+=`<div class="entry-photos">${(x.photos||[]).map((p,i)=>`<button class="photo-thumb" data-action="photo" data-id="${x.id}" data-index="${i}" aria-label="放大照片 ${i+1}"><img ${photoAttrs(p)} alt="记录照片 ${i+1}"></button>`).join('')}</div>`;
  detail+=attachmentHTML(x.attachments,x.id);
  if(x.kind==='order')detail+=(x.items||[]).map(p=>`<div class="order-item"><div class="order-line"><span>${esc(p.icon||'💌')} ${esc(p.name)} ×${p.quantity}</span><span>¥0</span></div><div class="product-reference">${productLinks(p)}</div></div>`).join('')+`<div class="order-status">${x.shippedAt?'已发货 · '+dateTime(x.shippedAt):x.status==='received'?'已回应':'等他回应'}</div>${x.reaction?`<div class="reaction">♡ ${esc(x.reaction)}</div>`:''}${!mine?shipmentButton(x)+replyButtons(x.id):''}`;
  else if(x.kind==='wish')detail+=`<div class="actions"><button class="primary" data-action="fulfill" data-id="${x.id}">实现心愿 · 记入回忆</button>${x.category!=='物品'&&!x.linkedId?`<button class="outline" data-action="convert" data-id="${x.id}">安排进见面计划</button>`:''}</div>${x.linkedId?'<p class="form-note">已经安排进计划，真正实现后再记入回忆。</p>':''}`;
  else if(['plan','moment'].includes(x.kind)&&!x.linkedId)detail+=`<div class="actions"><button class="outline" data-action="convert" data-id="${x.id}">存为共同回忆</button></div>`;
  if(x.kind==='moment')detail+=`${x.reaction?`<div class="reaction">♡ ${esc(x.reaction)}</div>`:''}${!mine?replyButtons(x.id,true):''}`;
  if(mine&&x.kind!=='order')detail+=`<div class="actions"><button class="text-button" data-action="remove" data-id="${x.id}">删除这条${labels[x.kind]||'记录'}</button></div>`;
  return `<article class="card record-drawer ${expanded?'is-expanded':''}" data-key="${x.id}">${canEdit&&x.kind!=='order'?`<button class="record-edit" data-action="edit" data-id="${x.id}">编辑${labels[x.kind]}</button>`:''}<button class="record-summary record-expand" data-action="expand-record" data-id="${x.id}" aria-expanded="${expanded}" aria-controls="detail-${x.id}"><div class="meta"><span>${esc(author?.name||'另一半')}${mine?' · 我':''}</span><span>${dateTime(x.createdAt)}</span></div><div class="record-cover-row">${photo?`<img class="record-cover" ${photoAttrs(photo)} alt="${labels[x.kind]}封面">`:''}<div><h3>${esc(x.title)}</h3><p class="record-preview">${esc([x.date,x.place,x.mood].filter(Boolean).join(' · ')||'点击打开这一页')}</p></div></div><span class="drawer-hint"><span>${expanded?'收起详情':'打开这一页'}</span><span class="chevron" aria-hidden="true">⌄</span></span></button><div id="detail-${x.id}" class="record-reveal ${expanded?'expanded':''}" ${expanded?'':'inert'}><div class="record-reveal-inner">${detail}</div></div></article>`;
}
function freezeDialogTheme(){const d=$('modal'),style=getComputedStyle(document.body);for(const name of ['--bg','--ink','--text','--accent','--line','--button-ink','--surface','--surface-soft','--surface-strong','--content-surface','--reading-halo'])d.style.setProperty(name,style.getPropertyValue(name))}
function openModal(title,html,kind){const d=$('modal');if(!d.open)freezeDialogTheme();clearTimeout(modalCloseTimer);modalEpoch++;d.classList.remove('closing','submission-error','submission-pending');$('submission-feedback').textContent='';d.dataset.kind=kind||(html.includes('entry-form')?'editor':'panel');$('modal-title').textContent=title;$('modal-body').innerHTML=html;hydratePhotos();if(!d.open){d.showModal();if(d.dataset.kind==='editor'){d.classList.add('opening-editor');const epoch=modalEpoch;setTimeout(()=>{if(epoch===modalEpoch)d.classList.remove('opening-editor')},340)}}}
function closeModal(){if(documentBusy)return toast('行程附件正在上传，请稍等');if(photoBusy)return toast('照片正在压缩，请稍等');if(submitBusy){if(executingSubmit)pendingClose=true;return}const d=$('modal'),epoch=++modalEpoch;d.classList.add('closing');clearTimeout(modalCloseTimer);modalCloseTimer=setTimeout(()=>{if(epoch!==modalEpoch)return;if(d.open)d.close();d.classList.remove('closing');if(draftUploads.length){cloud?.removeUnused(draftUploads);draftUploads=[]}draft=null;productDraft=null;clearPhotoDraft();clearDocumentDraft();ui.productId='';if(tab==='plan')meetingAfterRender()},DiaryMotion.reduced()?0:150)}
async function submitWithFeedback(event,task){
  event.preventDefault();if(submitBusy||photoBusy||documentBusy)return;const form=event.target,dialog=$('modal'),buttons=Array.from(form.querySelectorAll('button')),before=buttons.map(b=>b.disabled);submitBusy=true;pendingClose=false;dialog.classList.remove('submission-error');dialog.classList.add('submission-pending');form.setAttribute('aria-busy','true');form.inert=true;buttons.forEach(b=>b.disabled=true);$('submission-feedback').innerHTML='<span class="status-spinner" aria-hidden="true"></span>正在保存到两个人的小屋…'
  try{await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));executingSubmit=true;try{await task(event)}finally{executingSubmit=false}if(pendingClose){$('submission-feedback').innerHTML='<span class="status-check" aria-hidden="true">✓</span>已经保存好了';await new Promise(resolve=>setTimeout(resolve,DiaryMotion.reduced()?0:250))}else{dialog.classList.add('submission-error');$('submission-feedback').textContent=$('toast').textContent||'请检查填写内容后再试'}}catch(error){dialog.classList.add('submission-error');$('submission-feedback').textContent='这次没有保存成功，请重试。';toast('保存失败，填写的内容仍保留。')}finally{submitBusy=false;dialog.classList.remove('submission-pending');form.removeAttribute('aria-busy');form.inert=false;buttons.forEach((b,i)=>b.disabled=before[i]);if(pendingClose){pendingClose=false;closeModal()}}
}
function openBag(){openModal('装好的一点心意',`<div id="bag-items">${Object.entries(cart).map(([id,n])=>{const p=products.find(x=>x.id===id);return `<div class="order-line"><span>${esc(p.icon)} ${esc(p.name)}</span>${stepper(id)}</div>`}).join('')||'<div class="cart-empty">购物袋空啦，去挑一点心意吧。</div>'}</div><div class="totals"><span>合计（无需付款）</span><b>¥0</b></div><button class="primary wide" data-action="checkout" ${!Object.keys(cart).length?'disabled':''}>把心意送给${esc(partner().name)} →</button>`)}
async function placeOrder(){
    const items=Object.entries(cart).map(([id,quantity])=>({...products.find(x=>x.id===id),quantity,price:0}));if(!items.length)return
    const content=$('order-note').value.trim(),recipient=partner().id
    if(await commit(s=>{const order={id:uid(),kind:'order',title:items.map(x=>x.name).join('、'),items,content,author:s.current,recipient,status:'sent',createdAt:Date.now(),date:day(0),total:0};s.entries.push(order);notify(s,'order',order);})){cart={};orderView=true;closeModal();render();toast('送到他的首页啦 ♡')}
}
function openCheckout(){if(!bound()||!Object.keys(cart).length)return;openModal('把这份心意，送给你',`<div class="help">收件人：${esc(partner().name)}</div>${Object.entries(cart).map(([id,n])=>{const p=products.find(x=>x.id===id);return `<div class="order-line"><span>${esc(p.icon)} ${esc(p.name)} ×${n}</span><span>¥0</span></div><div class="product-reference">${productLinks(p)}</div>`}).join('')}<label class="form-field"><span>想多说一句（选填）</span><input id="order-note" maxlength="200" placeholder="比如：不着急，等你忙完来找我就好。"></label><div class="warning">心意订单为 ¥0。商品参考金额与链接会一并送达，实际购买或红包由你们自行安排。</div><div class="totals"><span>合计</span><b>¥0</b></div><button class="primary wide" data-action="place-order">确认 0 元下单 ♡</button>`)}
function newDraft(kind,source){
  if(!bound())return;clearPhotoDraft();clearDocumentDraft()
  draft={kind,title:'',content:'',place:'',date:day(0),mood:'想念',need:'只需倾听',category:'旅行',budget:'',photos:[]}
  if(['plan','memory'].includes(kind)){draft.endDate=day(0);draft.attachments=[]}
  if(source){Object.assign(draft,{title:source.title,content:source.content||'',place:source.place||(source.kind==='wish'&&source.category==='旅行'?source.title:''),budget:source.budget||'',photos:[...(source.photos||[])],sourceId:source.id,mood:source.mood||'开心'});if(source.kind==='plan'){draft.date=source.date;draft.endDate=source.endDate||source.date;draft.attachments=(source.attachments||[]).map(a=>({...a}));draft.sourcePlanId=source.id;draft.wishId=source.wishId||''}if(source.kind==='wish')draft.wishId=source.id}
  renderEditor()
}
const field=(label,name,value,type='text',placeholder='')=>`<label class="form-field"><span>${label}</span><input name="${name}" type="${type}" value="${esc(value||'')}" ${['title','name'].includes(name)?'maxlength="60" required':name==='place'?'maxlength="80"':name==='note'?'maxlength="200"':name==='url'?'maxlength="2048"':''} ${type==='date'?'required':''} ${type==='number'?'min="0" max="10000000" step="0.01"':''} placeholder="${esc(placeholder)}"></label>`
const choices=(label,name,values,value,custom=false)=>`<div class="form-field"><span>${label}</span><div class="choices">${values.map(v=>`<button type="button" class="${v===value?'active':''}" data-action="choice" data-field="${name}" data-value="${esc(v)}">${esc(v)}</button>`).join('')}${custom?`<button type="button" class="choice-plus" data-action="custom-choice-open" data-field="${name}" aria-label="新增${label}">＋</button>`:''}</div>${custom?`<div class="custom-choice-row" id="custom-${name}" hidden><input type="text" maxlength="20" aria-label="自定义${label}" placeholder="写一个自己的${label}"><button type="button" class="outline" data-action="custom-choice-save" data-field="${name}">添加</button></div>`:''}</div>`
function renderEditor(){
  const d=draft,k=d.kind;if(k==='moment')return renderStatusEditor();if(k==='plan')return renderMeetingEditor();
  let html=`<form id="entry-form">${field(k==='moment'?'用一句话说说今天':'标题','title',d.title,'text',k==='wish'?'例如：一起去日本看樱花':'给这一刻起个名字')}`
  if(k==='memory'||k==='plan')html+=`<div class="form-row">${field(k==='memory'?'回忆日期':'见面日期','date',d.date,'date')}${field('地点（选填）','place',d.place,'text','想一起去哪里')}</div>`
  if(k==='wish')html+=choices('心愿类别','category',DiaryUIModel.choices(['旅行','物品','一起做的事'],state.entries.filter(x=>x.kind==='wish'||x.sourceWishId),'category',d.category),d.category,true)+field('地点（选填）','place',d.place)
  if(k==='plan'||k==='wish')html+=field('参考预算（选填，不涉及支付）','budget',d.budget,'number','0.00')
  if(['memory','moment','plan'].includes(k))html+=choices('这一刻的心情','mood',DiaryUIModel.choices(moods,state.entries,'mood',d.mood),d.mood,true)
  if(k==='moment')html+=choices('希望你怎样陪我','need',needs,d.need)
  html+=`<label class="form-field"><span>${k==='plan'?'想一起做的事、行程和备注':'写下故事和感受'}</span><textarea name="content" maxlength="2000" placeholder="慢慢写，另一半会看到。">${esc(d.content)}</textarea></label><div class="photos-edit" id="photos-edit">${draftPhotosHTML()}</div><p id="photo-feedback" class="photo-feedback" role="status"></p><label class="upload-label">＋ 添加照片（最多 6 张）<input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" multiple></label><p class="form-note">照片会先压缩，再上传到两个人的私密相册。保存记录后，对方即可看到。</p><button type="submit" class="primary wide" id="save-entry">保存到我们的小屋 ♡</button></form>`
  if(k==='memory'&&d.attachments?.length)html=html.replace('<button type="submit"',attachmentHTML(d.attachments,d.sourcePlanId||d.editId)+'<button type="submit"');
  openModal(d.editId?(k==='plan'?'修改见面计划':'编辑记录'):{memory:'添加一段回忆',plan:'安排下一次见面',wish:'收藏一个心愿',moment:'分享此刻的心情'}[k],html);refreshPhotoDraft()
}
function captureDraft(){if(!draft||!$('entry-form'))return;const f=new FormData($('entry-form'));for(const key of ['title','content','place','date','endDate','budget'])if(f.has(key))draft[key]=String(f.get(key)).trim()}
async function saveEntry(event){event.preventDefault();if(documentBusy||documentErrors())return toast('请等附件上传完成，失败的附件可重试或移除');if(photoBusy)return toast('照片正在处理，请稍等');captureDraft();const d=draft;if(d.kind==='moment'&&!d.title.trim())d.title='此刻：'+d.mood;if(!d.title.trim())return toast('先给这条记录起个名字吧');if((d.kind==='memory'||d.kind==='plan')&&!/^\d{4}-\d{2}-\d{2}$/.test(d.date))return toast('请选择日期');if(d.kind==='memory'&&d.date>day(0))return toast('回忆日期不能晚于今天，未来的安排可以存成计划');if(d.kind==='plan'&&(!Number.isFinite(DiaryUIModel.dayNumber(d.endDate||d.date))||(d.endDate||d.date)<d.date))return toast('结束日期不能早于开始日期');if(d.kind==='plan'&&d.date<day(0)&&!d.editId)return toast('新计划请选择今天或未来的日期');if(d.budget!==''&&(!Number.isFinite(Number(d.budget))||Number(d.budget)<0||Number(d.budget)>10000000))return toast('请填写有效预算');const id=uid(),kind=d.kind;if(await commit(s=>{if(d.editId){const item=s.entries.find(x=>x.id===d.editId);if(!item||JSON.stringify(item)!==d.editSnapshot)throw new Error('这条记录已被另一半修改。请先保留你填写的内容，关闭后重新打开最新记录。');Object.assign(item,d,{budget:d.budget?Number(d.budget):0,sample:false,editedAt:Date.now()});delete item.editId;delete item.editSnapshot;if(kind==='plan')notify(s,'plan',item)}else{const saved={...d};delete saved.editSnapshot;s.entries.push({...saved,id,budget:d.budget?Number(d.budget):0,author:s.current,createdAt:Date.now(),status:'active',sample:false});if(['moment','wish','plan'].includes(kind))notify(s,kind,s.entries[s.entries.length-1]);if(kind==='memory'&&d.wishId&&s.entries.some(x=>x.kind==='wish'&&x.id===d.wishId)){const w=s.entries.find(x=>x.id===d.wishId);const m=s.entries[s.entries.length-1];Object.assign(m,{sourceWishId:w.id,wishAuthor:w.author,fulfilledBy:s.current});if(w.author!==s.current){m.completionNotes=m.content;m.title=w.title;m.content=w.content||'';m.place=w.place||'';m.photos=[...(w.photos||[])]}s.entries=s.entries.filter(x=>x.id!==w.id)}if(d.sourceId){const x=s.entries.find(x=>x.id===d.sourceId);if(x){x.linkedId=id;x.status=kind==='plan'?'planned':'remembered'}}}})){draftUploads=[];const savedDocRefs=new Set(state.entries.flatMap(x=>(x.attachments||[]).map(a=>a.ref)));cloud.removeDocuments(draftDocumentUploads.filter(ref=>!savedDocRefs.has(ref)));draftDocumentUploads=[];closeModal();tab=kind;if(kind==='moment')moodView='moment';render();toast(kind==='memory'?'已收藏到回忆相册 ♡':'已保存到我们的小屋 ♡')}}
function openAccount(){
  if(!authenticated)return showAuth('')
  openModal('我们的小屋',`<div class="account-pair"><b>♡ ${state.users.map(u=>esc(u.name)).join(' × ')}</b><small>两人私密空间 · 当前是 ${esc(me().name)}</small></div><label class="form-field"><span>我的称呼</span><input id="profile-name" maxlength="20" value="${esc(me().name)}"></label><button class="outline" data-action="profile">保存称呼</button>${field('我们的相恋日','since',state.since,'date')}<button class="outline" data-action="since">保存纪念日</button><div class="motion-setting"><span>减少动态效果</span><button data-action="motion-setting" aria-pressed="${DiaryMotion.reduced()}">${DiaryMotion.reduced()?'已减少':'完整动效'}</button></div><div class="motion-setting"><span>接收邮件提醒</span><button id="mail-preference" type="button" aria-pressed="false" disabled>读取中…</button></div><p id="mail-hint" class="form-note">读取你的邮件提醒设置…</p><div class="divider"></div><button class="outline wide" data-action="sync-now">重新同步</button><button class="outline wide" data-action="backup">导出日记备份</button><p class="form-note">文字备份不包含照片文件；重要照片请另存原图。新消息在打开小屋时同步；邮件提醒可在离线时送达。</p><button class="text-button wide" data-action="logout">退出当前账号</button>`)
  loadMailPreference()
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||submitBusy)return
  const a=button.dataset.action,id=button.dataset.id,x=state.entries.find(x=>x.id===id);if(cloudBusy&&['reply','receive','react','fulfill','remove','profile','since','complete'].includes(a))return toast('正在同步，请稍等')
  if(a==='tab'){go(id)}
  else if(a==='product-detail')openProductDetail(id)
  else if(a==='close-panel')closeModal()
  else if(a==='clear-search'){ui.query='';$('record-search').value='';paintContent();syncToolbar()}
  else if(a==='edit-product')openProduct(id)
  else if(a==='delete-product')deleteProduct(id)
  else if(a==='toggle-read-inbox')toggleReadInbox(button)
  else if(a==='custom-choice-open'){const row=$('custom-'+button.dataset.field);row.hidden=!row.hidden;if(!row.hidden)row.querySelector('input').focus()}
  else if(a==='custom-choice-save'){const row=$('custom-'+button.dataset.field),value=row.querySelector('input').value.trim();if(!value||value.length>20)return toast('请填写 1—20 个字');captureDraft();draft[button.dataset.field]=value;renderEditor()}
  else if(a==='expand-record'){ui.open=DiaryUIModel.toggleOpen(ui.open,id);const expanded=!!ui.open[id],card=button.closest('article'),detail=card.querySelector('.record-reveal');detail.classList.toggle('expanded',expanded);card.classList.toggle('is-expanded',expanded);detail.inert=!expanded;button.setAttribute('aria-expanded',String(expanded));button.querySelector('.drawer-hint>span').textContent=expanded?'收起详情':'打开这一页';if(expanded)hydratePhotos()}
  else if(a==='motion-setting'){DiaryMotion.setReduced(!DiaryMotion.reduced());button.textContent=DiaryMotion.reduced()?'已减少':'完整动效';button.setAttribute('aria-pressed',String(DiaryMotion.reduced()))}
  else if(a==='theme')themeController.select(button.dataset.theme)
  else if(a==='category'){category=button.dataset.name;paintContent();syncToolbar();$('content').querySelector('.product-grid').scrollTop=0;DiaryMotion.resetScroll()}
  else if(a==='cart'){if(!bound())return;cart[id]=Math.max(0,Math.min(9,(cart[id]||0)+Number(button.dataset.delta)));if(!cart[id])delete cart[id];render();if($('modal').open){if($('modal').dataset.kind==='product-detail')openProductDetail(ui.productId||id);else openBag()}}
  else if(a==='bag')openBag()
  else if(a==='checkout')openCheckout()
  else if(a==='place-order')submitWithFeedback({target:$('modal-body'),preventDefault(){}},placeOrder)
  else if(a==='ship-order'&&x){button.disabled=true;try{await shipOrder(id)}finally{if(button.isConnected)button.disabled=false}}
  else if(a==='open-orders'){go('order');orderView=true;render()}
  else if(a==='receive'&&x)replyTo(id,'收到啦 ♡')
  else if(a==='reply')replyTo(id,button.dataset.reaction)
  else if(a==='custom-reply')openModal('回他一句',`<form id="reply-form" data-id="${id}"><label class="form-field"><span>你的回应</span><textarea name="reply" maxlength="200" required placeholder="我看到啦，想跟你说…"></textarea></label><button class="primary wide" type="submit">把回应送给他 ♡</button></form>`)
  else if(a==='dismiss')dismiss(id)
  else if(a==='clear-inbox')commit(s=>s.notifications.filter(n=>n.recipient===s.current).forEach(n=>n.dismissed=true))
  else if(a==='notice-open'){dismiss(id);go(button.dataset.tab)}
  else if(a==='fulfill'&&x&&x.kind==='wish'){const memoryId=uid();if(await commit(s=>{const m=DiaryUIModel.archiveWish(s,id,s.current,memoryId,day(0));notify(s,'fulfilled',m)})){render();toast('心愿实现啦，已记入回忆，可以继续实现其他心愿 ♡')}}
  else if(a==='add')newDraft(button.dataset.kind||tab)
  else if(a==='convert'&&x&&!x.linkedId){if(x.kind==='plan'&&DiaryUIModel.meetingRange(x,day(0)).phase!=='ended')return toast('等见面结束后，再把这段时光存入回忆叭');newDraft(x.kind==='wish'?'plan':'memory',x)}
  else if(a==='edit'&&x){clearPhotoDraft();clearDocumentDraft();draft={budget:'',date:day(0),need:'只需倾听',...x,endDate:x.endDate||x.date,attachments:(x.attachments||[]).map(a=>({...a})),photos:[...(x.photos||[])],editId:x.id,editSnapshot:JSON.stringify(x)};renderEditor()}
  else if(a==='choice'){if(button.dataset.field==='product-category'){const f=$('product-form');f.querySelector('[name=category]').value=button.dataset.value;button.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===button))}else{captureDraft();draft[button.dataset.field]=button.dataset.value;renderEditor()}}
  else if(a==='remove-photo'&&draft){draft.photos.splice(Number(button.dataset.index),1);refreshPhotoDraft()}
  else if(a==='remove-pending-photo')removePendingPhoto(id)
  else if(a==='retry-photo')retryPendingPhoto(id)
  else if(a==='weather-shift'){ui.month=DiaryUIModel.shiftMonth(ui.month,Number(button.dataset.delta));paintContent()}
  else if(a==='weather-day')openWeatherDay(button.dataset.date)
  else if(a==='open-status'&&x)openStatusDetail(x)
  else if(a==='mood-view'){moodView=button.dataset.value;render()}
  else if(a==='react'&&x)replyTo(id,button.dataset.reaction)
  else if(a==='complete'&&x)commit(s=>{const e=s.entries.find(y=>y.id===id);e.status=e.status==='done'?'active':'done'})
  else if(a==='remove'&&x&&x.author===state.current){if(confirm('从两个人的小屋移除这条记录？'))commit(s=>{s.entries=s.entries.filter(y=>y.id!==id);const source=s.entries.find(y=>y.linkedId===id);if(source)delete source.linkedId})}
  else if(a==='photo'&&x){const p=(x.photos||[])[Number(button.dataset.index)];if(p)openModal('我们的照片',`<img class="preview-photo" ${photoAttrs(p)} alt="记录照片">`)}
  else if(a==='profile'){const name=$('profile-name').value.trim();if(!name)return toast('请填写称呼');if(await commit(s=>s.users.find(u=>u.id===s.current).name=name)){openAccount();toast('称呼已保存')}}
  else if(a==='since'){const since=document.querySelector('[name="since"]').value;if(!since||since>day(0))return toast('请选择今天或过去的日期');if(await commit(s=>s.since=since)){openAccount();toast('纪念日已保存')}}
  else if(a==='sync-now'){await syncNow(true)}
  else if(a==='backup'){const data={exportedAt:new Date().toISOString(),state:{...state,current:undefined}};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='我们的恋爱日记-'+day(0)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  else if(a==='logout'){if(cloudBusy)return toast('正在同步，请稍等');if(documentBusy)return toast('附件正在上传，请稍等');if(photoBusy)return toast('照片正在上传，请稍等');await cloud.signOut()}

})
document.addEventListener('submit',async event=>{if(event.target.id==='entry-form')submitWithFeedback(event,saveEntry)})
document.addEventListener('change',event=>{if(event.target.id==='photo-input'){const files=Array.from(event.target.files||[]);event.target.value='';uploadPhotos(files)}})
$('section-action').onclick=()=>{if(tab==='weather'){ui.month=day(0).slice(0,7);paintContent()}else if(tab==='order'){orderView=!orderView;render()}else newDraft(tab==='moment'&&moodView==='memory'?'memory':tab)}
$('countdown').onclick=()=>go('plan');$('home-button').onclick=()=>go('home');$('add-product').onclick=openProduct
$('account').onclick=openAccount;$('close-modal').onclick=()=>{if(!submitBusy)closeModal()}
$('modal').addEventListener('cancel',event=>{event.preventDefault();if(submitBusy)return;closeModal()})
let backdropPress=false
$('modal').addEventListener('pointerdown',event=>{const r=$('modal').getBoundingClientRect();backdropPress=event.target===$('modal')&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)})
$('modal').addEventListener('click',event=>{if(backdropPress&&event.target===$('modal')&&!submitBusy)closeModal();backdropPress=false})
document.addEventListener('submit',async event=>{
  if(event.target.id==='product-form')submitWithFeedback(event,saveProduct)
  if(event.target.id==='reply-form')submitWithFeedback(event,async()=>{const reply=String(new FormData(event.target).get('reply')).trim();if(!reply)return;if(await replyTo(event.target.dataset.id,reply))closeModal()})
})
$('search-toggle').onclick=()=>{ui.searchOpen=!ui.searchOpen;if(!ui.searchOpen){ui.query='';paintContent()}syncToolbar();if(ui.searchOpen)$('record-search').focus()}
$('view-toggle').onclick=()=>{ui.shopLayout=ui.shopLayout==='grid'?'list':'grid';paintContent();syncToolbar()}
$('record-view-toggle').onclick=()=>{const key=tab==='order'?'orders':tab;ui.recordLayouts[key]=ui.recordLayouts[key]==='grid'?'list':'grid';paintContent();syncToolbar()}
let composing=false,searchTimer=0
$('record-search').addEventListener('compositionstart',()=>composing=true)
$('record-search').addEventListener('compositionend',()=>{composing=false;ui.query=$('record-search').value;paintContent();syncToolbar()})
$('record-search').addEventListener('input',()=>{if(composing)return;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{ui.query=$('record-search').value;paintContent();syncToolbar()},80)})
themeController.start(true)
document.addEventListener('visibilitychange',()=>{if(document.hidden)themeController.stop();else themeController.start()})
window.addEventListener('pagehide',()=>themeController.stop())
renderTheme();bootCloud()

$('landscape-open').onclick=()=>document.body.classList.add('immersive')
$('landscape-close').onclick=()=>document.body.classList.remove('immersive')
document.addEventListener('keydown',event=>{if(event.key==='Escape')document.body.classList.remove('immersive')})
