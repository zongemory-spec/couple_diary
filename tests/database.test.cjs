const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const {pathToFileURL}=require('node:url');const {randomUUID}=require('node:crypto');
let db;const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
before(async()=>{
 const {PGlite}=await require('./pglite.cjs')();db=new PGlite();await db.waitReady;
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,metadata jsonb);
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 alter table storage.objects enable row level security;
 grant usage on schema public,auth,storage to anon,authenticated;
 grant select,insert,delete on storage.objects to authenticated;
 insert into auth.users values('${A}'),('${B}'),('${C}');`);
 await db.exec(fs.readFileSync(path.resolve(__dirname,'./fixtures/01-初始化.sql'),'utf8'));
 // A second run must preserve data and policies.
 await db.exec(fs.readFileSync(path.resolve(__dirname,'./fixtures/01-初始化.sql'),'utf8'));
 await db.query('insert into public.diary_members(user_id,slot) values($1,\'a\'),($2,\'b\')',[A,B]);
});
after(async()=>{await db?.close()});
async function as(id,fn){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return await fn()}finally{await db.exec('reset role')}}
async function read(id){return as(id,async()=>{const q=await db.query('select public.diary_read(-1) packet');return q.rows[0].packet})}
async function save(id,p,change,commit=randomUUID()){const next=structuredClone(p.state);change(next);return as(id,async()=>{const q=await db.query('select public.diary_save($1,$2,$3::jsonb) packet',[p.revision,commit,JSON.stringify(next)]);return q.rows[0].packet})}
function entry(kind,id,author='a'){return {id,kind,author,title:'测试标题',content:'两个人的小事',createdAt:Date.now(),date:'2026-10-22',photos:[],status:'active'}}
test('database: only the two slots can exist',async()=>{await assert.rejects(()=>db.query('insert into public.diary_members values($1,\'c\')',[C]));await assert.rejects(()=>db.query('insert into public.diary_members values($1,\'a\')',[C]));assert.equal((await read(A)).role,'a');assert.equal((await read(B)).role,'b')});
test('database: a third authenticated user cannot read, save, or select private tables',async()=>{await assert.rejects(()=>read(C),/DIARY_FORBIDDEN/);await assert.rejects(()=>as(C,()=>db.query('select * from public.diary_house')),/permission denied/);const p=await read(A);await assert.rejects(()=>save(C,p,()=>{}),/DIARY_FORBIDDEN/)});

test('database: anonymous visitors cannot execute read RPC',async()=>{await db.exec('set role anon');try{await assert.rejects(()=>db.query('select public.diary_read(-1)'),/permission denied/)}finally{await db.exec('reset role')}});
test('database: a saved mood is shared, without client current role in persisted data',async()=>{const p=await read(A);await save(A,p,s=>s.entries.push(entry('moment','mood-1')));const b=await read(B);assert.equal(b.state.entries[0].title,'测试标题');assert.equal(b.state.current,undefined)});
test('database: stale revisions return latest state without overwriting it',async()=>{const p=await read(A);await save(B,p,s=>s.since='2026-05-21');const result=await save(A,p,s=>s.since='2026-05-22');assert.equal(result.conflict,true);assert.equal(result.state.since,'2026-05-21')});
test('database: retrying an ambiguous save id is idempotent',async()=>{const p=await read(A),id=randomUUID();const first=await save(A,p,s=>s.entries.push(entry('wish','wish-1')),id);const again=await save(A,p,s=>s.entries.push(entry('wish','wish-1')),id);assert.equal(first.revision,again.revision);assert.equal(again.state.entries.filter(x=>x.id==='wish-1').length,1)});
test('database: member cannot impersonate partner, change partner name, or rewrite partner mood',async()=>{const p=await read(B);await assert.rejects(()=>save(B,p,s=>s.entries.push(entry('moment','forged','a'))),/DIARY_FORBIDDEN/);await assert.rejects(()=>save(B,p,s=>s.users[0].name='冒名'),/DIARY_FORBIDDEN/);await assert.rejects(()=>save(B,p,s=>s.entries[0].content='覆盖'),/DIARY_FORBIDDEN/)});
test('database: partner can react and sender reads the reaction',async()=>{const p=await read(B);await save(B,p,s=>Object.assign(s.entries[0],{reaction:'抱抱你',reactionBy:'b',reactionAt:Date.now()}));assert.equal((await read(A)).state.entries[0].reaction,'抱抱你')});
test('database: meeting plans can be edited by both members',async()=>{await save(A,await read(A),s=>s.entries.push(entry('plan','plan-1')));await save(B,await read(B),s=>s.entries.find(x=>x.id==='plan-1').place='杭州');assert.equal((await read(A)).state.entries.find(x=>x.id==='plan-1').place,'杭州')});
test('database: zero-yuan order and physical wish commit together; priced orders are rejected',async()=>{const order={...entry('order','order-1'),recipient:'b',status:'sent',total:0,items:[{id:'kiwi',name:'猕猴桃',price:0,quantity:1}]};await save(A,await read(A),s=>{s.entries.push(order);s.entries.push({...entry('wish','kiwi-wish'),wishType:'physical',category:'物品',orderId:'order-1'})});assert.equal((await read(B)).state.entries.find(x=>x.id==='kiwi-wish').orderId,'order-1');const p=await read(A);await assert.rejects(()=>save(A,p,s=>s.entries.push({...order,id:'paid',total:2})),/DIARY_INVALID/)});
test('database: invalid price check uses a current revision',async()=>{const p=await read(A);await assert.rejects(()=>save(A,p,s=>s.entries.push({...entry('order','paid-2'),recipient:'b',total:1,items:[{price:1,quantity:1}]})),/DIARY_INVALID/)});
test('database: deleting partner records and altering user slots are rejected',async()=>{const p=await read(B);await assert.rejects(()=>save(B,p,s=>s.entries=s.entries.filter(x=>x.id!=='mood-1')),/DIARY_FORBIDDEN/);await assert.rejects(()=>save(B,p,s=>s.users[1].id='a'),/DIARY_FORBIDDEN/)});

test('database: photos are private, allowlisted, and restricted to uploader folder',async()=>{const name=A+'/'+randomUUID()+'.jpg';await as(A,()=>db.query('insert into storage.objects(bucket_id,name) values(\'diary-photos\',$1)',[name]));assert.equal((await as(B,()=>db.query('select * from storage.objects'))).rows.length,1);assert.equal((await as(C,()=>db.query('select * from storage.objects'))).rows.length,0);await assert.rejects(()=>as(B,()=>db.query('insert into storage.objects(bucket_id,name) values(\'diary-photos\',$1)',[A+'/'+randomUUID()+'.jpg'])),/row-level security/);await save(A,await read(A),s=>s.entries.push({...entry('memory','photo-memory'),photos:['storage:'+name]}));const removed=await as(A,()=>db.query('delete from storage.objects where name=$1 returning name',[name]));assert.equal(removed.rows.length,0);await save(A,await read(A),s=>s.entries=s.entries.filter(x=>x.id!=='photo-memory'));assert.equal((await as(A,()=>db.query('delete from storage.objects where name=$1 returning name',[name]))).rows.length,1)});
test('database: arbitrary photo URLs and missing objects are rejected',async()=>{const p=await read(A);await assert.rejects(()=>save(A,p,s=>s.entries.push({...entry('memory','bad-photo'),photos:['https://example.com/private.jpg']})),/DIARY_INVALID/);await assert.rejects(()=>save(A,p,s=>s.entries.push({...entry('memory','missing-photo'),photos:['storage:'+A+'/'+randomUUID()+'.jpg']})),/DIARY_INVALID/)});

test('database: a null revision cannot bypass conflict detection',async()=>{const p=await read(A);const result=await save(A,{...p,revision:null},s=>s.since='2026-05-22');assert.equal(result.conflict,true);assert.equal(result.revision,p.revision)});
