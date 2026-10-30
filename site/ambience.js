/* A separate drawing loop: theme changes never touch diary forms or their values. */
;(function(){
  const canvas=document.getElementById('atmosphere')
  const ctx=canvas.getContext('2d',{alpha:true})
  const leaf=new Image();leaf.src=document.getElementById('maple-sprite').src
  let scene,frameId=0,paused=false
  function resize(){const w=document.documentElement.clientWidth,h=window.innerHeight,dpr=Math.min(window.devicePixelRatio||1,1.35);canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);if(scene)scene.resize(w,h);else{scene=new DiaryAtmosphere.Scene(ctx,w,h);scene.setSeason(document.body.dataset.season||'spring',true)}if(leaf.complete&&leaf.naturalWidth)scene.leafImage=leaf}
  leaf.onload=()=>{if(scene)scene.leafImage=leaf}
  const observer=new MutationObserver(()=>{if(!scene)return;const reduced=DiaryMotion.reduced();if(scene.current!==document.body.dataset.season||reduced)scene.setSeason(document.body.dataset.season,reduced);if(reduced){cancelAnimationFrame(frameId);frameId=0;scene.draw()}else if(!paused&&!frameId){scene.last=0;frameId=requestAnimationFrame(loop)}})
  observer.observe(document.body,{attributes:true,attributeFilter:['data-season','class']})
  function loop(t){if(paused)return;if(DiaryMotion.reduced()){scene.setSeason(document.body.dataset.season,true);scene.draw();frameId=0;return}scene.frame(t);frameId=requestAnimationFrame(loop)}
  resize();frameId=requestAnimationFrame(loop)
  window.addEventListener('resize',resize,{passive:true})
  document.addEventListener('visibilitychange',()=>{paused=document.hidden;cancelAnimationFrame(frameId);if(!paused){scene.last=0;frameId=requestAnimationFrame(loop)}})
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(frameId);observer.disconnect()})
})()
