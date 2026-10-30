/* Authentication gate and foreground synchronization. Backgrounds never hold private data. */
let photoObserver=null
const photoPlaceholder='data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="300" height="240"%3E%3Crect width="100%25" height="100%25" fill="%23e8e0d8"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%23726562" font-size="18"%3E%E2%99%A1%3C/text%3E%3C/svg%3E'
function photoAttrs(ref){return `src="${esc(cloud?.photoUrl(ref)||photoPlaceholder)}" data-private-photo="${esc(ref)}" loading="lazy" referrerpolicy="no-referrer"`}
function hydratePhotos(){
  if(!authenticated||!cloud)return
  if(!photoObserver)photoObserver=new IntersectionObserver(entries=>entries.forEach(async entry=>{
    if(!entry.isIntersecting)return
    const img=entry.target,ref=img.dataset.privatePhoto,epoch=authEpoch;photoObserver.unobserve(img)
    try{const url=await cloud.signPhoto(ref);if(authenticated&&epoch===authEpoch&&img.isConnected&&img.dataset.privatePhoto===ref){img.src=url;img.classList.remove('photo-failed')}}catch(e){if(img.isConnected){img.classList.add('photo-failed');img.alt='照片暂时未加载，点击重试';img.dataset.photoRetry='true'}}
  }),{rootMargin:'160px'})
  document.querySelectorAll('img[data-private-photo]').forEach(img=>{const url=cloud.photoUrl(img.dataset.privatePhoto);if(url){img.src=url;img.classList.remove('photo-failed')}else photoObserver.observe(img)})
}
function connection(kind,message){const button=$('connection-status');button.dataset.state=kind;button.textContent=message;button.disabled=kind==='saving'}
function applyPacket(packet){
  if(!packet||packet.revision<revision)return
  viewer=packet.role;revision=packet.revision
  if(packet.state){state={...packet.state,current:viewer};rebuildProducts();render()}
}
function showAuth(message=''){
  stopLobby();$('lobby-view').hidden=true;
  selectAuthMode('login');
  $('login-password').value='';$('login-password').type='password';$('password-toggle').textContent='显示';$('password-toggle').setAttribute('aria-pressed','false');
  authenticated=false;authEpoch++;stopPolling();photoObserver?.disconnect()
  const dialog=$('modal');if(dialog.open)dialog.close();clearTimeout(modalCloseTimer)
  clearPhotoDraft();clearDocumentDraft();resetMeeting();draft=null;draftUploads=[];cart={};tab='home';revision=-1;ui.query='';ui.open={};$('record-search').value='';$('toast').textContent='';$('toast').classList.remove('visible')
  state=DiaryBrand.emptyState();DiaryBrand.render(state.users)
  for(const id of ['content','inbox','home-menu','cartbar','account-name','avatar-letter','greeting','modal-body','countdown','together-days','inbox-count','inbox-tools','context-tip'])$(id).replaceChildren()
  $('cartbar').classList.add('hidden');$('diary-main').inert=true;$('auth-view').hidden=false
  document.body.dataset.mode='auth';document.body.classList.add('auth-locked');document.body.classList.remove('immersive','chrome-hidden','feature-active')
  $('auth-message').textContent=message;connection('offline','等待登录')
}
function enterHouse(packet){
  $('login-password').value='';
  if(packet?.onboarding){showLobby(packet);return}
  stopLobby();$('lobby-view').hidden=true;
  authenticated=true;authEpoch++;$('auth-view').hidden=true;$('diary-main').inert=false;document.body.classList.remove('auth-locked')
  $('login-password').value='';applyPacket(packet);connection('online','已同步');startPolling()
}
async function loadMailPreference(){
  const button=$('mail-preference'),hint=$('mail-hint'),epoch=authEpoch;
  if(!button||!hint||!authenticated)return;
  const valid=()=>authenticated&&epoch===authEpoch&&button.isConnected;
  try{
    const pref=await cloud.rpc('diary_mail_preference',{p_enabled:null});if(!valid())return;
    button.disabled=false;button.setAttribute('aria-pressed',String(pref.enabled));button.textContent=pref.enabled?'已开启接收':'已关闭接收';
    hint.textContent='此处控制你是否接收提醒。后台发信服务正常时会发送到你的登录邮箱，失败原因可在后台邮件记录中查看。';
    button.onclick=async()=>{
      button.disabled=true;
      try{const next=await cloud.rpc('diary_mail_preference',{p_enabled:button.getAttribute('aria-pressed')!=='true'});if(!valid())return;button.setAttribute('aria-pressed',String(next.enabled));button.textContent=next.enabled?'已开启接收':'已关闭接收';toast(next.enabled?'已开启你的邮件提醒':'已关闭你的邮件提醒')}
      catch(e){if(valid())toast(e.message||'设置暂未保存，请重试')}
      finally{if(valid())button.disabled=false}
    };
  }catch(e){if(valid()){button.textContent='尚未启用';hint.textContent=e.status===404?'部署包已包含邮件模块，需按邮件提醒教程完成后台配置。':'暂时无法读取邮件设置，关闭后重试。'}}
}
function stopPolling(){clearInterval(pollTimer);pollTimer=0}
function startPolling(){stopPolling();if(authenticated&&!document.hidden)pollTimer=setInterval(()=>syncNow(),10000)}
async function syncNow(manual=false){
  if(!authenticated||cloudBusy||polling||document.hidden)return
  polling=true;const epoch=authEpoch
  try{
    const packet=manual&&cloud.pending?await cloud.resolvePending():await cloud.read(manual?-1:revision)
    if(!authenticated||epoch!==authEpoch)return;applyPacket(packet);connection('online','已同步');hydratePhotos();if(manual)toast('已经同步到最新内容')
  }catch(e){if(e.packet)applyPacket(e.packet);connection('error','未同步 · 点击重试');if(manual)toast(e.message);if(e.code==='FORBIDDEN'){cloud.clear();showAuth(e.message)}}
  finally{polling=false}
}
async function bootCloud(){
  try{cloud=new DiaryCloud.Client(window.DIARY_CONFIG||{});cloud.onAuthLost=()=>showAuth('登录已结束，请重新登录。')}
  catch(e){showAuth('小屋还在准备中：请先按仓库README完成配置，再重新部署。');$('login-submit').disabled=true;return}
  try{if(await restoreAuthLink())return}catch(e){showAuth(e.message);return}
  if(!cloud.session){showAuth(pendingInvite()?'请使用受邀邮箱登录；没有账号可以先注册并验证邮箱。':'');return}
  $('auth-message').textContent='正在打开我们的小屋…'
  try{enterHouse(await cloud.read(-1))}catch(e){showAuth(e.message)}
}
document.addEventListener('DOMContentLoaded',()=>{
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('login-submit');if(button.disabled||!cloud)return
    button.disabled=true;button.textContent='正在打开小屋…';$('auth-message').textContent=''
    try{
      if(authMode==='password'){await cloud.updatePassword($('login-password').value);selectAuthMode('login');enterHouse(await cloud.read(-1))}
      else if(authMode==='signup'){
        const packet=await cloud.signUp($('login-email').value,$('login-password').value);
        if(packet.confirmationRequired){$('login-password').value='';selectAuthMode('login');$('auth-message').textContent='请查收邮箱确认链接，验证后再登录；如果已注册可直接登录或重置密码。'}else enterHouse(packet);
      }else enterHouse(await cloud.signIn($('login-email').value,$('login-password').value));
    }
    catch(e){$('auth-message').textContent=e.message||'暂时无法登录，请稍后再试。'}
    finally{button.disabled=false;button.textContent=authMode==='signup'?'注册并验证邮箱':authMode==='password'?'保存新密码':'进入我们的小屋 ↗'}
  })
  $('password-toggle').onclick=()=>{const input=$('login-password'),show=input.type==='password';input.type=show?'text':'password';$('password-toggle').textContent=show?'隐藏':'显示';$('password-toggle').setAttribute('aria-pressed',String(show));$('password-toggle').setAttribute('aria-label',show?'隐藏密码':'显示密码')}
  $('connection-status').onclick=()=>syncNow(true)
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPolling()}else if(authenticated){startPolling();syncNow()}})
  window.addEventListener('online',()=>syncNow())
  window.addEventListener('offline',()=>{if(authenticated)connection('offline','网络已断开')})
  window.addEventListener('pagehide',()=>{stopPolling();photoObserver?.disconnect()})
  window.addEventListener('pageshow',event=>{if(event.persisted){themeController.start();if(authenticated){startPolling();syncNow()}}})
  window.addEventListener('storage',event=>{if(!cloud||event.key!==cloud.storageKey)return;if(!event.newValue)cloud.clear();else{try{const next=JSON.parse(event.newValue);if(cloud.session&&next.user.id===cloud.session.user.id)cloud.session=next;else location.reload()}catch(e){cloud.clear()}}})
  if(!window.DIARY_SINGLE_FILE&&'serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('sw.js').catch(()=>{})
})
