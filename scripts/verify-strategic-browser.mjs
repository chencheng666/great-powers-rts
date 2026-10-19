const {root,spaceId}=globalThis.STRATEGIC_QA;
const task=await taskSpace(spaceId),page=task.page('p1'),fs=await import('node:fs/promises');
const folder=`${root}/releases/strategic-qa`,report={};await fs.mkdir(folder,{recursive:true});
await page.goto('http://localhost:4188/');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await page.click('#menu-catalog-btn');
await page.waitForSelector('#catalog-detail:not([hidden])',{state:'visible'});
await page.selectOption('#catalog-map','strategic');
for(const [faction,query,type,file] of [['nato','F-22','fighter','03-f22-catalog'],['nato','阿帕奇','helicopter','04-apache-catalog'],['china','东风','ballistic','05-dongfeng-catalog'],['china','九天','swarmCarrier','06-jiutian-catalog']]) {
  await page.selectOption('#catalog-faction',faction);await page.fill('#catalog-search',query);await page.click(`[data-entry="unit:${type}"]`);
  await page.waitForFunction(name=>document.querySelector('#catalog-canvas').getAttribute('aria-label').includes(name),query);
  await page.screenshot({path:`${folder}/${file}.png`});
  report[type]=await page.evaluate(()=>({title:document.querySelector('#catalog-summary h3').textContent,failed:document.querySelector('#catalog-model-status').textContent,canvas:!!document.querySelector('#catalog-canvas')}));
  if(report[type].failed)throw new Error(report[type].failed);
}
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
await page.screenshot({path:`${folder}/07-catalog-1280.png`});
report.layout=await page.evaluate(()=>{const r=document.querySelector('#catalog-dialog').getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth};});
if(report.layout.left<0||report.layout.right>report.layout.width||report.layout.overflow)throw new Error('图鉴横向溢出');
await page.click('[data-catalog-close]');
await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await page.evaluate(async()=>{
  window.__strategyErrors=[];addEventListener('error',e=>__strategyErrors.push(e.message));addEventListener('unhandledrejection',e=>__strategyErrors.push(String(e.reason)));
  const source=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/render.js').name;
  const {Renderer}=await import(source),render=Renderer.prototype.render;
  Renderer.prototype.render=function(...args){window.__strategyRenderer=this;return render.apply(this,args);};
});
await page.selectOption('#map-select','strategic');await page.click('#start-btn');
await page.waitForFunction(()=>window.__strategyRenderer?.game.time>.1,undefined,{timeout:60000});
report.start=await page.evaluate(()=>({map:__strategyRenderer.game.mapId,world:__strategyRenderer.game.world,resources:__strategyRenderer.game.resourceSites.length}));
await page.screenshot({path:`${folder}/01-strategic-start.png`});
report.scene=await page.evaluate(()=>{
  const r=__strategyRenderer,g=r.game;window.__strategyBattleId=g.battleId;g.update=()=>{};g.units=[];
  g.players[0].faction='nato';g.players[1].faction='china';for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}
  for(const [type,x,y,owner] of [['fighter',1450,1920,0],['helicopter',1450,2110,0],['ballistic',1360,2340,1],['abm',1630,2340,0],['counterIntel',1900,2340,0],['swarmCarrier',1850,1920,1],['swarmScout',1870,2130,1],['swarmDecoy',1990,2190,1]])g.addUnit(owner,type,x,y);
  g.selected=[];r.centerOn(1660,2150);r.camera.zoom=1.1;r.updateCamera();r.setQuality('standard');r.render(performance.now());
  const gl=r.webgl.getContext(),data=new Uint8Array(r.canvas.width*r.canvas.height*4);gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
  const colors=new Set();for(let i=0;i<data.length;i+=2048)colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
  return {models:g.units.map(u=>({type:u.type,visible:r.entities.get(u.id)?.model.visible})),colors:colors.size,glError:gl.getError(),errors:__strategyErrors};
});
if(report.scene.glError||report.scene.errors.length||report.scene.colors<30||report.scene.models.some(m=>!m.visible))throw new Error('战略场景渲染失败');
await page.screenshot({path:`${folder}/02-equipment-battlefield.png`});
report.motion=await page.evaluate(async()=>{const r=__strategyRenderer,g=r.game,h=g.units.find(u=>u.type==='helicopter'),entry=r.entities.get(h.id),rotor=entry.rotors[0],before=rotor.rotation.y;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {before,after:rotor.rotation.y};});
if(report.motion.before===report.motion.after)throw new Error('旋翼动画没有运行');
await fs.writeFile(`${folder}/验收记录.json`,JSON.stringify(report,null,2));console.log(report);
