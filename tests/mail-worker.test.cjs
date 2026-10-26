const {test}=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../supabase/functions/diary-mail/index.ts');
const env={DIARY_MAIL_WORKER_SECRET:'a'.repeat(64),SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'local-service-only',RESEND_API_KEY:'local-provider-only',DIARY_MAIL_FROM:'恋爱日记 <notice@example.com>',DIARY_SITE_URL:'https://couple-diary.example/'};
const job={id:'11111111-1111-4111-8111-111111111111',lease:'22222222-2222-4222-8222-222222222222',recipient_email:'b@example.com',payload:{type:'order',actor:'小明'}};
const req=(secret=env.DIARY_MAIL_WORKER_SECRET)=>new Request('https://example.supabase.co/functions/v1/diary-mail',{method:'POST',headers:{'x-diary-mail-secret':secret},body:'{}'});
const ok=data=>Response.json(data);
test('mail copy uses the requested fixed templates and escapes display names without including journal content',async()=>{const {buildMail}=await load();const negative=buildMail({...job,payload:{type:'moment',actor:'<img src=x onerror=alert(1)>',mood:'沮丧',content:'PRIVATE_TEXT'}},env.DIARY_SITE_URL);assert.ok(negative.text.includes('好像不太开心'));assert.ok(!negative.html.includes('<img'));assert.ok(!negative.html.includes('PRIVATE_TEXT'));const happy=buildMail({...job,payload:{type:'moment',actor:'小夏',mood:'开心'}},env.DIARY_SITE_URL);assert.ok(happy.text.includes('小夏记录了现在的心情'));assert.ok(happy.text.includes('好像不太开心'));assert.throws(()=>buildMail(job,'javascript:alert(1)'))});
test('mail worker rejects unauthenticated requests before any database or mail call',async()=>{const {createMailHandler}=await load();let calls=0;const handler=createMailHandler({env,fetch:()=>{calls++;throw Error()}});assert.equal((await handler(req('wrong'))).status,401);assert.equal(calls,0)});
test('mail worker uses fixed provider, derived recipient and stable provider idempotency key',async()=>{const {createMailHandler}=await load();let sent,ack;const handler=createMailHandler({env,pause:async()=>{},fetch:async(url,o)=>{if(url.endsWith('/diary_mail_claim'))return ok([job]);if(url==='https://api.resend.com/emails'){sent={url,o};return ok({id:'provider-1'})}ack=JSON.parse(o.body);return ok(true)}});const result=await (await handler(req())).json();assert.equal(result.accepted,1);assert.deepEqual(JSON.parse(sent.o.body).to,['b@example.com']);assert.equal(sent.o.headers['Idempotency-Key'],'diary/'+job.id);assert.equal(ack.p_result,'sent');assert.equal(ack.p_lease,job.lease)});
test('mail worker retries transient errors without exposing provider bodies or private addresses',async()=>{const {createMailHandler}=await load();let ack;const handler=createMailHandler({env,pause:async()=>{},fetch:async(url,o)=>{if(url.endsWith('/diary_mail_claim'))return ok([job]);if(url==='https://api.resend.com/emails')return new Response('sensitive provider response',{status:429});ack=JSON.parse(o.body);return ok(true)}});const result=await handler(req());const text=await result.text();assert.equal(ack.p_result,'retry');assert.equal(ack.p_error,'provider_http_429');assert.ok(!text.includes('b@example.com'));assert.ok(!text.includes('sensitive'))});
test('mail worker records ambiguous acknowledgements without claiming delivery',async()=>{const {createMailHandler}=await load();const handler=createMailHandler({env,fetch:async(url)=>{if(url.endsWith('/diary_mail_claim'))return ok([job]);if(url==='https://api.resend.com/emails')return ok({id:'provider-1'});throw Error('network')}});const result=await (await handler(req())).json();assert.equal(result.accepted,0);assert.equal(result.unconfirmed,1)});
const qqEnv={DIARY_MAIL_WORKER_SECRET:env.DIARY_MAIL_WORKER_SECRET,SUPABASE_URL:env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY,DIARY_SITE_URL:env.DIARY_SITE_URL,MAIL_PROVIDER:'qq',QQ_SMTP_USER:'local-sender@qq.com',QQ_SMTP_AUTH_CODE:'local-test-authorization'};
test('QQ SMTP sends from the configured QQ address without Resend or a custom domain',async()=>{
  const {createMailHandler}=await load();let message,ack,verified=0,begun=0;
  const handler=createMailHandler({env:qqEnv,smtpTransport:{verify:async()=>{verified++},sendMail:async m=>{message=m;return {accepted:['b@example.com'],messageId:m.messageId}}},fetch:async(url,o)=>{
    assert.ok(!url.includes('resend.com'));if(url.endsWith('/diary_mail_claim'))return ok([job]);if(url.endsWith('/diary_mail_smtp_begin')){begun++;return ok(true)}ack=JSON.parse(o.body);return ok(true);
  }});
  const r=await (await handler(req())).json();assert.equal(r.accepted,1);assert.equal(verified,1);assert.equal(begun,1);assert.equal(message.from,'恋爱日记 <local-sender@qq.com>');assert.equal(message.to,'b@example.com');assert.equal(ack.p_result,'sent');assert.ok(!JSON.stringify(message).includes(qqEnv.QQ_SMTP_AUTH_CODE));
});
test('QQ SMTP uncertain post-submission errors are not blindly retried',async()=>{
  const {createMailHandler}=await load();let ack;const handler=createMailHandler({env:qqEnv,smtpTransport:{verify:async()=>{},sendMail:async()=>{throw Object.assign(new Error('private server error'),{code:'ETIMEDOUT'})}},fetch:async(url,o)=>{if(url.endsWith('/diary_mail_claim'))return ok([job]);if(url.endsWith('/diary_mail_smtp_begin'))return ok(true);ack=JSON.parse(o.body);return ok(true)}});
  const r=await (await handler(req())).json();assert.equal(r.uncertain,1);assert.equal(ack.p_result,'uncertain');assert.equal(ack.p_error,'smtp_unconfirmed');
});
test('QQ SMTP connection checks fail before mail submission and may safely retry',async()=>{
  const {createMailHandler}=await load();let ack,sent=0;const handler=createMailHandler({env:qqEnv,smtpTransport:{verify:async()=>{throw Error('network')},sendMail:async()=>{sent++}},fetch:async(url,o)=>{if(url.endsWith('/diary_mail_claim'))return ok([job]);assert.ok(!url.endsWith('/diary_mail_smtp_begin'));ack=JSON.parse(o.body);return ok(true)}});
  const r=await (await handler(req())).json();assert.equal(r.retry,1);assert.equal(sent,0);assert.equal(ack.p_error,'smtp_connect_or_auth');
});
test('QQ SMTP rechecks a cancelled lease before sending',async()=>{
  const {createMailHandler}=await load();let sent=0;const handler=createMailHandler({env:qqEnv,smtpTransport:{verify:async()=>{},sendMail:async()=>{sent++}},fetch:async(url)=>{if(url.endsWith('/diary_mail_claim'))return ok([job]);return ok(false)}});
  const r=await (await handler(req())).json();assert.equal(r.unconfirmed,1);assert.equal(sent,0);
});
test('Gmail reads the fixed member-b sender from server membership and ignores addresses in the request',async()=>{
  const {createMailHandler}=await load();let message;const gmailEnv={...qqEnv,MAIL_PROVIDER:'gmail',GMAIL_APP_PASSWORD:'test app password'};
  const handler=createMailHandler({env:gmailEnv,smtpTransport:{verify:async()=>{},sendMail:async m=>{message=m;return {accepted:[m.to],messageId:m.messageId}}},fetch:async(url)=>{
    if(url.endsWith('/diary_mail_context'))return ok({sender_slot:'b',sender_email:'member-b@gmail.com',allowed_emails:['member-a@example.com','member-b@gmail.com']});
    if(url.endsWith('/diary_mail_claim'))return ok([{...job,recipient_email:'member-a@example.com'}]);return ok(true);
  }});
  const request=new Request('https://example.supabase.co/functions/v1/diary-mail',{method:'POST',headers:{'x-diary-mail-secret':env.DIARY_MAIL_WORKER_SECRET},body:JSON.stringify({from:'attacker@gmail.com',to:'stranger@example.com'})});
  const r=await (await handler(request)).json();assert.equal(r.accepted,1);assert.equal(message.from,'恋爱日记 <member-b@gmail.com>');assert.equal(message.to,'member-a@example.com');
});
test('Gmail refuses queue recipients outside the two bound accounts',async()=>{
  const {createMailHandler}=await load();let sent=0,ack;const handler=createMailHandler({env:{...qqEnv,MAIL_PROVIDER:'gmail',GMAIL_APP_PASSWORD:'local-test-only'},smtpTransport:{verify:async()=>{},sendMail:async()=>{sent++}},fetch:async(url,o)=>{
    if(url.endsWith('/diary_mail_context'))return ok({sender_slot:'b',sender_email:'member-b@gmail.com',allowed_emails:['member-a@example.com','member-b@gmail.com']});
    if(url.endsWith('/diary_mail_claim'))return ok([{...job,recipient_email:'stranger@example.com'}]);ack=JSON.parse(o.body);return ok(true);
  }});const r=await (await handler(req())).json();assert.equal(r.failed,1);assert.equal(sent,0);assert.equal(ack.p_error,'recipient_not_allowed');
});
test('the five requested mail bodies substitute member-b and member-a names',async()=>{
  const {buildMail}=await load();const expected={order:'叮~，您的想你小铺收到了一条来自小夏的订单，快来查看叭，别让他等太久喔',moment:'叮~，小夏记录了现在的心情，好像不太开心哎，快来看看他叭~',wish:'叮~，小夏许下了一个心愿，来帮他实现叭~',plan:'叮~，小夏更新了一条见面计划，一起看看去哪里相见叭~',memory:'叮~，小夏记录了一个美好回忆，快来相册记住他的表情叭~'};
  for(const [type,text] of Object.entries(expected))assert.ok(buildMail({...job,payload:{type,actor:'小夏'}},env.DIARY_SITE_URL).text.startsWith(text));
});

test('shipment mail body: actor name is substituted, private order text is not included',async()=>{const {buildMail}=await load();const m=buildMail({...job,payload:{type:'shipment',actor:'小夏',content:'PRIVATE_ORDER'}},env.DIARY_SITE_URL);assert.equal(m.subject,'叮～小夏为你的订单发货啦');assert.ok(m.text.startsWith('叮~，小夏已为您的想你小铺订单发货，快来看看叭~'));assert.ok(!JSON.stringify(m).includes('PRIVATE_ORDER'))});
