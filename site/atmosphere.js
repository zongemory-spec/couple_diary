/* Canvas 2D scene engine shared by WeChat and the browser. No emoji scenery. */
;(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DiaryAtmosphere=factory()})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const TAU=Math.PI*2
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v))
  class Scene {
    constructor(ctx,width,height,options={}) {
      this.ctx=ctx;this.w=width;this.h=height;this.random=options.random||Math.random
      this.leafImage=options.leafImage||null;this.current='spring';this.weights={spring:1,summer:0,autumn:0,winter:0}
      this.time=0;this.last=0;this.nextLaunch=.25;this.rockets=[];this.sparks=[];this.flashes=[];this.burstCount=0;this.lastLaunchX=-1;this.salvos=[];this.sequenceCount=0
      this.sparkLimit=width<600?460:820;this.groups=new Map()
      this.shapes=['chrysanthemum','peony','willow','brocade'];this.lastShape=-1
      this.foliage=Array.from({length:width<600?18:28},()=>this.makeLeaf(true))
      this.petals=Array.from({length:width<600?34:52},()=>this.makePetal())
      this.snow=Array.from({length:width<600?46:74},()=>({x:this.r(0,width),y:this.r(0,height),size:this.r(.6,2.6),speed:this.r(9,28),phase:this.r(0,TAU)}))
      this.stars=Array.from({length:width<600?27:55},()=>({x:this.r(0,width),y:this.r(0,height*.48),size:this.r(.3,1),phase:this.r(0,TAU)}))
    }
    r(a,b){return a+this.random()*(b-a)}
    makeLeaf(initial=false){const near=this.random()>.74;return {x:this.r(-30,this.w+30),y:initial?this.r(-this.h*.3,this.h):-this.r(45,150),size:near?this.r(43,65):this.r(19,37),speed:near?this.r(24,35):this.r(13,23),angle:this.r(-Math.PI,Math.PI),spin:this.r(-.34,.34),phase:this.r(0,TAU),sway:this.r(20,54),depth:near?1:this.r(.38,.72)}}
    makePetal(){return {x:this.r(-20,this.w+20),y:this.r(-this.h*.2,this.h),size:this.r(4,9),speed:this.r(12,28),phase:this.r(0,TAU),angle:this.r(0,TAU)}}
    resize(width,height){const sx=width/this.w,sy=height/this.h;this.foliage.forEach(p=>{p.x*=sx;p.y*=sy});this.petals.forEach(p=>{p.x*=sx;p.y*=sy});this.snow.forEach(p=>{p.x*=sx;p.y*=sy});this.stars.forEach(p=>{p.x*=sx;p.y*=sy});this.w=width;this.h=height}
    setSeason(season,immediate=false){if(!Object.hasOwnProperty.call(this.weights,season))return;this.current=season;if(immediate)for(const name in this.weights)this.weights[name]=name===season?1:0;if(season==='summer'&&!this.rockets.length&&!this.sparks.length)this.nextLaunch=this.time+.15}
    scheduleSalvo(){
      const mode=Math.floor(this.r(0,4));this.sequenceCount++;const base=this.w<600?this.w*.23:Math.min(this.w*.17,220)
      const gold=this.r(33,47),accent=[330,270,195,37][Math.floor(this.r(0,4))]
      const add=(delay,x,y,scale,hue)=>this.salvos.push({at:this.time+delay,x:x*this.w,y:y*this.h,size:base*scale,hue})
      if(mode===0){add(0,.24,.22,1.12,gold);add(.3,.73,.28,.9,accent);add(.72,.48,.13,1.45,gold)}
      else if(mode===1){const reverse=this.random()>.5;for(let i=0;i<5;i++)add(i*this.r(.2,.37),reverse?.87-i*.18:.13+i*.18,this.r(.17,.31),this.r(.75,1.1),i%2?accent:gold)}
      else if(mode===2){add(0,.36,.18,1.5,accent);add(.16,.72,.33,.83,gold);add(.94,.16,.34,.72,gold);add(1.38,.62,.12,1.3,gold)}
      else{for(let i=0;i<6;i++)add(this.r(0,1.25),.1+i*.16,this.r(.16,.32),this.r(.95,1.25),gold+this.r(-5,5));add(1.75,.5,.1,1.75,gold)}
      this.nextLaunch=this.time+this.r(mode===3?7:4.6,mode===3?9:6.8)
    }
    launch(spec){
      let x=spec?spec.x:this.r(this.w*.13,this.w*.9)
      if(!spec&&this.lastLaunchX>=0&&Math.abs(x-this.lastLaunchX)<this.w*.22)x=(x+this.w*.43)%(this.w*.8)+this.w*.1
      this.lastLaunchX=x
      const y=spec?spec.y:this.r(this.h*.10,this.h*.37),size=spec?spec.size:this.r(this.w<600?70:120,this.w<600?115:220)
      this.rockets.push({x0:x+this.r(-this.w*.07,this.w*.07),y0:this.h*.63,x:x+this.r(-6,6),y:y+this.r(-9,9),size,age:0,life:this.r(.88,1.48),hue:spec?spec.hue:[36,42,332,267,193][Math.floor(this.r(0,5))]})
    }
    burst(rocket){
      const shapeIndex=(this.lastShape+1+Math.floor(this.r(0,3)))%4;this.lastShape=shapeIndex
      const shape=this.shapes[shapeIndex],count=this.w<600?76:112
      const speed=rocket.size*(shape==='willow'?.82:1.14),hue=shape==='brocade'?this.r(35,46):rocket.hue
      this.flashes.push({x:rocket.x,y:rocket.y,age:0,life:1.5,hue,size:rocket.size,water:this.r(.8,1.2)})
      const rotation=this.r(0,TAU),tilt=this.r(.78,1.05)
      for(let i=0;i<count;i++){
        const a=i*2.399963229728653+rotation,z=1-2*(i+.5)/count,radius=Math.sqrt(1-z*z),variation=this.r(.86,1.12)
        let vx=Math.cos(a)*radius,vy=z*tilt
        if(shape==='peony'){const theta=this.r(0,TAU),shell=i%3===0?.55:1;vx=Math.cos(theta)*shell;vy=Math.sin(theta)*shell*tilt}
        const life=shape==='willow'||shape==='brocade'?this.r(3.1,4.8):this.r(1.9,3.2)
        const color=`hsl(${Math.round((hue+this.r(-6,6))/8)*8},88%,${shape==='willow'?76:79}%)`
        this.sparks.push({x:rocket.x,y:rocket.y,px:rocket.x,py:rocket.y,vx:vx*speed*variation,vy:vy*speed*variation,age:-this.r(0,.07),life,gravity:shape==='willow'?21:17,drag:shape==='willow'?.47:.8,hue,color,size:this.r(.65,1.45),shape,twinkle:this.r(0,TAU),glitter:shape==='brocade'||this.random()>.73})
      }
      this.burstCount++
    }
    update(dt){
      dt=clamp(dt,0,.08);this.time+=dt
      for(const name in this.weights){const target=name===this.current?1:0;this.weights[name]+=(target-this.weights[name])*Math.min(1,dt*1.45);if(Math.abs(target-this.weights[name])<.001)this.weights[name]=target}
      this.foliage.forEach(p=>{p.y+=p.speed*dt;p.angle+=p.spin*dt;if(p.y>this.h+p.size)Object.assign(p,this.makeLeaf())})
      this.petals.forEach(p=>{p.y+=p.speed*dt;p.angle+=dt*.34;if(p.y>this.h+15){p.y=-20;p.x=this.r(-20,this.w+20)}})
      this.snow.forEach(p=>{p.y+=p.speed*dt;p.x+=Math.sin(this.time*.35+p.phase)*dt*3;if(p.y>this.h+5){p.y=-5;p.x=this.r(0,this.w)}})
      if(this.weights.summer>.035){if(this.time>=this.nextLaunch)this.scheduleSalvo();this.salvos=this.salvos.filter(spec=>{if(spec.at<=this.time){this.launch(spec);return false}return true})}else this.salvos=[]
      this.rockets=this.rockets.filter(r=>{r.age+=dt;if(r.age>=r.life){this.burst(r);return false}return true})
      this.sparks=this.sparks.filter(p=>{p.age+=dt;if(p.age<0)return true;if(p.age>=p.life)return false;p.px=p.x;p.py=p.y;const drag=Math.exp(-p.drag*dt);p.vx*=drag;p.vy=p.vy*drag+p.gravity*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;return true})
      this.flashes=this.flashes.filter(f=>{f.age+=dt;return f.age<f.life})
      // Bound work even on older phones, without accumulating stale particles.
      if(this.sparks.length>this.sparkLimit)this.sparks.splice(0,this.sparks.length-this.sparkLimit)
    }
    draw(){
      const c=this.ctx;c.clearRect(0,0,this.w,this.h)
      const night=this.weights.summer+this.weights.winter
      if(night>.01){c.save();this.stars.forEach(s=>{c.globalAlpha=night*(.18+.19*Math.sin(this.time*.5+s.phase));c.fillStyle='#e5edff';c.beginPath();c.arc(s.x,s.y,s.size,0,TAU);c.fill()});c.restore()}
      if(this.weights.summer>.01)this.drawFireworks(this.weights.summer)
      if(this.weights.spring>.01)this.drawPetals(this.weights.spring)
      if(this.weights.autumn>.01)this.drawLeaves(this.weights.autumn)
      if(this.weights.winter>.01)this.drawSnow(this.weights.winter)
      c.globalAlpha=1
    }
    drawFireworks(weight){
      const c=this.ctx;c.save();c.globalCompositeOperation='lighter';c.lineCap='round'
      for(const r of this.rockets){const t=r.age/r.life,e=1-Math.pow(1-t,1.7),x=r.x0+(r.x-r.x0)*e,y=r.y0+(r.y-r.y0)*e;c.globalAlpha=weight*.7;c.strokeStyle='#f8ce8e';c.lineWidth=1;c.beginPath();c.moveTo(x,y);c.lineTo(x-(r.x-r.x0)*.02,y+12*(1-t)+3);c.stroke();c.fillStyle='#fff2d6';c.fillRect(x-.7,y-.7,1.4,1.4)}
      for(const f of this.flashes){const a=Math.pow(1-f.age/f.life,2);if(f.age<.24){const radius=f.size*(.18+f.age*.5),g=c.createRadialGradient(f.x,f.y,0,f.x,f.y,radius);g.addColorStop(0,`hsla(${f.hue},100%,88%,${a*.42})`);g.addColorStop(1,`hsla(${f.hue},100%,70%,0)`);c.globalAlpha=weight;c.fillStyle=g;c.fillRect(f.x-radius,f.y-radius,radius*2,radius*2)}
        c.globalAlpha=weight*a*.18;c.strokeStyle=`hsl(${f.hue},75%,75%)`;c.lineWidth=1;const water=this.h*.66;for(let i=0;i<9;i++){const y=water+i*i*2.2,w=f.size*(.1+i*.045)*f.water;c.beginPath();c.moveTo(f.x-w+Math.sin(this.time*1.3+i)*7,y);c.lineTo(f.x+w+Math.cos(this.time+i)*7,y);c.stroke()}}
      // Batch firework tails by colour and age; no per-spark shadows or trail arrays.
      const groups=this.groups;groups.clear()
      for(const p of this.sparks){if(p.age<=0)continue;const t=p.age/p.life,alpha=Math.pow(1-t,1.25)*Math.min(1,p.age*17);if(p.glitter&&t>.55&&Math.sin(this.time*24+p.twinkle)<-.25)continue;const bucket=Math.min(4,Math.floor(alpha*5)),key=p.color+bucket;let group=groups.get(key);if(!group){group={color:p.color,alpha:(bucket+.5)/5,particles:[]};groups.set(key,group)}group.particles.push(p)}
      for(const group of groups.values()){c.globalAlpha=weight*group.alpha;c.strokeStyle=group.color;c.lineWidth=1.05;c.beginPath();for(const p of group.particles){const tail=p.shape==='willow'?5.5:3.2;c.moveTo(p.x-(p.x-p.px)*tail,p.y-(p.y-p.py)*tail);c.lineTo(p.x,p.y)}c.stroke();c.fillStyle=group.color;for(const p of group.particles){const size=p.size*(1-p.age/p.life*.3);c.fillRect(p.x-size/2,p.y-size/2,size,size)}}
      c.restore()
    }
    drawLeaves(weight){
      if(!this.leafImage)return
      const c=this.ctx
      for(const p of this.foliage){const phase=this.time*.55+p.phase,x=p.x+Math.sin(phase)*p.sway,tilt=Math.cos(phase*.72);c.save();c.globalAlpha=weight*p.depth*.85;c.translate(x,p.y);c.rotate(p.angle+Math.sin(phase)*.25);c.scale((tilt<0?-1:1)*(.45+.55*Math.abs(tilt)),1);c.drawImage(this.leafImage,-p.size/2,-p.size/2,p.size,p.size*1.03);c.restore()}
    }
    drawPetals(weight){
      const c=this.ctx
      for(const p of this.petals){const phase=this.time*.55+p.phase;c.save();c.globalAlpha=weight*.48;c.translate(p.x+Math.sin(phase)*27,p.y);c.rotate(p.angle+Math.sin(phase)*.4);c.scale(.5+Math.abs(Math.sin(phase))*.5,1);c.fillStyle=p.size>7?'#dc9aad':'#e8b7c4';c.beginPath();c.moveTo(0,p.size);c.bezierCurveTo(-p.size*1.2,0,-p.size*.6,-p.size,0,-p.size*.55);c.bezierCurveTo(p.size*.6,-p.size,p.size*1.2,0,0,p.size);c.fill();c.restore()}
    }
    drawSnow(weight){const c=this.ctx;for(const p of this.snow){c.globalAlpha=weight*(.18+p.size*.15);c.fillStyle='#f0f7ff';c.beginPath();c.arc(p.x+Math.sin(this.time*.3+p.phase)*7,p.y,p.size,0,TAU);c.fill()}}
    frame(time){if(!this.last){this.last=time;this.draw();return}const dt=(time-this.last)/1000;if(dt<1/75)return;this.last=time;this.update(dt);this.draw()}
  }
  return {Scene}
})
