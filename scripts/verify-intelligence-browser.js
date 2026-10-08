const {root,taskSpaceId,pageLabel='p1'}=globalThis.GAME_QA;
const task=await taskSpace(taskSpaceId),page=task.page(pageLabel),fs=await import('node:fs/promises');
const folder=`${root}/releases/intelligence-qa`,report={layouts:[],scenarios:[]};
const check=(value,message)=>{if(!value)throw new Error(message);};
await fs.mkdir(folder,{recursive:true});let backup;
const shot=async name=>{await page.screenshot({path:`${folder}/${name}.png`});};
async function rightClickWorld(point){
  const screen=await page.evaluate(point=>{const r=__caiRenderer,p=r.worldToScreen(point.x,point.y,point.height||0),box=r.canvas.getBoundingClientRect();r.game.paused=false;return{x:p.x+box.x,y:p.y+box.y};},point);
  await page.mouse.click(screen.x,screen.y,{button:'right',label:'下达战场目标指令'});
  await page.evaluate(()=>{__caiRenderer.game.paused=true;});
}
try{
  await page.goto('http://localhost:4173/');
  backup=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')).map(k=>[k,localStorage.getItem(k)])));
  await fs.writeFile(`${folder}/用户设置验收前备份.json`,JSON.stringify(backup));
  await page.evaluate(async()=>{
    window.__caiErrors=[];addEventListener('error',e=>__caiErrors.push(e.message));addEventListener('unhandledrejection',e=>__caiErrors.push(String(e.reason)));
    window.__qaVisibility=e=>e.stopImmediatePropagation();document.addEventListener('visibilitychange',__qaVisibility,true);
    window.__caiStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('great-powers-save-'))return;return __caiStorageSet.call(this,key,value);};
    const load=path=>import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path).name);
    const {Renderer}=await load('/src/render.js'),render=Renderer.prototype.render;
    Renderer.prototype.render=function(...args){window.__caiRenderer=this;return render.apply(this,args);};
    window.__caiAudio=(await load('/src/audio.js')).gameAudio;
    window.__caiTick=seconds=>{const g=__caiRenderer.game;g.paused=false;for(let i=0;i<Math.ceil(seconds/.05);i++)g.update(.05);g.paused=true;__caiRenderer.render();};
  });
  for(const [width,height] of [[1600,1000],[1280,800],[1024,768]]){
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const layout=await page.evaluate(()=>{const el=document.querySelector('.deployment-controls'),rect=el.getBoundingClientRect();return{width:innerWidth,height:innerHeight,inViewport:rect.x>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,overflow:el.scrollWidth>el.clientWidth+1,checked:document.querySelector('#expanded-map').checked};});
    check(layout.inViewport&&!layout.overflow&&layout.checked,`首页布局异常 ${JSON.stringify(layout)}`);report.layouts.push(layout);await shot(`01-home-${width}`);
  }
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.selectOption('#map-select','valley');await page.selectOption('#enemy-select','russia');await page.click('#start-btn');
  await page.waitForFunction(()=>window.__caiRenderer?.entities.size>0,undefined,{timeout:30000});
  const size=await page.evaluate(()=>{
    const r=__caiRenderer,g=r.game;g.aiTimer=g.aiWaveTimer=100000;g.updateLogistics=()=>{};g.paused=true;
    for(const u of g.ownedUnits(1))u.hp=0;g.units=g.units.filter(u=>u.hp>0);
    for(const fog of g.fogs){fog.visible.fill(true);fog.explored.fill(true);}g.fogTimer=100000;
    window.__caiVoices=[];const voice=g.events.voice;g.events.voice=key=>{__caiVoices.push(key);voice?.(key);};
    return{width:g.world.width,height:g.world.height,scale:g.battlefieldScale,sites:g.resourceSites.length};
  });check(size.width===3360&&size.height===2160&&size.scale===1.5&&size.sites===6,'纵深战场未生效');report.size=size;
  const destination=await page.evaluate(()=>{
    const r=__caiRenderer,g=r.game;const tank=g.ownedUnits(0,'tank')[0];tank.x=750;tank.y=g.homeY;g.selected=[tank.id];
    for(let i=0;i<4;i++){const u=g.addUnit(0,i%2?'rifle':'tank',760+i*55,g.homeY+90);g.selected.push(u.id);}
    g.events.selection?.();r.centerOn(940,g.homeY);r.render();return{x:1200,y:g.homeY-130};
  });await rightClickWorld(destination);
  await page.evaluate(()=>{__caiTick(.5);});
  const routes=await page.evaluate(()=>{__caiRenderer.render();return __caiRenderer.orderRoutes.map(r=>({points:r.points.length,destination:r.destination}));});check(routes.length===5&&routes.every(r=>r.points>=2),'行军虚线缺失');report.routes=routes;await shot('02-route-and-personnel');
  const factory=await page.evaluate(()=>{
    const r=__caiRenderer,g=r.game,b=g.ownedBuildings(0,'factory')[0],spy=g.addUnit(1,'scout',b.x+50,b.y);
    spy.order={type:'infiltrate',targetId:b.id,x:b.x,y:b.y};g.updateSpecialOrder(spy,.05);g.selected=[];r.centerOn(b.x+180,b.y);r.render();
    return{id:b.id,x:b.x,y:b.y,hasBomb:!!b.sabotage,spyConsumed:spy.hp===0};
  });check(factory.hasBomb&&factory.spyConsumed,'一次性潜入失败');await shot('03-spy-countdown');
  await page.evaluate(id=>{const g=__caiRenderer.game,b=g.getEntity(id),u=g.addUnit(0,'engineer',b.x+50,b.y);g.selected=[u.id];g.events.selection?.();__caiRenderer.render();},factory.id);
  await rightClickWorld(factory);
  check(await page.evaluate(()=>__caiRenderer.game.getEntity(__caiRenderer.game.selected[0])?.order?.type==='defuse'),'右键己方建筑未下达拆弹');
  await page.evaluate(()=>{__caiTick(3.5);});
  check(await page.evaluate(id=>!__caiRenderer.game.getEntity(id).sabotage&&__caiVoices.includes('spyDefused_factory'),factory.id),'拆弹或含名称播报失败');report.scenarios.push('一次性间谍、倒计时、右键拆弹与设施名称播报');
  const resource=await page.evaluate(()=>{
    const r=__caiRenderer,g=r.game,s=g.resourceSites.find(s=>s.type==='cache'),u=g.addUnit(0,'rifle',s.x-25,s.y);g.selected=[u.id];g.events.selection?.();r.centerOn(s.x,s.y);r.render();return{x:s.x,y:s.y,id:s.id};
  });await rightClickWorld(resource);
  check(await page.evaluate(()=>__caiRenderer.game.getEntity(__caiRenderer.game.selected[0])?.order?.type==='collect'),'资源模型右键拾取失败');
  await shot('04-resource-collection');await page.evaluate(()=>__caiTick(5));check(await page.evaluate(id=>__caiRenderer.game.getEntity(id).amount===0,resource.id),'物资库存未回收');report.scenarios.push('资源实体拾取与有限库存');
  const depot=await page.evaluate(()=>{
    const r=__caiRenderer,g=r.game,s=g.resourceSites.find(s=>s.type==='depot'),u=g.addUnit(0,'engineer',s.x-20,s.y);g.selected=[u.id];g.events.selection?.();r.centerOn(s.x,s.y);r.render();return{x:s.x,y:s.y,id:s.id};
  });await rightClickWorld(depot);await page.evaluate(()=>__caiTick(.2));check(await page.evaluate(id=>__caiRenderer.game.getEntity(id).owner===0,depot.id),'能源仓不能占领');await shot('05-captured-energy-depot');
  await page.evaluate(()=>{
    const g=__caiRenderer.game;for(const side of [0,1]){for(let i=0;i<4;i++)g.addBuilding(side,'power',side?g.world.width-120-i*80:120+i*80,150);g.addBuilding(side,'super',side?g.world.width-200:200,350);g.players[side].credits=3000;g.players[side].cyberCharge=120;}
    g.recalculatePower();g.events.selection?.();
  });if(await page.evaluate(()=>document.querySelector('#sidebar-btn').getAttribute('aria-expanded')!=='true'))await page.click('#sidebar-btn');await page.click('[data-tab="tactics"]');await page.waitForSelector('#cyber-button');
  await page.click('#cyber-button');check(await page.evaluate(()=>!!__caiRenderer.game.players[0].cyberPending),'网络技能按钮失效');
  await page.evaluate(()=>{const g=__caiRenderer.game;g.launchCyber(1);const u=g.addUnit(0,'tank',900,g.homeY+300);g.selected=[u.id];u.order={type:'move',x:1300,y:u.y};window.__caiBefore={x:u.x,y:u.y};g.events.selection?.();});
  await page.waitForFunction(()=>document.querySelector('#cyber-status').textContent.includes('预警'));await shot('06-cyber-warning');
  await page.evaluate(()=>__caiTick(12.2));await page.waitForFunction(()=>document.querySelector('#cyber-status').textContent.includes('链路干扰'));
  const locked=await page.evaluate(()=>{const g=__caiRenderer.game,u=g.getEntity(g.selected[0]);return{locked:g.isControlLocked(0),moved:Math.hypot(u.x-__caiBefore.x,u.y-__caiBefore.y)>5,order:JSON.stringify(u.order)};});check(locked.locked&&locked.moved,`网络干扰仿真异常：${JSON.stringify(locked)}`);
  await page.evaluate(()=>{__caiRenderer.game.paused=false;});await page.click('#stop-btn');
  check(await page.evaluate(order=>{__caiRenderer.game.paused=true;return JSON.stringify(__caiRenderer.game.getEntity(__caiRenderer.game.selected[0]).order)===order;},locked.order),'干扰期间停止按钮仍能下达指令');await shot('07-cyber-disrupted');
  for(const [width,height] of [[1280,800],[1024,768]]){
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const layout=await page.evaluate(()=>{const top=document.querySelector('.topbar');return{width:innerWidth,overflow:top.scrollWidth>top.clientWidth+1,header:document.querySelector('#cyber-status').textContent};});check(!layout.overflow,'网络标题栏溢出');report.layouts.push(layout);await shot(`08-cyber-${width}`);
  }
  await page.evaluate(()=>{const g=__caiRenderer.game,b=g.ownedBuildings(1,'super')[0];b.hp=0;g.updateIntelligence(.05);});check(await page.evaluate(()=>!__caiRenderer.game.isControlLocked(0)),'摧毁源站未立即恢复');report.scenarios.push('网络按钮、预警、UI 锁定、行军继续、摧毁反制');
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.click('#sound-btn');await page.selectOption('#audio-voice','portable-female');
  await page.evaluate(()=>{__caiAudio.setSettings({muted:false,voice:1,master:.6});});await page.click('#audio-test');
  await page.waitForFunction(()=>__caiAudio.buffers.has('portable/female-welcome-0.wav'),undefined,{timeout:15000});
  const audio=await page.evaluate(async()=>{
    const female=await __caiAudio.buffer('portable/female-welcome-0.wav'),male=await __caiAudio.buffer('portable/welcome-0.wav');
    const energy=b=>b.getChannelData(0).reduce((s,v)=>s+v*v,0);return{voice:__caiAudio.settings.voiceURI,femaleDuration:female.duration,maleDuration:male.duration,femaleEnergy:energy(female),maleEnergy:energy(male),state:__caiAudio.context.state};
  });check(audio.voice==='portable-female'&&audio.femaleEnergy>1&&audio.maleEnergy>1&&audio.state==='running','女声未正确载入与解码');report.audio=audio;await shot('09-female-voice');await page.click('#audio-close');
  const pixels=await page.evaluate(()=>{
    const r=__caiRenderer;r.render();const gl=r.webgl.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return{colors:colors.size,error:gl.getError(),errors:__caiErrors};
  });check(pixels.colors>100&&!pixels.error&&!pixels.errors.length,'三维画面空白或有运行错误');report.pixels=pixels;
  await page.evaluate(()=>{const r=__caiRenderer;r.centerOn(2900,1500);r.render();});check(await page.evaluate(()=>__caiRenderer.center.x>2240),'不能移动到新增地图区域');report.scenarios.push('扩展区域平移、三维像素非空、男女声解码');
  await page.evaluate(async()=>{const {CatalogPreview}=await import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/catalog-preview.js').name),start=CatalogPreview.prototype.start;CatalogPreview.prototype.start=function(...args){window.__caiPreview=this;return start.apply(this,args);};});
  await page.click('#catalog-btn');await page.waitForSelector('#catalog-detail',{state:'visible'});report.models=[];
  for(const [type,name]of [['scout','间谍'],['rifle','突击步兵'],['engineer','工程师']]){
    await page.fill('#catalog-search','');await page.click(`[data-entry="unit:${type}"]`);
    const model=await page.evaluate(()=>{const r=__caiPreview.renderer;r.render(__caiPreview.scene,__caiPreview.camera);const gl=r.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>0)opaque++;return{name:__caiPreview.model.name,opaque,error:gl.getError(),status:document.querySelector('#catalog-model-status').textContent};});
    check(model.name===type&&model.opaque>1000&&!model.error&&!model.status,`${name} 模型预览异常`);report.models.push(model);await shot(`10-model-${type}`);
  }
  await page.click('[data-catalog-close]');
  await fs.writeFile(`${folder}/验收报告.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{
  // 实机验收场景不作为用户战绩；停止测试并恢复原存档、设置和荣誉。
  await page.evaluate(()=>{if(window.__caiRenderer?.game){__caiRenderer.game.running=false;__caiRenderer.game.paused=true;}window.__caiAudio?.stopBattle();if(window.__caiStorageSet)Storage.prototype.setItem=__caiStorageSet;document.removeEventListener('visibilitychange',window.__qaVisibility,true);});
  if(backup)await page.evaluate(values=>{for(const k of Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')))if(!Object.hasOwn(values,k))localStorage.removeItem(k);for(const[k,v]of Object.entries(values))localStorage.setItem(k,v);},backup);
}
