const { root, taskSpaceId, pageLabel = 'p1' } = globalThis.GAME_QA;
const fs = await import('node:fs/promises'), task = await taskSpace(taskSpaceId), page = task.page(pageLabel);
const folder = `${root}/releases/animation-tactics-qa`; await fs.mkdir(folder, { recursive: true });
await page.goto('http://127.0.0.1:4173/');
await page.cdp('Page.bringToFront', {});
await page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js').name;
  const { Renderer } = await import(url), original = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__qaRenderer = this; return original.apply(this, args); };
  window.__qaErrors = []; addEventListener('error', e => __qaErrors.push(e.message));
  document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
});
await page.click('#start-btn'); await page.waitForFunction(() => window.__qaRenderer?.entities.size > 0);
const cases = [];
for (const [count, quality] of [[60, 'high'], [120, 'high'], [240, 'high'], [240, 'standard']]) {
  await page.evaluate(({ count, quality }) => {
    window.__armyResult = null; window.__armyError = null;
    (async () => {
    const r = __qaRenderer, g = r.game; g.units = []; g.effects = []; g.multiplayer = true; g.fogTimer = 1e9;
    for (const f of g.fogs) { f.visible.fill(true); f.explored.fill(true); }
    const cx = g.world.width / 2, cy = g.world.height / 2;
    for (let i = 0; i < count; i++) {
      const side = i % 2, rank = Math.floor(i / 2), x = cx + (side ? 1 : -1) * (50 + rank % 8 * 43), y = cy - 285 + Math.floor(rank / 8) * 42;
      const u = g.addUnit(side, i % 3 ? 'rifle' : 'tank', x, y); u.hp = u.maxHp = 10000;
      u.order = { type: 'attackMove', x: cx + (side ? -100 : 100), y };
    }
    g.paused = false; r.setQuality(quality); r.setViewMode('immersive'); r.camera.zoom = 1.25; r.centerOn(cx, cy);
    for (let i = 0; i < 10; i++) await new Promise(requestAnimationFrame);
    const times = [], cpu = [], sim = [], original = r.render, update = g.update;
    r.render = function (...args) { const t = performance.now(); original.apply(this, args); cpu.push(performance.now() - t); };
    g.update = function (...args) { const t = performance.now(); update.apply(this, args); sim.push(performance.now() - t); };
    let previous = performance.now();
    try { for (let i = 0; i < 35; i++) { await new Promise(requestAnimationFrame); const now = performance.now(); times.push(now - previous); previous = now; } }
    finally { r.render = original; g.update = update; g.paused = true; }
    const stats = values => { const a = [...values].sort((x, y) => x - y); return { median: a[Math.floor(a.length / 2)], p95: a[Math.floor(a.length * .95)] }; };
    const gl = r.webgl.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    r.webgl.render(r.scene, r.viewCamera); const pixels = new Uint8Array(16 * 16 * 4); gl.readPixels(Math.floor(gl.drawingBufferWidth / 2), Math.floor(gl.drawingBufferHeight / 2), 16, 16, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { count, quality, frameMs: stats(times), renderCpuMs: stats(cpu), simulationMs: stats(sim), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '未提供', calls: r.webgl.info.render.calls, triangles: r.webgl.info.render.triangles, nonblank: pixels.some((n, i) => i % 4 !== 3 && n > 0), glError: gl.getError(), errors: __qaErrors, combat: g.battleStats.sides.map(s => ({ damage: s.damageDealt, kills: s.kills })) };
    })().then(result => window.__armyResult = result, error => window.__armyError = String(error));
  }, { count, quality });
  await page.waitForFunction(() => window.__armyResult || window.__armyError, undefined, { timeout: 120000 });
  const result = await page.evaluate(() => { if (__armyError) throw new Error(__armyError); return __armyResult; });
  if (!result.nonblank || result.glError || result.errors.length || !result.combat.some(s => s.damage > 0)) throw new Error(`军团验收失败：${JSON.stringify(result)}`);
  cases.push(result); console.log(result);
  if (count === 240) await page.screenshot({ path: `${folder}/240单位-${quality}.png` });
}
await fs.writeFile(`${folder}/军团性能报告.json`, JSON.stringify(cases, null, 2));
await page.evaluate(() => { __qaRenderer.game.endGame(0); }); await page.waitForSelector('.battle-report');
await page.screenshot({ path: `${folder}/单机战后复盘.png` });
