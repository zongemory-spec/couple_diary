const {test}=require('node:test'),assert=require('node:assert/strict');
const ui=require('../site/ui-model.js');
test('catalog: edited defaults and saved custom products stay available, deletions and physical goods stay hidden',()=>{
  const defaults=[{id:'miss',name:'想你',category:'想念'},{id:'hug',name:'抱抱',category:'陪伴'}];
  const saved=[{id:'miss',name:'想你啦',category:'想念',amount:18,url:'https://example.com'},{id:'hug',deleted:true},{id:'tea',name:'奶茶',category:'陪伴'},{id:'kiwi',name:'猕猴桃',category:'实物'}];
  const result=ui.catalog(defaults,saved);assert.deepEqual(result.map(x=>x.id),['miss','tea']);assert.equal(result[0].amount,18);assert.equal(ui.products(result,'陪伴','奶茶')[0].id,'tea');assert.deepEqual(saved[2],{id:'tea',name:'奶茶',category:'陪伴'});
});
test('product links: reject executable, credential-bearing and malformed URLs',()=>{assert.equal(ui.safeLink('javascript:alert(1)'),'');assert.equal(ui.safeLink('https://u:p@example.com'),'');assert.equal(ui.safeLink('not-a-link'),'');assert.equal(ui.safeLink('https://example.com/item?q=1'),'https://example.com/item?q=1')});
test('custom moods and wish categories are recovered from saved shared records',()=>{assert.deepEqual(ui.choices(['开心'],[{mood:'紧张'},{mood:'开心'}],'mood','害羞'),['开心','紧张','害羞']);assert.deepEqual(ui.choices(['旅行','物品'],[{category:'纪念日'}],'category','纪念日'),['旅行','物品','纪念日'])});
test('inbox: read and expired notices remain expandable, including notices for deleted records',()=>{const notes=[{id:'n1',recipient:'b',createdAt:3,expiresAt:99},{id:'n2',recipient:'b',dismissed:true,createdAt:2,expiresAt:99,entryId:'gone'},{id:'n3',recipient:'b',createdAt:1,expiresAt:1},{id:'n4',recipient:'a',createdAt:9,expiresAt:99}];const r=ui.inbox(notes,'b',10);assert.deepEqual(r.unread.map(x=>x.id),['n1']);assert.deepEqual(r.read.map(x=>x.id),['n2','n3']);assert.equal(notes.length,4)});
test('wish fulfillment: consume wish and preserve its details and photo references in one new memory',()=>{const s={entries:[{id:'wish',kind:'wish',author:'a',title:'一起旅行',content:'春天去',place:'京都',photos:['storage:original'],category:'旅行',budget:2000}]};const m=ui.archiveWish(s,'wish','b','memory','2026-10-22',123);assert.equal(s.entries.length,1);assert.equal(m.kind,'memory');assert.equal(m.author,'b');assert.equal(m.wishAuthor,'a');assert.equal(m.sourceWishId,'wish');assert.deepEqual(m.photos,['storage:original']);assert.equal(m.content,'春天去');assert.throws(()=>ui.archiveWish(s,'wish','a','duplicate','2026-10-22'))});
test('shop scrolling: forward scroll hides chrome and reverse scroll restores it',()=>{const hidden=ui.scroll({anchor:0,hidden:false},150);assert.equal(hidden.hidden,true);assert.equal(ui.scroll(hidden,100).hidden,false);assert.equal(ui.scroll(hidden,180,true).hidden,false)});


test('status: only the latest per person is shown, and exactly 24 hours expires without deleting history',()=>{
  const now=Date.now(),entries=[{id:'old',kind:'moment',author:'a',createdAt:now-ui.statusLifetime,mood:'沮丧'},{id:'b',kind:'moment',author:'b',createdAt:now-1000,mood:'开心'},{id:'a1',kind:'moment',author:'a',createdAt:now-2000,mood:'平静'},{id:'a2',kind:'moment',author:'a',createdAt:now-1000,mood:'期待'}];
  assert.deepEqual(ui.activeStatuses(entries,now).map(x=>x.id).sort(),['a2','b']);assert.equal(entries.length,4);
  assert.equal(ui.activeStatuses(entries,now+ui.statusLifetime).length,0);
});
test('monthly chart: retained statuses from both people survive expiry, daily summaries use the last status of each person',()=>{
  const timestamp=(d,h)=>new Date(2026,9,d,h,0).getTime(),entries=[{id:'a1',kind:'moment',author:'a',createdAt:timestamp(1,8),mood:'沮丧'},{id:'a2',kind:'moment',author:'a',createdAt:timestamp(1,20),mood:'开心'},{id:'b1',kind:'moment',author:'b',createdAt:timestamp(1,10),mood:'愤怒'},{id:'other',kind:'moment',author:'a',createdAt:new Date(2026,8,30).getTime(),mood:'期待'}];
  const data=ui.moodMonth(entries,'2026-10',[{id:'a',name:'小明'},{id:'b',name:'小夏'}]);assert.equal(data.records.length,3);assert.equal(data.days.length,31);assert.equal(data.days[0].entries.length,3);assert.equal(data.days[0].latest.a.id,'a2');assert.equal(data.summaries[0].counts.sun,1);assert.equal(data.summaries[0].counts.rain,0);assert.equal(data.summaries[1].counts.storm,1);assert.equal(entries.length,4);
});
test('monthly chart: leap years, year boundaries and custom moods are handled',()=>{assert.equal(ui.moodMonth([],'2024-02',[]).days.length,29);assert.equal(ui.shiftMonth('2026-12',1),'2027-01');assert.equal(ui.shiftMonth('2026-01',-1),'2025-12');assert.equal(ui.moodWeather('自定义状态').key,'cloud');assert.throws(()=>ui.moodMonth([],'2026-13',[]));});
