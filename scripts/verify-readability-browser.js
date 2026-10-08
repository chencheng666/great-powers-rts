const { root, taskSpaceId, url } = globalThis.READABILITY_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const fs = await import('node:fs/promises'), folder = `${root}/releases/readability-qa`;
await fs.mkdir(folder, { recursive: true });
const check = (value, message) => { if (!value) throw new Error(message); };
const report = { layouts: [], maps: [] };
await page.goto(url);
await page.waitForSelector('#start-btn');
await page.evaluate(async () => {
  const resource = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js');
  const { Renderer } = await import(resource.name), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__readabilityRenderer = this; return render.apply(this, args); };
  window.__readabilityErrors = [];
  addEventListener('error', e => __readabilityErrors.push(e.message));
  addEventListener('unhandledrejection', e => __readabilityErrors.push(String(e.reason)));
  document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
});
for (const [width, height] of [[1512, 900], [1280, 800], [1024, 768]]) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const result = await page.evaluate(() => {
    const box = selector => {
      const r = document.querySelector(selector).getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom };
    };
    const fields = ['#map-select', '.victory-options', '#enemy-select', '#difficulty-select', '#start-btn', '#online-btn'].map(box);
    return { width: innerWidth, fields, hero: box('.start-content'), band: box('.faction-picker'),
      overflow: document.querySelector('#start-screen').scrollWidth > innerWidth,
      clipped: [...document.querySelectorAll('.faction-option strong,.faction-option small,.battle-entry button')].some(e => e.scrollWidth > e.clientWidth + 1) };
  });
  check(!result.overflow && !result.clipped && result.hero.bottom <= result.band.y, '首页出现溢出、裁字或重叠');
  check(result.fields.every(r => r.height === 48), '部署控件高度不一致');
  check(result.fields[4].y === result.fields[5].y, '两个开战按钮未对齐');
  if (width >= 1280) check(result.fields.every(r => r.y === result.fields[0].y), '桌面部署控件未对齐');
  report.layouts.push(result);
  await page.screenshot({ path: `${folder}/首页-${width}.png` });
}
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1512, height: 900, deviceScaleFactor: 1, mobile: false });
for (const map of ['valley', 'canyon', 'strait', 'frontier', 'ocean', 'archipelago', 'meridian']) {
  // 验收使用独立本地端口，不覆盖玩家平时试玩的存档。
  await page.selectOption('#map-select', map);
  await page.evaluate(() => { window.__readabilityRenderer = null; });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__readabilityRenderer?.entities.size > 0, undefined, { timeout: 30000 });
  const result = await page.evaluate(() => {
    const r = __readabilityRenderer, g = r.game; g.paused = true; g.aiTimer = g.aiWaveTimer = 1e9;
    for (const f of g.fogs) { f.visible.fill(true); f.explored.fill(true); } g.fogTimer = 1e9;
    const x = g.map.water ? (g.map.water.x1 + g.map.water.x2) / 2 : 740, y = g.homeY + 100;
    g.units = []; g.selected = [];
    const types = g.map.water ? ['destroyer', 'drone', 'frigate'] : ['tank', 'rifle', 'engineer', 'drone', 'supply'];
    const units = [];
    for (const owner of [0, 1]) for (const [index, type] of types.entries()) units.push(g.addUnit(owner, type, x + (owner ? 170 : -130) + index * 24, y + index * 60 - 100));
    r.centerOn(x, y); r.camera.zoom = 1.5; r.updateCamera();
    const quality = [];
    for (const value of ['standard', 'high']) {
      r.setQuality(value); r.render(performance.now());
      const gl = r.webgl.getContext(), pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
      gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const colors = new Set(); for (let i = 0; i < pixels.length; i += 128) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
      quality.push({ value, colors: colors.size, error: gl.getError() });
    }
    const enemy = units.find(u => u.owner === 1); const visible = g.canSeeEntity;
    g.canSeeEntity = (owner, entity) => entity.id === enemy.id ? false : visible.call(g, owner, entity);
    r.render(performance.now()); const hidden = !r.entities.get(enemy.id).identity.visible;
    g.canSeeEntity = visible; r.render(performance.now());
    return { map: g.mapId, quality, hidden, markers: units.every(u => r.entities.get(u.id).identity.visible), errors: __readabilityErrors };
  });
  check(result.hidden && result.markers && !result.errors.length && result.quality.every(q => q.colors > 100 && q.error === 0), '模型、识别标记、迷雾或画质切换异常');
  report.maps.push(result);
  await page.screenshot({ path: `${folder}/战场-${map}.png` });
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  await page.waitForSelector('#start-btn');
}
await fs.writeFile(`${folder}/验收报告.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
