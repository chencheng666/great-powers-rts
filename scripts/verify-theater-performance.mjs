const {root,taskSpaceId,count=240,quality='standard',scenario='land',batching=true}=globalThis.GAME_QA;
const fs=await import('node:fs/promises'),page=(await taskSpace(taskSpaceId)).page('p1');
const folder=`${root}/releases/theaters-20261022`;
await page.reload();await page.waitForSelector('#start-btn');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:720,deviceScaleFactor:1,mobile:false});
await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name;
  const {Renderer}=await import(url),render=Renderer.prototype.render;
  Renderer.prototype.render=function(...a){window.__qaRenderer=this;return render.apply(this,a);};
});
if(scenario==='mixed'){await page.click('#challenge-btn');await page.click('[data-modal=challenge-seabreach]');}
else{await page.click('[data-faction=china]');await page.selectOption('#map-select','valley');await page.click('#start-btn');}
await page.waitForFunction(()=>!!window.__qaRenderer,undefined,{timeout:30000});
await page.evaluate(({count,quality,scenario,batching})=>{
  window.__performanceResult=null;window.__performanceError=null;
  (async()=>{
    const r=__qaRenderer,g=r.game;
    g.paused=true;g.units=[];g.effects=[];g.selected=[];g.challenge=null;g.multiplayer=true;
    g.updateAI=()=>{};g.updateLogistics=()=>{};g.updateFreight=()=>{};g.checkVictory=()=>{};g.fogTimer=1e9;
    for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}
    for(const p of g.players)p.faction='china';
    const cx=scenario==='mixed'?2600:g.world.width/2,cy=scenario==='mixed'?1850:g.homeY;
    let sea=0,land=0;
    for(let i=0;i<count;i++){
      const owner=i%2,naval=scenario==='mixed'&&i%4===0,rank=naval?sea++:land++;
      const type=naval?['destroyer','frigate','landing','containerShip'][Math.floor(i/4)%4]:i%13===0?'fighter':i%3===0?'rifle':'tank';
      const x=naval?1510+(rank%6)*153:scenario==='mixed'?2900+(rank%12)*48:cx+(owner?1:-1)*(80+Math.floor(rank/2)%8*48);
      const y=naval?1180+Math.floor(rank/6)*150:cy-300+Math.floor(rank/(scenario==='mixed'?12:16))*44;
      const u=g.addUnit(owner,type,x,y);u.hp=u.maxHp=100000;
      if(type==='containerShip')u.freight={phase:'outbound',entry:{x:x+120,y},value:0};
      else if(type!=='landing')u.order={type:'attackMove',x:x+(owner?-150:150),y};
    }
    r.setQuality(quality);r.setViewMode('immersive');r.camera.zoom=scenario==='mixed'?.6:1.15;r.centerOn(cx,cy);r.updateFog();
    if(!batching){r.armyBatches.dispose();r.armyBatches.update=()=>{};}
    g.paused=false;
    const warmup=performance.now();while(performance.now()-warmup<3000)await new Promise(requestAnimationFrame);
    const frames=[],renders=[],simulations=[];
    const oldRender=r.render,oldUpdate=g.update;
    r.render=function(...a){const t=performance.now();oldRender.apply(this,a);renders.push(performance.now()-t);};
    g.update=function(...a){const t=performance.now();oldUpdate.apply(this,a);simulations.push(performance.now()-t);};
    let previous=performance.now(),start=previous;
    try{while(performance.now()-start<12000){await new Promise(requestAnimationFrame);const now=performance.now();frames.push(now-previous);previous=now;}}
    finally{r.render=oldRender;g.update=oldUpdate;g.paused=true;}
    const stats=a=>{const sorted=a.slice().sort((a,b)=>a-b);return {p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)]};};
    r.webgl.render(r.scene,r.viewCamera);
    const gl=r.webgl.getContext(),pixels=new Uint8Array(32*32*4),ext=gl.getExtension('WEBGL_debug_renderer_info');
    gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return {scenario,count,actual:g.units.length,quality,batching,warmupMs:3000,sampleMs:performance.now()-start,samples:frames.length,frameMs:stats(frames),renderCpuMs:stats(renders),simulationMs:stats(simulations),visibleUnits:r.framedUnits.size,calls:r.webgl.info.render.calls,triangles:r.webgl.info.render.triangles,memory:r.webgl.info.memory,viewport:r.viewport,renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'未知',glError:gl.getError(),nonblank:pixels.some((v,i)=>i%4!==3&&v>0),damage:g.battleStats.sides.map(s=>s.damageDealt)};
  })().then(v=>window.__performanceResult=v,e=>window.__performanceError=String(e));
},{count,quality,scenario,batching});
await page.waitForFunction(()=>window.__performanceResult||window.__performanceError,undefined,{timeout:60000});
const result=await page.evaluate(()=>{if(__performanceError)throw Error(__performanceError);return __performanceResult;});
await fs.writeFile(`${folder}/performance-${scenario}-${count}-${quality}${batching?'':'-unbatched'}.json`,JSON.stringify(result,null,2));
await page.screenshot({path:`${folder}/performance-${scenario}-${count}-${quality}${batching?'':'-unbatched'}.png`});
console.log(result);
if(result.samples<100||result.glError||!result.nonblank||result.actual<count*.95)throw Error('性能样本无效或渲染失败，请核实前台与场景');
