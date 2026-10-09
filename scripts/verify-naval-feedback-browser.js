const { root, taskSpaceId, pageLabel = 'p2' } = globalThis.NAVAL_FEEDBACK_QA || globalThis.GAME_QA;
const fs = await import('node:fs/promises'), task = await taskSpace(taskSpaceId), page = task.page(pageLabel);
const folder = `${root}/releases/naval-feedback-qa`; await fs.mkdir(folder, { recursive: true });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
await page.goto('http://127.0.0.1:4173/'); await page.waitForSelector('#start-btn');
await page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js').name;
  const { Renderer } = await import(url), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__communityRenderer = this; return render.apply(this, args); };
  window.__communityErrors = [];
  addEventListener('error', e => __communityErrors.push(e.message));
  addEventListener('unhandledrejection', e => __communityErrors.push(String(e.reason)));
  document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
});
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1512, height: 900, deviceScaleFactor: 1, mobile: false });
await page.selectOption('#map-select', 'ocean'); await page.click('#start-btn');
await page.waitForFunction(() => window.__communityRenderer?.game.mapId === 'ocean' && window.__communityRenderer.entities.size > 0);
const report = await page.evaluate(() => {
  const r = __communityRenderer, g = r.game; g.paused = true; g.aiTimer = g.aiWaveTimer = g.fogTimer = 1e9;
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  g.units = []; g.effects = []; g.time = 5;
  const cx = (g.map.water.x1 + g.map.water.x2) / 2, cy = g.world.height / 2;
  const fleet = ['patrol', 'frigate', 'destroyer', 'carrier', 'containerShip', 'submarine'].map((type, i) => g.addUnit(0, type, cx - 240 + i % 3 * 240, cy - 190 + Math.floor(i / 3) * 270));
  const plane = g.addUnit(0, 'freightPlane', cx + 230, cy + 300); plane.freight = { phase: 'inbound', value: 720, progress: 0, homeId: g.ownedBuildings(0, 'refinery')[0].id };
  r.setViewMode('immersive'); r.camera.zoom = 1.35; r.centerOn(cx, cy); r.render(performance.now());
  const models = [...fleet, plane].map(u => {
    const entry = r.entities.get(u.id);
    return { type: u.type, hull: entry.model.userData.navalHullVersion, body: entry.model.userData.transportBodyVersion, meshes: entry.model.children.length, visible: entry.model.visible };
  });
  const sub = fleet.at(-1), ship = fleet[2]; sub.x = ship.x; sub.y = ship.y; sub.angle = ship.angle; sub.exposedUntil = 0;
  r.setQuality('standard'); r.camera.zoom = 3.5; r.centerOn(ship.x, ship.y); r.render(performance.now());
  const gl = r.webgl.getContext(), pixel = entity => {
    const p = r.worldToScreen(entity.x + 20, entity.y, r.entities.get(entity.id).model.position.y + 8);
    const x = Math.round(p.x * gl.drawingBufferWidth / r.viewport.width), y = Math.round((r.viewport.height - p.y) * gl.drawingBufferHeight / r.viewport.height);
    const data = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, data); return [...data];
  };
  r.webgl.render(r.scene, r.viewCamera);
  const withSub = pixel(ship), subEntry = r.entities.get(sub.id); subEntry.model.visible = false; r.webgl.render(r.scene, r.viewCamera); const withoutSub = pixel(ship);
  const occlusion = { withSub, withoutSub, difference: withSub.reduce((n, value, i) => n + Math.abs(value - withoutSub[i]), 0), underwater: subEntry.model.position.y < 0 };
  sub.x = cx + 240; sub.y = cy + 80; r.camera.zoom = 1.35; r.centerOn(cx, cy); r.render(performance.now());
  window.__navalFleet = fleet; window.__navalPlane = plane;
  return { models, occlusion, errors: __communityErrors };
});
assert(report.models.slice(0, 5).every(m => m.hull === 1 && m.visible), '舰体细化未接入真实资产');
assert(report.models.at(-1).body === 1, '宽体运输机未接入真实资产');
assert(report.occlusion.withSub.slice(0, 3).some(value => value > 0) && report.occlusion.difference < 6 && report.occlusion.underwater, '潜艇轮廓穿透水面舰体或采样为空');
assert(!report.errors.length, '渲染产生异常');
await page.screenshot({ path: `${folder}/海军舰体与运输机.png` });
report.harbor = await page.evaluate(() => {
  const r = __communityRenderer, g = r.game, dock = g.ownedBuildings(0, 'dock')[0], sub = __navalFleet.at(-1);
  g.requestResupply(sub, dock); Object.assign(sub, g.shipBerth(sub, dock)); sub.ammo = 1; sub.hp = sub.maxHp * .5;
  r.camera.zoom = 2.1; r.centerOn(sub.x - 90, sub.y); r.render(performance.now());
  return { surfaced: g.submarineSurfaced(sub), height: r.entities.get(sub.id).model.position.y, scale: r.entities.get(sub.id).model.scale.y / r.entities.get(sub.id).scale };
});
assert(report.harbor.surfaced && report.harbor.height < 0 && report.harbor.scale === 1, '返港浮航未正常显示');
await page.screenshot({ path: `${folder}/潜艇港口浮航.png` });
report.facilities = await page.evaluate(() => {
  const r = __communityRenderer, g = r.game;
  const radar = g.addBuilding(0, 'radar', 770, 1100), power = g.addBuilding(0, 'power', 580, 1100), factory = g.addBuilding(0, 'factory', 820, 1320);
  factory.hp = factory.maxHp * .7; factory.repairing = true; g.selected = [];
  r.camera.zoom = 2; r.centerOn(730, 1180); r.render(performance.now());
  const radarNode = r.entities.get(radar.id).model.getObjectByName('facility_radar'), fan = r.entities.get(power.id).model.getObjectByName('facility_fan_-1.65');
  const first = { radar: radarNode?.rotation.y, fan: fan?.rotation.y };
  g.time += 1; r.render(performance.now());
  const second = { radar: radarNode?.rotation.y, fan: fan?.rotation.y };
  const badges = r.repairBadges, bars = r.healthBars;
  const overlap = badges.some(a => bars.some(b => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y));
  return { first, second, badges: badges.length, overlap, errors: __communityErrors };
});
assert(report.facilities.first.radar !== report.facilities.second.radar && report.facilities.first.fan !== report.facilities.second.fan, '真实雷达或风扇部件未运动');
assert(report.facilities.badges === 1 && !report.facilities.overlap && !report.facilities.errors.length, '维修徽标与血条重叠或渲染异常');
await page.screenshot({ path: `${folder}/动态设施与维修徽标.png` });
await fs.writeFile(`${folder}/验收报告.json`, JSON.stringify(report, null, 2)); console.log(report);
