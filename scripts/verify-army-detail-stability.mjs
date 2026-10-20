const {root,taskSpaceId,pageLabel='p1'}=globalThis.GAME_QA;
const fs=await import('node:fs/promises'),page=(await taskSpace(taskSpaceId)).page(pageLabel),folder=`${root}/releases/challenge-profile-20261020`;
try {
  await fs.mkdir(folder,{recursive:true});
  await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;});
  await page.goto('http://127.0.0.1:4173/');await page.cdp('Page.bringToFront',{});
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name;
    const {Renderer}=await import(url),render=Renderer.prototype.render;
    Renderer.prototype.render=function(...a){window.__qaRenderer=this;return render.apply(this,a);};
    document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);
    const set=Storage.prototype.setItem;window.__qaRestoreArmyStorage=()=>{Storage.prototype.setItem=set;};
    Storage.prototype.setItem=function(k,v){if(this===localStorage&&/^great-powers-save-(manual|auto)-v1$/.test(k))return;return set.call(this,k,v);};
    window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));
  });
  await page.click('#start-btn');await page.waitForFunction(()=>window.__qaRenderer?.entities.size>0);
  const transitions=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game;
    g.units=[];g.effects=[];g.projectiles=[];g.selected=[];g.running=true;g.paused=true;g.time=0;g.fogTimer=1e9;
    g.events.end=()=>{};g.checkVictory=()=>{};g.updateAI=()=>{};g.launchAIWave=()=>{};g.updateLogistics=()=>{};
    for(const fog of g.fogs){fog.visible.fill(true);fog.explored.fill(true);}
    for(let i=0;i<170;i++)g.addUnit(0,'rifle',840+i%17*20,640+Math.floor(i/17)*19);
    r.setQuality('high');r.camera.zoom=1.8;r.centerOn(1000,720);r.armyDetail=undefined;
    const out=[];
    for(const zoom of [1.8,1.68,1.72,1.6,1.57,1.7,1.8]){
      r.camera.zoom=zoom;r.render(performance.now());
      out.push({zoom,near:r.armyDetail.near.size,actualNear:[...r.entities.values()].filter(e=>e.entity.kind==='unit'&&e.personnelLOD&&!e.personnelLOD.visible).length});
    }
    window.__qaTarget=g.units.at(-1).id;
    return out;
  });
  const expected=[12,12,12,12,0,0,12];if(transitions.some((v,i)=>v.near!==expected[i]||v.actualNear!==expected[i]))throw Error(`精模切换不稳定：${JSON.stringify(transitions)}`);
  const target=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game,u=g.getEntity(__qaTarget);g.paused=false;const p=r.worldToScreen(u.x,u.y,12),rect=r.canvas.getBoundingClientRect();
    for(let y=-18;y<=18;y+=3)for(let x=-12;x<=12;x+=3)if(r.pickEntity(p.x+x,p.y+y)?.id===u.id)return{x:p.x+x+rect.x,y:p.y+y+rect.y};throw Error('未找到可点击人物');
  });
  await page.mouse.click(target.x,target.y);await page.waitForFunction(()=>__qaRenderer.game.selected.includes(__qaTarget));
  const start=await page.evaluate(()=>{const r=__qaRenderer,u=r.game.getEntity(__qaTarget),p=r.worldToScreen(u.x+100,u.y+80),rect=r.canvas.getBoundingClientRect();return{x:u.x,y:u.y,goal:{x:p.x+rect.x,y:p.y+rect.y}};});
  await page.mouse.click(start.goal.x,start.goal.y,{button:'right'});
  await page.waitForFunction(start=>{const u=__qaRenderer.game.getEntity(__qaTarget);return Math.hypot(u.x-start.x,u.y-start.y)>6;},start,{timeout:30000});
  const motion=await page.evaluate(start=>{const r=__qaRenderer,u=r.game.getEntity(__qaTarget);r.game.paused=true;r.render(performance.now());r.webgl.render(r.scene,r.viewCamera);const gl=r.webgl.getContext(),pixels=new Uint8Array(32*32*4);gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return{distance:Math.hypot(u.x-start.x,u.y-start.y),selectedDetail:r.armyDetail.near.has(u.id),nonblank:pixels.some((v,i)=>i%4!==3&&v>0),glError:gl.getError(),drawCalls:r.webgl.info.render.calls,errors:__qaErrors.slice()};},start);
  if(!motion.selectedDetail||!motion.nonblank||motion.glError||motion.errors.length)throw Error(`人物交互验收失败：${JSON.stringify(motion)}`);
  await page.screenshot({path:`${folder}/05-army-detail.png`});
  const viewport=[];
  for(const [width,height]of [[1280,800],[390,844]]){
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    viewport.push(await page.evaluate(()=>{const r=__qaRenderer;r.render(performance.now());const gl=r.webgl.getContext(),pixels=new Uint8Array(16*16*4);gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,16,16,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return{width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,nonblank:pixels.some((v,i)=>i%4!==3&&v>0),glError:gl.getError()};}));
  }
  if(viewport.some(v=>v.overflow>0||!v.nonblank||v.glError))throw Error('视口或画布验收失败');
  const report={transitions,motion,viewport};await fs.writeFile(`${folder}/army-stability.json`,JSON.stringify(report,null,2));console.log(report);
} finally {
  await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;window.__qaRestoreArmyStorage?.();});
}
