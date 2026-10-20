const {root,taskSpaceId}=globalThis.GAME_QA;
const page=(await taskSpace(taskSpaceId)).page('p1'),fs=await import('node:fs/promises'),folder=`${root}/releases/priority-recon-20261020`;
try{
  await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;});
  await page.goto('http://127.0.0.1:4173/');
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.evaluate(async()=>{
    window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));
    const set=Storage.prototype.setItem;window.__qaRestoreSceneStorage=()=>{Storage.prototype.setItem=set;};
    Storage.prototype.setItem=function(k,v){if(this===localStorage&&/^great-powers-(save-|player-honors-|challenge-profile-)/.test(k))return;return set.call(this,k,v);};
    const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name,{Renderer}=await import(url),render=Renderer.prototype.render;
    Renderer.prototype.render=function(...a){window.__qaRenderer=this;return render.apply(this,a);};
  });
  await page.click('#start-btn');await page.waitForFunction(()=>window.__qaRenderer?.entities.size>0);
  const initial=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game;g.units=[];g.buildings=[];g.effects=[];g.projectiles=[];g.players[0].faction='nato';
    g.checkVictory=()=>{};g.updateLogistics=()=>{};g.updateAI=()=>{};g.launchAIWave=()=>{};g.events.end=()=>{};
    window.__qaSceneUpdate=g.update.bind(g);g.update=()=>{};g.paused=true;g.fogTimer=1e9;g.time=0;
    for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}
    g.addBuilding(0,'airfield',850,900);g.addBuilding(0,'power',550,650);
    const plane=g.addUnit(0,'fighter',850,940),heli=g.addUnit(0,'helicopter',1090,900),launcher=g.addUnit(0,'ballistic',1210,1080);
    heli.turretAngle=-.8;launcher.deployProgress=0;g.selected=[plane.id];
    window.__qaPriorityIds={plane:plane.id,heli:heli.id,launcher:launcher.id};
    r.setQuality('high');r.camera.zoom=1.8;r.centerOn(1030,960);r.render(performance.now());
    const e=r.entities.get(plane.id),rotor=r.entities.get(heli.id).rotors[0];
    return{planeY:e.model.position.y,ground:r.elevation(plane.x,plane.y),gear:e.model.getObjectByName('fighter_gear_nose').visible,rotor:rotor.rotation.y,supportY:r.entities.get(launcher.id).model.getObjectByName('launcher_supports').position.y};
  });
  await page.screenshot({path:`${folder}/scene-ground.png`});
  const animated=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game,ids=__qaPriorityIds,plane=g.getEntity(ids.plane),launcher=g.getEntity(ids.launcher),enemy=g.addUnit(1,'tank',2200,1080);
    enemy.stunUntil=1e9;g.paused=false;g.selected=[plane.id];g.command(1450,940);
    let now=performance.now();r.render(now);launcher.deployProgress=5;
    for(let i=0;i<50;i++){__qaSceneUpdate(.05);now+=50;r.render(now);}
    g.paused=true;r.render(now);
    const e=r.entities.get(plane.id),h=r.entities.get(ids.heli),l=r.entities.get(ids.launcher);
    r.webgl.render(r.scene,r.viewCamera);const gl=r.webgl.getContext(),pixels=new Uint8Array(4096);gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return{planeY:e.model.position.y,gearDeployment:e.gearDeployment,planeDistance:Math.hypot(plane.x-850,plane.y-940),rotor:h.rotors[0].rotation.y,gunYaw:h.model.getObjectByName('helicopter_gun_yaw').rotation.y,launcherAngle:l.model.getObjectByName('strategic_launcher').rotation.z,supportY:l.model.getObjectByName('launcher_supports').position.y,supportScale:l.model.getObjectByName('launcher_supports').scale.y,nonblank:pixels.some((v,i)=>i%4!==3&&v>0),glError:gl.getError(),errors:__qaErrors};
  });
  if(!initial.gear||initial.planeY-initial.ground<11||animated.gearDeployment>.2||animated.planeY<50||animated.rotor===initial.rotor||animated.launcherAngle<.7||animated.supportY>.1||!animated.nonblank||animated.glError||animated.errors.length)throw Error(JSON.stringify({initial,animated}));
  await page.screenshot({path:`${folder}/scene-animated.png`});
  await fs.writeFile(`${folder}/scene.json`,JSON.stringify({initial,animated},null,2));console.log({initial,animated});
}finally{await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;window.__qaRestoreSceneStorage?.();});}
