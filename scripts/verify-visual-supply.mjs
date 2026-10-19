const { root, spaceId, base = 'http://localhost:4173/' } = globalThis.VISUAL_SUPPLY_QA;
const task = await taskSpace(spaceId), page = task.page('p1'), fs = await import('node:fs/promises');
const folder = `${root}/releases/visual-supply-20261019`;
await fs.mkdir(folder, { recursive: true });
const report = { scope: '受控验收场景，不代表自然完整对局或其他设备性能' };
const check = (value, message) => { if (!value) throw Error(message); };
await page.goto(base);
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.waitForSelector('#start-btn');
if (await page.evaluate(() => document.querySelector('#nickname-dialog').open)) {
  await page.fill('#nickname-dialog input', '画面与保障验收'); await page.click('#nickname-dialog button[type=submit]');
}
await page.evaluate(async () => {
  const resource = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/render.js');
  const { Renderer } = await import(resource.name), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__visualQA = this; return render.apply(this, args); };
  window.__qaErrors = [];
  addEventListener('error', e => __qaErrors.push(e.message));
  addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
});
await page.click('#start-btn');
await page.waitForFunction(() => window.__visualQA?.entities.size > 0, undefined, { timeout: 60000 });
report.initial = await page.evaluate(() => {
  const r = __visualQA, g = r.game; g.paused = true;
  const hq = g.ownedBuildings(0, 'hq')[0], p = r.worldToScreen(hq.x, hq.y);
  return { width: r.viewport.width, height: r.viewport.height, hq: p, azimuth: r.cameraAzimuth };
});
check(report.initial.hq.x >= 0 && report.initial.hq.x < report.initial.width && report.initial.hq.y > 0 && report.initial.hq.y < report.initial.height, '开局基地不在画面内');
await page.evaluate(() => {
  const r = __visualQA, g = r.game;
  g.time = 0; g.units = []; g.buildings = []; g.effects = []; g.attackAlerts = []; g.isAI = () => false; g.updateLogistics = () => {};
  g.addBuilding(1, 'hq', g.world.width - 300, 2200);
  for (const [type, x, y] of [['hq', 650, 700], ['factory', 850, 900], ['barracks', 600, 1000], ['armory', 1060, 1020], ['power', 1060, 730], ['airfield', 1250, 850]]) g.addBuilding(0, type, x, y);
  for (const [type, x, y] of [['tank', 790, 1080], ['supply', 960, 1120], ['fighter', 980, 570], ['rifle', 760, 1160]]) g.addUnit(0, type, x, y);
  g.players[0].credits = 10000; g.updateFog(); r.camera.zoom = 1.15; r.centerOn(900, 870); r.render(performance.now());
});
await page.screenshot({ path: `${folder}/01-building-platforms.png` });
report.scene = await page.evaluate(() => {
  const r = __visualQA, gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
  gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const colors = new Set(); for (let i = 0; i < pixels.length; i += 4096) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  const p = r.worldToScreen(1000, 900), world = r.screenToWorld(p.x, p.y);
  return { colors: colors.size, glError: gl.getError(), foundation: r.foundationMesh.geometry.type, foundationInstances: r.foundationSlots.size, projectionError: Math.hypot(world.x - 1000, world.y - 900), errors: __qaErrors };
});
check(report.scene.colors > 50 && !report.scene.glError && !report.scene.errors.length && report.scene.projectionError < .01 && report.scene.foundation === 'CylinderGeometry', '三维地台或镜头投影检查失败');
await page.evaluate(() => {
  const r = __visualQA, g = r.game; g.units = []; g.buildings = [];
  g.addBuilding(0, 'hq', 300, 2300); g.addBuilding(1, 'hq', g.world.width - 300, 2300);
  const s = g.addUnit(0, 'supply', 1000, 1400);
  window.__supplyQAIds = { truck: s.id, tanks: [] };
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, u = g.addUnit(0, 'tank', 1000 + Math.cos(a) * 185, 1400 + Math.sin(a) * 185);
    u.ammo = 0; u.hp -= 20; g.requestResupply(u); __supplyQAIds.tanks.push({ id: u.id, x: u.x, y: u.y });
  }
  g.selected = [s.id]; g.events.selection?.(); r.camera.zoom = 1.1; r.centerOn(1000, 1400);
  g.paused = false; for (let i = 0; i < 400; i++) g.update(.05); g.paused = true; r.render(performance.now());
});
report.supply = await page.evaluate(() => {
  const g = __visualQA.game, tanks = __supplyQAIds.tanks.map(({ id, x, y }) => { const u = g.getEntity(id); return { ammo: u.ammo, hp: u.hp, maxHp: u.maxHp, displacement: Math.hypot(u.x - x, u.y - y) }; });
  return { tanks, stock: g.getEntity(__supplyQAIds.truck).stock };
});
check(report.supply.tanks.every(u => u.ammo >= 15 && u.hp === u.maxHp && u.displacement < 1), '八车原地保障未通过');
await page.screenshot({ path: `${folder}/02-supply-aura.png` });
await page.evaluate(() => {
  const r = __visualQA, g = r.game; g.units = []; g.selected = [];
  for (const [type, x, y] of [['fighter', 1050, 1350], ['bomber', 1220, 1450], ['helicopter', 850, 1430]]) g.addUnit(0, type, x, y);
  g.updateFog(); r.camera.zoom = 2; r.centerOn(1050, 1430); r.render(performance.now());
});
await page.screenshot({ path: `${folder}/03-airframe-textures.png` });
report.camera = await page.evaluate(() => {
  const r = __visualQA; r.setViewMode('tactical'); r.render(performance.now());
  const tactical = { azimuth: r.cameraAzimuth, error: r.webgl.getContext().getError() };
  r.setViewMode('immersive'); r.render(performance.now()); return { tactical, immersive: r.cameraAzimuth };
});
check(!report.camera.tactical.error && report.camera.tactical.azimuth === 0, '战术镜头回退失败');
report.performance = [];
for (const amount of [120, 240]) {
  const sample = await page.evaluate(amount => {
    const r = __visualQA, g = r.game; g.units = [];
    for (let i = 0; i < amount; i++) g.addUnit(0, i % 3 ? 'tank' : 'rifle', 700 + i % 20 * 72, 1100 + Math.floor(i / 20) * 72);
    g.updateFog(); r.camera.zoom = .7; r.centerOn(1350, 1500); r.setQuality('standard');
    r.render(performance.now()); const gl = r.webgl.getContext(); gl.finish();
    const start = performance.now(); for (let i = 0; i < 8; i++) { r.render(performance.now()); gl.finish(); }
    return { units: amount, quality: r.quality, meanRenderMs: (performance.now() - start) / 8, calls: r.webgl.info.render.calls, triangles: r.webgl.info.render.triangles, glError: gl.getError(), errors: __qaErrors };
  }, amount);
  check(!sample.glError && !sample.errors.length, '大军团渲染异常'); report.performance.push(sample);
}
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await page.evaluate(() => { __visualQA.resize(); __visualQA.render(performance.now()); });
report.desktop = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, glError: __visualQA.webgl.getContext().getError() }));
check(report.desktop.overflow <= 0 && !report.desktop.glError, '1280桌面视口溢出');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
await page.evaluate(() => { __visualQA.resize(); __visualQA.render(performance.now()); });
report.narrow = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, glError: __visualQA.webgl.getContext().getError() }));
check(report.narrow.overflow <= 0 && !report.narrow.glError, '窄视口基础渲染失败');
await page.screenshot({ path: `${folder}/04-narrow-smoke.png` });
await fs.writeFile(`${folder}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(report);
