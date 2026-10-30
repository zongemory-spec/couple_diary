// Backend only. Never put these secrets in config.js or the Cloudflare upload.
export function buildMail(job,siteUrl) {
  const actor=String(job.payload?.actor||'对方').slice(0,20),type=job.payload?.type;
  const mood=String(job.payload?.mood||'');
  let title,copy;
  if(type==='invite'){title=`${actor}邀请你一起记录恋爱日记`;copy='请使用收到这封邮件的邮箱注册并验证，打开邀请链接确认资料。邀请7天有效；如果你不认识邀请人，请忽略。'} else if(type==='letter'){title='你收到了一封新的私密信件';copy='另一半给你写了一封信，登录小屋查看吧。'} else if(type==='order') {
    title=`叮～收到来自${actor}的一份心意`;
    copy=`叮~，您的想你小铺收到了一条来自${actor}的订单，快来查看叭，别让他等太久喔`;
  } else if(type==='shipment') {
    title=`叮～${actor}为你的订单发货啦`;
    copy=`叮~，${actor}已为您的想你小铺订单发货，快来看看叭~`;
  } else if(type==='moment') {
    title=`叮～${actor}分享了此刻的心情`;
    copy=`叮~，${actor}记录了现在的心情，好像不太开心哎，快来看看他叭~`;
  } else {
    const templates={memory:['回忆',`叮~，${actor}记录了一个美好回忆，快来相册记住他的表情叭~`],wish:['心愿',`叮~，${actor}许下了一个心愿，来帮他实现叭~`],plan:['见面计划',`叮~，${actor}更新了一条见面计划，一起看看去哪里相见叭~`],'plan-update':['见面计划',`叮~，${actor}更新了一条见面计划，一起看看去哪里相见叭~`]};
    const item=templates[type];if(!item)throw new Error('unsupported_event');
    title=`叮～收到来自${actor}的${item[0]}`;copy=item[1];
  }
  const url=new URL(siteUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw new Error('invalid_site_url');
  if(type==='invite'){if(!/^[0-9a-f]{64}$/.test(job.payload?.token||''))throw Error('invalid_invite_token');url.hash='invite='+job.payload.token}
  const link=url.href;
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  return {subject:title,text:`${copy}\n\n打开我们的小屋：${link}\n\n邮件只作提醒，不附日记正文或照片。可以在“我们的小屋”关闭自己的邮件提醒。`,html:`<!doctype html><html lang="zh-CN"><body style="margin:0;background:#fff7f2;color:#403237;font:16px/1.9 system-ui,sans-serif"><div style="max-width:520px;padding:36px 24px;margin:auto"><p style="color:#b46f86;font-size:24px">✿</p><h1 style="font-size:21px;font-weight:400">${esc(title)}</h1><p>${esc(copy)}</p><p><a href="${esc(link)}" style="display:inline-block;padding:12px 22px;background:#a06079;color:white;text-decoration:none;border-radius:18px">回到我们的小屋 ♡</a></p><p style="font-size:12px;color:#79676e">邮件只作提醒，不附日记正文或照片。<br>可以在“我们的小屋”关闭自己的邮件提醒。</p></div></body></html>`};
}

export function createMailHandler(options={}) {
  const get=key=>options.env?options.env[key]:Deno.env.get(key);
  const fetcher=options.fetch||fetch;
  const pause=options.pause||((ms)=>new Promise(r=>setTimeout(r,ms)));
  const constantEqual=(a,b)=>{if(a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0};
  return async request=>{
    if(request.method!=='POST')return new Response('Method not allowed',{status:405});
    const secret=get('DIARY_MAIL_WORKER_SECRET')||'';
    if(secret.length<32)return new Response('Mail worker is not configured',{status:503});
    if(!constantEqual(request.headers.get('x-diary-mail-secret')||'',secret))return new Response('Unauthorized',{status:401});
    const base=get('SUPABASE_URL'),key=get('SUPABASE_SERVICE_ROLE_KEY'),resend=get('RESEND_API_KEY'),site=get('DIARY_SITE_URL');
    const provider=get('MAIL_PROVIDER')||(get('QQ_SMTP_USER')?'qq':'resend');
    const qqUser=(get('QQ_SMTP_USER')||'').trim(),qqCode=(get('QQ_SMTP_AUTH_CODE')||'').trim(),gmailCode=(get('GMAIL_APP_PASSWORD')||'').replace(/\s/g,'');
    const smtpProvider=['qq','gmail'].includes(provider);
    let smtpUser=provider==='gmail'?(get('GMAIL_SMTP_USER')||'').trim().toLowerCase():qqUser,from=smtpProvider?`恋爱日记 <${smtpUser}>`:get('DIARY_MAIL_FROM');
    if(!base||!key||!site||!['qq','gmail','resend'].includes(provider)
      ||(provider==='qq'&&(!/^[A-Za-z0-9._+-]+@(?:qq|foxmail)\.com$/i.test(qqUser)||!qqCode))
      ||(provider==='gmail'&&(!gmailCode||!/^[A-Za-z0-9._+-]+@(?:gmail|googlemail)\.com$/.test(smtpUser)))||(provider==='resend'&&(!resend||!from)))return new Response('Mail worker is not configured',{status:503});
    try{
      const b=new URL(base);if(b.protocol!=='https:'||!b.hostname.endsWith('.supabase.co')||b.pathname!=='/')throw new Error();
      buildMail({payload:{type:'order'}},site);
      if(provider!=='gmail'&&(/[\r\n]/.test(from)||!from.includes('@')))throw new Error();
    }catch{return new Response('Invalid mail configuration',{status:503})}
    async function rpc(name,args){
      const r=await fetcher(base.replace(/\/$/,'')+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(10000)});
      if(!r.ok)throw new Error('database_'+r.status);return r.json();
    }
    let transport;
    try {
      if(smtpProvider){
        if(options.smtpTransport)transport=options.smtpTransport;
        else{
          const {default:nodemailer}=await import('npm:nodemailer@10.2.0');
          transport=nodemailer.createTransport({host:provider==='gmail'?'smtp.gmail.com':'smtp.qq.com',port:465,secure:true,
            auth:{user:smtpUser,pass:provider==='gmail'?gmailCode:qqCode},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},
            connectionTimeout:8000,greetingTimeout:8000,socketTimeout:12000,
            disableFileAccess:true,disableUrlAccess:true,logger:false,debug:false});
        }
      }
      const jobs=await rpc('diary_mail_claim',{p_limit:smtpProvider?2:5});
      if(!Array.isArray(jobs)||jobs.length>5)throw new Error('invalid_jobs');
      const results={accepted:0,retry:0,failed:0,uncertain:0,unconfirmed:0};
      for(const [i,job] of jobs.entries()){
        if(i)await pause(600);
        let outcome='retry',providerId=null,error=null,smtpStarted=false;
        try{
          const mail=buildMail(job,site);
          if(smtpProvider){
            // Verify performs authentication only, and does not send a message.
            await transport.verify();
            const ready=await rpc('diary_mail_smtp_begin',{p_id:job.id,p_lease:job.lease});
            if(!ready){results.unconfirmed++;continue}
            smtpStarted=true;
            const info=await transport.sendMail({from,to:job.recipient_email,...mail,
              messageId:`<diary-${job.id}@${smtpUser.split('@')[1]}>`,headers:{'Auto-Submitted':'auto-generated'},
              disableFileAccess:true,disableUrlAccess:true});
            if(!info.accepted?.some(address=>String(address).toLowerCase()===job.recipient_email.toLowerCase()))throw new Error('smtp_not_confirmed');
            providerId=info.messageId||`diary-${job.id}`;outcome='sent';
          }else{
            if(!await rpc('diary_mail_smtp_begin',{p_id:job.id,p_lease:job.lease})){results.unconfirmed++;continue}
            const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+resend,'Content-Type':'application/json','Idempotency-Key':'diary/'+job.id},body:JSON.stringify({from,to:[job.recipient_email],...mail}),signal:AbortSignal.timeout(15000)});
            if(response.ok){const data=await response.json();if(typeof data.id!=='string'||!data.id)throw new Error('provider_missing_id');providerId=data.id;outcome='sent'}
            else{error='provider_http_'+response.status;outcome=[400,404,422].includes(response.status)?'failed':'retry'}
          }
        }catch(e){
          if(error==='recipient_not_allowed')outcome='failed';
          else if(!smtpProvider)error='provider_network_or_payload';
          else if(Number(e.responseCode)>=400){error='smtp_reply_'+Number(e.responseCode);outcome=Number(e.responseCode)>=500?'failed':'retry'}
          else{error=smtpStarted?'smtp_unconfirmed':'smtp_connect_or_auth';outcome=smtpStarted?'uncertain':'retry'}
        }
        try {
          const ack=await rpc('diary_mail_finish',{p_id:job.id,p_lease:job.lease,p_result:outcome,p_provider_id:providerId,p_error:error});
          if(!ack)results.unconfirmed++;
          else results[outcome==='sent'?'accepted':outcome]++;
        }catch{results.unconfirmed++}
      }
      // Only aggregate counts leave the worker; no emails, diary text, secrets or provider bodies in logs.
      return Response.json(results);
    }catch{return Response.json({error:'mail_worker_unavailable'},{status:503})}
    finally{transport?.close?.()}
  };
}

if(typeof Deno!=='undefined')Deno.serve(createMailHandler());
