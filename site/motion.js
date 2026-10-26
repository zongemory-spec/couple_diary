/* Small, bounded UI effects. Business data never lives in animation state. */
;(function(){
  const reducedMedia=window.matchMedia('(prefers-reduced-motion: reduce)')
  let reduced=false,lastView='',scrollState={anchor:0,hidden:false},tipTimer=0
  try{reduced=localStorage.getItem('diary-reduced-motion')==='true'||reducedMedia.matches}catch(e){reduced=reducedMedia.matches}
  const reducedNow=()=>reduced
  const applyReduced=()=>{document.body.classList.toggle('reduce-motion',reduced);window.dispatchEvent(new Event('diary-motion-change'))}
  function setReduced(value){reduced=!!value;try{localStorage.setItem('diary-reduced-motion',String(reduced))}catch(e){}applyReduced()}
  reducedMedia.addEventListener('change',e=>setReduced(e.matches))
  function enter(node){if(!node||reduced)return;node.classList.remove('view-enter');void node.offsetWidth;node.classList.add('view-enter')}
  function afterRender(view){if(lastView!==view){lastView=view;scrollState={anchor:0,hidden:false};document.body.classList.remove('chrome-hidden');const scroller=document.getElementById('content');if(scroller)scroller.scrollTop=0;enter(document.getElementById(view==='home'?'home-view':'feature-view'))}}
  function reflow(node,change){const before=new Map();if(node&&!reduced)node.querySelectorAll('[data-key]').forEach(el=>before.set(el.dataset.key,el.getBoundingClientRect()));change();if(!node||reduced)return;node.querySelectorAll('[data-key]').forEach(el=>{const old=before.get(el.dataset.key),now=el.getBoundingClientRect();if(now.bottom<0||now.top>window.innerHeight)return;if(old){const dx=old.left-now.left,dy=old.top-now.top;if(old.bottom<0||old.top>window.innerHeight||Math.abs(dx)+Math.abs(dy)>120){enter(el);return}if(Math.abs(dx)+Math.abs(dy)>1)el.animate([{transform:`translate(${dx}px,${dy}px)`,opacity:.75},{transform:'translate(0,0)',opacity:1}],{duration:260,easing:'cubic-bezier(.2,.8,.2,1)'})}else enter(el)})}
  function hint(text,anchor){const tip=document.getElementById('ui-tooltip');if(!text||!tip)return;tip.textContent=text;const r=anchor.getBoundingClientRect();tip.style.left=Math.max(12,Math.min(window.innerWidth-230,r.left))+'px';tip.style.top=Math.min(window.innerHeight-65,r.bottom+8)+'px';tip.classList.add('visible');clearTimeout(tipTimer);tipTimer=setTimeout(()=>tip.classList.remove('visible'),2300)}
  let tapStart=null;
  document.addEventListener('pointerdown',event=>{tapStart=event.button>0?null:{id:event.pointerId,x:event.clientX,y:event.clientY}},{passive:true});
  document.addEventListener('pointercancel',()=>tapStart=null,{passive:true});
  document.addEventListener('pointerup',event=>{const start=tapStart;tapStart=null;if(reduced||!start||start.id!==event.pointerId||Math.hypot(event.clientX-start.x,event.clientY-start.y)>12||event.target.closest('[disabled],[inert]'))return;const dialog=document.getElementById('modal'),host=document.getElementById(dialog?.open?'dialog-tap-effects':'tap-effects');if(!host)return;const r=host.getBoundingClientRect(),wave=document.createElement('span');wave.className='tap-wave';wave.style.left=(event.clientX-r.left)+'px';wave.style.top=(event.clientY-r.top)+'px';host.append(wave);while(host.childElementCount>4)host.firstElementChild.remove();wave.addEventListener('animationend',()=>wave.remove(),{once:true});setTimeout(()=>wave.remove(),650)},{passive:true});
  document.addEventListener('pointerover',event=>{const target=event.target.closest('[data-tip]');if(target&&event.pointerType==='mouse')hint(target.dataset.tip,target)})
  document.addEventListener('focusin',event=>{if(event.target.matches('textarea'))event.target.classList.add('field-expanded');const target=event.target.closest('[data-tip]');if(target)hint(target.dataset.tip,target)})
  let chromeUntil=0;
  document.addEventListener('scroll',event=>{const shop=document.body.dataset.mode==='shop',feature=document.body.classList.contains('feature-active');const target=event.target;if(shop&&!target.matches?.('.product-grid'))return;if(!shop&&feature&&target!==document.getElementById('content'))return;if(!shop&&!feature&&target!==document)return;const y=shop||feature?target.scrollTop:window.scrollY,blocked=document.getElementById('modal').open||document.activeElement.matches('input,textarea');if(Date.now()<chromeUntil&&!blocked)return;const next=DiaryUIModel.scroll(scrollState,y,blocked);if(next.hidden!==scrollState.hidden)chromeUntil=Date.now()+260;scrollState=next;document.body.classList.toggle('chrome-hidden',scrollState.hidden)},{passive:true,capture:true})
  function resetScroll(){scrollState={anchor:0,hidden:false};chromeUntil=0;document.body.classList.remove('chrome-hidden')}
  window.DiaryMotion={reduced:reducedNow,setReduced,enter,afterRender,reflow,hint,resetScroll}
  applyReduced()
})()
