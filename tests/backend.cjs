const fs=require('node:fs'),path=require('node:path');
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','66666666-6666-4666-8666-666666666666'];
const install=()=>fs.readFileSync(path.resolve(__dirname,'../database/install.sql'),'utf8');
async function bootstrap(db,paired=true){
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid() primary key,bucket_id text,name text,metadata jsonb);
 create function storage.foldername(text) returns text[] language sql immutable as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;
 alter table storage.objects enable row level security;grant usage on schema public,auth,storage to anon,authenticated,service_role;
 grant select,insert,delete on storage.objects to authenticated;`);
 for(const [i,id] of ids.entries())await db.query('insert into auth.users values($1,$2,$3)',[id,String.fromCharCode(97+i)+'@example.com',i===5?null:new Date().toISOString()]);
 await db.exec(install());await db.exec(install());
 if(paired){const h=(await db.query(`insert into public.diary_house(body) values('{"version":3,"bound":true,"since":"2000-01-01","users":[{"id":"a","name":"我"},{"id":"b","name":"你","city":""}],"entries":[],"products":[],"notifications":[]}') returning id`)).rows[0].id;await db.query("insert into public.diary_members(user_id,slot,couple_id) values($1,'a',$3),($2,'b',$3)",[ids[0],ids[1],h]);}
}
async function rpc(db,id,name,args=[]){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');try{return (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result}finally{await db.exec('reset role')}}
module.exports={bootstrap,install,ids,rpc};
