const {root,taskSpaceId}=globalThis.GAME_QA;
const task=await taskSpace(taskSpaceId),page=task.page('p1'),fs=await import('node:fs/promises');
const folder=`${root}/releases/model-polish-qa`,report={previews:[],layouts:[]};let backup;
const check=(value,message)=>{if(!value)throw new Error(message);};
const shot=name=>page.screenshot({path:`${folder}/${name}.png`});
await fs.mkdir(folder,{recursive:true});
try {
  await page.goto('http://localhost:4173/');await page.waitForSelector('#menu-catalog-btn');
  backup=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')).map(k=>[k,localStorage.getItem(k)])));
  await fs.writeFile(`${folder}/用户设置验收前备份.json`,JSON.stringify(backup));
  await page.evaluate(async()=>{
    window.__polishErrors=[];addEventListener('error',e=>__polishErrors.push(e.message));addEventListener('unhandledrejection',e=>__polishErrors.push(String(e.reason)));
    window.__polishVisibility=e=>e.stopImmediatePropagation();document.addEventListener('visibilitychange',__polishVisibility,true);
    window.__polishSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('great-powers-save-'))return;return __polishSet.call(this,k,v);};
    const load=path=>import(performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname===path).name);
    const {CatalogPreview}=await load('/src/catalog-preview.js'),start=CatalogPreview.prototype.start;
    CatalogPreview.prototype.start=function(...args){window.__polishPreview=this;return start.apply(this,args);};
    const {Renderer}=await load('/src/render.js'),render=Renderer.prototype.render;
    Renderer.prototype.render=function(...args){window.__polishRenderer=this;return render.apply(this,args);};
    window.__polishAudio=(await load('/src/audio.js')).gameAudio;
  });
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.click('#menu-catalog-btn');await page.waitForFunction(()=>!!window.__polishPreview);
  for(const faction of ['china','russia','nato','asia','middleeast']) {
    await page.selectOption('#catalog-faction',faction);
    const types=faction==='china'?['rifle','engineer','scout','tank','fighter','strike','rocket','supply']:['tank'];
    for(const type of types) {
      await page.click(`[data-entry="unit:${type}"]`);
      const result=await page.evaluate(()=>{
        const p=__polishPreview;p.controls.autoRotate=false;p.reset();p.renderer.render(p.scene,p.camera);
        const gl=p.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let visible=0,invalidUV=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i])visible++;
        p.model.traverse(m=>{if(m.isMesh&&(!m.geometry.attributes.uv||m.geometry.attributes.uv.count!==m.geometry.attributes.position.count))invalidUV++;});
        const calls=p.renderer.info.render.calls,triangles=p.renderer.info.render.triangles;
        const before=p.camera.position.clone();p.controls.autoRotate=true;p.controls.update(.5);p.controls.autoRotate=false;p.renderer.render(p.scene,p.camera);
        const rotated=before.distanceTo(p.camera.position)>.001;p.reset();p.renderer.render(p.scene,p.camera);
        return {name:p.model.name,visible,calls,triangles,invalidUV,rotated,error:gl.getError(),status:document.querySelector('#catalog-model-status').textContent};
      });
      check(result.visible>1000&&!result.invalidUV&&result.rotated&&!result.error&&!result.status,'图鉴模型、UV 或旋转异常');
      check(result.triangles<55000&&result.calls<=18,'模型面数或绘制调用超出预算');report.previews.push(result);await shot(`after-${faction}-${type}`);
    }
  }
  for(const [width,height]of [[1280,800],[1024,768]]) {
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    const result=await page.evaluate(()=>{
      const p=__polishPreview;p.resize();p.renderer.render(p.scene,p.camera);
      const {min,max}=p.bounds;let clipped=false;
      for(const x of [min.x,max.x])for(const y of [min.y,max.y])for(const z of [min.z,max.z]){
        const point=p.camera.position.clone().set(x,y,z).project(p.camera);if(Math.abs(point.x)>.97||Math.abs(point.y)>.97)clipped=true;
      }
      const dialog=document.querySelector('#catalog-dialog');return{width:innerWidth,clipped,overflow:dialog.scrollWidth>dialog.clientWidth+1};
    });check(!result.clipped&&!result.overflow,'桌面图鉴溢出或模型裁切');report.layouts.push(result);await shot(`desktop-${width}`);
  }
  await page.click('[data-catalog-close]');
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.selectOption('#map-select','valley');await page.click('#start-btn');
  await page.waitForFunction(()=>window.__polishRenderer?.entities.size>0,undefined,{timeout:30000});
  report.battle=await page.evaluate(()=>{
    const r=__polishRenderer,g=r.game;g.paused=true;g.aiTimer=g.aiWaveTimer=1e9;g.units=[];
    for(const fog of g.fogs){fog.visible.fill(true);fog.explored.fill(true);}g.fogTimer=1e9;
    const x=640,y=g.homeY+280,units=[];
    for(const [type,dx,dy]of [['tank',-110,-40],['tank',80,-30],['rifle',-80,100],['rifle',-30,90],['rifle',20,100],['engineer',80,90],['scout',130,90],['supply',-100,-150]])units.push(g.addUnit(0,type,x+dx,y+dy));
    g.addUnit(1,'tank',x+250,y-110);g.addUnit(1,'rifle',x+245,y-40);
    g.selected=units.map(u=>u.id);g.events.selection?.();r.centerOn(x,y);r.camera.zoom=2.4;r.updateCamera();r.render();
    const rifle=units.find(u=>u.type==='rifle'),entry=r.entities.get(rifle.id),knee=entry.model.getObjectByName('knee_left');
    const before=knee.rotation.z;rifle.x+=2;rifle.movePulse=2;r.render();const bend=knee.rotation.z;
    const gl=r.webgl.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const colors=new Set();for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return{units:units.length,kneeChanges:before!==bend,colors:colors.size,error:gl.getError(),errors:__polishErrors};
  });
  check(report.battle.kneeChanges&&report.battle.colors>100&&!report.battle.error&&!report.battle.errors.length,'实机画面、步态或渲染异常');
  await shot('battlefield-detail');await fs.writeFile(`${folder}/验收报告.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {
  // 验收战局不写入用户进度，恢复全部原有游戏设置与荣誉。
  await page.evaluate(()=>{if(window.__polishRenderer?.game){__polishRenderer.game.running=false;__polishRenderer.game.paused=true;}window.__polishAudio?.stopBattle();if(window.__polishSet)Storage.prototype.setItem=__polishSet;document.removeEventListener('visibilitychange',window.__polishVisibility,true);});
  if(backup)await page.evaluate(values=>{for(const k of Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')))if(!Object.hasOwn(values,k))localStorage.removeItem(k);for(const [k,v]of Object.entries(values))localStorage.setItem(k,v);},backup);
}
