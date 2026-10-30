;(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DiaryUIModel=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().trim()
  function matches(item,query){const terms=normalize(query).split(/\s+/).filter(Boolean),haystack=normalize([item.name,item.title,item.note,item.content,item.category,item.place,item.mood].filter(Boolean).join(' '));return terms.every(term=>haystack.includes(term))}
  function products(items,category,query){return items.filter(item=>!item.deleted&&item.category!=='实物'&&(category==='全部'||item.category===category)&&matches(item,query))}
  function catalog(defaults,saved){const map=new Map(defaults.map(p=>[p.id,p]));for(const p of saved||[])map.set(p.id,p);return [...map.values()].filter(p=>!p.deleted&&p.category!=='实物')}
  function safeLink(value){try{const u=new URL(String(value||'').trim());return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:''}catch{return ''}}
  function choices(base,entries,key,current){return [...new Set([...base,...entries.map(x=>x[key]),current].filter(v=>typeof v==='string'&&v.trim()).map(v=>v.trim()))]}
  function inbox(notifications,recipient,now=Date.now()){const all=notifications.filter(n=>n.recipient===recipient).sort((a,b)=>b.createdAt-a.createdAt);return {unread:all.filter(n=>!n.dismissed&&n.expiresAt>now),read:all.filter(n=>n.dismissed||n.expiresAt<=now)}}
  function archiveWish(state,id,actor,memoryId,date,now=Date.now()){
    const wish=state.entries.find(x=>x.id===id&&x.kind==='wish');if(!wish)throw new Error('这个心愿已经更新，请先同步后再试。');
    if(state.entries.some(x=>x.kind==='memory'&&x.sourceWishId===id))throw new Error('这个心愿已经记入回忆。');
    const memory={id:memoryId,kind:'memory',title:wish.title,content:wish.content||'',place:wish.place||'',photos:[...(wish.photos||[])],date,mood:wish.mood||'开心',author:actor,createdAt:now,status:'active',sourceWishId:wish.id,wishAuthor:wish.author,fulfilledBy:actor,category:wish.category||'',budget:wish.budget||0};
    state.entries=state.entries.filter(x=>x.id!==id);state.entries.push(memory);return memory;
  }
  function scroll(previous,y,blocked=false){y=Math.max(0,Number(y)||0);const state=previous||{anchor:0,hidden:false};if(blocked||y<28)return {anchor:y,hidden:false};const delta=y-state.anchor;if(Math.abs(delta)<14)return state;return {anchor:y,hidden:y>90&&delta>0}}
  function toggleOpen(open,id){const next={...open};next[id]=!next[id];return next}
  function tip(count,category,query,kind){return `${category&&category!=='全部'?category+' · ':''}${query?'“'+query.trim()+'” · ':''}${count} ${kind==='products'?'件商品':'条记录'}`}
  const statusLifetime=24*60*60*1000;
  function dateKey(value){const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
  function activeStatuses(entries,now=Date.now()){
    const latest=new Map();for(const x of entries){if(x.kind!=='moment'||!Number.isFinite(Number(x.createdAt))||x.createdAt>now||now-x.createdAt>=statusLifetime)continue;const old=latest.get(x.author);if(!old||x.createdAt>old.createdAt)latest.set(x.author,x)}return [...latest.values()];
  }
  function moodWeather(mood){if(['开心','幸福','安心','感动','期待'].includes(mood))return {key:'sun',icon:'☀️',name:'晴'};if(['愤怒','生气'].includes(mood))return {key:'storm',icon:'⛈️',name:'雷雨'};if(['委屈','沮丧','抱怨','焦虑','难过','伤心'].includes(mood))return {key:'rain',icon:'🌧️',name:'雨'};return {key:'cloud',icon:'☁️',name:'云'}}
  function moodMonth(entries,month,users){
    if(!/^\d{4}-\d{2}$/.test(month))throw new Error('invalid_month');const [y,m]=month.split('-').map(Number);if(m<1||m>12||y<1970||y>2200)throw new Error('invalid_month');
    const days=Array.from({length:new Date(y,m,0).getDate()},(_,i)=>({date:month+'-'+String(i+1).padStart(2,'0'),number:i+1,entries:[],latest:{}}));
    const records=entries.filter(x=>x.kind==='moment'&&dateKey(x.createdAt).startsWith(month+'-')).sort((a,b)=>a.createdAt-b.createdAt);
    for(const x of records){const d=days[Number(dateKey(x.createdAt).slice(-2))-1];if(d){d.entries.push(x);d.latest[x.author]=x}}
    const summaries=users.map(u=>{const counts={sun:0,cloud:0,rain:0,storm:0};for(const d of days)if(d.latest[u.id])counts[moodWeather(d.latest[u.id].mood).key]++;return {id:u.id,name:u.name,counts,days:Object.values(counts).reduce((a,b)=>a+b,0)}});
    return {month,days,firstWeekday:new Date(y,m-1,1).getDay(),summaries,records};
  }
  function shiftMonth(month,delta){const [y,m]=month.split('-').map(Number),d=new Date(y,m-1+delta,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')}
  function dayNumber(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return NaN;const [y,m,d]=value.split('-').map(Number),n=Date.UTC(y,m-1,d);return new Date(n).toISOString().slice(0,10)===value?n/86400000:NaN}
  function meetingRange(plan,today){const start=dayNumber(plan.date),end=dayNumber(plan.endDate||plan.date),now=dayNumber(today);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||!Number.isFinite(now))return {phase:'invalid'};return {phase:now<start?'upcoming':now<=end?'together':'ended',days:start-now,start:plan.date,end:plan.endDate||plan.date,duration:end-start+1}}
  function meetingFocus(entries,today,acknowledged=[]){const all=entries.filter(p=>p.kind==='plan'&&!p.linkedId&&p.status!=='remembered').map(plan=>({plan,...meetingRange(plan,today)})).filter(x=>x.phase!=='invalid');const active=all.filter(x=>x.phase==='together').sort((a,b)=>a.start.localeCompare(b.start)),future=all.filter(x=>x.phase==='upcoming').sort((a,b)=>a.start.localeCompare(b.start));const ended=all.filter(x=>x.phase==='ended').sort((a,b)=>b.end.localeCompare(a.end));return {focus:active[0]||future[0]||ended.find(x=>!acknowledged.includes(x.plan.id))||null,ended,others:[...active.slice(active.length?1:0),...future.slice(active.length?0:1)]}}
  return {dayNumber,meetingRange,meetingFocus,normalize,matches,products,scroll,toggleOpen,tip,catalog,safeLink,choices,inbox,archiveWish,statusLifetime,dateKey,activeStatuses,moodWeather,moodMonth,shiftMonth}
})
