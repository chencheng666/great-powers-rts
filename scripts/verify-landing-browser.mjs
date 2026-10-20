const {root,taskSpaceId}=globalThis.GAME_QA;
const page=(await taskSpace(taskSpaceId)).page('p1'),fs=await import('node:fs/promises'),folder=`${root}/releases/landing-refinement-20261020`;
await fs.mkdir(folder,{recursive:true});const report={viewports:[]};
try{
  await page.evaluate(async()=>{
    window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));addEventListener('unhandledrejection',e=>__qaErrors.push(String(e.reason)));
    const keys=['great-powers-save-manual-v1','great-powers-save-auto-v1','great-powers-player-honors-v1','great-powers-challenge-profile-v1'];
    window.__qaProtected=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));const set=Storage.prototype.setItem;
    window.__qaRestoreStorage=()=>{Storage.prototype.setItem=set;};
    Storage.prototype.setItem=function(k,v){if(this===localStorage&&Object.hasOwn(__qaProtected,k))return;return set.call(this,k,v);};
    const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name,{Renderer}=await import(url),render=Renderer.prototype.render;
    Renderer.prototype.render=function(...a){window.__qaRenderer=this;return render.apply(this,a);};
    window.__qaPick=id=>{
      const r=__qaRenderer,u=r.game.getEntity(id),p=r.worldToScreen(u.x,u.y,18),rect=r.canvas.getBoundingClientRect();
      for(let y=-45;y<=45;y+=3)for(let x=-60;x<=60;x+=3)if(r.pickEntity(p.x+x,p.y+y)?.id===id)return{x:p.x+x+rect.x,y:p.y+y+rect.y};
      throw Error(`无法选择单位 ${id}`);
    };
  });
  await page.click('#challenge-btn');await page.waitForSelector('[data-modal="challenge-beachhead"]');await page.click('[data-modal="challenge-beachhead"]');
  await page.waitForFunction(()=>window.__qaRenderer?.game.challenge?.id==='beachhead');
  const pick=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game;window.__qaUpdate=g.update.bind(g);g.update=()=>{};r.camera.zoom=2;r.centerOn(1240,1410);r.render(performance.now());return __qaPick(g.challenge.targetId);
  });
  await page.mouse.click(pick.x,pick.y,{label:'选择任务登陆舰'});
  await page.waitForFunction(()=>__qaRenderer.game.selected.length===1&&__qaRenderer.game.selected[0]===__qaRenderer.game.challenge.targetId);
  await page.screenshot({path:`${folder}/landing-loaded.png`});
  report.models=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game,e=r.entities.get(g.challenge.targetId);let meshes=0,triangles=0;e.model.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});
    const gl=r.webgl.getContext(),pixels=new Uint8Array(4096);gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return{cargo:e.deckModels.size,meshes,triangles,gl:gl.getError(),nonblank:pixels.some((v,i)=>i%4<3&&v>25)};
  });
  const destination=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game;g.selected=g.activeUnits(0).filter(u=>u.type!=='landing').map(u=>u.id);g.command(2400,1640,true);g.selected=[g.challenge.targetId];
    r.camera.zoom=1.1;r.centerOn(2250,1470);r.render(performance.now());const p=r.worldToScreen(2400,1450),rect=r.canvas.getBoundingClientRect();return{x:p.x+rect.x,y:p.y+rect.y};
  });
  await page.mouse.click(destination.x,destination.y,{button:'right',label:'航向东岸卸载点'});
  report.travel=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game,s=g.getEntity(g.challenge.targetId);for(let i=0;i<1000&&g.running&&(s.x<2360||s.order);i++)__qaUpdate(.05);
    r.camera.zoom=1.6;r.centerOn(2470,1470);r.render(performance.now());return{time:g.time,x:s.x,y:s.y,order:s.order,cargo:s.passengers.length};
  });
  if(report.travel.order||report.travel.time>=50)throw Error(`登陆舰未及时停驻：${JSON.stringify(report.travel)}`);
  await page.click('loc=css:button[aria-label="卸载部队"]');
  report.unload=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game,s=g.getEntity(g.challenge.targetId);g.selected=g.activeUnits(0).filter(u=>['tank','rifle','supply'].includes(u.type)).map(u=>u.id);g.command(2590,1510,true);
    while(g.time<26&&g.running)__qaUpdate(.05);r.render(performance.now());return{cargo:s.passengers.length,deckModels:r.entities.get(s.id).deckModels.size,landed:g.activeUnits(0).filter(u=>['tank','rifle','supply','engineer'].includes(u.type)).length};
  });
  if(report.unload.cargo||report.unload.deckModels||report.unload.landed!==5)throw Error(JSON.stringify(report.unload));
  if(await page.evaluate(()=>document.querySelector('#sidebar-btn').getAttribute('aria-expanded')==='false'))await page.click('#sidebar-btn');
  await page.waitForSelector('.challenge-objectives');
  await page.screenshot({path:`${folder}/landing-unloaded.png`});
  const engineer=await page.evaluate(()=>{const r=__qaRenderer,g=r.game,u=g.ownedUnits(0,'engineer')[0];r.centerOn(u.x,u.y);r.render(performance.now());return __qaPick(u.id);});
  await page.mouse.click(engineer.x,engineer.y,{label:'选择接管工程师'});
  await page.waitForFunction(()=>__qaRenderer.game.selected.length===1&&__qaRenderer.game.getEntity(__qaRenderer.game.selected[0]).type==='engineer');
  await page.click('[data-challenge-focus="exit"]');
  const objective=await page.evaluate(()=>{const r=__qaRenderer,p=r.worldToScreen(2650,1540),rect=r.canvas.getBoundingClientRect();return{x:p.x+rect.x,y:p.y+rect.y};});
  await page.mouse.click(objective.x,objective.y,{button:'right',label:'接管东岸通信站'});
  report.capture=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game;for(let i=0;i<1000&&g.running&&g.getEntity('beacon-east').owner!==0;i++)__qaUpdate(.05);r.render(performance.now());return{time:g.time,owner:g.getEntity('beacon-east').owner,hold:g.challenge.beachhead.hold};
  });
  if(report.capture.owner!==0)throw Error(`未能接管：${JSON.stringify(report.capture)}`);
  report.save=await page.evaluate(async()=>{
    const r=__qaRenderer,g=r.game,url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/game.js').name,{Game}=await import(url),loaded=Game.fromSave(g.toSave(),g.events);
    r.game=loaded;r.render(performance.now());r.game=g;r.render(performance.now());return{paused:loaded.paused,hold:loaded.challenge.beachhead.hold,owner:loaded.getEntity('beacon-east').owner};
  });
  for(const[width,height]of[[1600,1000],[1280,800]]){
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    report.viewports.push(await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(r));return{width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};}));
  }
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  report.result=await page.evaluate(()=>{const g=__qaRenderer.game;for(let i=0;i<4800&&g.running;i++)__qaUpdate(.05);__qaRenderer.render(performance.now());return{time:g.time,winner:g.winner,stars:g.challenge.stars,reason:g.challenge.reason};});
  await page.waitForFunction(()=>document.querySelector('#modal h2')?.textContent==='挑战完成');
  report.resultHeader=await page.evaluate(()=>{const card=document.querySelector('#modal .modal-card'),heading=document.querySelector('#modal h2');return{scrollTop:card.scrollTop,visible:heading.getBoundingClientRect().top>=card.getBoundingClientRect().top};});
  if(report.resultHeader.scrollTop!==0||!report.resultHeader.visible)throw Error(`结算标题被旧滚动位置遮挡：${JSON.stringify(report.resultHeader)}`);
  if(report.result.winner!==0)throw Error(JSON.stringify(report.result));await page.screenshot({path:`${folder}/landing-victory.png`});
  const previous=await page.evaluate(()=>__qaRenderer.game.battleId);await page.click('[data-modal="retry-challenge"]');
  await page.waitForFunction(id=>__qaRenderer.game.battleId!==id&&__qaRenderer.game.challenge?.id==='beachhead',previous);
  await page.evaluate(()=>{const g=__qaRenderer.game;g.damage(g.ownedUnits(0,'engineer')[0],10000,1);g.checkVictory();});
  await page.waitForFunction(()=>document.querySelector('#modal h2')?.textContent==='挑战未完成');
  report.failure=await page.evaluate(()=>({winner:__qaRenderer.game.winner,reason:__qaRenderer.game.challenge.reason}));
  report.integrity=await page.evaluate(()=>({protectedUnchanged:Object.entries(__qaProtected).every(([k,v])=>localStorage.getItem(k)===v),errors:__qaErrors}));
  if(report.viewports.some(v=>v.overflow>0)||report.models.gl||!report.models.nonblank||report.models.cargo!==5||!report.integrity.protectedUnchanged||report.integrity.errors.length)throw Error(JSON.stringify(report));
  await fs.writeFile(`${folder}/landing.json`,JSON.stringify(report,null,2));console.log(report);
}finally{
  await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;window.__qaRestoreStorage?.();});
}
