const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const fs = await import('node:fs/promises');
await fs.mkdir(`${root}/docs/images`, { recursive: true });
await page.cdp('Network.setCacheDisabled', { cacheDisabled: true });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto('http://localhost:4173/');
const keys = ['great-powers-save-manual-v1', 'great-powers-save-auto-v1', 'great-powers-quality', 'great-powers-sidebar', 'great-powers-audio-v1'];
const backup = await page.evaluate(keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)])), keys);
const report = { menu: [], scenes: [] };
const check = (ok, msg) => { if (!ok) throw new Error(msg); };
async function menu() {
  const result = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('.faction-option, .deployment-controls button, .deployment-controls select, .start-content h1')];
    return { width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth > innerWidth, boxes: elements.map(e => {
      const b = e.getBoundingClientRect(); return { text: e.innerText, clipped: b.left < 0 || b.right > innerWidth || b.bottom > innerHeight, overflows: e.scrollWidth > e.clientWidth + 2 };
    }) };
  });
  check(!result.overflow && result.boxes.every(e => !e.clipped && !e.overflows), `主界面元素溢出：${JSON.stringify(result)}`);
  report.menu.push(result);
  await page.screenshot({ path: `${root}/docs/images/visual-menu-${result.width}.png` });
}
async function screenshot(file) {
  const result = await page.evaluate(() => {
    const r = __visualRenderer; document.querySelectorAll('.toast').forEach(e => e.remove()); r.resize(); r.render(performance.now()); r.drawMinimap();
    const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
    gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 512) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return { map: r.game.mapId, colors: colors.size, glError: gl.getError(), errors: __qaErrors, overflow: document.documentElement.scrollWidth > innerWidth, quality: r.quality, triangles: r.webgl.info.render.triangles };
  });
  check(result.colors > 150 && !result.glError && !result.errors.length && !result.overflow, `实机渲染异常：${JSON.stringify(result)}`);
  await page.screenshot({ path: `${root}/docs/images/${file}` }); report.scenes.push({ file, ...result });
}
async function back() {
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
}
try {
  await menu();
  for (const [width, height] of [[1280,800],[1024,768]]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false }); await menu();
  }
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.evaluate(async () => {
    window.__qaErrors = []; addEventListener('error', e => __qaErrors.push(e.message)); addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
    const url = performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), render = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__visualRenderer = this; return render.apply(this, args); };
  });
  for (const map of ['valley','meridian','ocean']) {
    await page.selectOption('#map-select', map); await page.selectOption('#enemy-select', 'nato'); await page.click('#start-btn');
    await page.waitForFunction(map => window.__visualRenderer?.game.mapId === map && __visualRenderer.entities.size > 0, map, { timeout: 60000 });
    if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
    await page.evaluate(() => {
      const r = __visualRenderer, g = r.game; g.paused = true; g.time = 40; g.aiTimer = g.aiWaveTimer = 1e9; g.closestEnemy = () => null;
      for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
      g.units = []; g.effects = []; g.players.forEach(p => p.credits = 30000);
      if (g.mapId !== 'ocean') {
        g.addBuilding(0, 'armory', 455, g.homeY + 200);
        ['tank','tank','supply','drone','fighter','strike','rifle','scout'].forEach((type,i) => g.addUnit(0,type,650 + (i%4)*80,g.homeY-100+Math.floor(i/4)*110));
        r.camera.zoom = 1.6; r.centerOn(510,g.homeY+50);
      } else {
        const sea = g.map.water;
        ['destroyer','carrier','landing','submarine'].forEach((type,i) => g.addUnit(0,type,sea.x1 + 160 + (i%2)*190,g.homeY-140+Math.floor(i/2)*240));
        r.camera.zoom = 1.25; r.centerOn(sea.x1+200,g.homeY);
      }
      r.updateFog(); r.render(performance.now());
      g.selected = [g.units[0].id]; g.events.selection?.();
    });
    await screenshot(`visual-${map}.png`);
    const models = await page.evaluate(() => {
      const r = __visualRenderer;
      return [...r.entities.values()].filter(e => e.entity.owner === 0 && ['hq','barracks','factory','armory','power'].includes(e.entity.type)).map(e => ({ type: e.entity.type, model: e.model.name, sprite: !!e.sprite, grounded: Math.abs(e.model.position.y - r.elevation(e.entity.x,e.entity.y)) < .01 }));
    });
    check(models.every(e => !e.sprite && e.grounded), '核心建筑仍使用贴片或未贴合地表');
    report.scenes.at(-1).models = models;
    await page.evaluate(() => {
      const r = __visualRenderer, g = r.game;
      const u = g.units.find(u => u.type === (g.mapId === 'ocean' ? 'destroyer' : 'tank'));
      const enemy = g.addUnit(1, u.type, u.x+235, u.y+15);
      g.fire(u, enemy, 15, 'tank');
      g.effects.push({ type: 'explosion', x: enemy.x+80, y: enemy.y+50, targetType: u.type, age: .22, duration: 1.2, size: 40, owner: 0 });
      g.effects.forEach(e => { if (e.type !== 'explosion') e.age = .025; });
      r.camera.zoom = 2; r.centerOn(u.x+125,u.y+20); r.render(performance.now());
    });
    await screenshot(`visual-${map}-combat.png`);
    const effects = await page.evaluate(() => {
      const r = __visualRenderer, g = r.game, effects = [...r.effects.values()];
      const before = effects.find(e => e.userData.impact?.explosion)?.children.at(-2).geometry.attributes.position.array.slice();
      g.time += .1; g.effects.forEach(e => e.age += .06); r.render(performance.now());
      const after = [...r.effects.values()].find(e => e.userData.impact?.explosion)?.children.at(-2).geometry.attributes.position.array;
      const moving = before && after && before.some((v,i) => v !== after[i]);
      const result = { lights: r.flashLights.length, sparksMoving: !!moving, traces: r.scorchMesh.count, impactLayers: effects.filter(e => e.userData.impact).map(e => e.children.length) };
      g.effects = []; g.time += 40; r.render(performance.now());
      result.cleaned = r.effects.size === 0 && r.scorchMesh.count === 0 && r.trails.length === 0 && r.flashLights.every(s => s.light.intensity === 0);
      r.setQuality('standard'); r.render(performance.now()); r.setQuality('high'); r.render(performance.now());
      return result;
    });
    check(effects.lights === 4 && effects.sparksMoving && effects.cleaned && effects.impactLayers.every(n => n >= 7), `特效动画或回收异常：${JSON.stringify(effects)}`);
    report.scenes.at(-1).effects = effects;
    await back();
  }
  await fs.writeFile(`${root}/releases/visual-browser-report.json`, JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
} finally {
  if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) await back();
  await page.evaluate(backup => { for (const [key,value] of Object.entries(backup)) if (value === null) localStorage.removeItem(key); else localStorage.setItem(key,value); }, backup);
}
