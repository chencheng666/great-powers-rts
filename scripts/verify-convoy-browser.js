const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const fs = await import('node:fs/promises');
const folder = `${root}/docs/wechat-fleet-20261006/images`;
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
    const r = __convoyRenderer;
    document.querySelectorAll('.toast').forEach(e => e.remove());
    r.game.events.selection?.(); r.render(performance.now()); r.drawMinimap();
    const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
    gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 512) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return { colors: colors.size, glError: gl.getError(), errors: __qaErrors, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check(quality.colors > 150 && !quality.glError && !quality.errors.length && !quality.overflow, `战场渲染异常：${JSON.stringify(quality)}`);
  await page.screenshot({ path: `${folder}/${file}` }); report.screenshots.push({ file, ...quality });
}

try {
  await page.evaluate(async () => {
    window.__qaErrors = [];
    addEventListener('error', e => __qaErrors.push(e.message));
    addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
    const url = performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), render = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__convoyRenderer = this; return render.apply(this, args); };
  });
  await page.selectOption('#map-select', 'ocean'); await page.selectOption('#enemy-select', 'nato'); await page.click('#start-btn');
  await page.waitForFunction(() => window.__convoyRenderer?.entities.size > 0, undefined, { timeout: 60000 });
  if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
  await page.evaluate(() => {
    const r = __convoyRenderer, g = r.game;
    g.paused = true; g.time = 40; g.units = []; g.effects = []; g.aiTimer = g.aiWaveTimer = 1e9;
    g.logistics.forEach(route => { route.nextAir = route.nextSea = 1e9; });
    g.players.forEach(p => { p.credits = 20000; });
    g.closestEnemy = () => null;
    for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
    r.updateFog();
    const home = g.ownedBuildings(0, 'dock')[0], ship = g.addUnit(0, 'destroyer', 1300, home.y);
    g.requestResupply(ship); Object.assign(ship, g.shipBerth(ship, home)); ship.hp = 500; ship.ammo = 3;
    window.__repairId = ship.id; g.selected = [ship.id];
    g.paused = false; for (let n = 0; n < 25; n++) g.update(.05); g.paused = true;
    r.camera.zoom = 1.7; r.centerOn(1080, home.y); r.updateFog();
  });
  await shot('01-port-repair.png');
  report.checks.port = await page.evaluate(() => {
    const g = __convoyRenderer.game, initial = g.players[0].credits;
    g.paused = false; for (let n = 0; n < 400; n++) g.update(.05); g.paused = true;
    const ship = g.getEntity(__repairId);
    return { hp: ship.hp, maxHp: ship.maxHp, ammo: ship.ammo, order: ship.order?.type, paid: initial - g.players[0].credits };
  });
  check(report.checks.port.hp === report.checks.port.maxHp && report.checks.port.ammo === 8 && report.checks.port.paid > 0 && report.checks.port.order !== 'rearm', '真实港口整备未完成');

  await page.evaluate(() => {
    const r = __convoyRenderer, g = r.game; g.units = []; g.effects = [];
    const home = g.ownedBuildings(0, 'refinery')[0], plane = g.launchFreight(0);
    plane.x = home.x + 62; plane.y = home.y;
    g.paused = false; for (let n = 0; n < 26; n++) g.update(.05); g.paused = true;
    g.selected = [plane.id]; window.__freightId = plane.id;
    for (const fog of g.fogs) fog.visible.fill(true); r.updateFog();
    r.camera.zoom = 2; r.centerOn(450, home.y - 30);
  });
  await shot('02-airdrop-logistics.png');
  report.checks.air = await page.evaluate(() => {
    const g = __convoyRenderer.game, before = g.players[0].credits;
    g.paused = false; for (let n = 0; n < 140; n++) g.update(.05); g.paused = true;
    return { income: g.players[0].credits - before, phase: g.getEntity(__freightId)?.freight.phase, drops: __convoyRenderer.effects.size };
  });
  check(report.checks.air.income === 720 && report.checks.air.phase === 'outbound', '空运物资没有只结算一次');

  await page.evaluate(() => {
    const r = __convoyRenderer, g = r.game; g.units = []; g.effects = [];
    const home = g.ownedBuildings(0, 'dock')[0], cargo = g.launchFreight(0, true);
    Object.assign(cargo, g.navalGoal(home.x, home.y, 100));
    g.addUnit(0, 'destroyer', 1390, home.y - 130); g.addUnit(0, 'frigate', 1410, home.y + 155);
    g.addUnit(1, 'patrol', 1780, home.y + 40);
    g.paused = false; for (let n = 0; n < 25; n++) g.update(.05); g.paused = true;
    g.selected = [cargo.id]; window.__seaId = cargo.id;
    for (const fog of g.fogs) fog.visible.fill(true); r.updateFog();
    r.camera.zoom = 1.6; r.centerOn(1290, home.y + 10);
  });
  await shot('03-container-convoy.png');
  report.checks.sea = await page.evaluate(() => {
    const g = __convoyRenderer.game, before = g.players[0].credits;
    g.paused = false; for (let n = 0; n < 190; n++) g.update(.05); g.paused = true;
    return { income: g.players[0].credits - before, phase: g.getEntity(__seaId)?.freight.phase };
  });
  check(report.checks.sea.income === 900 && report.checks.sea.phase === 'outbound', '海运卸货没有结算');

  await page.evaluate(() => {
    const r = __convoyRenderer, g = r.game; g.units = []; g.effects = [];
    const carrier = g.addUnit(0, 'carrier', 1400, 1120);
    for (const type of ['navalFighter', 'navalStrike']) {
      const plane = g.addUnit(0, type, carrier.x, carrier.y); plane.order = { type: 'board', targetId: carrier.id };
      for (let n = 0; n < 60 && !plane.embarkedIn; n++) { g.time += .05; g.boardTransport(plane, .05); }
    }
    window.__carrierId = carrier.id; g.selected = [carrier.id];
    for (const fog of g.fogs) fog.visible.fill(true); r.updateFog();
    r.camera.zoom = 2.3; r.centerOn(1400, 1110);
  });
  await shot('04-carrier-deck.png');
  const parked = await page.evaluate(() => __convoyRenderer.game.getEntity(__carrierId).passengers.length);
  check(parked === 2, '真实舰载机没有上舰');
  await page.click('[data-action="unload"]');
  report.checks.launch = await page.evaluate(() => {
    const r = __convoyRenderer, g = r.game, carrier = g.getEntity(__carrierId);
    g.paused = false; for (let n = 0; n < 20; n++) g.update(.05);
    r.lastEntityFrame = performance.now() - 50; r.render(performance.now()); g.paused = true;
    g.selected = g.carrierAircraft(carrier).map(p => p.id); g.events.selection?.();
    return { parked: carrier.passengers.length, active: g.carrierAircraft(carrier).length, moved: g.carrierAircraft(carrier).some(p => Math.hypot(p.x - carrier.x, p.y - carrier.y) > 100) };
  });
  check(!report.checks.launch.parked && report.checks.launch.active === 2 && report.checks.launch.moved, '起飞按钮没有驱动真实机体');
  await shot('05-carrier-launch.png');

  await page.evaluate(() => {
    const g = __convoyRenderer.game;
    g.addBuilding(0, 'radar', 640, 870); g.addBuilding(0, 'lab', 620, 1010); g.addBuilding(0, 'power', 480, 940);
    g.recalculatePower(); g.paused = true;
  });
  await page.click('[data-tab="tactics"]');
  await page.waitForFunction(() => !!document.querySelector('#satellite-button'), undefined, { timeout: 10000 });
  report.checks.satellite = await page.evaluate(() => {
    const g = __convoyRenderer.game, before = g.players[0].credits;
    g.paused = false; document.querySelector('#satellite-button').click(); g.paused = true;
    __convoyRenderer.updateFog();
    return { paid: before - g.players[0].credits, visible: g.fogs[0].visible.every(Boolean), duration: g.players[0].satelliteUntil - g.time };
  });
  check(report.checks.satellite.paid === 1000 && report.checks.satellite.visible && report.checks.satellite.duration === 8, '卫星请求按钮没有执行真实侦察');
  await shot('06-satellite-recon.png');

  report.checks.save = await page.evaluate(() => {
    const g = __convoyRenderer.game; document.querySelector('#save-btn').click();
    const s = JSON.parse(localStorage.getItem('great-powers-save-manual-v1'));
    return { mode: s.config.economyMode, aircraft: s.state.units.filter(u => u.homeCarrierId).length, logistics: s.state.logistics.length };
  });
  check(report.checks.save.mode === 'convoy' && report.checks.save.aircraft === 2 && report.checks.save.logistics === 2, '界面保存未包含新规则');
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await shot('07-desktop-compact.png');
  console.log(JSON.stringify(report, null, 2));
  await fs.writeFile(`${root}/releases/convoy-browser-report.json`, JSON.stringify(report, null, 2));
} finally {
  if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) {
    if (await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))) await page.click('#modal-close');
    await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  }
  await page.evaluate(backup => { for (const [key, value] of Object.entries(backup)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } }, backup);
}
