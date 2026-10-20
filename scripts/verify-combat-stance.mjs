const { root, taskSpaceId } = globalThis.GAME_QA;
const fs = await import('node:fs/promises');
const page = (await taskSpace(taskSpaceId)).page('p1'), folder = `${root}/releases/combat-stance-20261020`;
await fs.mkdir(folder, { recursive: true });
try {
  await page.cdp('Page.bringToFront', {});
  await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js').name;
    const { Renderer } = await import(url), render = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__qaRenderer = this; return render.apply(this, args); };
    window.__qaErrors = []; addEventListener('error', e => __qaErrors.push(e.message));
    addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
    const keys = ['great-powers-save-manual-v1', 'great-powers-save-auto-v1', 'great-powers-player-honors-v1', 'great-powers-challenge-profile-v1'];
    window.__qaProtected = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
    const set = Storage.prototype.setItem;
    window.__qaRestoreStanceStorage = () => { Storage.prototype.setItem = set; };
    Storage.prototype.setItem = function (k, v) { if (this === localStorage && Object.hasOwn(__qaProtected, k)) return; return set.call(this, k, v); };
  });
  await page.click('#start-btn'); await page.waitForFunction(() => window.__qaRenderer?.entities.size > 0);
  const click = await page.evaluate(() => {
    const r = __qaRenderer, g = r.game, update = g.update.bind(g);
    g.units = []; g.buildings = []; g.effects = []; g.projectiles = []; g.selected = [];
    g.time = 0; g.fogTimer = 1e9; g.map.barriers = []; g.paused = false; g.running = true;
    g.events.end = () => {}; g.checkVictory = () => {}; g.updateLogistics = () => {}; g.updateAI = () => {}; g.launchAIWave = () => {};
    g.update = () => {}; window.__qaTick = seconds => { for (let i = 0; i < seconds * 20; i++) update(.05); r.render(performance.now()); };
    for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
    const u = g.addUnit(0, 'tank', 1000, 920); u.fireTimer = 0; window.__qaTank = u.id;
    const enemy = g.addUnit(1, 'tank', 1350, 920); enemy.stunUntil = 1e9; window.__qaEnemy = enemy.id;
    g.addUnit(0, 'rifle', 980, 1010); g.addUnit(0, 'aa', 870, 940);
    const supply = g.addUnit(0, 'supply', 820, 1060); supply.stock = 0; supply.autoSupply = false;
    r.setQuality('high'); r.camera.zoom = 2.2; r.centerOn(1070, 930); r.render(performance.now());
    const p = r.worldToScreen(u.x, u.y, 15), rect = r.canvas.getBoundingClientRect();
    for (let y = -20; y <= 20; y += 3) for (let x = -15; x <= 15; x += 3) if (r.pickEntity(p.x + x, p.y + y)?.id === u.id) return { x: p.x + x + rect.x, y: p.y + y + rect.y };
    throw Error('没有找到可点击的坦克');
  });
  await page.mouse.click(click.x, click.y, { label: '选择阵地坦克' });
  await page.waitForSelector('[data-stance="guard"]');
  console.log(await page.snapshot());
  await page.click('[data-stance="guard"]');
  await page.waitForFunction(() => document.querySelector('[data-stance="guard"]').getAttribute('aria-pressed') === 'true');
  const guard = await page.evaluate(() => {
    const g = __qaRenderer.game, u = g.getEntity(__qaTank), enemy = g.getEntity(__qaEnemy), start = { x: u.x, y: u.y };
    __qaTick(2); const held = Math.hypot(u.x - start.x, u.y - start.y);
    enemy.x = 1240; __qaTick(2);
    return { held, distance: Math.hypot(u.x - start.x, u.y - start.y), ammo: u.ammo, enemyHP: enemy.hp, enemyMax: enemy.maxHp, stance: u.combatStance };
  });
  if (guard.distance > .01 || guard.ammo >= 30 || guard.enemyHP >= guard.enemyMax) throw Error(`警戒行为失败：${JSON.stringify(guard)}`);
  await page.screenshot({ path: `${folder}/01-guard.png` });
  await page.click('[data-stance="ceasefire"]');
  await page.waitForFunction(() => document.querySelector('[data-stance="ceasefire"]').getAttribute('aria-pressed') === 'true');
  const ceasefire = await page.evaluate(() => {
    const g = __qaRenderer.game, u = g.getEntity(__qaTank), ammo = u.ammo;
    __qaTick(2); return { before: ammo, after: u.ammo, stance: u.combatStance };
  });
  if (ceasefire.before !== ceasefire.after) throw Error('停火状态仍在耗弹');
  const attackPoint = await page.evaluate(() => {
    const r = __qaRenderer, enemy = r.game.getEntity(__qaEnemy), p = r.worldToScreen(enemy.x, enemy.y, 8), rect = r.canvas.getBoundingClientRect();
    return { x: p.x + rect.x, y: p.y + rect.y };
  });
  await page.mouse.click(attackPoint.x, attackPoint.y, { button: 'right', label: '下达明确攻击命令' });
  await page.waitForFunction(() => __qaRenderer.game.getEntity(__qaTank).combatStance === 'free');
  const materials = await page.evaluate(() => {
    const r = __qaRenderer; r.render(performance.now()); let armor = 0;
    r.entities.get(__qaTank).model.traverse(m => { if (m.isMesh) for (const material of Array.isArray(m.material) ? m.material : [m.material]) if (material.map?.userData?.surfaceKind === 'armor') armor++; });
    r.webgl.render(r.scene, r.viewCamera); const gl = r.webgl.getContext(), pixels = new Uint8Array(32 * 32 * 4);
    gl.readPixels(gl.drawingBufferWidth / 2 | 0, gl.drawingBufferHeight / 2 | 0, 32, 32, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { armor, nonblank: pixels.some((v, i) => i % 4 !== 3 && v > 0), glError: gl.getError() };
  });
  if (!materials.armor || !materials.nonblank || materials.glError) throw Error(`装甲显示失败：${JSON.stringify(materials)}`);
  const viewports = [];
  for (const [width, height] of [[1600, 1000], [1280, 800], [390, 844]]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    const viewport = await page.evaluate(async () => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const r = __qaRenderer; r.render(performance.now());
      const panel = document.querySelector('#selection-panel').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('[data-stance]')].map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
      return { width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, panel: { x: panel.x, y: panel.y, right: panel.right, bottom: panel.bottom }, buttons };
    });
    if (viewport.overflow > 0 || viewport.buttons.some(b => b.x < 0 || b.x + b.width > width || b.y < 0 || b.y + b.height > height)) throw Error(`姿态按钮越界：${JSON.stringify(viewport)}`);
    viewports.push(viewport);
    if (width === 1280) await page.screenshot({ path: `${folder}/02-desktop-1280.png` });
  }
  const integrity = await page.evaluate(() => ({ protectedUnchanged: Object.entries(__qaProtected).every(([k, v]) => localStorage.getItem(k) === v), errors: __qaErrors }));
  if (!integrity.protectedUnchanged || integrity.errors.length) throw Error(`页面或存档回归失败：${JSON.stringify(integrity)}`);
  const report = { guard, ceasefire, materials, viewports, integrity };
  await fs.writeFile(`${folder}/report.json`, JSON.stringify(report, null, 2)); console.log(report);
} finally {
  await page.evaluate(() => { if (window.__qaRenderer) window.__qaRenderer.game.running = false; window.__qaRestoreStanceStorage?.(); });
}
