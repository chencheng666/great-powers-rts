const {root,taskSpaceId,pageLabel='p2',stage='before'}=globalThis.GAME_QA;
const fs=await import('node:fs/promises'),task=await taskSpace(taskSpaceId),page=task.page(pageLabel);
try {
const folder=`${root}/releases/challenge-review-20261020`;await fs.mkdir(folder,{recursive:true});
await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;});
await page.goto('http://127.0.0.1:4173/');
await page.cdp('Page.bringToFront',{});
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name;
  const {Renderer}=await import(url),original=Renderer.prototype.render;
  Renderer.prototype.render=function(...args){window.__qaRenderer=this;return original.apply(this,args);};
  window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));
  document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);
  const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(this===localStorage&&/^great-powers-save-(manual|auto)-v1$/.test(key))return;return set.call(this,key,value);};
  window.__restoreQASaves=()=>{Storage.prototype.setItem=set;};
});
await page.click('#start-btn');await page.waitForFunction(()=>window.__qaRenderer?.entities.size>0);
const results=[];
for(const count of [120,240]){
  await page.cdp('Page.bringToFront',{});
  await page.evaluate(count=>{
    window.__armyResult=null;window.__armyError=null;
    (async()=>{
      const r=__qaRenderer,g=r.game;g.events.end=()=>{};g.units=[];g.effects=[];g.checkVictory=()=>{};g.updateAI=()=>{};g.launchAIWave=()=>{};g.updateLogistics=()=>{};g.fogTimer=1e9;
      for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}
      const cx=1000,cy=720;
      for(let i=0;i<count;i++){
        const side=i%2,rank=Math.floor(i/2),x=cx+(side?1:-1)*(50+rank%8*40),y=cy-280+Math.floor(rank/8)*36;
        const u=g.addUnit(side,i%3?'rifle':'tank',x,y);u.hp=u.maxHp=10000;u.fireTimer=0;u.order={type:'attackMove',x:cx+(side?-100:100),y};
      }
      g.paused=false;r.setQuality('high');r.setViewMode('immersive');r.camera.zoom=1.8;r.centerOn(cx,cy);
      for(let i=0;i<6;i++)await new Promise(requestAnimationFrame);
      const frames=[],cpu=[],sim=[],render=r.render,update=g.update;
      r.render=function(...a){const t=performance.now();render.apply(this,a);cpu.push(performance.now()-t);};
      g.update=function(...a){const t=performance.now();update.apply(this,a);sim.push(performance.now()-t);};
      let previous=performance.now();
      try{for(let i=0;i<25;i++){await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;}}
      finally{r.render=render;g.update=update;g.paused=true;}
      const stats=v=>{const a=v.slice().sort((a,b)=>a-b);return{median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)]};};
      r.webgl.render(r.scene,r.viewCamera);const gl=r.webgl.getContext(),pixels=new Uint8Array(32*32*4);gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      return{count,zoom:r.camera.zoom,frame:stats(frames),renderCpu:stats(cpu),simulation:stats(sim),calls:r.webgl.info.render.calls,triangles:r.webgl.info.render.triangles,nonblank:pixels.some((v,i)=>i%4!==3&&v>0),glError:gl.getError(),damage:g.battleStats.sides.map(s=>s.damageDealt),errors:__qaErrors};
    })().then(v=>window.__armyResult=v,e=>window.__armyError=String(e));
  },count);
  await page.waitForFunction(()=>window.__armyResult||window.__armyError,undefined,{timeout:180000});
  const result=await page.evaluate(()=>{if(__armyError)throw Error(__armyError);return __armyResult;});
  if(!result.nonblank||result.glError||result.errors.length||!result.damage.some(v=>v>0))throw Error(JSON.stringify(result));
  results.push(result);console.log(result);
  await fs.writeFile(`${folder}/army-${stage}.json`,JSON.stringify(results,null,2));
  if(count===240)await page.screenshot({path:`${folder}/army-${stage}.png`});
}
await fs.writeFile(`${folder}/army-${stage}.json`,JSON.stringify(results,null,2));
} finally {
  await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;window.__restoreQASaves?.();});
}
