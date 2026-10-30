/* Local QA only: synthetic authentication, real install.sql. Never deploy this server. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {bootstrap,ids,rpc}=require('./backend.cjs');
(async()=>{
 const {PGlite}=await require('./pglite.cjs')(),db=new PGlite();await db.waitReady;await bootstrap(db,false);
 const root=path.resolve(__dirname,'../site'),errors=[];let serial=Promise.resolve();
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:4173');res.setHeader('Cache-Control','no-store');
  function json(data,status=200){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
  try{
   if(url.pathname==='/qa-errors')return json(errors);
   if(url.pathname==='/qa-error'){let text='';for await(const c of req)text+=c;errors.push(text.slice(0,2000));return json(true)}
   if(url.pathname.startsWith('/mock/')){
    let body='';for await(const c of req)body+=c;const args=body?JSON.parse(body):{};const route=url.pathname.slice(5);
    if(route.includes('/auth/v1/token')){
     const email=String(args.email||'').toLowerCase(),index='abcdef'.indexOf(email.split('@')[0]);
     if(index<0||email!=='abcdef'[index]+'@example.com')return json({message:'Invalid login credentials'},400);
     return json({access_token:ids[index],refresh_token:ids[index],expires_in:3600,user:{id:ids[index],email}});
    }
    if(route.includes('/auth/v1/signup')||route.includes('/auth/v1/recover')||route.includes('/auth/v1/resend')||route.includes('/auth/v1/logout'))return json({});
    if(route.includes('/rest/v1/rpc/')){
     const name=route.split('/').pop();if(!/^diary_[a-z_]+$/.test(name))return json({},400);
     const id=String(req.headers.authorization||'').replace(/^Bearer /,'');if(!ids.includes(id))return json({},401);
     const task=serial.then(()=>rpc(db,id,name,Object.values(args)));serial=task.catch(()=>{});
     try{return json(await task)}catch(e){return json({message:e.message},400)}
    }
    return json({},404);
   }
   let filename=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));if(!filename.startsWith(root+path.sep))return json({},403);
   const ext=path.extname(filename),mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
   let content=fs.readFileSync(filename);
   if(ext==='.html')content=content.toString().replace('<head>','<head><script>const originalFetch=window.fetch.bind(window);window.fetch=(url,opts)=>{const parsed=new URL(url,location.href);return originalFetch(parsed.hostname==="qa.supabase.co"?"/mock"+parsed.pathname+parsed.search:url,opts)};window.addEventListener("error",e=>originalFetch("/qa-error",{method:"POST",body:e.message+" "+e.filename+":"+e.lineno}));window.addEventListener("unhandledrejection",e=>originalFetch("/qa-error",{method:"POST",body:String(e.reason?.stack||e.reason)}));</script>').replace('<body class="auth-locked">','<body class="auth-locked"><div style="position:fixed;bottom:0;left:0;z-index:9999;background:#fff;color:#722;padding:3px;font:12px sans-serif">本地合成账号测试 · 非真实注册/邮件</div>');
   if(url.pathname==='/config.js')content='window.DIARY_CONFIG={supabaseUrl:"https://qa.supabase.co",publishableKey:"sb_publishable_qa_only"};';
   res.writeHead(200,{'Content-Type':mime[ext]||'application/octet-stream'});res.end(content);
  }catch{json({error:'local_qa_error'},500)}
 });
 server.listen(4173,'127.0.0.1',()=>console.log('Local QA: http://127.0.0.1:4173/ — synthetic a@example.com through e@example.com, any test password; no real mail'));
 process.on('SIGINT',()=>server.close(()=>db.close().then(()=>process.exit())));
})();
