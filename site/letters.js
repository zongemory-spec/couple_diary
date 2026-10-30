/* On-site mailbox: no diary text is included in external notification emails. */
let letterDraftId='';
async function openLetters(){
 if(!authenticated)return;
 const epoch=authEpoch;openModal('给另一半的信','<p>正在打开信箱…</p>');
 try{
  const letters=await cloud.rpc('diary_letters_list',{});if(!authenticated||epoch!==authEpoch)return;
  $('modal-body').innerHTML=`<button id="compose-letter" class="primary wide">写一封信 ♡</button><p class="form-note">显示最近100封来信与寄信。正文仅在小屋内查看。</p><div id="letter-list"></div>`;
  for(const letter of letters){const item=document.createElement('details'),title=document.createElement('summary'),body=document.createElement('p');title.textContent=`${letter.sent?'寄出':'收到'} · ${letter.subject} · ${new Date(letter.created_at).toLocaleDateString()}${letter.sent?(letter.read_at?' · 对方已读':' · 对方未读'):!letter.read_at?' · 未读':''}`;body.className='letter-body';body.textContent=letter.body;item.append(title,body);item.ontoggle=()=>{if(item.open&&!letter.sent&&!letter.read_at)cloud.rpc('diary_letter_read',{p_id:letter.id}).then(()=>{letter.read_at=true;title.textContent=title.textContent.replace(' · 未读','')}).catch(()=>toast('已读状态暂未同步'))};$('letter-list').append(item)}
  if(!letters.length)$('letter-list').textContent='还没有信，从第一封开始吧。';
  $('compose-letter').onclick=()=>{letterDraftId=crypto.randomUUID();$('modal-body').innerHTML='<form id="letter-form"><label class="form-field"><span>标题</span><input name="subject" maxlength="80" required></label><label class="form-field"><span>想说的话</span><textarea name="body" maxlength="10000" rows="8" required></textarea></label><button class="primary wide">寄给另一半</button></form>';$('letter-form').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,button=form.querySelector('button');button.disabled=true;try{const d=new FormData(form);await cloud.rpc('diary_letter_send',{p_id:letterDraftId,p_subject:d.get('subject'),p_body:d.get('body')});toast('信已放进对方的信箱');await openLetters()}catch(e){toast(e.message)}finally{button.disabled=false}}};
 }catch(e){if(epoch===authEpoch)$('modal-body').textContent=e.message}
}
document.addEventListener('DOMContentLoaded',()=>{$('letters-open').onclick=openLetters});
