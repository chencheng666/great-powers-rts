const {root,taskSpaceId,pageLabel='p1'}=globalThis.GAME_QA;
const fs=await import('node:fs/promises'),page=(await taskSpace(taskSpaceId)).page(pageLabel),folder=`${root}/releases/challenge-profile-20261020`;
const key='great-powers-challenge-profile-v1';let original;
const install=async()=>page.evaluate(async()=>{
  const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name;
  const {Renderer}=await import(url),render=Renderer.prototype.render;
  Renderer.prototype.render=function(...a){window.__qaRenderer=this;return render.apply(this,a);};
  window.__qaErrors=[];addEventListener('error',e=>__qaErrors.push(e.message));
  document.addEventListener('visibilitychange',e=>e.stopImmediatePropagation(),true);
  const set=Storage.prototype.setItem;
  // 验收只临时写挑战成绩，普通战局与荣誉不被自动存档改写。
  Storage.prototype.setItem=function(k,v){if(this===localStorage&&/^great-powers-save-(manual|auto)-v1$/.test(k))return;return set.call(this,k,v);};
  window.__qaGuardedSet=Storage.prototype.setItem;window.__qaRestoreStorage=()=>{Storage.prototype.setItem=set;};
});
try{
  await fs.mkdir(folder,{recursive:true});await page.goto('http://127.0.0.1:4173/');await page.cdp('Page.bringToFront',{});
  await page.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  original=await page.evaluate(key=>({profile:localStorage.getItem(key),honors:localStorage.getItem('great-powers-player-honors-v1'),manual:localStorage.getItem('great-powers-save-manual-v1'),auto:localStorage.getItem('great-powers-save-auto-v1')}),key);
  const before=original.profile?JSON.parse(original.profile).results.length:0;await install();
  await page.click('#challenge-btn');await page.click('[data-modal=challenge-corridor]');await page.waitForFunction(()=>window.__qaRenderer?.game.challenge?.id==='corridor');
  await page.evaluate(()=>{__qaRenderer.game.paused=true;});await page.click('[data-challenge-focus=exit]');await page.click('#attack-btn');
  const goal=await page.evaluate(()=>{const r=__qaRenderer,p=r.worldToScreen(1570,1030),rect=r.canvas.getBoundingClientRect();r.game.paused=false;return{x:p.x+rect.x,y:p.y+rect.y};});
  await page.mouse.click(goal.x,goal.y);
  const win=await page.evaluate(()=>{const g=__qaRenderer.game;for(let i=0;i<3100&&g.running;i++)g.update(.05);return{winner:g.winner,stars:g.challenge.stars,time:g.time};});
  if(win.winner!==0)throw Error(`正常护航未通过：${JSON.stringify(win)}`);
  await page.waitForSelector('.challenge-result-record');
  const first=await page.evaluate(key=>({raw:localStorage.getItem(key),text:document.querySelector('.challenge-result-record').innerText}),key);
  if(JSON.parse(first.raw).results.length!==before+1)throw Error('首次结算未写入');
  await page.evaluate(()=>__qaRenderer.game.events.end(__qaRenderer.game.winner));
  const duplicate=await page.evaluate(key=>({count:JSON.parse(localStorage.getItem(key)).results.length,text:document.querySelector('.challenge-result-record').innerText}),key);
  if(duplicate.count!==before+1||!duplicate.text.includes('未重复累计'))throw Error('结算去重失败');
  await page.click('.report-losses summary');
  const panel=await page.evaluate(()=>{const r=document.querySelector('.modal-card').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height*.8};});
  await page.mouse.move(panel.x,panel.y);await page.mouse.wheel(0,650);await page.screenshot({path:`${folder}/01-losses.png`});
  const lossText=await page.evaluate(()=>document.querySelector('.report-losses').innerText);if(!lossText.includes('合计补充造价'))throw Error('兵种战损表缺失');
  await page.click('[data-modal=challenges]');await page.screenshot({path:`${folder}/02-records.png`});
  await page.reload();await page.waitForSelector('#challenge-btn');await install();await page.click('#challenge-btn');
  const persisted=await page.evaluate(key=>({count:JSON.parse(localStorage.getItem(key)).results.length,text:document.querySelector('.challenge-personal-best').innerText}),key);
  if(persisted.count!==before+1||!persisted.text.includes('最快'))throw Error('刷新后成绩未恢复');
  const downloadWait=page.waitForEvent('download',{timeout:30000});await page.click('[data-modal=challenge-export]');const download=await downloadWait;await download.saveAs(`${folder}/export.json`);
  const exported=JSON.parse(await fs.readFile(`${folder}/export.json`,'utf8'));if(exported.format!=='great-powers-challenge-profile'||exported.profile.results.length!==before+1)throw Error('原生下载格式错误');
  await page.click('[data-modal=challenge-corridor]');await page.waitForFunction(()=>window.__qaRenderer?.game.challenge?.id==='corridor');
  await page.evaluate(()=>{
    const guarded=__qaGuardedSet;Storage.prototype.setItem=function(k,v){if(k==='great-powers-challenge-profile-v1')throw Error('验收模拟：配额不足');return guarded.call(this,k,v);};
    const g=__qaRenderer.game;g.damage(g.getEntity(g.challenge.targetId),1e6,1);g.checkVictory();
  });
  await page.waitForSelector('#challenge-save-warning');await page.screenshot({path:`${folder}/03-storage-warning.png`});
  const unmodified=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).results.length,key);if(unmodified!==before+1)throw Error('写入失败改写了旧记录');
  await page.evaluate(()=>{Storage.prototype.setItem=__qaGuardedSet;});await page.click('[data-modal=retry-challenge-record]');
  const retried=await page.evaluate(key=>({raw:localStorage.getItem(key),warning:!!document.querySelector('#challenge-save-warning')}),key);
  if(retried.warning||JSON.parse(retried.raw).results.length!==before+2)throw Error('同战局重试保存失败');
  await fs.writeFile(`${folder}/merge.json`,JSON.stringify({format:'great-powers-challenge-profile',version:1,profile:JSON.parse(retried.raw)}));
  await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key,value:first.raw});await page.click('[data-modal=challenges]');
  await page.setInputFiles('#challenge-profile-file',[`${folder}/merge.json`]);await page.waitForSelector('[data-modal=challenge-confirm-import]');
  const preview=await page.evaluate(()=>document.querySelector('#modal-content').innerText);if(!preview.includes('新增 1 场'))throw Error('合并预览数量不正确');
  await page.click('[data-modal=challenge-confirm-import]');
  await page.setInputFiles('#challenge-profile-file',[`${folder}/merge.json`]);await page.waitForSelector('[data-modal=challenge-confirm-import]');await page.click('[data-modal=challenge-confirm-import]');
  const merged=await page.evaluate(key=>({count:JSON.parse(localStorage.getItem(key)).results.length,notice:document.querySelector('#challenge-profile-message').innerText}),key);
  if(merged.count!==before+2||!merged.notice.includes('0 场'))throw Error('合并导入未去重');
  await fs.writeFile(`${folder}/invalid.json`,JSON.stringify({format:'great-powers-honors',version:1}));
  await page.setInputFiles('#challenge-profile-file',[`${folder}/invalid.json`]);await page.waitForFunction(()=>document.querySelector('#challenge-profile-message').textContent.includes('不是挑战成绩'));
  const viewport=[];
  for(const [width,height]of [[1600,1000],[1280,800]]){
    await page.cdp('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    viewport.push(await page.evaluate(()=>({width:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,modalOverflow:document.querySelector('.modal-card').scrollWidth-document.querySelector('.modal-card').clientWidth,errors:__qaErrors.slice()})));
  }
  await page.screenshot({path:`${folder}/04-import-1280.png`});
  const protectedData=await page.evaluate(original=>({honors:localStorage.getItem('great-powers-player-honors-v1')===original.honors,manual:localStorage.getItem('great-powers-save-manual-v1')===original.manual,auto:localStorage.getItem('great-powers-save-auto-v1')===original.auto}),original);
  if(Object.values(protectedData).some(v=>!v)||viewport.some(v=>v.overflow>0||v.modalOverflow>0||v.errors.length))throw Error('存档隔离或页面验收失败');
  const report={win,duplicate:{count:duplicate.count},persisted:{count:persisted.count},exportCount:exported.profile.results.length,storageFailurePreserved:true,retrySaved:true,merged,viewport,protectedData};
  await fs.writeFile(`${folder}/report.json`,JSON.stringify(report,null,2));console.log(report);
}finally{
  if(original!==undefined)await page.evaluate(({key,value})=>{
    if(window.__qaRenderer)window.__qaRenderer.game.running=false;window.__qaRestoreStorage?.();
    if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);
  },{key,value:original.profile});
}
