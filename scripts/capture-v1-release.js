const {root,taskSpaceId}=globalThis.RELEASE_CAPTURE;
const fs=await import('node:fs/promises'),t=await taskSpace(taskSpaceId),p=t.page('p3'),out=`${root}/docs/wechat-v1-20261013/images`;
await fs.mkdir(out,{recursive:true});await p.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:60000});
await p.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
await p.evaluate(async()=>{
  const load=path=>import(performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname===path).name);
  const {Renderer}=await load('/src/render.js'),render=Renderer.prototype.render;Renderer.prototype.render=function(...args){window.__releaseRenderer=this;return render.apply(this,args);};
  const {CatalogPreview}=await load('/src/catalog-preview.js'),show=CatalogPreview.prototype.show;CatalogPreview.prototype.show=function(...args){window.__releasePreview=this;return show.apply(this,args);};
  window.__releaseErrors=[];addEventListener('error',e=>__releaseErrors.push(e.message));addEventListener('unhandledrejection',e=>__releaseErrors.push(String(e.reason)));
});
if(await p.evaluate(()=>document.querySelector('#nickname-dialog').open)){await p.fill('#nickname-dialog input','1.0验收');await p.click('#nickname-dialog button[type=submit]');}
await p.screenshot({path:`${out}/01-home.png`});
await p.click('#menu-catalog-btn');await p.waitForFunction(()=>window.__releasePreview?.frame);
for(const [type,name,file]of [['fighter','fighter_china','v1-fighter'],['freightPlane','freightPlane','v1-transport'],['scout','scout','v1-spy'],['rifle','rifle','v1-personnel']]){
  await p.click(`[data-category=${['scout','rifle'].includes(type)?'infantry':'air'}]`);await p.click(`[data-entry="unit:${type}"]`);
  await p.waitForFunction(name=>__releasePreview.model.name===name,name);await p.evaluate(()=>__releasePreview.renderer.render(__releasePreview.scene,__releasePreview.camera));
  const result=await p.evaluate(()=>{const r=__releasePreview.renderer,gl=r.getContext(),b=new Uint8Array(r.domElement.width*r.domElement.height*4);gl.readPixels(0,0,r.domElement.width,r.domElement.height,gl.RGBA,gl.UNSIGNED_BYTE,b);const s=new Set();for(let i=0;i<b.length;i+=120)s.add(`${b[i]},${b[i+1]},${b[i+2]}`);return{colors:s.size,error:gl.getError()};});
  if(result.error||result.colors<80)throw Error(`图鉴渲染失败：${file}`);await p.screenshot({path:`${out}/${file}.png`});console.log({file,...result});
}
await p.selectOption('#catalog-map','meridian');await p.click('[data-entry="unit:rifle"]');await p.waitForFunction(()=>__releasePreview.model.name==='robot_rifle');await p.screenshot({path:`${out}/v1-robot.png`});
await p.click('[data-catalog-close]');await p.click('#honor-profile-btn');await p.screenshot({path:`${out}/v1-honors.png`});await p.click('[data-honor-close]');
await p.selectOption('#map-select','valley');await p.click('#start-btn');await p.waitForFunction(()=>window.__releaseRenderer?.entities.size>0);
const point=await p.evaluate(()=>{const r=__releaseRenderer,g=r.game;g.paused=true;r.setViewMode('immersive');r.centerOn(470,g.homeY);const b=g.ownedBuildings(0,'factory')[0];g.selected=[];g.events.selection?.();r.render();const q=r.worldToScreen(b.x,b.y,30),rect=r.canvas.getBoundingClientRect();return{x:q.x+rect.x,y:q.y+rect.y};});
await p.mouse.move(point.x,point.y);await p.waitForSelector('#building-info',{state:'visible'});await p.screenshot({path:`${out}/v1-base.png`});
const panel=await p.evaluate(()=>{const r=document.querySelector('#building-info').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};});
await p.mouse.move(panel.x,panel.y);await p.waitForFunction(()=>!document.querySelector('#building-info').hidden);await p.screenshot({path:`${out}/v1-building-info.png`});
console.log(await p.evaluate(()=>({buildingPanelVisible:!document.querySelector('#building-info').hidden,glError:__releaseRenderer.webgl.getContext().getError(),errors:__releaseErrors})));
for(const name of ['v1-fighter','v1-transport'])await fs.copyFile(`${out}/${name}.png`,`${root}/public/official/assets/${name}.png`);
