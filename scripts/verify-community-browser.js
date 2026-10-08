const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1'), fs = await import('node:fs/promises');
const folder = `${root}/releases/community-qa`, report = { layouts: [], previews: [] };
const check = (value, message) => { if (!value) throw new Error(message); };
const shot = name => page.screenshot({ path: `${folder}/${name}.png` });
await fs.mkdir(folder, { recursive: true }); let backup;
try {
  await page.goto('http://localhost:4173/');
  backup = await page.evaluate(() => Object.fromEntries(Object.keys(localStorage).filter(k => k.startsWith('great-powers-')).map(k => [k, localStorage.getItem(k)])));
  await fs.writeFile(`${folder}/用户设置验收前备份.json`, JSON.stringify(backup));
  await page.evaluate(async () => {
    window.__communityErrors = []; addEventListener('error', e => __communityErrors.push(e.message)); addEventListener('unhandledrejection', e => __communityErrors.push(String(e.reason)));
    window.__communityVisibility = e => e.stopImmediatePropagation(); document.addEventListener('visibilitychange', __communityVisibility, true);
    window.__communitySet = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v) { if (k.startsWith('great-powers-save-')) return; return __communitySet.call(this, k, v); };
    const load = path => import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path).name);
    const { Renderer } = await load('/src/render.js'), render = Renderer.prototype.render;
    Renderer.prototype.render = function(...args) { window.__communityRenderer = this; return render.apply(this, args); };
    window.__communityAudio = (await load('/src/audio.js')).gameAudio;
    window.__communityTick = seconds => { const r = __communityRenderer, g = r.game; g.paused = false; for (let i = 0; i < Math.ceil(seconds / .05); i++) g.update(.05); g.paused = true; r.render(); r.drawMinimap(); };
  });
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.selectOption('#map-select', 'ocean'); await page.click('#start-btn');
  await page.waitForFunction(() => window.__communityRenderer?.entities.size > 0, undefined, { timeout: 30000 });
  const port = await page.evaluate(() => {
    const r = __communityRenderer, g = r.game; g.paused = true; g.aiTimer = g.aiWaveTimer = 1e9; g.closestEnemy = () => null; g.units = [];
    g.logistics.forEach(route => { route.nextAir = route.nextSea = 1e9; });
    for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); } g.fogTimer = 1e9;
    const dock = g.ownedBuildings(0, 'dock')[0], ship = g.launchFreight(0, true);
    Object.assign(ship, g.navalGoal(dock.x, dock.y, 100)); ship.angle = Math.PI / 2;
    const ally = g.addUnit(0, 'destroyer', g.map.water.x1 + 310, dock.y + 190);
    g.addUnit(1, 'frigate', g.map.water.x1 + 340, dock.y - 260);
    g.selected = [dock.id, ship.id, ally.id]; g.events.selection?.(); r.centerOn(dock.x + 130, dock.y); r.camera.zoom = 1.3; r.updateCamera(); r.render();
    window.__communityDock = dock.id;
    const entry = r.entities.get(dock.id); return { sprite: !!entry.sprite, children: entry.model.children.length, topHeight: entry.topHeight, scale: entry.scale };
  }); check(!port.sprite && port.topHeight > 60, '港口未使用三维结构'); report.port = port;
  await shot('01-harbor-and-naval-coating');
  const scars = await page.evaluate(() => {
    const r = __communityRenderer, g = r.game, x = 810, y = g.homeY + 320;
    for (const [dx, size] of [[0, 65], [220, 95]]) g.effects.push({ type: 'explosion', x: x + dx, y, targetType: 'factory', size, age: 0, duration: .8 });
    g.selected = []; r.centerOn(x + 140, y); r.camera.zoom = 1.7; r.updateCamera(); r.render(); __communityTick(1);
    const read = () => {
      const point = r.worldToScreen(x + 220, y, r.elevation(x + 220, y) + .2), gl = r.webgl.getContext(), scale = gl.drawingBufferWidth / r.viewport.width;
      const pixels = new Uint8Array(24 * 24 * 4); gl.readPixels(Math.round(point.x * scale) - 12, gl.drawingBufferHeight - Math.round(point.y * scale) - 12, 24, 24, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let brightness = 0; for (let i = 0; i < pixels.length; i += 4) brightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      return brightness / (24 * 24);
    };
    const marked = read(); r.scorchMesh.visible = r.craterMesh.visible = false; r.render(); const clean = read();
    r.scorchMesh.visible = r.craterMesh.visible = true; r.render();
    return { marks: r.scorchMarks.length, geometry: r.craterMesh.geometry.type, instances: r.craterMesh.count, contrast: clean - marked };
  }); check(scars.geometry === 'BufferGeometry' && scars.instances === 2 && scars.contrast > 8, '新弹坑未显示或被地面遮住'); report.scars = scars; await shot('02-fractured-craters');
  report.air = await page.evaluate(() => {
    const r = __communityRenderer, g = r.game; g.units = []; g.logistics[0].delivered = 0;
    window.__communityPower = g.hasPower; g.hasPower = () => false;
    const a = g.launchFreight(0), b = g.launchFreight(0), home = g.getEntity(a.freight.homeId);
    Object.assign(a, { x: home.x + 155, y: home.y }); Object.assign(b, { x: home.x + 155, y: home.y + 80 });
    __communityTick(20); g.selected = [a.id, b.id]; g.events.selection?.(); r.centerOn(home.x + 300, home.y); r.camera.zoom = .95; r.updateCamera(); r.render();
    return { separation: Math.hypot(a.x - b.x, a.y - b.y), service: a.freight.phase, holding: b.freight.holding, delivered: g.logistics[0].delivered };
  }); check(report.air.separation > 136 && report.air.holding && !report.air.delivered, '积压航班未分离'); await shot('03-separated-freight-flights');
  const delivered = await page.evaluate(() => { const g = __communityRenderer.game; g.hasPower = __communityPower; __communityTick(100); return { income: g.logistics[0].delivered, planes: g.activeUnits(0, 'freightPlane').length }; });
  check(delivered.income === 1440 && !delivered.planes, '复电后航班未全部交付退出'); report.air.completion = delivered;
  await page.evaluate(() => {
    const r = __communityRenderer, g = r.game;
    const structures = [['radar', 580, g.homeY - 310], ['airfield', 810, g.homeY - 310], ['lab', 1040, g.homeY - 310], ['super', 1050, g.homeY]];
    for (const [type, x, y] of structures) g.addBuilding(0, type, x, y);
    for (const side of [0, 1]) for (let i = 0; i < 5; i++) g.addBuilding(side, 'power', side ? g.world.width - 120 - i * 80 : 120 + i * 80, 180);
    g.addBuilding(1, 'super', g.world.width - 200, 380); g.recalculatePower(); r.centerOn(690, g.homeY - 130); r.camera.zoom = 1.1; r.updateCamera(); r.render();
  }); await shot('04-coherent-3d-facilities');
  const structures = await page.evaluate(() => [...__communityRenderer.entities.values()].filter(e => ['radar', 'airfield', 'lab', 'super'].includes(e.entity.type)).map(e => ({ type: e.entity.type, sprite: !!e.sprite, height: e.topHeight })));
  check(structures.every(e => !e.sprite && e.height > 10), '三维设施存在旧图片立面'); report.structures = structures;
  await page.evaluate(() => { const g = __communityRenderer.game; g.paused = false; g.players[1].credits = 3000; g.players[1].cyberCharge = 120; window.__communityLaunched = g.launchCyber(1); g.paused = true; __communityTick(12.2); });
  check(await page.evaluate(() => __communityLaunched && __communityRenderer.game.isControlLocked(0)), '网络攻击未进入干扰');
  await page.waitForFunction(() => document.querySelector('#cyber-status').textContent.includes('链路干扰'));
  await shot('05-cyber-radar-static');
  const center = await page.evaluate(() => ({ ...__communityRenderer.center })); await page.click('#minimap');
  check(await page.evaluate(center => __communityRenderer.center.x === center.x && __communityRenderer.center.y === center.y, center), '雪花屏仍可定位地图');
  for (const [width, height] of [[1280, 800], [1024, 768]]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    const layout = await page.evaluate(() => ({ width: innerWidth, headerOverflow: document.querySelector('.topbar').scrollWidth > document.querySelector('.topbar').clientWidth + 1 }));
    check(!layout.headerOverflow, '标题栏溢出'); report.layouts.push(layout); await shot(`06-desktop-${width}`);
  }
  await page.evaluate(() => { const g = __communityRenderer.game; g.ownedBuildings(1, 'super')[0].hp = 0; g.updateIntelligence(.05); __communityRenderer.drawMinimap(); });
  check(await page.evaluate(() => !__communityRenderer.game.isControlLocked(0)), '摧毁源站未恢复雷达');
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.evaluate(async () => { const { CatalogPreview } = await import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/catalog-preview.js').name), start = CatalogPreview.prototype.start; CatalogPreview.prototype.start = function(...args) { window.__communityPreview = this; return start.apply(this, args); }; });
  await page.click('#catalog-btn'); await page.waitForSelector('#catalog-detail', { state: 'visible' });
  for (const [kind, type] of [['building', 'dock'], ['unit', 'destroyer'], ['building', 'airfield']]) {
    await page.click(`[data-entry="${kind}:${type}"]`);
    const result = await page.evaluate(() => { const p = __communityPreview; p.renderer.render(p.scene, p.camera); const gl = p.renderer.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); let visible = 0; for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) visible++; return { name: p.model.name, visible, calls: p.renderer.info.render.calls, error: gl.getError() }; });
    check(result.visible > 1000 && !result.error, '图鉴模型空白'); report.previews.push(result); await shot(`07-catalog-${type}`);
  }
  await page.click('[data-catalog-close]');
  report.pixels = await page.evaluate(() => { const r = __communityRenderer; r.render(); const gl = r.webgl.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels); const colors = new Set(); for (let i = 0; i < pixels.length; i += 64) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`); return { colors: colors.size, error: gl.getError(), errors: __communityErrors }; });
  check(report.pixels.colors > 100 && !report.pixels.error && !report.pixels.errors.length, '战场画面空白或运行错误');
  await fs.writeFile(`${folder}/验收报告.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally {
  // 保留用户原有战局、荣誉与音量设置，验收场景不进入用户存档。
  await page.evaluate(() => { if (window.__communityRenderer?.game) { __communityRenderer.game.running = false; __communityRenderer.game.paused = true; } window.__communityAudio?.stopBattle(); if (window.__communitySet) Storage.prototype.setItem = __communitySet; document.removeEventListener('visibilitychange', window.__communityVisibility, true); });
  if (backup) await page.evaluate(values => { for (const k of Object.keys(localStorage).filter(k => k.startsWith('great-powers-'))) if (!Object.hasOwn(values, k)) localStorage.removeItem(k); for (const [k, v] of Object.entries(values)) localStorage.setItem(k, v); }, backup);
}
