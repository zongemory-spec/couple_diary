/* Public signup and targeted invitations. No diary content is stored in the lobby. */
let authMode='login',lobbyTimer=0,lobbyEpoch=0;
const inviteKey='diary-pending-invite';
function pendingInvite(){try{return sessionStorage.getItem(inviteKey)||''}catch{return ''}}
function rememberInvite(token){try{if(token)sessionStorage.setItem(inviteKey,token);else sessionStorage.removeItem(inviteKey)}catch{}}
function selectAuthMode(mode){
  authMode=mode;$('auth-title').textContent=mode==='signup'?'从这里，拥有两个人的小屋。':mode==='password'?'设置新的登录密码':'おかえり，回家啦。';
  $('login-submit').textContent=mode==='signup'?'注册并验证邮箱':mode==='password'?'保存新密码':'进入我们的小屋 ↗';
  $('login-email').closest('label').hidden=mode==='password';$('login-email').required=mode!=='password';
  $('login-password').minLength=mode==='login'?1:10;$('login-password').autocomplete=mode==='login'?'current-password':'new-password';
  $('auth-mode').textContent=mode==='login'?'还没有账号？邮箱注册':'已有账号？返回登录';$('auth-message').textContent='';
}
async function restoreAuthLink(){
  const hash=new URLSearchParams(location.hash.slice(1)),token=hash.get('invite');
  if(token&&/^[0-9a-f]{64}$/.test(token))rememberInvite(token);
  if(hash.has('access_token')||hash.has('invite')||hash.has('error_description'))history.replaceState(null,'',location.pathname+location.search);
  if(hash.has('error_description'))throw Error('邮箱链接已失效，请重新申请验证或重置邮件。');
  if(hash.has('access_token')){
    const session=await cloud.raw('/auth/v1/user',{},hash.get('access_token'));
    cloud.remember({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_in:Number(hash.get('expires_in'))||3600,user:session});
    if(hash.get('type')==='recovery'){showAuth();selectAuthMode('password');return true}
  }
  return false;
}
function stopLobby(){clearInterval(lobbyTimer);lobbyTimer=0;lobbyEpoch++}
function lobbyMessage(text){$('lobby-message').textContent=text}
function profileFields(a='我',b='你',since=''){
 return `<label class="form-field"><span>我的称呼</span><input name="name" required maxlength="20" value="${esc(a)}"></label><label class="form-field"><span>另一半的称呼（也可以帮对方填写）</span><input name="partner" required maxlength="20" value="${esc(b)}"></label><label class="form-field"><span>我们的相恋日</span><input name="since" type="date" required min="1900-01-01" value="${esc(since)}"></label>`;
}
async function showLobby(packet){
  if(packet.invitation&&!pendingInvite())rememberInvite(packet.invitation);
  stopLobby();authenticated=false;$('auth-view').hidden=true;$('lobby-view').hidden=false;$('diary-main').inert=true;document.body.classList.add('auth-locked');
  $('lobby-email').textContent=cloud.session?.user.email||'';lobbyMessage('');
  const epoch=lobbyEpoch,token=pendingInvite(),box=$('lobby-content');
  if(token){
    box.textContent='正在核对邀请…';
    try{
      const preview=await cloud.rpc('diary_invite_preview',{p_token:token});if(epoch!==lobbyEpoch)return;
      box.innerHTML=`<h2>一起确认我们的小屋</h2><p>请核对两人称呼和相恋日。点击下方按钮后，两人的账号正式绑定。</p><form id="pair-form">${profileFields(preview.users[1].name,preview.users[0].name,preview.since)}<button class="primary wide">确认资料并接受邀请 ♡</button></form><button id="discard-invite" class="text-button">放弃本次邀请</button>`;
      $('pair-form').onsubmit=e=>lobbyAction(e,async data=>{const next=await cloud.rpc('diary_invite_accept',{p_token:token,p_name:data.get('name'),p_partner_name:data.get('partner'),p_since:data.get('since')});rememberInvite('');enterHouse(next)});
      $('discard-invite').onclick=()=>{rememberInvite('');showLobby({...packet,invitation:null})};
    }catch(e){if(epoch!==lobbyEpoch)return;box.innerHTML='<h2>暂时无法接受邀请</h2><p>请用受邀邮箱注册并验证，或让对方重新创建邀请。一个账号只能加入一个小屋。</p><button id="discard-invite" class="outline wide">取消邀请，返回</button>';$('discard-invite').onclick=()=>{rememberInvite('');showLobby({...packet,invitation:null})};lobbyMessage(e.message)}
    return;
  }
  if(packet.stage==='create'){
    box.innerHTML=`<h2>创建两个人的小屋</h2><p>收到邀请的用户请直接打开邀请链接，无需另建小屋。</p><form id="pair-form">${profileFields()}<button class="primary wide">保存资料，邀请另一半 ↗</button></form><form id="paste-invite"><label class="form-field"><span>已有邀请链接？粘贴到这里</span><input name="link" type="url" required placeholder="https://…/#invite=…"></label><button class="outline wide">打开邀请</button></form>`;
    $('pair-form').onsubmit=e=>lobbyAction(e,async d=>showLobby(await cloud.rpc('diary_create_house',{p_name:d.get('name'),p_partner_name:d.get('partner'),p_since:d.get('since')})));
    $('paste-invite').onsubmit=e=>lobbyAction(e,async d=>{const url=new URL(d.get('link'));if(url.origin!==location.origin||url.pathname!==location.pathname)throw Error('请使用本站的邀请链接');const t=new URLSearchParams(url.hash.slice(1)).get('invite');if(!/^[0-9a-f]{64}$/.test(t||''))throw Error('邀请链接格式不正确');rememberInvite(t);await showLobby(packet)});
  }else{
    box.innerHTML=`<h2>等另一半来敲门</h2><p>${esc(packet.profile[0].name)} × ${esc(packet.profile[1].name)} · ${esc(packet.since)}</p><p>邀请 ${esc(packet.inviteEmail||'另一半')} 注册并验证邮箱。对方接受后即可一起使用。</p><form id="invite-form"><label class="form-field"><span>另一半的邮箱</span><input name="email" type="email" required maxlength="254" value="${esc(packet.inviteEmail||'')}" placeholder="对方用于注册的邮箱"></label><button class="primary wide">${packet.inviteEmail?'重新生成邀请（旧链接失效）':'生成邀请与邮件提醒'}</button></form><div id="share-invite" hidden><label class="form-field"><span>把链接发给另一半（7天内有效）</span><input id="invite-link" readonly></label><button id="copy-invite" class="outline wide">复制邀请链接</button></div><button id="refresh-lobby" class="outline wide">对方已接受，刷新进入</button>${packet.inviteEmail?'<button id="revoke-invite" class="text-button wide">撤销当前邀请</button>':''}<p class="form-note">邀请邮件取决于站点发信配置，复制链接也能完成邀请。刷新后如需链接，可重新生成。不要公开分享邀请。</p>`;
    $('invite-form').onsubmit=e=>lobbyAction(e,async d=>{const inv=await cloud.rpc('diary_invite_create',{p_email:d.get('email')});await showLobby({...packet,inviteEmail:inv.email});$('share-invite').hidden=false;$('invite-link').value=location.origin+location.pathname+'#invite='+inv.token;lobbyMessage('邀请已生成，邮件已排队；你也可以复制链接发给对方。')});
    $('copy-invite').onclick=async()=>{try{await navigator.clipboard.writeText($('invite-link').value);lobbyMessage('已复制')}catch{$('invite-link').select();lobbyMessage('请手动复制上方链接')}};
    const refresh=async()=>{try{const next=await cloud.read(-1);if(epoch!==lobbyEpoch)return;if(!next.onboarding)enterHouse(next);else lobbyMessage('还在等待对方接受邀请。')}catch(e){if(epoch===lobbyEpoch)lobbyMessage(e.message)}};
    $('refresh-lobby').onclick=refresh;if($('revoke-invite'))$('revoke-invite').onclick=async()=>{try{await cloud.rpc('diary_invite_revoke',{});showLobby(await cloud.read(-1))}catch(e){lobbyMessage(e.message)}};
    lobbyTimer=setInterval(()=>{if(!document.hidden)refresh()},10000);
  }
}
async function lobbyAction(event,action){event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');if(button.disabled)return;button.disabled=true;lobbyMessage('');try{await action(new FormData(form))}catch(e){lobbyMessage(e.message||'操作未完成，请重试')}finally{button.disabled=false}}
document.addEventListener('DOMContentLoaded',()=>{
 $('auth-mode').onclick=()=>selectAuthMode(authMode==='login'?'signup':'login');
 $('auth-reset').onclick=async()=>{if(!cloud)return;const email=$('login-email').value.trim();if(!email)return $('auth-message').textContent='请先填写你的注册邮箱。';try{await cloud.recover(email);$('auth-message').textContent='如果该邮箱已注册，将收到重置链接，请检查收件箱和垃圾箱。'}catch(e){$('auth-message').textContent=e.message}};
 $('auth-resend').onclick=async()=>{if(!cloud)return;try{await cloud.resend($('login-email').value.trim());$('auth-message').textContent='如果账号待验证，将发送确认邮件，请检查邮箱。'}catch(e){$('auth-message').textContent=e.message}};
 $('lobby-logout').onclick=()=>cloud.signOut();
 window.addEventListener('pagehide',stopLobby);
});
