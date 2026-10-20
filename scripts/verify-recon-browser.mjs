const {root,taskSpaceId}=globalThis.GAME_QA;
const page=(await taskSpace(taskSpaceId)).page('p1'),fs=await import('node:fs/promises'),folder=`${root}/releases/priority-recon-20261020`;
await fs.mkdir(folder,{recursive:true});
const report={stages:[],viewports:[]};
try{
  await page.evaluate(async()=>{
    window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));addEventListener('unhandledrejection',e=>__qaErrors.push(String(e.reason)));
    const keys=['great-powers-save-manual-v1','great-powers-save-auto-v1','great-powers-player-honors-v1','great-powers-challenge-profile-v1'];
    window.__qaProtected=Object.fromEntries(keys.map(k=>[k,localStorage.getItem(k)]));
    const set=Storage.prototype.setItem;window.__qaRestoreReconStorage=()=>{Storage.prototype.setItem=set;};
    Storage.prototype.setItem=function(k,v){if(this===localStorage&&Object.hasOwn(__qaProtected,k))return;return set.call(this,k,v);};
    const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name;
    const {Renderer}=await import(url),render=Renderer.prototype.render;
    Renderer.prototype.render=function(...a){window.__qaRenderer=this;return render.apply(this,a);};
  });
  await page.click('#challenge-btn');await page.waitForSelector('[data-modal="challenge-recon"]');
  await page.click('[data-modal="challenge-recon"]');await page.waitForFunction(()=>window.__qaRenderer?.game.challenge?.id==='recon');
  const pick=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game,update=g.update.bind(g);g.update=()=>{};
    window.__qaTickUntil=stage=>{for(let i=0;i<4200&&g.running&&g.challenge.intel.completed<stage;i++)update(.05);r.render(performance.now());return{time:g.time,completed:g.challenge.intel.completed,hp:g.getEntity(g.challenge.targetId)?.hp,winner:g.winner};};
    window.__qaFinish=()=>{for(let i=0;i<4200&&g.running;i++)update(.05);r.render(performance.now());return{time:g.time,winner:g.winner,stars:g.challenge.stars};};
    const u=g.getEntity(g.challenge.targetId);g.selected=g.ownedUnits(0).filter(v=>v.id!==u.id).map(v=>v.id);g.command(2760,2160,true);g.selected=[];
    r.render(performance.now());const p=r.worldToScreen(u.x,u.y,12),rect=r.canvas.getBoundingClientRect();
    for(let y=-18;y<=18;y+=3)for(let x=-15;x<=15;x+=3)if(r.pickEntity(p.x+x,p.y+y)?.id===u.id)return{x:p.x+x+rect.x,y:p.y+y+rect.y};
    throw Error('无法选择侦察员');
  });
  await page.mouse.click(pick.x,pick.y,{label:'选择任务侦察员'});
  await page.waitForFunction(()=>__qaRenderer.game.selected.length===1&&__qaRenderer.game.selected[0]===__qaRenderer.game.challenge.targetId);
  for(const [width,height]of[[1600,1000],[1280,800],[390,844]]){
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    report.viewports.push(await page.evaluate(async()=>{await new Promise(r=>requestAnimationFrame(r));return{width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth};}));
  }
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  for(let index=0;index<3;index++){
    if(index===2)await page.evaluate(()=>{const g=__qaRenderer.game;g.selected=g.ownedUnits(0).filter(v=>v.id!==g.challenge.targetId).map(v=>v.id);g.command(3970,2360,true);g.selected=[g.challenge.targetId];});
    await page.click(`[data-challenge-focus="node-${index}"]`);
    const point=await page.evaluate(index=>{const r=__qaRenderer,d=[{x:1700,y:1720},{x:2700,y:2140},{x:3900,y:2580}][index],p=r.worldToScreen(d.x-85,d.y-30),rect=r.canvas.getBoundingClientRect();return{x:p.x+rect.x,y:p.y+rect.y};},index);
    await page.mouse.click(point.x,point.y,{button:'right',label:`前往第 ${index+1} 个观察点`});
    const stage=await page.evaluate(index=>__qaTickUntil(index+1),index);report.stages.push(stage);
    if(stage.completed!==index+1||stage.winner!==null)throw Error(`侦察过程失败：${JSON.stringify(stage)}`);
    if(index===0){
      await page.waitForFunction(()=>document.querySelector('.recon-objectives .complete'));
      await page.screenshot({path:`${folder}/recon-intel.png`});
      report.save=await page.evaluate(async()=>{
        const g=__qaRenderer.game,s=g.toSave(),url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/game.js').name,{Game}=await import(url),loaded=Game.fromSave(s,g.events),r=__qaRenderer;
        r.game=loaded;r.render(performance.now());r.game=g;r.render(performance.now());return{completed:loaded.challenge.intel.completed,progress:loaded.challenge.intel.progress,paused:loaded.paused};
      });
    }
  }
  await page.click('[data-challenge-focus="exit"]');
  const exit=await page.evaluate(()=>{const r=__qaRenderer,p=r.worldToScreen(800,2080),rect=r.canvas.getBoundingClientRect();return{x:p.x+rect.x,y:p.y+rect.y};});
  await page.mouse.click(exit.x,exit.y,{button:'right',label:'携带情报返回撤离区'});report.result=await page.evaluate(()=>__qaFinish());
  await page.waitForFunction(()=>document.querySelector('#modal h2')?.textContent==='挑战完成');
  if(report.result.winner!==0)throw Error(`未完成撤离：${JSON.stringify(report.result)}`);
  await page.screenshot({path:`${folder}/recon-victory.png`});
  const previous=await page.evaluate(()=>__qaRenderer.game.battleId);
  await page.click('[data-modal="retry-challenge"]');await page.waitForFunction(id=>window.__qaRenderer?.game.battleId!==id&&__qaRenderer.game.challenge?.id==='recon',previous);
  await page.evaluate(()=>{const g=__qaRenderer.game;g.damage(g.getEntity(g.challenge.targetId),10000,1);g.checkVictory();});
  await page.waitForFunction(()=>document.querySelector('#modal h2')?.textContent==='挑战未完成');
  report.failure=await page.evaluate(()=>({winner:__qaRenderer.game.winner,reason:__qaRenderer.game.challenge.reason}));
  report.integrity=await page.evaluate(()=>({protectedUnchanged:Object.entries(__qaProtected).every(([k,v])=>localStorage.getItem(k)===v),errors:__qaErrors.slice()}));
  if(report.viewports.some(v=>v.overflow>0)||!report.integrity.protectedUnchanged||report.integrity.errors.length)throw Error(JSON.stringify(report));
  await fs.writeFile(`${folder}/recon.json`,JSON.stringify(report,null,2));console.log(report);
}finally{
  await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;window.__qaRestoreReconStorage?.();});
}
