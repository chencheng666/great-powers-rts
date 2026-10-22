const { root, taskSpaceId } = globalThis.GAME_QA;
const fs = await import('node:fs/promises');
const page = (await taskSpace(taskSpaceId)).page('p1');
const folder = `${root}/releases/open-assets-20261022`;
await fs.mkdir(folder, { recursive: true });
await page.reload();
await page.waitForSelector('#start-btn');
await page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js').name;
  const { Renderer } = await import(url), original = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__qaRenderer = this; return original.apply(this, args); };
  window.__qaErrors = [];
  addEventListener('error', event => __qaErrors.push(event.message));
  addEventListener('unhandledrejection', event => __qaErrors.push(String(event.reason)));
});
await page.click('[data-faction=nato]');
await page.selectOption('#map-select', 'valley');
await page.click('#start-btn');
await page.waitForFunction(() => !!window.__qaRenderer, undefined, { timeout: 30000 });
const land = await page.evaluate(() => {
  const r = __qaRenderer, g = r.game;
  g.paused = true; g.multiplayer = true; g.units = []; g.effects = [];
  g.players[1].faction = 'russia'; g.fogTimer = 1e9;
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  const cy = g.homeY - 180;
  for (let i = 0; i < 6; i++) {
    const u = g.addUnit(0, 'tank', 1250 + i % 3 * 90, cy + Math.floor(i / 3) * 105);
    u.angle = -.2; u.order = { type: 'attackMove', x: 1710, y: u.y };
    u.hp = u.maxHp = 5000;
  }
  for (let i = 0; i < 3; i++) {
    const u = g.addUnit(1, 'tank', 1740, cy + i * 100); u.hp = u.maxHp = 5000;
    u.order = { type: 'attackMove', x: 1400, y: u.y };
  }
  r.setQuality('high'); r.setViewMode('immersive'); r.camera.zoom = 1.65; r.centerOn(1460, cy + 100);
  const start = g.units[0].x;
  g.paused = false;
  for (let i = 0; i < 100; i++) { g.update(.05); if (g.effects.some(e => e.type === 'shot')) break; }
  g.paused = true; g.selected = [g.units[0].id]; r.render(performance.now());
  return { moved: Math.abs(g.units[0].x - start) > 1, shots: g.effects.filter(e => e.type === 'shot').length, model: r.entities.get(g.units[0].id).model.name };
});
await page.screenshot({ path: `${folder}/01-装甲交战与扫描地表.png` });
const flight = await page.evaluate(() => {
  const r = __qaRenderer, g = r.game, cy = g.homeY - 650;
  g.units = []; g.effects = []; g.attackAlerts = []; g.selected = [];
  for (let i = 0; i < 2; i++) {
    const u = g.addUnit(0, 'fighter', 1250 + i * 125, cy + i * 130);
    u.angle = -.35; u.order = { type: 'move', x: 2200, y: cy + i * 100 };
  }
  g.paused = false; for (let i = 0; i < 20; i++) g.update(.05); g.paused = true;
  r.camera.zoom = 2.4; r.centerOn(1480, cy + 5); r.render(performance.now());
  return g.units.map(u => ({ model: r.entities.get(u.id)?.model.name, airborne: !g.aircraftGrounded(u) }));
});
await page.waitForFunction(() => document.querySelector('#attack-alert').hidden && document.querySelector('#selection-title')?.textContent !== 'M1A2 艾布拉姆斯', undefined, { timeout: 5000 });
await page.screenshot({ path: `${folder}/02-F22编队实机.png` });
await page.click('#menu-btn'); await page.click('text=不保存返回');
await page.click('#challenge-btn');
await page.click('[data-modal=challenge-islandwatch]');
await page.waitForFunction(() => __qaRenderer?.game.mapId === 'islandwatch', undefined, { timeout: 30000 });
const harbor = await page.evaluate(async () => {
  const { Box3, Vector3 } = await import('/node_modules/three/build/three.module.js');
  const r = __qaRenderer, g = r.game;
  g.paused = true; g.fogTimer = 1e9; g.selected = [];
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  const landing = g.units.find(u => u.type === 'landing'); landing.x = 1900; landing.y = 1850; landing.angle = -Math.PI / 2;
  const destroyer = g.units.find(u => u.type === 'destroyer'); destroyer.x = 1870; destroyer.y = 1550; destroyer.angle = Math.PI / 2;
  r.render(performance.now());
  const entry = [...r.entities.values()].find(e => e.entity.type === 'dock');
  const center = new Box3().setFromObject(entry.model).getCenter(new Vector3());
  r.setViewMode('immersive'); r.camera.zoom = 1.45; r.centerOn(center.x - 70, center.z - 45); r.render(performance.now());
  return { cranes: entry.model.children.filter(c => c.name === '开放资产装卸吊机').length, passengers: landing.passengers.length };
});
await page.screenshot({ path: `${folder}/03-群岛港口与登陆舰.png` });
await page.evaluate(() => { const r = __qaRenderer; r.camera.zoom = .66; r.centerOn(2570, 1650); r.render(performance.now()); });
await page.screenshot({ path: `${folder}/04-群岛地表全景.png` });
const pixels = await page.evaluate(() => {
  const r = __qaRenderer; r.webgl.render(r.scene, r.viewCamera);
  const gl = r.webgl.getContext(), data = new Uint8Array(32 * 32 * 4);
  gl.readPixels(gl.drawingBufferWidth / 2 | 0, gl.drawingBufferHeight / 2 | 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, data);
  return { nonblank: data.some((v, i) => i % 4 !== 3 && v > 0), error: gl.getError(), errors: __qaErrors };
});
if (!land.moved || !land.shots || flight.some(u => !u.airborne || u.model !== 'fighter_nato') || harbor.cranes !== 2 || !pixels.nonblank || pixels.error || pixels.errors.length) throw Error(JSON.stringify({ land, flight, harbor, pixels }));
await fs.writeFile(`${folder}/实机验收.json`, JSON.stringify({ land, flight, harbor, pixels }, null, 2));
console.log({ land, flight, harbor, pixels });
