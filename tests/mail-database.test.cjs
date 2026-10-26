const {test,before,beforeEach,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{randomUUID}=require('node:crypto');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
let db,initial;
before(async()=>{
  const lib=await require('./pglite.cjs')();
  db=new lib.PGlite();await db.waitReady;
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
  create table auth.users(id uuid primary key,email text);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,metadata jsonb);
  create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
  alter table storage.objects enable row level security;grant usage on schema public,auth,storage to anon,authenticated,service_role;
  insert into auth.users values('${A}','a@example.com'),('${B}','b@example.com'),('${C}','c@example.com');`);
  for(const file of ['01-初始化.sql','03-邮件提醒.sql','03-邮件提醒.sql'])await db.exec(fs.readFileSync(path.resolve(__dirname,'./fixtures/'+file),'utf8'));
  await db.query('insert into public.diary_members values($1,\'a\'),($2,\'b\')',[A,B]);
  initial=(await db.query('select body from public.diary_house')).rows[0].body;
});
beforeEach(async()=>{await db.exec('reset role');await db.exec(fs.readFileSync(path.resolve(__dirname,'./fixtures/07-订单发货邮件.sql'),'utf8'));await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec('truncate public.diary_mail_outbox,public.diary_mail_preferences,public.diary_commits');await db.query('update public.diary_house set body=$1::jsonb,revision=0',[JSON.stringify(initial)])});
after(async()=>{await db?.close()});
async function member(id,fn){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await fn()}finally{await db.exec('reset role')}}
async function service(name,args=[]){await db.exec('set role service_role');try{return (await db.query(name,args)).rows[0]?.result}finally{await db.exec('reset role')}}
async function save(id,change,commit=randomUUID()){
  return member(id,async()=>{const p=(await db.query('select public.diary_read(-1) p')).rows[0].p;change(p.state);return (await db.query('select public.diary_save($1,$2,$3::jsonb) result',[p.revision,commit,JSON.stringify(p.state)])).rows[0].result});
}
const order=(id='order-1')=>({id,kind:'order',title:'想你啦',author:'a',recipient:'b',content:'PRIVATE_TEXT',createdAt:Date.now(),total:0,items:[{quantity:1,price:0,name:'想你啦'}],status:'sent'});
const moment=()=>({id:'mood-1',kind:'moment',title:'今天',author:'a',content:'PRIVATE_TEXT',mood:'沮丧',createdAt:Date.now(),photos:[]});
const rows=async()=> (await db.query('select * from public.diary_mail_outbox order by created_at,id')).rows;
const claim=()=>service('select public.diary_mail_claim(5) result');
const finish=(j,result)=>service('select public.diary_mail_finish($1,$2,$3,$4,$5) result',[j.id,j.lease,result,result==='sent'?'provider-test':null,result==='retry'?'network':null]);

test('mail database: one order queues only the partner with no private text or photo payload',async()=>{
  await save(A,s=>s.entries.push(order()));const [job]=await rows();assert.equal(job.recipient_id,B);assert.equal(job.recipient_email,'b@example.com');assert.equal(job.actor_id,A);assert.equal(job.payload.type,'order');assert.ok(!JSON.stringify(job.payload).includes('PRIVATE_TEXT'));
});
test('mail database: edited mood, read state, retries and fabricated notifications do not create extra mail',async()=>{
  await save(A,s=>s.entries.push(moment()));await save(A,s=>s.entries[0].title='修改标题');await save(A,s=>s.notifications.push({id:'fake',type:'order',actor:'a',recipient:'b',entryId:'missing'}));assert.equal((await rows()).length,1);
  const p=await member(A,async()=> (await db.query('select public.diary_read(-1) p')).rows[0].p),commit=randomUUID();
  await member(A,()=>db.query('select public.diary_save($1,$2,$3::jsonb)',[p.revision,commit,JSON.stringify(p.state)]));await member(A,()=>db.query('select public.diary_save($1,$2,$3::jsonb)',[p.revision,commit,JSON.stringify(p.state)]));assert.equal((await rows()).length,1);
});
test('mail database: a reaction stays in the app and does not add a sixth email template',async()=>{
  await save(A,s=>s.entries.push(moment()));await save(B,s=>Object.assign(s.entries[0],{reaction:'抱抱你',reactionBy:'b',reactionAt:Date.now()}));assert.equal((await rows()).length,1);assert.equal((await rows())[0].payload.type,'moment');
});
test('mail database: automatic physical wishes do not duplicate the order notification',async()=>{
  await save(A,s=>s.entries.push(order(),{id:'kiwi',kind:'wish',author:'a',title:'猕猴桃',createdAt:Date.now(),wishType:'physical',orderId:'order-1'}));assert.equal((await rows()).length,1);
});
test('mail database: opt-out affects only your incoming mail and skips already queued jobs',async()=>{
  await save(A,s=>s.entries.push(order()));await member(B,()=>db.query('select public.diary_mail_preference(false)'));assert.equal((await rows())[0].status,'skipped');await save(A,s=>s.entries.push(moment()));assert.equal((await rows()).length,1);
  await member(B,()=>db.query('select public.diary_mail_preference(true)'));await save(B,s=>s.entries.push({...moment(),id:'from-b',author:'b'}));assert.equal((await rows()).filter(x=>x.recipient_id===A).length,1);
});
test('mail database: unlisted and anonymous callers cannot set preferences or access mail jobs',async()=>{
  await assert.rejects(()=>member(C,()=>db.query('select public.diary_mail_preference(true)')),/DIARY_FORBIDDEN/);
  await assert.rejects(()=>member(A,()=>db.query('select * from public.diary_mail_outbox')),/permission denied/);
  await assert.rejects(()=>member(A,()=>db.query('select public.diary_mail_claim(5)')),/permission denied/);
  await db.exec('set role anon');try{await assert.rejects(()=>db.query('select public.diary_mail_preference(true)'),/permission denied/)}finally{await db.exec('reset role')}
});
test('mail database: leases exclude duplicate workers, failed attempt retries same job, accepted mail is not resent',async()=>{
  await save(A,s=>s.entries.push(order()));const [one]=await claim();assert.equal((await claim()).length,0);assert.equal(await finish({...one,lease:randomUUID()},'sent'),false);assert.equal(await finish(one,'retry'),true);assert.equal((await claim()).length,0);
  await db.exec("update public.diary_mail_outbox set available_at=now()-interval '1 minute'");const [two]=await claim();assert.equal(two.id,one.id);assert.notEqual(two.lease,one.lease);assert.equal(two.attempts,2);assert.equal(await finish(two,'sent'),true);assert.equal((await claim()).length,0);assert.equal((await rows())[0].status,'sent');
});
test('mail database: events older than the provider idempotency window expire',async()=>{
  await save(A,s=>s.entries.push(order()));await db.exec("update public.diary_mail_outbox set created_at=now()-interval '24 hours'");assert.equal((await claim()).length,0);assert.equal((await rows())[0].status,'expired');
});
test('mail database: invalid or rolled-back diary saves cannot produce outgoing mail',async()=>{
  await assert.rejects(()=>save(A,s=>s.entries.push({...order(),total:2})),/DIARY_INVALID/);assert.equal((await rows()).length,0);
  await db.exec('begin');await save(A,s=>s.entries.push(order()));await db.exec('rollback');assert.equal((await rows()).length,0);
});
test('mail database: SMTP submission is not reclaimed after an unknown result',async()=>{
  await save(A,s=>s.entries.push(order()));const [job]=await claim();
  assert.equal(await service('select public.diary_mail_smtp_begin($1,$2) result',[job.id,job.lease]),true);
  assert.equal((await claim()).length,0);
  await db.exec("update public.diary_mail_outbox set locked_until=now()-interval '1 minute'");
  assert.equal((await claim()).length,0);assert.equal((await rows())[0].status,'uncertain');
  assert.equal(await finish(job,'sent'),false);
});
test('mail database: opt-out before SMTP submission prevents the send transition',async()=>{
  await save(A,s=>s.entries.push(order()));const [job]=await claim();await member(B,()=>db.query('select public.diary_mail_preference(false)'));
  assert.equal(await service('select public.diary_mail_smtp_begin($1,$2) result',[job.id,job.lease]),false);assert.equal((await rows())[0].status,'skipped');
});
test('mail database: confirmed SMTP success is accepted; ambiguous submission is parked for review',async()=>{
  await save(A,s=>s.entries.push(order()));let [job]=await claim();await service('select public.diary_mail_smtp_begin($1,$2) result',[job.id,job.lease]);assert.equal(await finish(job,'sent'),true);assert.equal((await rows())[0].status,'sent');
  await save(A,s=>s.entries.push(moment()));[job]=await claim();await service('select public.diary_mail_smtp_begin($1,$2) result',[job.id,job.lease]);assert.equal(await finish(job,'uncertain'),true);assert.equal((await claim()).length,0);assert.ok((await rows()).some(x=>x.status==='uncertain'));
});
test('catalog database: both members can edit or hide a saved product without changing its author',async()=>{
  await save(A,s=>s.products.push({id:'tea',name:'奶茶',note:'想喝',icon:'🧋',category:'陪伴',amount:18,url:'https://example.com/tea',author:'a',createdAt:1}));
  await save(B,s=>Object.assign(s.products[0],{name:'想喝奶茶',amount:20,editedBy:'b',updatedAt:2}));
  await save(B,s=>Object.assign(s.products[0],{deleted:true,editedBy:'b',updatedAt:3}));
  const p=await member(A,async()=> (await db.query('select public.diary_read(-1) p')).rows[0].p);assert.equal(p.state.products[0].author,'a');assert.equal(p.state.products[0].deleted,true);assert.equal(p.state.products[0].amount,20);
  await assert.rejects(()=>save(B,s=>s.products[0].author='b'),/DIARY_FORBIDDEN/);
});
test('catalog database: invalid amounts or executable links are rejected',async()=>{
  const p={id:'bad',name:'奶茶',icon:'🧋',category:'陪伴',author:'a',createdAt:1};
  await assert.rejects(()=>save(A,s=>s.products.push({...p,amount:-1})),/DIARY_INVALID/);
  await assert.rejects(()=>save(A,s=>s.products.push({...p,url:'javascript:alert(1)'})),/DIARY_INVALID/);
});
test('wish database: partner fulfillment replaces the wish with one memory, preserving source details',async()=>{
  await save(A,s=>s.entries.push({id:'wish-1',kind:'wish',title:'京都',content:'一起看红叶',place:'清水寺',author:'a',category:'旅行',createdAt:1,photos:[]}));
  const ui=require('../site/ui-model.js');await save(B,s=>ui.archiveWish(s,'wish-1','b','memory-wish','2026-10-22'));
  const p=await member(A,async()=> (await db.query('select public.diary_read(-1) p')).rows[0].p);assert.equal(p.state.entries.length,1);assert.equal(p.state.entries[0].sourceWishId,'wish-1');assert.equal(p.state.entries[0].content,'一起看红叶');assert.equal(p.state.entries[0].author,'b');
  assert.ok((await rows()).some(x=>x.payload.type==='memory'));
});
test('wish database: a partner cannot destroy a wish or forge a different memory as its replacement',async()=>{
  await save(A,s=>s.entries.push({id:'wish-1',kind:'wish',title:'京都',content:'一起看红叶',author:'a',createdAt:1,photos:[]}));
  await assert.rejects(()=>save(B,s=>s.entries=[]),/DIARY_FORBIDDEN/);
  await assert.rejects(()=>save(B,s=>{s.entries=[];s.entries.push({id:'fake',kind:'memory',author:'b',title:'覆盖',content:'改了',sourceWishId:'wish-1',wishAuthor:'a',fulfilledBy:'b',date:'2026-10-22',createdAt:2,photos:[]})}),/DIARY_FORBIDDEN/);
});
test('Gmail database: fixed sender is slot b and the only recipients are the two bound users',async()=>{
  const ctx=await service('select public.diary_mail_context() result');assert.equal(ctx.sender_slot,'b');assert.equal(ctx.sender_email,'b@example.com');assert.deepEqual(ctx.allowed_emails,['a@example.com','b@example.com']);
  await assert.rejects(()=>member(A,()=>db.query('select public.diary_mail_context()')),/permission denied/);
});
test('upgrade migration: legacy physical products move to wishes once, keeping other saved products',async()=>{
  await save(A,s=>s.products.push({id:'kiwi',name:'猕猴桃',note:'想吃',category:'实物',author:'a',createdAt:1},{id:'tea',name:'奶茶',category:'陪伴',author:'a',createdAt:1}));
  const sql=fs.readFileSync(path.resolve(__dirname,'./fixtures/05-界面与心愿升级.sql'),'utf8');await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec(sql);await db.exec(sql);
  const p=await member(A,async()=> (await db.query('select public.diary_read(-1) p')).rows[0].p);assert.equal(p.state.products.length,2);assert.equal(p.state.entries.filter(x=>x.sourceProductId==='kiwi').length,1);assert.equal(p.state.entries[0].category,'物品');assert.equal(p.state.products[0].deleted,true);
  const ui=require('../site/ui-model.js');await save(A,s=>ui.archiveWish(s,s.entries[0].id,'a','kiwi-memory','2026-10-22'));
  await db.query("select set_config('request.jwt.claim.sub','',false)");await db.exec(sql);
  const after=await member(A,async()=> (await db.query('select public.diary_read(-1) p')).rows[0].p);
  assert.equal(after.state.entries.filter(x=>x.kind==='wish').length,0);assert.equal(after.state.entries[0].kind,'memory');
});

const shipped=(s)=>Object.assign(s.entries.find(x=>x.kind==='order'),{status:'shipped',shippedAt:Date.now(),shippedBy:'b'});
test('shipment mail: only recipient shipment queues one email back to the original sender',async()=>{
 await save(A,s=>s.entries.push(order()));await save(B,shipped);let jobs=await rows();assert.equal(jobs.length,2);const j=jobs.find(x=>x.payload.type==='shipment');assert.equal(j.actor_id,B);assert.equal(j.recipient_id,A);assert.equal(j.recipient_email,'a@example.com');assert.equal(j.event_key,'shipped:order-1');assert.ok(!JSON.stringify(j.payload).includes('PRIVATE_TEXT'));
 await save(B,s=>Object.assign(s.entries[0],{reaction:'已经安排好啦',reactionBy:'b',reactionAt:Date.now()}));await save(A,s=>s.notifications.push({id:'view-only',actor:'a',recipient:'b',type:'reaction',entryId:'order-1'}));assert.equal((await rows()).length,2);
});
test('shipment mail: normal order replies stay in app; a later first shipment still sends once',async()=>{
 await save(A,s=>s.entries.push(order()));await save(B,s=>Object.assign(s.entries[0],{status:'received',reaction:'马上来',reactionBy:'b',receivedAt:Date.now()}));assert.equal((await rows()).length,1);await save(B,shipped);await save(B,()=>{});assert.equal((await rows()).filter(x=>x.payload.type==='shipment').length,1);
});
test('shipment permissions: sender cannot ship own order or forge shipment at creation',async()=>{
 await assert.rejects(()=>save(A,s=>s.entries.push({...order(),status:'shipped',shippedAt:Date.now(),shippedBy:'a'})),/DIARY_FORBIDDEN/);await save(A,s=>s.entries.push(order()));await assert.rejects(()=>save(A,s=>Object.assign(s.entries[0],{status:'shipped',shippedAt:Date.now(),shippedBy:'a'})),/DIARY_FORBIDDEN/);await assert.rejects(()=>save(B,s=>Object.assign(s.entries[0],{status:'shipped'})),/DIARY_INVALID/);await assert.rejects(()=>save(C,shipped),/DIARY_FORBIDDEN/);assert.equal((await rows()).length,1);
});
test('shipment permissions: sent state cannot be undone or restamped; recipient preferences still apply',async()=>{
 await save(A,s=>s.entries.push(order()));await member(A,()=>db.query('select public.diary_mail_preference(false)'));await save(B,shipped);assert.equal((await rows()).length,1);await assert.rejects(()=>save(B,s=>s.entries[0].status='received'),/DIARY_INVALID/);await assert.rejects(()=>save(B,s=>s.entries[0].shippedAt+=1),/DIARY_FORBIDDEN/);await assert.rejects(()=>save(B,s=>delete s.entries[0].shippedAt),/DIARY_FORBIDDEN/);
});
test('shipment migration: rerunning 07 does not send or replay historical shipments',async()=>{
 await save(A,s=>s.entries.push(order()));await save(B,shipped);const before=(await rows()).length;await db.exec(fs.readFileSync(path.resolve(__dirname,'./fixtures/07-订单发货邮件.sql'),'utf8'));await save(B,s=>s.since='2026-05-21');assert.equal((await rows()).length,before);
});
