const {root,spaceId}=globalThis.DETERRENCE_QA,task=await taskSpace(spaceId),page=task.page('p2'),fs=await import('node:fs/promises');
const folder=`${root}/docs/releases/v1.1.0-images`,report={};await fs.mkdir(folder,{recursive:true});
const check=(v,m)=>{if(!v)throw Error(m);};
await page.goto('http://localhost:4188/');await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await page.waitForFunction(()=>document.querySelector('#map-select').options.length>5);
if(await page.evaluate(()=>document.querySelector('#nickname-dialog').open)){await page.fill('#nickname-dialog input','战略发布验收');await page.click('#nickname-dialog button[type=submit]');}
report.default=await page.evaluate(()=>({off:!document.querySelector('#nuclear-enabled').checked,hidden:getComputedStyle(document.querySelector('#nuclear-option')).display==='none'}));check(report.default.off&&report.default.hidden,'常规地图不应显示或默认启用核规则');
await page.selectOption('#map-select','strategic');await page.click('#nuclear-enabled');
await page.screenshot({path:`${folder}/01-home.png`});
await page.evaluate(async()=>{
  document.addEventListener('visibilitychange',e=>{if(document.hidden)e.stopImmediatePropagation();},true);
  window.__deterrenceErrors=[];addEventListener('error',e=>__deterrenceErrors.push(e.message));addEventListener('unhandledrejection',e=>__deterrenceErrors.push(String(e.reason)));
  const source=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/render.js').name;
  const {Renderer}=await import(source),render=Renderer.prototype.render;
  Renderer.prototype.render=function(...args){window.__deterrenceRenderer=this;return render.apply(this,args);};
});
await page.click('#start-btn');await page.waitForFunction(()=>window.__deterrenceRenderer?.game.time>.1,undefined,{timeout:60000});
report.start=await page.evaluate(()=>({enabled:__deterrenceRenderer.game.nuclearEnabled,map:__deterrenceRenderer.game.mapId}));check(report.start.enabled,'开局核规则未生效');
await page.evaluate(()=>{
  const r=__deterrenceRenderer,g=r.game;window.__qaBattleId=g.battleId;window.__qaAdvance=g.update.bind(g);g.update=()=>{};g.isAI=()=>false;g.units=[];g.updateUnit=(u,dt)=>{u.fireTimer-=dt;};
  for(const side of [0,1]){for(const t of ['radar','lab'])g.addBuilding(side,t,side?5600:1100,1800);for(let i=0;i<6;i++)g.addBuilding(side,'power',side?5700:1100,2300+i*100);g.players[side].credits=16000;}
  g.addBuilding(0,'nuclearSilo',1300,2080);g.players[0].nuclearCharge=240;
  g.addBuilding(1,'hq',2600,2080);g.addUnit(0,'scout',2520,2180);g.addUnit(0,'ballistic',1900,2150).deployProgress=5;
  g.addUnit(1,'tank',2630,2180);g.addUnit(1,'tank',2690,2200);
  const abm=g.addUnit(1,'abm',2330,2200);abm.fireTimer=0;
  g.recalculatePower();g.updateFog();r.centerOn(2600,2080);r.camera.zoom=.9;r.setQuality('standard');r.updateCamera();r.render(performance.now());
});
await page.click('[data-tab="tactics"]');await page.waitForFunction(()=>!document.querySelector('#nuclear-button')?.disabled);
await page.click('#nuclear-button');
const point=await page.evaluate(()=>{const r=__deterrenceRenderer,p=r.worldToScreen(2600,2080,0),rect=r.canvas.getBoundingClientRect();return {x:p.x+rect.x,y:p.y+rect.y};});
await page.mouse.click(point.x,point.y);await page.mouse.move(1500,70);await page.waitForFunction(()=>!!__deterrenceRenderer.game.players[0].nuclearPending);
await page.waitForFunction(()=>!document.querySelector('#nuclear-alert').hidden);
await page.screenshot({path:`${folder}/02-nuclear-warning.png`});
report.warning=await page.evaluate(()=>({remaining:__deterrenceRenderer.game.nuclearWarnings()[0].remaining,credits:__deterrenceRenderer.game.players[0].credits,prepared:!!__deterrenceRenderer.game.players[0].nuclearPending}));
report.intercept=await page.evaluate(()=>{
  const r=__deterrenceRenderer,g=r.game;for(let i=0;i<700&&!g.effects.some(e=>e.style==='nuclearIntercept');i++)__qaAdvance(.05);
  r.render(performance.now());return {intercepted:g.effects.some(e=>e.style==='nuclearIntercept'),ammo:g.ownedUnits(1,'abm')[0].ammo,blasts:g.effects.filter(e=>e.type==='nuclearBlast').length,spent:g.players[0].nuclearSpent};
});check(report.intercept.intercepted&&report.intercept.ammo===0&&!report.intercept.blasts&&report.intercept.spent,'反导闭环未通过');
await page.screenshot({path:`${folder}/03-interception.png`});
report.blast=await page.evaluate(()=>{
  const r=__deterrenceRenderer,g=r.game,p=g.players[0];p.nuclearSpent=false;p.nuclearCharge=240;p.credits=16000;g.updateFog();
  if(!g.launchNuclear(2600,2080))throw Error('第二个独立验收场景未启动');
  for(let i=0;i<700&&!g.effects.some(e=>e.type==='nuclearBlast');i++)__qaAdvance(.05);
  const blast=g.effects.find(e=>e.type==='nuclearBlast');if(blast)blast.age=2.1;r.render(performance.now());
  const gl=r.webgl.getContext(),pixels=new Uint8Array(r.canvas.width*r.canvas.height*4);gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();for(let i=0;i<pixels.length;i+=2048)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
  return {visible:!!blast,colors:colors.size,glError:gl.getError(),hq:g.ownedBuildings(1,'hq').find(b=>b.x===2600)?.hp,errors:__deterrenceErrors};
});check(report.blast.visible&&report.blast.colors>50&&!report.blast.glError&&!report.blast.errors.length,'核打击场景渲染失败');
await page.screenshot({path:`${folder}/04-nuclear-impact.png`});
await page.evaluate(()=>{__deterrenceRenderer.setQuality('high');__deterrenceRenderer.render(performance.now());});
report.high=await page.evaluate(()=>({quality:__deterrenceRenderer.quality,composer:!!__deterrenceRenderer.composer,glError:__deterrenceRenderer.webgl.getContext().getError()}));check(!report.high.glError,'高画质失败');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});await page.evaluate(()=>{__deterrenceRenderer.resize();__deterrenceRenderer.render(performance.now());});
await page.screenshot({path:`${folder}/05-desktop-1280.png`});report.layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth,height:innerHeight}));check(!report.layout.overflow,'小桌面横向溢出');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await page.click('#catalog-btn');await page.waitForSelector('#catalog-detail:not([hidden])',{state:'visible'});await page.selectOption('#catalog-map','strategic');await page.fill('#catalog-search','战略威慑发射井');await page.click('[data-entry="building:nuclearSilo"]');
await page.screenshot({path:`${folder}/06-silo-catalog.png`});report.catalog=await page.evaluate(()=>({title:document.querySelector('#catalog-summary h3').textContent,error:document.querySelector('#catalog-model-status').textContent}));check(!report.catalog.error,'发射井图鉴失败');
await fs.writeFile(`${root}/releases/deterrence-browser-qa.json`,JSON.stringify(report,null,2));console.log(report);
