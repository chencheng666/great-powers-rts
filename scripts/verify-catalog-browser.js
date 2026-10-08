const { root, taskSpaceId, pageLabel = 'p1' } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page(pageLabel);
const fs = await import('node:fs/promises'), folder = `${root}/releases/catalog-qa`;
await fs.mkdir(folder, {recursive:true});
const check = (value, message) => { if (!value) throw new Error(message); };
let backup;
const results = [];

async function shot(name) {
  const report = await page.evaluate(() => {
    const p = __catalogPreview;
    p.renderer.render(p.scene, p.camera);
    const gl = p.renderer.getContext(), pixels = new Uint8Array(p.canvas.width * p.canvas.height * 4);
    gl.readPixels(0,0,p.canvas.width,p.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const colors = new Set(); let opaque = 0;
    for(let i=0;i<pixels.length;i+=32) if(pixels[i+3]) { opaque++; colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`); }
    const dialog = document.querySelector('#catalog-dialog'), r = dialog.getBoundingClientRect();
    const overflow = document.documentElement.scrollWidth > innerWidth || [...dialog.querySelectorAll('.catalog-heading,.catalog-filters,.catalog-page,#catalog-summary')].some(e => e.scrollWidth > e.clientWidth+1);
    return {colors:colors.size,opaque,glError:gl.getError(),width:innerWidth,height:innerHeight,overflow,inViewport:r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,errors:__catalogErrors};
  });
  check(report.colors>100&&report.opaque>100&&!report.glError&&!report.overflow&&report.inViewport&&!report.errors.length, `${name} 预览或布局异常：${JSON.stringify(report)}`);
  await page.screenshot({path:`${folder}/${name}.png`}); results.push({name,...report});
}

try {
  await page.goto('http://localhost:4173/');
  backup = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')).map(k=>[k,localStorage.getItem(k)])));
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.evaluate(async () => {
    window.__qaVisibility = e=>e.stopImmediatePropagation();
    document.addEventListener('visibilitychange',__qaVisibility,true);
    const resources = performance.getEntriesByType('resource');
    const load = path=>import(resources.find(e=>new URL(e.name).pathname===path).name);
    const {Renderer} = await load('/src/render.js'), original = Renderer.prototype.render;
    const {CatalogPreview} = await load('/src/catalog-preview.js'), show = CatalogPreview.prototype.show;
    window.__catalogErrors=[];
    addEventListener('error',e=>__catalogErrors.push(e.message));
    addEventListener('unhandledrejection',e=>__catalogErrors.push(String(e.reason)));
    Renderer.prototype.render=function(...args){window.__catalogRenderer=this;return original.apply(this,args);};
    CatalogPreview.prototype.show=function(...args){window.__catalogPreview=this;return show.apply(this,args);};
  });
  console.log(await page.snapshot());
  await page.click('#menu-catalog-btn');
  await page.waitForFunction(()=>document.querySelector('#catalog-list')?.children.length===45&&window.__catalogPreview?.frame);
  await shot('01-home-tank');
  await page.click('[data-preview="rotate"]');
  const position=await page.evaluate(()=>__catalogPreview.camera.position.toArray());
  await page.waitForFunction(before=>__catalogPreview.camera.position.toArray().some((v,i)=>Math.abs(v-before[i])>.1),position);
  await page.click('[data-preview="rotate"]');
  const distance=await page.evaluate(()=>__catalogPreview.camera.position.length());
  await page.click('[data-preview="zoom-in"]');
  check(await page.evaluate(before=>__catalogPreview.camera.position.length()<before,distance),'模型没有放大');
  await page.click('[data-preview="reset"]');
  check(await page.evaluate(()=>Math.abs(__catalogPreview.camera.position.length()-__catalogPreview.resetDistance)<.01),'视角没有复位');
  await page.selectOption('#catalog-faction','nato'); await page.fill('#catalog-search','himars');
  check(await page.evaluate(()=>document.querySelector('#catalog-list').children.length===1&&document.querySelector('#catalog-summary h3').textContent==='M142 HIMARS'),'型号搜索未应用阵营');
  await shot('02-himars'); console.log(await page.snapshot());
  await page.click('[data-related="building:armory"]');
  check(await page.evaluate(()=>document.querySelector('#catalog-summary h3').textContent==='兵工厂'&&document.querySelector('#catalog-search').value===''),'前置跳转没有清除搜索');
  await page.fill('#catalog-search','不存在的型号');
  check(await page.evaluate(()=>!document.querySelector('#catalog-loading').hidden&&document.querySelector('#catalog-detail').hidden&&__catalogPreview.frame===null),'空搜索未停止预览');
  await page.fill('#catalog-search',''); await page.selectOption('#catalog-map','meridian');
  await page.click('[data-category="infantry"]'); await page.click('[data-entry="unit:rifle"]');
  check(await page.evaluate(()=>document.querySelector('#catalog-summary').textContent.includes('电池')&&!document.querySelector('#catalog-summary').textContent.includes('弹药批次')),'机器人电池说明错误');
  await shot('03-moon-robot'); console.log(await page.snapshot());
  await page.click('[data-category="building"]'); await page.click('[data-entry="building:dock"]');
  check(await page.evaluate(()=>document.querySelector('.catalog-availability').textContent.includes('海域')&&!document.querySelector('#catalog-model-status').textContent),'无海域建筑未说明限制或模型缺失');
  await page.selectOption('#catalog-map','archipelago'); await page.selectOption('#catalog-faction','china');
  await page.click('[data-category="naval"]'); await page.click('[data-entry="unit:destroyer"]');
  await shot('04-destroyer');
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await shot('05-desktop-1280');
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1024,height:768,deviceScaleFactor:1,mobile:false});
  await page.click('[data-category="building"]'); await page.click('[data-entry="building:factory"]');
  await shot('06-desktop-1024');
  const models=await page.evaluate(async()=>{
    const resources=performance.getEntriesByType('resource'),load=path=>import(resources.find(e=>new URL(e.name).pathname===path).name);
    const {catalogEntries}=await load('/src/catalog-data.js'),{FACTIONS,MAPS}=await load('/src/data.js');
    const {visualLibrary}=await load('/src/visual-assets.js');
    const unique=new Map();for(const faction of Object.keys(FACTIONS))for(const mapId of Object.keys(MAPS))for(const entry of catalogEntries({faction,mapId}))unique.set(entry.model,entry);
    const failures=[];for(const [name,entry] of unique){
      if(!visualLibrary().models.has(name)){failures.push(`${name}:缺失`);continue;}
      __catalogPreview.show(entry);__catalogPreview.renderer.render(__catalogPreview.scene,__catalogPreview.camera);
      const bounds=__catalogPreview.bounds,point=__catalogPreview.camera.position.clone();let extent=0;
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {point.set(x,y,z).project(__catalogPreview.camera);extent=Math.max(extent,Math.abs(point.x),Math.abs(point.y));}
      if(extent>.86)failures.push(`${name}:默认镜头裁切模型`);
      const gl=__catalogPreview.renderer.getContext(),pixels=new Uint8Array(__catalogPreview.canvas.width*__catalogPreview.canvas.height*4);
      gl.readPixels(0,0,__catalogPreview.canvas.width,__catalogPreview.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const colors=new Set();for(let i=0;i<pixels.length;i+=64)if(pixels[i+3])colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
      if(colors.size<20||gl.getError())failures.push(`${name}:空白或渲染失败`);
    }
    return{count:unique.size,failures};
  });check(!models.failures.length,`模型验收失败：${JSON.stringify(models)}`);
  await page.keyboard.press('Escape');
  check(await page.evaluate(()=>!document.querySelector('#catalog-dialog').open&&__catalogPreview.frame===null),'关闭图鉴未停止动画');
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await page.selectOption('#map-select','valley'); await page.click('#start-btn');
  await page.waitForFunction(()=>window.__catalogRenderer?.entities.size>0,undefined,{timeout:30000});
  await page.evaluate(()=>{const g=__catalogRenderer.game;g.paused=false;g.aiTimer=100000;g.aiWaveTimer=100000;const tank=g.ownedUnits(0,'tank')[0];g.selected=[tank.id];g.events.selection();});
  console.log(await page.snapshot());
  await page.click('[data-action="catalog"]');
  check(await page.evaluate(()=>__catalogRenderer.game.paused&&document.querySelector('#catalog-summary h3').textContent==='99A 主战坦克'),'选中装备未直接打开对应资料并暂停');
  const gameTime=await page.evaluate(()=>__catalogRenderer.game.time);
  await page.focus('[data-preview="rotate"]'); await page.keyboard.press('A'); await page.keyboard.press('P'); await page.keyboard.press('B');
  check(await page.evaluate(before=>__catalogRenderer.game.time===before&&__catalogRenderer.game.orderMode==null,gameTime),'图鉴中热键影响对局');
  await shot('07-battle-catalog'); await page.keyboard.press('Escape');
  check(await page.evaluate(()=>!__catalogRenderer.game.paused),'关闭图鉴未恢复原本运行的对局');
  await page.evaluate(()=>{__catalogRenderer.game.paused=true;});
  await page.click('#catalog-btn'); await page.click('[data-catalog-close]');
  check(await page.evaluate(()=>__catalogRenderer.game.paused),'原本已暂停的对局被误恢复');
  for(let i=0;i<3;i++){await page.click('#catalog-btn');await page.click('[data-catalog-close]');}
  check(await page.evaluate(()=>!__catalogErrors.length&&__catalogPreview.frame===null),'重复开关图鉴产生异常或残留动画');
  console.log(JSON.stringify({results,models,tests:{search:true,filters:true,related:true,empty:true,rotate:true,zoom:true,reset:true,paused:true,hotkeys:true,repeat:true}},null,2));
} finally {
  // 停止测试对局，再恢复用户原有存档与设置，避免退出页面重新覆盖。
  await page.evaluate(()=>{if(window.__catalogRenderer?.game){__catalogRenderer.game.running=false;__catalogRenderer.game.paused=true;}document.querySelector('[data-catalog-close]')?.click();document.removeEventListener('visibilitychange',window.__qaVisibility,true);});
  if(backup)await page.evaluate(values=>{for(const key of Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')))if(!Object.hasOwn(values,key))localStorage.removeItem(key);for(const[key,value]of Object.entries(values))localStorage.setItem(key,value);},backup);
}
