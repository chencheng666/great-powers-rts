const { root, taskSpaceId, url, pageLabel = 'p3' } = globalThis.COMMUNITY3D_QA;
const fs = await import('node:fs/promises'), task = await taskSpace(taskSpaceId), page = task.page(pageLabel);
const folder = `${root}/releases/community3d-qa`; await fs.mkdir(folder, { recursive: true });
const assert = (value, message) => { if (!value) throw new Error(message); };
await page.goto(url); await page.waitForSelector('#start-btn');
await page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js').name;
  const { Renderer } = await import(url), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__communityRenderer = this; return render.apply(this, args); };
  window.__communityErrors = []; const error = console.error;
  console.error = (...args) => { __communityErrors.push(args.map(String).join(' ')); error(...args); };
  addEventListener('error', e => __communityErrors.push(e.message));
  addEventListener('unhandledrejection', e => __communityErrors.push(String(e.reason)));
  document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
});
const report = { maps: [] };
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1512, height: 900, deviceScaleFactor: 1, mobile: false });
for (const map of ['valley', 'canyon', 'strait', 'frontier', 'ocean', 'archipelago', 'meridian']) {
  await page.selectOption('#map-select', map); await page.click('#start-btn');
  await page.waitForFunction(map => window.__communityRenderer?.game.mapId === map && window.__communityRenderer.entities.size > 0, map, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const r = __communityRenderer, g = r.game; g.paused = true; g.aiTimer = g.aiWaveTimer = 1e9;
    for (const f of g.fogs) { f.visible.fill(true); f.explored.fill(true); } g.fogTimer = 1e9;
    const x = g.map.water ? (g.map.water.x1 + g.map.water.x2) / 2 : 850, y = g.homeY + 160;
    const u = g.addUnit(0, g.map.water ? 'destroyer' : 'tank', x, y); u.hp = u.maxHp * .48;
    r.camera.zoom = 1.55; r.centerOn(x, y); r.render(performance.now());
    const projections = [];
    for (const mode of ['tactical', 'immersive']) {
      r.setViewMode(mode); r.render(performance.now());
      const p = r.worldToScreen(r.center.x, r.center.y), q = r.screenToWorld(p.x, p.y);
      const anchor = r.worldToScreen(u.x, u.y, r.entities.get(u.id).model.position.y + 10);
      projections.push({ mode, error: Math.hypot(q.x - r.center.x, q.y - r.center.y), picked: r.pickEntity(anchor.x, anchor.y)?.id === u.id });
    }
    const gl = r.webgl.getContext(); for (let i = 0; i < 4 && gl.getError() !== gl.NO_ERROR; i++) { /* 清除切换战局前残留的上下文错误。 */ }
    const qualities = [];
    for (const quality of ['standard', 'high']) {
      r.setQuality(quality); r.render(performance.now());
      const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const colors = new Set(); for (let i = 0; i < pixels.length; i += 128) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      qualities.push({ quality, error: gl.getError(), colors: colors.size });
    }
    const smoke = r.trails.some(t => t.damage), stage = r.entities.get(u.id).damageStage;
    u.hp = u.maxHp; r.render(performance.now()); const repaired = r.entities.get(u.id).damageStage === 0;
    const replacement = { ...u, hp: u.maxHp * .25, x: u.x + 1 }; g.units[g.units.indexOf(u)] = replacement;
    r.render(performance.now());
    const entry = r.entities.get(u.id), snapshotFresh = entry.entity === replacement && entry.model.userData.entity === replacement && entry.damageStage === 2;
    return { map: g.mapId, projections, qualities, stage, smoke, repaired, snapshotFresh, errors: __communityErrors };
  });
  assert(result.projections.every(p => p.error < .001 && p.picked), `${map} 的坐标映射或点选异常`);
  assert(result.qualities.every(q => q.error === 0 && q.colors > 100), `${map} 的画面或 WebGL 异常`);
  assert(result.stage === 1 && result.smoke && result.repaired && result.snapshotFresh && !result.errors.length, `${map} 的损伤恢复异常`);
  report.maps.push(result);
  if (map === 'valley') {
    await page.evaluate(() => {
      const r = __communityRenderer, g = r.game, b = g.addBuilding(0, 'factory', 850, g.homeY + 170);
      b.hp = b.maxHp * .2;
      for (let i = 0; i < 12; i++) { g.time += .1; r.render(performance.now()); }
    });
    await page.screenshot({ path: `${folder}/立体战场-受损建筑.png` });
  }
  if (map === 'ocean') {
    report.sinking = await page.evaluate(() => {
      const r = __communityRenderer, g = r.game, ship = g.units.at(-1), center = { x: ship.x, y: ship.y };
      g.damage(ship, ship.maxHp * 2, 1); g.units = g.units.filter(u => u.hp > 0); r.render(performance.now());
      const wreck = r.wrecks.at(-1), initial = wreck?.model.position.y;
      g.time += 1.8; r.render(performance.now());
      const middle = wreck?.model.position.y, angle = wreck?.model.rotation.x;
      const pickedWreck = r.pickEntity(...Object.values(r.worldToScreen(center.x, center.y)))?.id === ship.id;
      window.__sinkingFinish = () => { g.time += 6; r.render(performance.now()); return r.wrecks.length; };
      return { count: r.wrecks.length, initial, middle, angle, pickedWreck };
    });
    assert(report.sinking.count === 1 && report.sinking.middle < report.sinking.initial && report.sinking.angle > 0 && !report.sinking.pickedWreck, '沉船动画或选择隔离异常');
    await page.screenshot({ path: `${folder}/舰船-侧倾下沉.png` });
    report.sinking.remaining = await page.evaluate(() => __sinkingFinish());
    assert(report.sinking.remaining === 0, '沉船未及时清理');
  }
  if (map === 'meridian') {
    report.moon = await page.evaluate(async () => {
      const { lunarCraters } = await import('/src/lunar-terrain.js'), r = __communityRenderer, craters = lunarCraters(r.game), c = craters[0];
      r.centerOn(c.x, c.y); r.camera.zoom = 1.25; r.updateCamera(); r.render(performance.now());
      return { count: craters.length, error: r.webgl.getContext().getError() };
    });
    assert(report.moon.count >= 16 && report.moon.error === 0, '月表地貌异常');
    await page.screenshot({ path: `${folder}/月表-三维陨石坑.png` });
  }
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
}
await fs.writeFile(`${folder}/验收报告.json`, JSON.stringify(report, null, 2)); console.log(report);
