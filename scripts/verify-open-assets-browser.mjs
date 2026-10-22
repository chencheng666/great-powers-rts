const { root, taskSpaceId, phase = 'after', count = 120, quality = 'high' } = globalThis.GAME_QA;
const fs = await import('node:fs/promises');
const page = (await taskSpace(taskSpaceId)).page('p1');
const folder = `${root}/releases/open-assets-20261022`;
await fs.mkdir(folder, { recursive: true });
await page.cdp('Page.bringToFront', {});
// 自动化标签页会被宿主按后台页节流；同一 CDP 会话保持前台调度再采样。
await page.cdp('Emulation.setFocusEmulationEnabled', { enabled: true });
await page.evaluate(({ count, quality }) => {
  window.__assetBenchmark = null;
  window.__assetBenchmarkError = null;
  (async () => {
    const r = window.__qaRenderer, g = r.game;
    g.paused = true; g.multiplayer = true; g.units = []; g.effects = [];
    g.fogTimer = 1e9;
    for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
    g.players[0].faction = 'nato'; g.players[1].faction = 'nato';
    const cx = g.world.width / 2, cy = g.homeY;
    for (let i = 0; i < count; i++) {
      const side = i % 2, rank = Math.floor(i / 2);
      const x = cx + (side ? 1 : -1) * (80 + rank % 8 * 48), y = cy - 300 + Math.floor(rank / 8) * 44;
      const type = i % 12 === 0 ? 'fighter' : i % 3 === 0 ? 'rifle' : 'tank';
      const unit = g.addUnit(side, type, x, y);
      unit.hp = unit.maxHp = 100000;
      unit.order = { type: 'attackMove', x: cx + (side ? -180 : 180), y };
    }
    r.setQuality(quality); r.setViewMode('immersive'); r.camera.zoom = 1.25; r.centerOn(cx, cy);
    g.paused = false;
    for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
    const frames = [], render = [], simulation = [];
    const originalRender = r.render, originalUpdate = g.update;
    r.render = function (...args) { const start = performance.now(); originalRender.apply(this, args); render.push(performance.now() - start); };
    g.update = function (...args) { const start = performance.now(); originalUpdate.apply(this, args); simulation.push(performance.now() - start); };
    let previous = performance.now();
    try {
      for (let i = 0; i < 30; i++) { await new Promise(requestAnimationFrame); const now = performance.now(); frames.push(now - previous); previous = now; }
    } finally { r.render = originalRender; g.update = originalUpdate; g.paused = true; }
    const stats = values => { const ordered = [...values].sort((a, b) => a - b); return { median: ordered[Math.floor(ordered.length / 2)], p95: ordered[Math.floor(ordered.length * .95)] }; };
    r.webgl.render(r.scene, r.viewCamera);
    const gl = r.webgl.getContext(), pixels = new Uint8Array(32 * 32 * 4), ext = gl.getExtension('WEBGL_debug_renderer_info');
    gl.readPixels(gl.drawingBufferWidth / 2 | 0, gl.drawingBufferHeight / 2 | 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { count, quality, frameMs: stats(frames), renderCpuMs: stats(render), simulationMs: stats(simulation), calls: r.webgl.info.render.calls, triangles: r.webgl.info.render.triangles, memory: r.webgl.info.memory, viewport: r.viewport, renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '未知', nonblank: pixels.some((v, i) => i % 4 !== 3 && v > 0), glError: gl.getError(), damage: g.battleStats.sides.map(side => side.damageDealt) };
  })().then(value => { window.__assetBenchmark = value; }, error => { window.__assetBenchmarkError = String(error); });
}, { count, quality });
await page.waitForFunction(() => window.__assetBenchmark || window.__assetBenchmarkError, undefined, { timeout: 60000 });
const result = await page.evaluate(() => {
  if (window.__assetBenchmarkError) throw new Error(window.__assetBenchmarkError);
  return window.__assetBenchmark;
});
if (!result.nonblank || result.glError) throw new Error(`军团画面验收失败：${JSON.stringify(result)}`);
await fs.writeFile(`${folder}/${phase}-${count}-${quality}.json`, JSON.stringify(result, null, 2));
await page.screenshot({ path: `${folder}/${phase}-${count}-${quality}.png` });
console.log(result);
