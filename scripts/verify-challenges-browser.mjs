const {root,taskSpaceId,pageLabel='p2'}=globalThis.GAME_QA;
const fs=await import('node:fs/promises'),page=(await taskSpace(taskSpaceId)).page(pageLabel),folder=`${root}/releases/challenge-review-20261020`;
let originalProfile;
try {
await fs.mkdir(folder,{recursive:true});
await page.evaluate(()=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;});
await page.goto('http://127.0.0.1:4173/');
originalProfile=await page.evaluate(()=>localStorage.getItem('great-powers-challenge-profile-v1'));
await page.cdp('Page.bringToFront',{});
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name;
  const {Renderer}=await import(url),render=Renderer.prototype.render;
  Renderer.prototype.render=function(...a){window.__qaRenderer=this;return render.apply(this,a);};
  window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));
  document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);
  window.__honorsBefore=localStorage.getItem('great-powers-player-honors-v1');
  const set=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(this===localStorage&&/^great-powers-save-(manual|auto)-v1$/.test(key))return;return set.call(this,key,value);};
  window.__restoreQASaves=()=>{Storage.prototype.setItem=set;};
});
const clickGoal=async(x,y)=>{
  await page.click('#attack-btn');
  const p=await page.evaluate(({x,y})=>{const r=__qaRenderer;r.game.paused=false;const p=r.worldToScreen(x,y),rect=r.canvas.getBoundingClientRect();return{x:p.x+rect.x,y:p.y+rect.y};},{x,y});
  await page.mouse.click(p.x,p.y);
};
const simulateUntil=async time=>page.evaluate(time=>{
  const g=__qaRenderer.game;g.paused=false;
  for(let i=0;i<3200&&g.running&&g.time<time;i++)g.update(.05);
  if(g.running)g.paused=true;
  return{time:g.time,winner:g.winner,stars:g.challenge.stars,reason:g.challenge.reason};
},time);
await page.click('#challenge-btn');await page.screenshot({path:`${folder}/01-challenges.png`});
await page.click('[data-modal=challenge-corridor]');await page.waitForFunction(()=>window.__qaRenderer?.game.challenge?.id==='corridor');
await page.evaluate(()=>{__qaRenderer.game.paused=true;});
await page.screenshot({path:`${folder}/02-corridor.png`});
await page.click('[data-challenge-focus=exit]');await clickGoal(1570,1030);
const corridor=await simulateUntil(150);if(corridor.winner!==0)throw Error(`护航未通过：${JSON.stringify(corridor)}`);
await page.waitForSelector('.battle-report');await page.screenshot({path:`${folder}/03-review.png`});
await page.click('[data-report-filter=mission]');
const filters=await page.evaluate(()=>({visible:[...document.querySelectorAll('[data-event-kind]:not([hidden])')].map(x=>x.dataset.eventKind),hidden:document.querySelectorAll('[data-event-kind][hidden]').length}));
if(filters.visible.some(k=>k!=='mission')||!filters.visible.length)throw Error('时间线筛选失败');
await page.click('[data-report-filter=resource]');
if(!await page.evaluate(()=>!document.querySelector('.report-empty').hidden))throw Error('空筛选提示缺失');
await page.click('[data-modal=retry-challenge]');await page.waitForFunction(()=>__qaRenderer.game.challenge.id==='corridor'&&__qaRenderer.game.time<2);
await page.evaluate(()=>{const g=__qaRenderer.game;g.paused=false;g.damage(g.getEntity(g.challenge.targetId),1e6,1);g.checkVictory();});
await page.waitForSelector('[data-modal=challenges]');await page.click('[data-modal=challenges]');await page.click('[data-modal=challenge-airshield]');
await page.waitForFunction(()=>__qaRenderer.game.challenge.id==='airshield');await simulateUntil(38);
await clickGoal(1120,560);await simulateUntil(74);
await clickGoal(1120,900);const airshield=await simulateUntil(120);
if(airshield.winner!==0)throw Error(`防御未通过：${JSON.stringify(airshield)}`);
await page.screenshot({path:`${folder}/04-airshield-review.png`});
const noHonorFarm=await page.evaluate(()=>localStorage.getItem('great-powers-player-honors-v1')===__honorsBefore);
if(!noHonorFarm)throw Error('挑战意外修改普通荣誉');
await page.click('[data-modal=menu]');await page.selectOption('#map-select','strategic');
if(!await page.evaluate(()=>document.querySelector('#nuclear-enabled').checked))await page.click('#nuclear-enabled');
await page.click('#start-btn');await page.waitForFunction(()=>__qaRenderer.game.mapId==='strategic');
await page.evaluate(()=>{
  const g=__qaRenderer.game;g.paused=true;g.players[0].credits=100000;
  g.addBuilding(0,'power',350,1700);g.addBuilding(0,'power',350,1850);g.addBuilding(0,'radar',550,1800);g.addBuilding(0,'lab',550,1650);
  if(!g.startBuild(0,'nuclearSilo'))throw Error('发射井生产前置错误');g.updateBuildQueue(g.players[0],70);
});
await page.waitForSelector('[data-build=nuclearSilo].queued');await page.click('[data-build=nuclearSilo]');
const point=await page.evaluate(()=>{const r=__qaRenderer,p=r.worldToScreen(650,r.game.homeY+180),rect=r.canvas.getBoundingClientRect();return{x:p.x+rect.x,y:p.y+rect.y};});await page.mouse.move(point.x,point.y);
const silo=await page.evaluate(async()=>{
  const r=__qaRenderer,g=r.game;r.updatePlacement();
  const {Game}=await import('/src/game.js'),save=g.toSave(),restored=Game.fromSave(save);
  const hadSprite=!!r.placement.sprite;restored.placingBuilding=true;r.game=restored;
  try{for(let i=0;i<10;i++)r.render(performance.now()+i*16);}finally{r.game=g;}
  const gl=r.webgl.getContext();return{hadSprite,restoredPending:restored.pendingBuilding,errors:__qaErrors.slice(),glError:gl.getError()};
});
if(silo.hadSprite||silo.restoredPending!=='nuclearSilo'||silo.glError||silo.errors.length)throw Error(`发射井验收失败：${JSON.stringify(silo)}`);
await page.screenshot({path:`${folder}/05-silo-preview.png`});
await page.evaluate(()=>{const g=__qaRenderer.game;g.placingBuilding=false;g.pendingBuilding=null;g.selected=[];const b=g.ownedBuildings(0,'factory')[0];__qaRenderer.centerOn(b.x,b.y);});
const hover=await page.evaluate(()=>{
  const r=__qaRenderer,b=r.game.ownedBuildings(0,'factory')[0],a=r.entityAnchor(b),rect=r.canvas.getBoundingClientRect();
  for(let y=-60;y<=60;y+=12)for(let x=-60;x<=60;x+=12)if(r.pickEntity(a.x+x,a.y+y)?.id===b.id)return{x:a.x+x+rect.x,y:a.y+y+rect.y};throw Error('未找到工厂可悬停区域');
});
await page.mouse.move(hover.x,hover.y);await page.waitForSelector('#building-info',{state:'visible'});
await page.evaluate(()=>{window.__hoverTrace=[];let n=0;const tick=()=>{__hoverTrace.push(!document.querySelector('#building-info').hidden);if(++n<12)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
await page.waitForFunction(()=>__hoverTrace.length===12,undefined,{timeout:30000});
const hoverStable=await page.evaluate(()=>__hoverTrace.every(Boolean));
await page.screenshot({path:`${folder}/06-building-info.png`});
const viewportChecks=[];
for(const [width,height]of [[1600,1000],[1280,800]]){
  await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  viewportChecks.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,errors:__qaErrors.slice()})));
}
const report={corridor,airshield,filters,noHonorFarm,silo,hoverStable,viewportChecks};
await fs.writeFile(`${folder}/browser-report.json`,JSON.stringify(report,null,2));console.log(report);
if(!hoverStable||viewportChecks.some(v=>v.overflow>0||v.errors.length))throw Error('悬浮信息或视口验收未通过');
} finally {
  await page.evaluate(({originalProfile})=>{if(window.__qaRenderer)window.__qaRenderer.game.running=false;window.__restoreQASaves?.();if(originalProfile===null)localStorage.removeItem('great-powers-challenge-profile-v1');else if(originalProfile!==undefined)localStorage.setItem('great-powers-challenge-profile-v1',originalProfile);},{originalProfile});
}
