/* 四季轮换逻辑在浏览器演示和微信端共用；不读取月份。 */
;(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DiarySeasons=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const names=['spring','summer','autumn','winter']
  const intervalMs=120000
  function choose(previous,random=Math.random){const pool=names.filter(x=>x!==previous);return pool[Math.min(pool.length-1,Math.max(0,Math.floor(random()*pool.length)))]}
  function controller(options){
    let current='',timer=null
    const clear=()=>{if(timer!==null){options.clearInterval(timer);timer=null}}
    function publish(value){current=value;try{options.writeLast(value)}catch(e){}options.onChange(value)}
    function next(){let previous=current;try{previous=previous||options.readLast()}catch(e){}publish(choose(previous,options.random||Math.random))}
    function start(fresh=false){clear();if(fresh||!current)next();timer=options.setInterval(next,intervalMs)}
    function select(value){if(!names.includes(value))return;publish(value);start()}
    return {start,stop:clear,next,select,get current(){return current}}
  }
  return {names,intervalMs,choose,controller}
})
