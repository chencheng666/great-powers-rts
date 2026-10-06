const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const fs = await import('node:fs/promises');
const folder = `${root}/docs/wechat-logistics-20261006/images`;
await fs.mkdir(folder, { recursive: true });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto('http://localhost:4173/');
const keys = ['great-powers-save-manual-v1', 'great-powers-save-auto-v1', 'great-powers-quality', 'great-powers-sidebar', 'great-powers-audio-v1'];
const backup = await page.evaluate(keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)])), keys);
const report = { screenshots: [], checks: {} };
const check = (value, message) => { if (!value) throw new Error(message); };

async function start(map) {
  if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) {
    if (await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))) await page.click('#modal-close');
    await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  }
  await page.goto('http://localhost:4173/');
  await page.evaluate(async () => {
    window.__qaErrors = [];
    addEventListener('error', e => __qaErrors.push(e.message));
    addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
    const url = performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), original = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__logisticsRenderer = this; return original.apply(this, args); };
    if (window.speechSynthesis) window.speechSynthesis.getVoices = () => [];
  });
  await page.selectOption('#map-select', map); await page.selectOption('#enemy-select', 'nato');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__logisticsRenderer?.entities.size > 0, undefined, { timeout: 60000 });
  if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
  await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game;
    g.paused = true; g.time = 20; g.aiTimer = g.aiWaveTimer = 1e6; g.units = []; g.selected = [];
    g.players.forEach(p => { p.credits = 10000; });
    for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
    r.updateFog();
  });
}

async function shot(file) {
  if (file !== '09-save-and-menu.png') await page.evaluate(() => document.querySelectorAll('.toast').forEach(item => item.remove()));
  const quality = await page.evaluate(() => {
    const r = __logisticsRenderer; r.game.events.selection?.(); r.render(performance.now()); r.drawMinimap();
    const gl = r.webgl.getContext(), b = new Uint8Array(r.canvas.width * r.canvas.height * 4);
    gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, b);
    const colors = new Set(); for (let n = 0; n < b.length; n += 512) colors.add(`${b[n]},${b[n + 1]},${b[n + 2]}`);
    return { colors: colors.size, glError: gl.getError(), errors: __qaErrors, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check(quality.colors > 100 && !quality.glError && !quality.errors.length && !quality.overflow, `画面异常：${JSON.stringify(quality)}`);
  await page.screenshot({ path: `${folder}/${file}` }); report.screenshots.push({ file, ...quality });
}

try {
  await start('frontier');
  const support = await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game;
    const truck = g.addUnit(0, 'supply', 760, 1150), tank = g.addUnit(0, 'tank', 1000, 1150), rifle = g.addUnit(0, 'rifle', 1100, 1240);
    tank.hp = 190; tank.ammo = 5; rifle.hp = 55; rifle.ammo = 10;
    g.selected = [truck.id]; r.camera.zoom = 1.8; r.centerOn(960, 1150); r.render(performance.now());
    window.__supportIds = { truck: truck.id, tank: tank.id, rifle: rifle.id };
    return { x: truck.x, tankHP: tank.hp, rifleHP: rifle.hp };
  });
  await shot('01-auto-support-before.png');
  const supported = await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game; g.paused = false;
    for (let n = 0; n < 820; n++) g.update(.05); g.paused = true;
    const { truck, tank, rifle } = __supportIds; g.selected = [tank]; g.events.selection?.();
    return { x: g.getEntity(truck).x, tankHP: g.getEntity(tank).hp, tankMax: g.getEntity(tank).maxHp, tankAmmo: g.getEntity(tank).ammo, rifleHP: g.getEntity(rifle).hp, rifleMax: g.getEntity(rifle).maxHp, stock: g.getEntity(truck).stock };
  });
  check(supported.x > support.x && supported.tankHP === supported.tankMax && supported.rifleHP === supported.rifleMax && supported.stock < 120, '自动保障未恢复实际状态');
  report.checks.autoSupport = supported; await shot('02-auto-support-after.png');

  await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game; g.units = [];
    const home = g.addBuilding(0, 'airfield', 900, 1150); g.addBuilding(0, 'power', 720, 1330); g.recalculatePower();
    const jet = g.addUnit(0, 'strike', 980, 1150); jet.hp = 120; jet.ammo = 0; jet.order = { type: 'rearm' };
    window.__repairId = jet.id; g.selected = [jet.id];
    g.paused = false; for (let n = 0; n < 50; n++) g.update(.05); g.paused = true;
    r.camera.zoom = 1.6; r.centerOn(880, 1180); g.events.selection?.();
  });
  await shot('03-airfield-repair.png');
  report.checks.airRepair = await page.evaluate(() => {
    const g = __logisticsRenderer.game; g.paused = false; for (let n = 0; n < 250; n++) g.update(.05); g.paused = true;
    const u = g.getEntity(__repairId); return { hp: u.hp, maxHp: u.maxHp, ammo: u.ammo };
  });
  check(report.checks.airRepair.hp === report.checks.airRepair.maxHp && report.checks.airRepair.ammo === 3, '机场维修补弹未完成');

  await start('ocean');
  await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game;
    const ship = g.addUnit(0, 'landing', 1140, 1270), tank = g.addUnit(0, 'tank', 1020, 1270), rifle = g.addUnit(0, 'rifle', 1010, 1340);
    tank.order = { type: 'board', targetId: ship.id }; rifle.order = { type: 'board', targetId: ship.id };
    g.boardTransport(tank, .05); g.boardTransport(rifle, .05);
    g.addUnit(0, 'destroyer', 1320, 1370); g.addUnit(0, 'frigate', 1280, 1100);
    window.__landingId = ship.id; g.selected = [ship.id]; r.camera.zoom = 1.65; r.centerOn(1160, 1250);
  });
  await shot('04-landing-loaded.png');
  const sea = await page.evaluate(() => { const g = __logisticsRenderer.game, ship = g.getEntity(__landingId); ship.x = 1760; return { load: g.transportLoad(ship), unload: g.unloadTransport(ship) }; });
  check(sea.load === 5 && sea.unload === 0, '深海卸载或载重规则错误');
  const landed = await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game, ship = g.getEntity(__landingId); ship.x = 2380; ship.y = 1270;
    const ids = [...ship.passengers], count = g.unloadTransport(ship);
    g.selected = ids; r.camera.zoom = 1.7; r.centerOn(2410, 1250);
    return { count, safe: ids.every(id => g.canOccupyUnit(g.getEntity(id), g.getEntity(id))) };
  });
  check(landed.count === 2 && landed.safe, '靠岸卸载未落到陆地'); report.checks.landing = { sea, landed };
  await shot('05-landing-unloaded.png');

  await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game; g.units = [];
    const plane = g.addUnit(0, 'airlift', 2750, 1250);
    for (const [type, x, y] of [['tank', 2710, 1250], ['rifle', 2730, 1290], ['rifle', 2740, 1210]]) {
      const u = g.addUnit(0, type, x, y); u.order = { type: 'board', targetId: plane.id }; g.boardTransport(u, .05);
    }
    g.selected = [plane.id]; window.__airliftId = plane.id; r.camera.zoom = 1.65; r.centerOn(2750, 1250);
  });
  await shot('06-airlift-cargo.png');
  report.checks.airlift = await page.evaluate(() => { const g = __logisticsRenderer.game, u = g.getEntity(__airliftId); return { passengers: u.passengers.length, weight: g.transportLoad(u) }; });
  check(report.checks.airlift.passengers === 3 && report.checks.airlift.weight === 6, '运输机混合载重错误');
  await page.click('[data-action="unload"]');
  check(await page.evaluate(() => __logisticsRenderer.game.getEntity(__airliftId).passengers.length === 0), '卸载按钮未生效');

  await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game; g.units = [];
    const drone = g.addUnit(0, 'drone', 1040, 1300); g.paused = false;
    for (let n = 0; n < 130; n++) g.moveUnitNow(drone, { x: 2200, y: 1300 }, .05);
    g.paused = true; g.selected = [drone.id]; window.__crossSeaId = drone.id;
    g.addUnit(0, 'destroyer', 1740, 1430); r.camera.zoom = 1.4; r.centerOn(1760, 1320);
  });
  report.checks.drone = await page.evaluate(() => { const u = __logisticsRenderer.game.getEntity(__crossSeaId); return { x: u.x, y: u.y }; });
  check(report.checks.drone.x > 1700 && Math.abs(report.checks.drone.y - 1300) < 15, '无人机仍在绕桥');
  await shot('07-drone-over-sea.png');

  await page.evaluate(() => {
    const r = __logisticsRenderer, g = r.game; g.units = []; g.projectiles = []; g.effects = [];
    const bomber = g.addUnit(0, 'bomber', 2670, 1280), fighter = g.addUnit(0, 'fighter', 2610, 1170), target = g.addUnit(1, 'tank', 2860, 1300);
    g.addUnit(1, 'tank', 2890, 1330); g.addUnit(1, 'rifle', 2875, 1320);
    g.selected = [bomber.id]; g.fire(bomber, target, 105, 'bomber'); g.updateProjectiles(.5);
    r.camera.zoom = 1.5; r.centerOn(2750, 1300);
  });
  await shot('08-bomber-strike.png');

  await page.keyboard.press('Escape'); await page.click('[data-modal="save"]');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('great-powers-save-manual-v1')));
  check(saved.state.units.some(u => u.type === 'bomber') && saved.state.projectiles.some(p => p.kind === 'bomb'), '新单位或在途炸弹未保存');
  await shot('09-save-and-menu.png');
  await page.click('[data-modal="menu"]'); await page.click('[data-modal="save-menu"]');
  await page.click('#continue-btn'); await page.click('[data-modal="load-manual"]');
  await page.waitForFunction(() => document.querySelector('#modal-content').textContent.includes('战局已恢复'));
  report.checks.saveRestore = await page.evaluate(() => ({ bomber: __logisticsRenderer.game.units.some(u => u.type === 'bomber'), bomb: __logisticsRenderer.game.projectiles.some(p => p.kind === 'bomb') }));
  check(report.checks.saveRestore.bomber && report.checks.saveRestore.bomb, '新单位读档丢失');
  await page.click('[data-modal="resume"]');
  await page.evaluate(async () => {
    const resource = performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/src/audio.js'));
    const { gameAudio } = await import(resource.name); window.__portableAudio = gameAudio;
    __logisticsRenderer.game.paused = false; gameAudio.setPaused(false); gameAudio.setSettings({ muted: false, master: .75, voice: .9, music: 0 });
    gameAudio.clearVoices(); gameAudio.cooldowns.clear(); gameAudio.say('unitUnderAttack');
  });
  await page.waitForFunction(() => __portableAudio.currentVoice?.source?.buffer?.duration > .1, undefined, { timeout: 15000 });
  report.checks.portableVoice = await page.evaluate(() => {
    const a = __portableAudio, b = a.currentVoice.source.buffer, data = new Float32Array(a.analyser.fftSize); a.analyser.getFloatTimeDomainData(data);
    return { duration: b.duration, sampleRate: b.sampleRate, context: a.context.state, noChineseSystemVoice: !speechSynthesis.getVoices().length, rms: Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length) };
  });
  check(report.checks.portableVoice.noChineseSystemVoice && report.checks.portableVoice.context === 'running', '无中文系统音色时没有使用离线播报');
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  console.log(report); await fs.writeFile(`${folder}/../验证报告.json`, `${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) {
    if (await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))) await page.click('#modal-close');
    await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  }
  await page.evaluate(values => { for (const [k, v] of Object.entries(values)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }, backup);
}
