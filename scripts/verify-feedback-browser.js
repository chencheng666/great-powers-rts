const { root, taskSpaceId, pageLabel = 'p2' } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page(pageLabel), fs = await import('node:fs/promises');
const folder = `${root}/docs/wechat-feedback-20261007/images`;
await fs.mkdir(folder, { recursive: true });
let backup;
const results = [], check = (value, message) => { if (!value) throw new Error(message); };

async function start(map) {
  await page.goto('http://localhost:4173/');
  if (!backup) backup = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('great-powers-')).map(key => [key, localStorage.getItem(key)])));
  await page.evaluate(async () => {
    // 自动化切换标签页会短暂隐藏页面，验收期间不让它触发正常的离屏暂停。
    window.__qaVisibility = event => event.stopImmediatePropagation();
    document.addEventListener('visibilitychange', __qaVisibility, true);
    const url = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/render.js').name;
    const { Renderer } = await import(url), render = Renderer.prototype.render;
    window.__feedbackErrors = []; window.__feedbackGl = []; window.__feedbackRenderer = null;
    addEventListener('error', e => __feedbackErrors.push(e.message)); addEventListener('unhandledrejection', e => __feedbackErrors.push(String(e.reason)));
    Renderer.prototype.render = function(...args) { window.__feedbackRenderer = this; const value = render.apply(this, args); const error = this.webgl.getContext().getError(); if (error) __feedbackGl.push(error); return value; };
  });
  await page.selectOption('#map-select', map); await page.selectOption('#enemy-select', 'nato'); await page.click('#start-btn');
  await page.waitForFunction(() => __feedbackRenderer?.entities.size > 0, undefined, { timeout: 30000 });
  await page.evaluate(() => { const g = __feedbackRenderer.game; g.paused = true; g.aiTimer = 100000; g.aiWaveTimer = 100000; g.time = 30; g.players[0].credits = 12000; });
  if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
}
async function shot(name) {
  const report = await page.evaluate(() => {
    const r = __feedbackRenderer; r.render(performance.now()); r.drawMinimap();
    const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4); gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 120) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return { colors: colors.size, glError: gl.getError(), errors: __feedbackErrors, frameErrors: __feedbackGl, models: r.entities.size, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  check(report.colors > 300 && !report.glError && !report.errors.length && !report.frameErrors.length && !report.overflow, `${name} 三维画面异常：${JSON.stringify(report)}`);
  await page.screenshot({ path: `${folder}/${name}` }); results.push({ name, ...report });
}
try {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width:1600, height:1000, deviceScaleFactor:1, mobile:false });
  await start('valley');
  await page.evaluate(() => {
    const r = __feedbackRenderer, g = r.game;
    for (const type of ['armory', 'radar']) g.addBuilding(0, type, type === 'armory' ? 600 : 540, type === 'armory' ? 875 : 520);
    g.addBuilding(0, 'power', 390, 420);
    g.startBuild(0, 'power'); g.updateBuildQueue(g.players[0], 15);
    const tank = g.ownedUnits(0, 'tank')[0]; g.selected = [tank.id]; g.events.selection(); r.updateFog(); r.centerOn(520, 720); r.camera.zoom = 1.25; r.updateCamera();
  });
  await page.waitForFunction(() => document.querySelector('[data-build="power"]')?.innerText.includes('点击部署'));
  check(await page.evaluate(() => !__feedbackRenderer.game.placingBuilding && !document.querySelector('[data-build="power"]').disabled), '建造完成仍抢走鼠标');
  await shot('01-ready-building.png');
  await page.click('[data-build="power"]'); check(await page.evaluate(() => __feedbackRenderer.game.placingBuilding), '点击已完成建筑没有进入部署');
  await page.keyboard.press('Escape'); check(await page.evaluate(() => !__feedbackRenderer.game.placingBuilding && __feedbackRenderer.game.pendingBuilding === 'power'), '退出部署丢失待部署建筑');
  await page.evaluate(() => {
    const r = __feedbackRenderer, g = r.game, factory = g.ownedBuildings(0, 'factory')[0], barracks = g.ownedBuildings(0, 'barracks')[0];
    const tank = g.ownedUnits(0, 'tank')[0]; tank.x = factory.x + 86; tank.y = factory.y; tank.hp = 200; tank.order = null;
    const rifle = g.ownedUnits(0, 'rifle')[0]; rifle.x = barracks.x + 65; rifle.y = barracks.y; rifle.hp = 60; rifle.ammo = 9; rifle.order = null;
    g.serviceIdleUnit(tank, .1); g.serviceIdleUnit(rifle, .7); factory.hp -= 150; g.toggleRepair(0, factory.id);
    g.selected = [tank.id, rifle.id]; g.events.selection(); r.render(performance.now());
    window.__repairCheck = { tankHP:tank.hp, rifleHP:rifle.hp, fullAmmo:tank.ammo === 12 };
  });
  check(await page.evaluate(() => __repairCheck.tankHP > 200 && __repairCheck.rifleHP > 60 && __repairCheck.fullAmmo), '满弹单位没有维修');
  await shot('02-station-service.png');
  await page.evaluate(() => { const r=__feedbackRenderer,g=r.game,t=g.ownedUnits(0,'tank')[0]; g.selected=[t.id]; g.orderMode='patrol'; g.command(840,860); g.events.selection(); r.render(performance.now()); });
  await shot('03-patrol-route.png');
  await page.click('#toolbar-toggle'); check(await page.evaluate(() => document.querySelector('#command-toolbar').classList.contains('collapsed') && document.querySelector('#toolbar-toggle').getAttribute('aria-expanded') === 'false'), '工具栏无法收起');
  await page.click('#toolbar-toggle');
  await page.click('#sound-btn'); await page.selectOption('#audio-voice', 'portable'); await page.click('#audio-test');
  check(await page.evaluate(async () => { const url=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname==='/src/audio.js').name; const {gameAudio}=await import(url); return gameAudio.settings.voiceURI === 'portable' && gameAudio.context?.state === 'running'; }), '内置中文音色没有接入音频通道');
  await shot('04-chinese-voice.png'); await page.click('#audio-close');
  await start('archipelago');
  await page.evaluate(() => {
    const r=__feedbackRenderer,g=r.game; g.units=[]; g.selected=[];
    for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}
    const landing=g.addUnit(0,'landing',1170,1010), destroyer=g.addUnit(0,'destroyer',1330,1300), sub=g.addUnit(0,'submarine',1180,1520), enemy=g.addUnit(1,'destroyer',1510,1500);
    const tank=g.addUnit(0,'tank',950,850); landing.passengers=[tank.id]; tank.embarkedIn=landing.id;
    g.addUnit(0,'frigate',1370,930); g.launchProjectile(sub,enemy,110,'submarine'); sub.exposedUntil=0;
    g.updateProjectiles(.45); g.selected=[landing.id];g.events.selection(); r.camera.zoom=1.15;r.centerOn(1250,1260);r.updateFog();r.render(performance.now());
  });
  await shot('05-amphibious-fleet.png');
  await page.evaluate(() => { __feedbackRenderer.game.paused=false; });
  await page.click('#unload-btn'); check(await page.evaluate(() => {const g=__feedbackRenderer.game;g.paused=true;return g.ownedUnits(0,'landing')[0].passengers.length===0;}), '右下卸载按钮没有卸载靠岸单位');
  await start('meridian');
  await page.evaluate(() => {
    const r=__feedbackRenderer,g=r.game;g.units=[];
    for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}
    for(const [type,x,y] of [['fighter',950,950],['strike',1110,950],['bomber',1280,1050],['airlift',960,1180],['aegis',1130,1220],['ewPlane',1280,1260]]) {const u=g.addUnit(0,type,x,y);u.angle=-.2;}
    g.addUnit(0,'rifle',1100,1340);g.addUnit(0,'engineer',1140,1360);g.addUnit(0,'scout',1180,1340);
    r.camera.zoom=1.8;r.centerOn(1110,1140);r.updateFog();r.render(performance.now());
  });
  await page.click('#sidebar-btn'); await shot('06-lunar-aircraft.png');
  await start('frontier');
  await page.evaluate(() => {
    const r=__feedbackRenderer,g=r.game;g.units=[];g.effects=[];g.projectiles=[];
    for(const f of g.fogs){f.visible.fill(true);f.explored.fill(true);}
    const plane=g.addUnit(0,'ewPlane',1000,950), bomber=g.addUnit(0,'bomber',1210,1150), tank=g.addUnit(1,'tank',1220,1150), aa=g.addUnit(1,'aa',1130,950);
    g.addUnit(0,'tank',920,1200);g.addUnit(0,'tank',1020,1280);g.addUnit(1,'tank',1320,1260);
    g.updateElectronicWarfare(.05);g.fire(bomber,tank,100,'bomber');g.updateProjectiles(.65);
    g.selected=[plane.id];g.events.selection();r.camera.zoom=1.7;r.centerOn(1100,1110);r.updateFog();r.render(performance.now());
  });
  await page.click('#sidebar-btn'); await shot('07-electronic-bombing.png');
  const motion=await page.evaluate(() => {
    const r=__feedbackRenderer,g=r.game,u=g.ownedUnits(0,'tank')[0],before={x:u.x,y:u.y};g.selected=[u.id];g.events.selection();g.command(u.x+150,u.y);g.paused=false;g.update(.1);g.paused=true;r.render(performance.now());return Math.hypot(u.x-before.x,u.y-before.y)>0;
  });check(motion,'游戏单位无法移动');
  await page.cdp('Emulation.setDeviceMetricsOverride', {width:1280,height:800,deviceScaleFactor:1,mobile:false});
  await shot('08-desktop-1280.png');
  await page.click('#save-btn'); check(await page.evaluate(()=>!!localStorage.getItem('great-powers-save-manual-v1')), '新功能存档失败');
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  await page.waitForSelector('#start-screen',{state:'visible'});await page.screenshot({path:`${folder}/09-home.png`});
  console.log(JSON.stringify({results, tests:{readyPlacement:true,manualRepair:true,toolbar:true,unload:true,portableVoice:true,motion,save:true,mainMenu:true}},null,2));
} finally {
  // 先停止测试对局，再还原真实存档，避免离开页面时再次写入测试进度。
  await page.evaluate(() => { if(window.__feedbackRenderer?.game) { __feedbackRenderer.game.running=false; __feedbackRenderer.game.paused=true; } });
  await page.evaluate(() => document.removeEventListener('visibilitychange', window.__qaVisibility, true));
  if (backup) await page.evaluate(values=>{for(const key of Object.keys(localStorage).filter(k=>k.startsWith('great-powers-'))) if(!Object.hasOwn(values,key)) localStorage.removeItem(key);for(const [key,value] of Object.entries(values)) localStorage.setItem(key,value);},backup);
}
