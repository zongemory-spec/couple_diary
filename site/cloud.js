/* Private two-person backend. No SDK/CDN dependency; no diary records stored locally. */
;(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DiaryCloud=api})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  class CloudError extends Error{constructor(message,code='',status=0,packet=null){super(message);this.code=code;this.status=status;this.packet=packet}}
  function secureId(){if(crypto.randomUUID)return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20)}
  function validate(config){
    const base=String(config.supabaseUrl||'').replace(/\/+$/,'');
    let url;try{url=new URL(base)}catch(e){throw new CloudError('请先完成部署配置。','CONFIG')}
    if(url.protocol!=='https:'||!/^([a-z0-9-]+)\.supabase\.co$/.test(url.hostname)||url.pathname!=='/'||url.search||url.hash)throw new CloudError('请填写 Supabase 项目的 HTTPS Project URL。','CONFIG');
    const key=String(config.publishableKey||'').trim();
    if(key.startsWith('sb_secret_'))throw new CloudError('这里不能使用 Secret key，请换成 Publishable key。','CONFIG');
    if(!key.startsWith('sb_publishable_')){
      try{const part=key.split('.')[1],data=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));if(data.role!=='anon')throw new Error()}catch(e){throw new CloudError('请填写 Publishable key 或 anon public key。','CONFIG')}
    }
    return {base,key};
  }
  class Client{
    constructor(config,options={}){
      const settings=validate(config);this.base=settings.base;this.key=settings.key;
      this.fetch=options.fetch||globalThis.fetch.bind(globalThis);this.storage=options.storage||globalThis.localStorage;
      this.uuid=options.uuid||secureId;this.now=options.now||(()=>Date.now());
      this.storageKey='couple-diary-cloud-session:'+new URL(this.base).hostname;this.session=null;this.refreshing=null;this.pending=null;
      this.photoCache=new Map();this.photoRequests=new Map();this.onAuthLost=()=>{};
      try{const s=JSON.parse(this.storage.getItem(this.storageKey)||'null');if(s&&s.access_token&&s.refresh_token)this.session=s}catch(e){}
    }
    remember(result){
      if(!result.access_token||!result.refresh_token||!result.user?.id)throw new CloudError('登录状态不完整，请重新登录。','AUTH');
      this.session={access_token:result.access_token,refresh_token:result.refresh_token,expires_at:result.expires_at||Math.floor(this.now()/1000)+(result.expires_in||3600),user:{id:result.user.id,email:result.user.email}};
      try{this.storage.setItem(this.storageKey,JSON.stringify(this.session))}catch(e){/* Private browsing: keep current session only. */}
      return this.session;
    }
    clear(){this.session=null;this.pending=null;this.photoCache.clear();try{this.storage.removeItem(this.storageKey)}catch(e){};this.onAuthLost()}
    async raw(path,options={},token=''){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
      const headers={apikey:this.key,...options.headers};if(token)headers.Authorization='Bearer '+token;
      let response;try{response=await this.fetch(this.base+path,{...options,headers,signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'})}catch(e){throw new CloudError('网络暂时没有连上，请检查连接后重试。','NETWORK')}finally{clearTimeout(timer)}
      let data;try{data=await response.json()}catch(e){data={}}
      if(!response.ok){
        const raw=String(data.message||data.msg||data.error_description||data.error||'');let message='这次没有保存成功，请稍后重试。',code=data.code||'REQUEST';
        if(/DIARY_FORBIDDEN/.test(raw)){message='这个账号还没有加入两人名单，请检查后台配置。';code='FORBIDDEN'}
        else if(/DIARY_(INVALID|LIMIT)/.test(raw))message=raw.replace(/^.*?DIARY_(INVALID|LIMIT):\s*/,'');
        else if(/Invalid login credentials/i.test(raw))message='邮箱或密码不正确。';
        else if(/Email not confirmed/i.test(raw))message='这个账号尚未确认，请在后台创建用户时勾选 Auto Confirm User。';
        else if(response.status===429)message='操作有点频繁，请稍等一分钟再试。';
        else if(response.status>=500)message='云端暂时不可用，请稍后重试，并检查项目是否暂停。';
        else if(response.status===401)message='登录已过期，请重新登录。';
        throw new CloudError(message,code,response.status);
      }
      return data;
    }
    async signIn(email,password){
      const result=await this.raw('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:email.trim(),password})});
      this.remember(result);
      try{return await this.read(-1)}catch(e){if(e.code==='FORBIDDEN')this.clear();throw e}
    }
    async refresh(){
      if(this.refreshing)return this.refreshing;
      if(!this.session)throw new CloudError('请先登录。','AUTH',401);
      const token=this.session.refresh_token;
      this.refreshing=this.raw('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:token})})
        .then(data=>this.remember(data)).catch(e=>{if(e.status===400||e.status===401)this.clear();throw e}).finally(()=>this.refreshing=null);
      return this.refreshing;
    }
    async request(path,options={}){
      if(!this.session)throw new CloudError('请先登录。','AUTH',401);
      if(this.session.expires_at*1000<this.now()+60000)await this.refresh();
      try{return await this.raw(path,options,this.session.access_token)}catch(e){if(e.status!==401)throw e;await this.refresh();return this.raw(path,options,this.session.access_token)}
    }
    rpc(name,args){return this.request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(args)})}
    read(revision=-1){return this.rpc('diary_read',{p_revision:revision})}
    async save(revision,state){
      // Keep the same id across an ambiguous network failure, including the next click.
      const payload=JSON.stringify(state);
      if(this.pending&&this.pending.payload!==payload)throw new CloudError('上一笔保存的结果还在确认中，请先点击重新同步。','PENDING');
      const pending=this.pending||{id:this.uuid(),revision,payload};this.pending=pending;
      const args={p_revision:pending.revision,p_commit_id:pending.id,p_state:JSON.parse(pending.payload)};
      let packet;
      for(let attempt=0;attempt<2;attempt++){
        try{packet=await this.rpc('diary_save',args);break}catch(e){if(e.code==='NETWORK'&&attempt===0)continue;if(e.code!=='NETWORK')this.pending=null;throw e}
      }
      this.pending=null;
      if(packet.conflict)throw new CloudError('另一半刚更新了内容。已同步最新记录，你填写的内容还在，请检查后再保存。','CONFLICT',409,packet);
      return packet;
    }
    async resolvePending(){if(!this.pending)return this.read(-1);const p=this.pending;return this.save(p.revision,JSON.parse(p.payload))}
    async signOut(){const token=this.session?.access_token;this.clear();if(token)try{await this.raw('/auth/v1/logout',{method:'POST'},token)}catch(e){/* Device session is already removed. */}}
    async upload(blob){
      if(!this.session)throw new CloudError('请先登录。','AUTH');
      if(blob.type!=='image/jpeg'||blob.size>2*1024*1024)throw new CloudError('压缩后照片需要小于 2 MB。','PHOTO');
      const path=this.session.user.id+'/'+this.uuid()+'.jpg';
      await this.request('/storage/v1/object/diary-photos/'+path,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'false'},body:blob});
      return 'storage:'+path;
    }
    photoUrl(ref){const value=this.photoCache.get(ref);return value&&value.until>this.now()?value.url:''}
    async signPhoto(ref){
      if(!/^storage:[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(ref))return '';
      if(this.photoUrl(ref))return this.photoUrl(ref);
      if(this.photoRequests.has(ref))return this.photoRequests.get(ref);
      const owner=this.session?.user.id;
      const promise=this.request('/storage/v1/object/sign/diary-photos/'+ref.slice(8),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:600})})
        .then(data=>{if(!data.signedURL||this.session?.user.id!==owner)throw new CloudError('照片暂时无法打开。','PHOTO');const url=new URL(this.base+'/storage/v1'+data.signedURL);if(url.origin!==this.base)throw new CloudError('照片地址不正确。','PHOTO');this.photoCache.set(ref,{url:url.href,until:this.now()+540000});return url.href})
        .finally(()=>this.photoRequests.delete(ref));
      this.photoRequests.set(ref,promise);return promise;
    }
    async uploadDocument(file){
      const ext=String(file.name||'').split('.').pop().toLowerCase(),types={pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
      if(!types[ext]||file.size<=0||file.size>20*1024*1024)throw new CloudError('请选择不超过20 MB的 Word 或 PDF 文件。','DOCUMENT');
      const name=String(file.name).replace(/[\\/\x00-\x1f]/g,'_').slice(0,160),path=this.session.user.id+'/'+this.uuid()+'.'+ext;
      await this.request('/storage/v1/object/diary-documents/'+path,{method:'POST',headers:{'Content-Type':types[ext],'x-upsert':'false'},body:file});
      return {ref:'document:'+path,name,size:file.size,type:types[ext]};
    }
    async documentBlob(ref){
      if(!/^document:[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|doc|docx)$/.test(ref))throw new CloudError('附件地址不正确。','DOCUMENT');
      const data=await this.request('/storage/v1/object/sign/diary-documents/'+ref.slice(9),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({expiresIn:120})});
      const url=new URL(this.base+'/storage/v1'+data.signedURL);if(!data.signedURL||url.origin!==this.base)throw new CloudError('无法读取附件。','DOCUMENT');
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
      try{const response=await this.fetch(url.href,{signal:controller.signal,referrerPolicy:'no-referrer',cache:'no-store'});if(!response.ok)throw new Error();return await response.blob()}catch(e){throw new CloudError('附件下载未完成，请检查网络后重试。','DOCUMENT')}finally{clearTimeout(timer)}
    }
    async removeDocuments(refs){
      const prefixes=refs.filter(ref=>ref.startsWith('document:'+this.session?.user.id+'/')).map(ref=>ref.slice(9));if(!prefixes.length)return;
      try{await this.request('/storage/v1/object/diary-documents',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes})})}catch(e){}
    }
    async removeUnused(refs){
      const prefixes=refs.filter(ref=>ref.startsWith('storage:'+this.session?.user.id+'/')).map(ref=>ref.slice(8));
      if(!prefixes.length)return;
      try{await this.request('/storage/v1/object/diary-photos',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefixes})})}catch(e){/* Removal can be retried from the account panel. */}
    }
  }
  return {Client,CloudError,validate};
});
