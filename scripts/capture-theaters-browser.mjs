const {root,taskSpaceId}=globalThis.GAME_QA;
const fs=await import('node:fs/promises'),page=(await taskSpace(taskSpaceId)).page('p1');
const folder=`${root}/releases/theaters-20261022`;
await fs.mkdir(folder,{recursive:true});
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
await page.reload();await page.waitForSelector('#challenge-btn');
await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name;
  const {Renderer}=await import(url),original=Renderer.prototype.render;
  Renderer.prototype.render=function(...a){window.__qaRenderer=this;return original.apply(this,a);};
  window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));addEventListener('unhandledrejection',e=>__qaErrors.push(String(e.reason)));
});
const results=[];
for(const id of globalThis.GAME_QA.ids||['islandwatch','seabreach','deepblue','farshore','passwatch','homebound','ironworks','sentinel','moonsea']){
  if(results.length){await page.click('#menu-btn');await page.click('text=不保存返回');}
  await page.click('#challenge-btn');await page.click(`[data-modal=challenge-${id}]`);
  await page.waitForFunction(id=>window.__qaRenderer?.game.mapId===id,id,{timeout:30000});
  const state=await page.evaluate(async()=>{
    const r=__qaRenderer,g=r.game;
    const {CHALLENGES}=await import('/src/challenges.js');
    g.paused=true;g.selected=[];g.fogTimer=1e9;
    for(const fog of g.fogs){fog.visible.fill(true);fog.explored.fill(true);}
    r.setQuality('high');r.setViewMode('immersive');r.updateFog();
    r.camera.zoom=1.05;r.centerOn(CHALLENGES[g.challenge.id].camera.x,CHALLENGES[g.challenge.id].camera.y);r.render(performance.now());
    return {id:g.mapId,name:g.map.name,units:g.units.length};
  });
  await page.waitForFunction(()=>!document.querySelector('.toast'),undefined,{timeout:15000});
  await page.screenshot({path:`${folder}/${id}-指挥视角.png`});
  const wide=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game;r.camera.zoom=.32;r.centerOn(g.world.width/2,g.world.height/2);r.render(performance.now());
    r.webgl.render(r.scene,r.viewCamera);
    const gl=r.webgl.getContext(),pixels=new Uint8Array(32*32*4);
    gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return {glError:gl.getError(),nonblank:pixels.some((v,i)=>i%4!==3&&v>0),errors:__qaErrors};
  });
  await page.screenshot({path:`${folder}/${id}-战区全景.png`});
  const detail=await page.evaluate(async()=>{
    const r=__qaRenderer,g=r.game,{theaterFacilities}=await import('/src/theater-operations.js');
    const unit=g.activeUnits(0,g.map.water?'destroyer':'tank')[0]||g.activeUnits(0,'tank')[0]||g.activeUnits(0,'rifle')[0];
    r.camera.zoom=g.map.water?2:2.8;r.centerOn(unit.x,unit.y);r.render(performance.now());
    return {model:r.entities.get(unit.id)?.model.name,nodes:theaterFacilities(g).length};
  });
  await page.screenshot({path:`${folder}/${id}-装备近景.png`});
  results.push({...state,...wide,...detail});
  if(wide.glError||!wide.nonblank||wide.errors.length)throw Error(JSON.stringify(results.at(-1)));
  console.log(results.at(-1));
}
await fs.writeFile(`${folder}/画面检查.json`,JSON.stringify({description:'本次引擎受控场景，暂停并揭开迷雾以检查整张地图；不是全程试玩录像。',results},null,2));
