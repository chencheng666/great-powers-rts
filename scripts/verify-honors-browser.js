const {root,taskSpaceId,pageLabel='p1'}=globalThis.GAME_QA;
const task=await taskSpace(taskSpaceId),page=task.page(pageLabel),fs=await import('node:fs/promises');
const folder=`${root}/releases/honors-qa`,key='great-powers-player-honors-v1',results=[];
await fs.mkdir(folder,{recursive:true});
const check=(value,message)=>{if(!value)throw new Error(message);};
let backup;
async function shot(name,selector) {
  await page.waitForFunction(selector=>[...document.querySelector(selector).querySelectorAll('.result-badge')].every(e=>e.getAnimations().every(a=>a.playState==='finished')),selector);
  const report=await page.evaluate(selector=>{
    const element=document.querySelector(selector),rect=element.getBoundingClientRect();
    const overflow=[...element.querySelectorAll('h2,h3,h4,button,.honor-rank,.honor-reward-lines,.honor-profile-stats')].some(e=>e.scrollWidth>e.clientWidth+1);
    return {width:innerWidth,height:innerHeight,inViewport:rect.x>=0&&rect.y>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight,overflow,errors:window.__honorErrors};
  },selector);
  check(report.inViewport&&!report.overflow&&!report.errors.length,`${name} 布局异常：${JSON.stringify(report)}`);
  await page.screenshot({path:`${folder}/${name}.png`});results.push({name,...report});
}
async function profile() {return page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);}
async function win() {await page.evaluate(()=>{const g=__honorRenderer.game;for(const b of g.ownedBuildings(1))b.hp=0;g.checkVictory();});}

try {
  await page.goto('http://localhost:4173/');
  backup=await page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')).map(k=>[k,localStorage.getItem(k)])));
  await page.evaluate(async key=>{
    const resources=performance.getEntriesByType('resource'),load=path=>import(resources.find(e=>new URL(e.name).pathname===path).name);
    const {emptyHonors}=await load('/src/player-honors.js');localStorage.setItem(key,JSON.stringify(emptyHonors()));
    dispatchEvent(new StorageEvent('storage',{key}));
    window.__honorErrors=[];
    addEventListener('error',e=>__honorErrors.push(e.message));addEventListener('unhandledrejection',e=>__honorErrors.push(String(e.reason)));
    window.__qaVisibility=e=>e.stopImmediatePropagation();document.addEventListener('visibilitychange',__qaVisibility,true);
    const {Renderer}=await load('/src/render.js'),render=Renderer.prototype.render;
    Renderer.prototype.render=function(...args){window.__honorRenderer=this;return render.apply(this,args);};
    const {GameAudio}=await load('/src/audio.js'),celebrate=GameAudio.prototype.celebrate;
    window.__honorChimes=0;GameAudio.prototype.celebrate=function(...args){++__honorChimes;return celebrate.apply(this,args);};
  },key);
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  console.log(await page.snapshot());
  await page.click('#honor-profile-btn');
  await shot('01-rank-ladder','#honor-dialog');
  const atlas=await page.evaluate(async()=>{
    const src=getComputedStyle(document.querySelector('.rank-badge')).backgroundImage.match(/url\(["']?(.*?)["']?\)/)[1];
    const image=new Image();image.src=src;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const cells=[];for(let row=0;row<2;row++)for(let col=0;col<4;col++){
      const data=ctx.getImageData(Math.floor(col*image.width/4),Math.floor(row*image.height/2),Math.floor(image.width/4),Math.floor(image.height/2)).data;
      let opaque=0,transparent=0,hash=0;for(let i=0;i<data.length;i+=4){if(data[i+3])opaque++;else transparent++;hash=(Math.imul(hash,31)+data[i]+data[i+1]+data[i+2])>>>0;}cells.push({opaque,transparent,hash});
    }return{width:image.width,height:image.height,cells};
  });
  check(atlas.cells.every(c=>c.opaque>1000&&c.transparent>1000)&&new Set(atlas.cells.map(c=>c.hash)).size===8,'徽章图集未正确加载或单元重复');
  for(const [width,height] of [[1280,800],[1024,768]]){await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await shot(`02-ladder-${width}`,'#honor-dialog');}
  await page.click('[data-honor-tab="rules"]');check(await page.evaluate(()=>document.querySelector('#honor-view').textContent.includes('240')),'积分规则缺失');
  await page.click('[data-honor-tab="history"]');check(await page.evaluate(()=>document.querySelector('.honor-empty').textContent.includes('第一')),'无战绩状态缺失');
  await page.keyboard.press('Escape');
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  await page.selectOption('#map-select','valley');await page.selectOption('#difficulty-select','recruit');await page.click('#start-btn');
  await page.waitForFunction(()=>window.__honorRenderer?.entities.size>0,undefined,{timeout:30000});
  const save=await page.evaluate(()=>{const g=__honorRenderer.game;g.aiTimer=g.aiWaveTimer=100000;g.paused=false;return g.toSave();});
  await fs.writeFile(`${folder}/test-battle.json`,JSON.stringify(save));
  await page.click('#honor-btn');check(await page.evaluate(()=>__honorRenderer.game.paused),'打开荣誉未暂停');
  const time=await page.evaluate(()=>__honorRenderer.game.time);await page.keyboard.press('P');await page.keyboard.press('A');
  check(await page.evaluate(time=>__honorRenderer.game.time===time&&__honorRenderer.game.orderMode===null,time),'荣誉面板内热键影响战局');
  await page.keyboard.press('Escape');check(await page.evaluate(()=>!__honorRenderer.game.paused),'关闭荣誉未恢复');
  await page.evaluate(()=>{__honorRenderer.game.paused=true;});await page.click('#honor-btn');await page.click('[data-honor-close]');
  check(await page.evaluate(()=>__honorRenderer.game.paused),'原本暂停的战局被恢复');
  await win();check((await profile()).points===180&&(await profile()).wins===1,'首胜积分错误');
  check(await page.evaluate(()=>document.querySelector('.result-honor').textContent.includes('晋升')&&document.querySelector('.honor-award-total').textContent.includes('+180')&&__honorChimes===1),'首胜授勋或音效缺失');
  await shot('03-first-victory','.modal-card');console.log(await page.snapshot());
  const battlePixels=await page.evaluate(()=>{
    const r=__honorRenderer;r.render();const gl=r.webgl.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const colors=new Set();for(let i=0;i<pixels.length;i+=64)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return{colors:colors.size,error:gl.getError()};
  });check(battlePixels.colors>100&&!battlePixels.error,'战场三维画面为空白');
  await page.click('[data-modal="honors"]');
  const downloadPromise=page.waitForEvent('download',{timeout:30000});await page.click('[data-honor-command="export"]');const download=await downloadPromise;await download.saveAs(`${folder}/test-honors.json`);
  const exported=JSON.parse(await fs.readFile(`${folder}/test-honors.json`,'utf8'));check(exported.profile.points===180,'导出档案不匹配');
  await page.click('[data-honor-tab="history"]');check(await page.evaluate(()=>document.querySelector('.honor-history').textContent.includes('+180')),'战绩未记录');
  await page.keyboard.press('Escape');await page.click('[data-modal="menu"]');
  await page.setInputFiles('#save-file',[`${folder}/test-battle.json`]);
  await page.waitForFunction(()=>document.querySelector('#modal-content h2')?.textContent==='战局已恢复');
  await page.click('[data-modal="resume"]');await win();
  check((await profile()).points===180&&(await profile()).wins===1,'读档重复领奖');
  check(await page.evaluate(()=>document.querySelector('.result-honor').textContent.includes('本场荣誉已记录')&&__honorChimes===1),'重复结算提示或音效错误');
  await page.click('[data-modal="restart"]');await page.waitForFunction(()=>__honorRenderer.game.winner===null&&__honorRenderer.game.running);
  await page.evaluate(key=>{window.__qaOriginalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===key)throw new DOMException('验收：模拟存储满','QuotaExceededError');return __qaOriginalSet.call(this,k,v);};},key);
  await win();check((await profile()).points===180,'写入失败产生未保存积分');check(await page.evaluate(()=>!!document.querySelector('#honor-save-warning')&&!document.querySelector('.result-honor')),'存储失败没有清晰提示');
  await page.evaluate(()=>{Storage.prototype.setItem=__qaOriginalSet;delete window.__qaOriginalSet;});await page.click('[data-modal="retry-honor"]');
  check((await profile()).points===280&&(await profile()).wins===2,'重试保存失败或重复首胜奖励');
  await page.click('[data-modal="honors"]');
  await page.setInputFiles('[data-honor-file]',[`${folder}/test-honors.json`]);await page.waitForSelector('.honor-import-confirm');
  check((await profile()).points===280,'确认前就替换档案');await page.click('[data-honor-command="cancel-import"]');check((await profile()).points===280,'取消导入改变档案');
  await page.setInputFiles('[data-honor-file]',[`${folder}/test-honors.json`]);await page.waitForSelector('.honor-import-confirm');await page.click('[data-honor-command="confirm-import"]');
  check((await profile()).points===180&&await page.evaluate(()=>document.querySelector('.honor-profile-stats').textContent.includes('180')),'确认恢复未更新');
  await page.setInputFiles('[data-honor-file]',[`${folder}/test-battle.json`]);await page.waitForSelector('.honor-warning');check((await profile()).points===180,'错误类型文件覆盖荣誉');
  await page.keyboard.press('Escape');await page.click('[data-modal="restart"]');await page.waitForFunction(()=>__honorRenderer.game.winner===null);
  await page.evaluate(()=>{const g=__honorRenderer.game;for(const b of g.ownedBuildings(0))b.hp=0;g.checkVictory();});
  check((await profile()).points===180&&(await profile()).wins===1,'失败扣分或加胜场');
  check(await page.evaluate(()=>document.querySelector('#modal-content').textContent.includes('不会减少')),'失败鼓励缺失');
  await page.click('[data-modal="menu"]');await page.click('#honor-profile-btn');
  await page.evaluate(async key=>{
    const {emptyHonors,applyHonorResult}=await import('/src/player-honors.js');let p=emptyHonors();
    for(let i=0;i<45;i++)p=applyHonorResult(p,{battleId:`qa-legendary-${String(i).padStart(4,'0')}`,winner:0,difficulty:'veteran',mode:'control',mapId:'meridian',faction:'china',time:700},Date.now()).profile;
    localStorage.setItem(key,JSON.stringify(p));dispatchEvent(new StorageEvent('storage',{key}));
  },key);
  await page.keyboard.press('Escape');await page.click('#honor-profile-btn');
  check(await page.evaluate(()=>document.querySelector('.honor-profile-lead h3').textContent==='传奇元帅'&&document.querySelectorAll('.honor-rank.earned').length===7),'最高称号未展示');
  await shot('04-legendary-ladder','#honor-dialog');
  await page.cdp('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  check(await page.evaluate(()=>{const el=document.createElement('span');el.className='rank-badge result-badge';document.body.append(el);const disabled=getComputedStyle(el).animationName==='none';el.remove();return disabled;}),'减少动态效果设置未生效');
  console.log(JSON.stringify({results,atlas,battlePixels,tests:{firstWin:true,dedupe:true,pause:true,hotkeys:true,writeFailureRetry:true,export:true,importConfirmation:true,invalidImport:true,loss:true,highestRank:true,reducedMotion:true}},null,2));
} finally {
  // 停止验收战局，恢复用户原有荣誉、存档和设置，不留下虚构战绩。
  await page.evaluate(()=>{if(window.__qaOriginalSet)Storage.prototype.setItem=__qaOriginalSet;if(window.__honorRenderer?.game){__honorRenderer.game.running=false;__honorRenderer.game.paused=true;}document.querySelector('[data-honor-close]')?.click();document.removeEventListener('visibilitychange',window.__qaVisibility,true);});
  if(backup)await page.evaluate(values=>{for(const k of Object.keys(localStorage).filter(k=>k.startsWith('great-powers-')))if(!Object.hasOwn(values,k))localStorage.removeItem(k);for(const[k,v]of Object.entries(values))localStorage.setItem(k,v);},backup);
}
