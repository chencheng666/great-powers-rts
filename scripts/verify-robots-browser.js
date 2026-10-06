const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const fs = await import('node:fs/promises');
const folder = `${root}/docs/images`;
await fs.mkdir(folder, { recursive: true });
await page.cdp('Network.setCacheDisabled', { cacheDisabled: true });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto('http://localhost:4173/');
const keys = ['great-powers-save-manual-v1', 'great-powers-save-auto-v1', 'great-powers-quality', 'great-powers-sidebar', 'great-powers-audio-v1'];
const backup = await page.evaluate(keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)])), keys);
const report = { checks: {}, screenshots: [] };
const check = (ok, message) => { if (!ok) throw new Error(message); };

async function shot(file) {
  const quality = await page.evaluate(() => {
    const r = __robotRenderer;
    document.querySelectorAll('.toast').forEach(e => e.remove());
    r.game.events.selection?.(); r.render(performance.now()); r.drawMinimap();
    const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
    gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 512) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return { colors: colors.size, glError: gl.getError(), errors: __qaErrors, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check(quality.colors > 150 && !quality.glError && !quality.errors.length && !quality.overflow, `机器人战场渲染异常：${JSON.stringify(quality)}`);
  await page.screenshot({ path: `${folder}/${file}` }); report.screenshots.push({ file, ...quality });
}

try {
  await page.evaluate(async () => {
    window.__qaErrors = [];
    addEventListener('error', e => __qaErrors.push(e.message));
    addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
    const url = performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), render = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__robotRenderer = this; return render.apply(this, args); };
  });
  await page.selectOption('#map-select', 'meridian'); await page.selectOption('#enemy-select', 'china'); await page.click('#start-btn');
  await page.waitForFunction(() => window.__robotRenderer?.entities.size > 0, undefined, { timeout: 60000 });
  if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
  await page.click('[data-tab="units"]');
  report.checks.catalog = await page.evaluate(() => document.querySelector('#sidebar-content').innerText);
  check(['月卫战斗机器人', '天工工程机器人', '巡星侦察机器人', '机器人装配站', '电池驱动'].every(s => report.checks.catalog.includes(s)), '生产列表没有转换为机器人');
  await page.evaluate(() => {
    const r = __robotRenderer, g = r.game;
    g.paused = true; g.time = 40; g.units = []; g.effects = []; g.aiTimer = g.aiWaveTimer = 1e9;
    g.players.forEach(p => { p.credits = 20000; }); g.closestEnemy = () => null;
    for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
    const home = g.ownedBuildings(0, 'barracks')[0];
    window.__robotIds = ['rifle', 'engineer', 'scout'].map((type, i) => g.addUnit(0, type, home.x + 125 + i * 55, home.y + 110).id);
    for (let i = 0; i < 6; i++) g.addUnit(0, 'rifle', home.x + 115 + (i % 3) * 52, home.y + 175 + Math.floor(i / 3) * 50);
    g.addUnit(0, 'supply', home.x + 235, home.y - 10);
    g.selected = [__robotIds[0]]; r.camera.zoom = 2.4; r.centerOn(home.x + 160, home.y + 90); r.updateFog();
  });
  await shot('lunar-robots.png');
  report.checks.models = await page.evaluate(() => __robotIds.map(id => {
    const e = __robotRenderer.entities.get(id);
    return { name: e.model.name, legs: e.legs.length, meshes: e.model.children.length };
  }));
  check(report.checks.models.every((e, i) => e.name === ['robot_rifle', 'robot_engineer', 'robot_scout'][i] && e.legs === 2 && e.meshes > 3), '机器人模型或机械关节未加载');

  // 使用真实界面的返场按钮，再推进同一套游戏逻辑验收充电。
  await page.evaluate(() => {
    const g = __robotRenderer.game, u = g.getEntity(__robotIds[1]);
    u.battery = 20; g.selected = [u.id]; g.events.selection?.();
    g.paused = false; document.querySelector('[data-action="resupply"]').click(); g.paused = true;
  });
  report.checks.manualReturn = await page.evaluate(() => __robotRenderer.game.getEntity(__robotIds[1]).order?.type);
  check(report.checks.manualReturn === 'rearm', '工程机器人的充电按钮无效');
  await page.evaluate(() => {
    const r = __robotRenderer, g = r.game, home = g.ownedBuildings(0, 'barracks')[0];
    for (const id of __robotIds) {
      const u = g.getEntity(id); u.x = home.x + 40; u.y = home.y + (__robotIds.indexOf(id) - 1) * 34;
      u.battery = 10; u.lastMovedAt = -10; g.requestResupply(u);
    }
    g.paused = false; for (let n = 0; n < 30; n++) g.update(.05); g.paused = true;
    g.selected = [__robotIds[1]]; r.centerOn(home.x + 80, home.y + 50);
    for (const fog of g.fogs) fog.visible.fill(true); r.updateFog();
  });
  await shot('lunar-robot-charge.png');
  report.checks.charging = await page.evaluate(() => {
    const g = __robotRenderer.game;
    return { batteries: __robotIds.map(id => g.getEntity(id).battery), load: g.players[0].robotChargeLoad, status: document.querySelector('#selection-panel').innerText };
  });
  check(report.checks.charging.batteries.every(v => v > 20) && report.checks.charging.load === 12 && report.checks.charging.status.includes('电池'), '真实充电、电网负载或电量状态未生效');
  report.checks.complete = await page.evaluate(() => {
    const g = __robotRenderer.game; g.paused = false; for (let n = 0; n < 160; n++) g.update(.05); g.paused = true;
    return __robotIds.map(id => ({ battery: g.getEntity(id).battery, order: g.getEntity(id).order?.type }));
  });
  check(report.checks.complete.every(u => u.battery > 99 && u.order !== 'rearm'), '充满电后没有退出整备状态');

  report.checks.movement = await page.evaluate(() => {
    const r = __robotRenderer, g = r.game, u = g.getEntity(__robotIds[0]), x = u.x;
    u.order = { type: 'move', x: u.x + 130, y: u.y + 100 }; g.paused = false;
    for (let n = 0; n < 10; n++) g.update(.05);
    r.lastEntityFrame = performance.now() - 50; r.render(performance.now());
    const angles = r.entities.get(u.id).legs.map(l => l.rotation.z); g.paused = true;
    return { moved: u.x !== x, battery: u.battery, angles };
  });
  check(report.checks.movement.moved && report.checks.movement.battery < 100 && report.checks.movement.angles.some(a => Math.abs(a) > .01), '机体移动、机械步态或耗电没有生效');
  await page.evaluate(() => {
    const r = __robotRenderer, g = r.game, home = g.ownedBuildings(0, 'barracks')[0];
    g.effects = []; g.units = g.units.filter(u => __robotIds.includes(u.id));
    const u = g.getEntity(__robotIds[0]); u.order = null; u.x = home.x + 240; u.y = home.y + 160;
    const enemy = g.addUnit(1, 'rifle', u.x + 115, u.y + 10); enemy.hp = 65;
    g.fire(u, enemy, 12, 'rifle'); g.selected = [u.id]; r.centerOn(home.x + 210, home.y + 115);
  });
  await shot('lunar-robot-pulse.png');
  report.checks.save = await page.evaluate(() => {
    const g = __robotRenderer.game, u = g.getEntity(__robotIds[1]); u.battery = 17.35; g.requestResupply(u);
    document.querySelector('#save-btn').click();
    const saved = JSON.parse(localStorage.getItem('great-powers-save-manual-v1'));
    const stored = saved.state.units.find(v => v.id === u.id);
    return { battery: stored.battery, ammo: stored.ammo, map: saved.config.mapId, order: stored.order.type };
  });
  check(report.checks.save.battery === 17.35 && report.checks.save.ammo === null && report.checks.save.map === 'meridian' && report.checks.save.order === 'rearm', '界面存档丢失电量或充电状态');
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await shot('lunar-robot-desktop.png');
  await page.evaluate(() => {
    const r = __robotRenderer, g = r.game, home = g.ownedBuildings(0, 'barracks')[0];
    g.selected = [home.id]; g.events.selection?.(); r.camera.zoom = 1.8; r.centerOn(home.x, home.y); r.render(performance.now());
  });
  await page.waitForFunction(() => !document.querySelector('#building-info').hidden && document.querySelector('#building-info').innerText.includes('机器人装配站'), undefined, { timeout: 10000 });
  report.checks.building = await page.evaluate(() => document.querySelector('#building-info').innerText);
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  await page.selectOption('#map-select', 'valley'); await page.click('#start-btn');
  await page.waitForFunction(() => window.__robotRenderer?.game.mapId === 'valley' && __robotRenderer.entities.size > 0, undefined, { timeout: 60000 });
  await page.click('[data-tab="units"]');
  report.checks.conventional = await page.evaluate(() => {
    const r = __robotRenderer, g = r.game; g.paused = true; r.render(performance.now());
    const u = g.activeUnits(0, 'rifle')[0];
    return { model: r.entities.get(u.id).model.name, battery: u.battery ?? null, ammo: u.ammo, catalog: document.querySelector('#sidebar-content').innerText };
  });
  check(report.checks.conventional.model === 'rifle' && report.checks.conventional.battery === null && report.checks.conventional.ammo === 18 && !report.checks.conventional.catalog.includes('机器人装配站'), '常规地图真人与弹药被意外转换');
  await fs.writeFile(`${root}/releases/robots-browser-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) {
    if (await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))) await page.click('#modal-close');
    await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  }
  await page.evaluate(backup => { for (const [key, value] of Object.entries(backup)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } }, backup);
}
