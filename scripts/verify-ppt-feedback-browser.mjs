// 仅在本地 ego-browser 验收空间运行，使用受控战局，不上传成绩或连接公网房间。
// 调用前设置 GAME_QA={root:项目绝对路径,taskSpaceId:现有空间编号}。
const { root, taskSpaceId } = globalThis.GAME_QA;
const fs = await import('node:fs/promises');
const p = (await taskSpace(taskSpaceId)).page('p1');
const folder = `${root}/releases/ppt-feedback-20261024`;
await fs.mkdir(folder, { recursive: true });
await p.reload();
await p.waitForSelector('#start-btn');
await p.evaluate(async () => {
  const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js').name;
  const { Renderer } = await import(url), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__qaRenderer = this; return render.apply(this, args); };
  window.__qaErrors = [];
  addEventListener('error', e => __qaErrors.push(e.message));
  addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
});
await p.selectOption('#map-select', 'ocean');
await p.click('#start-btn');
await p.waitForFunction(() => !!window.__qaRenderer, undefined, { timeout: 30000 });
const point = await p.evaluate(() => {
  const r = __qaRenderer, g = r.game;
  g.update = () => {}; g.multiplayer = true; g.time = 0; g.units = []; g.effects = []; g.projectiles = []; g.fogTimer = 1e9;
  for (const f of g.fogs) { f.visible.fill(true); f.explored.fill(true); }
  const jet = g.addUnit(0, 'fighter', 850, 750), enemy = g.addUnit(1, 'tank', 1040, 750);
  jet.angle = 0; jet.fireTimer = 0;
  const home = g.addBuilding(0, 'airfield', 650, 1200); g.addBuilding(0, 'power', 300, 500);
  const rotor = g.addUnit(0, 'helicopter', home.x + 30, home.y), ship = g.addUnit(0, 'carrier', 1700, 1100);
  ship.angle = 0; ship.order = { type: 'move', x: 2100, y: 1100 };
  g.selected = [jet.id]; r.camera.zoom = 1.3; r.centerOn(1000, 900); r.render(performance.now());
  r.entities.get(rotor.id).rotorSpeed = 47;
  window.__pptFixture = { jet: jet.id, enemy: enemy.id, rotor: rotor.id, ship: ship.id };
  window.__pptResults = {};
  const rect = r.canvas.getBoundingClientRect(), s = r.worldToScreen(1250, 720);
  return { x: s.x + rect.x, y: s.y + rect.y };
});
await p.screenshot({ path: `${folder}/飞行验收布置.png` });
await p.mouse.click(point.x, point.y, { button: 'right', label: '复核战机移动优先' });
await p.evaluate(() => {
  const r = __qaRenderer, g = r.game, u = g.getEntity(__pptFixture.jet), rotor = g.getEntity(__pptFixture.rotor);
  const order = structuredClone(u.order), before = { x: u.x, y: u.y };
  let maxTurn = 0, minGoal = Infinity;
  const base = performance.now();
  // 用固定步长推进逻辑和渲染动画，避免帧率波动改变验收时长。
  for (let i = 0; i < 100; i++) {
    const angle = u.angle; g.time += .05; g.updateUnit(u, .05); g.updateUnit(rotor, .05);
    maxTurn = Math.max(maxTurn, Math.abs(Math.atan2(Math.sin(u.angle - angle), Math.cos(u.angle - angle))));
    minGoal = Math.min(minGoal, Math.hypot(u.x - order.x, u.y - order.y)); r.render(base + i * 50);
  }
  __pptResults.movement = { order, before, after: { x: u.x, y: u.y }, maxTurn, minGoal, ammo: u.ammo, rotorSpeed: r.entities.get(rotor.id).rotorSpeed };
  if (minGoal > 12 || u.ammo !== 9 || maxTurn > .047501 || r.entities.get(rotor.id).rotorSpeed !== 0) throw Error('飞行移动或停机桨叶检查失败');
  document.addEventListener('contextmenu', e => { __pptResults.hudMenuSuppressed = e.defaultPrevented; }, { once: true });
});
await p.click('#move-btn', { button: 'right', label: '复核战场右键菜单' });
await p.evaluate(() => {
  if (!__pptResults.hudMenuSuppressed) throw Error('战场指令栏仍弹出浏览器菜单');
  const r = __qaRenderer, g = r.game, ship = g.getEntity(__pptFixture.ship);
  ship.x = 1700; ship.y = 1100; ship.angle = 0; ship.order = { type: 'move', x: 2100, y: 1100 };
  g.selected = [ship.id]; r.camera.zoom = 1.45; r.centerOn(1700, 1100);
  const base = performance.now();
  for (let i = 0; i < 40; i++) { g.time += .05; g.updateUnit(ship, .05); r.render(base + i * 50); }
  const e = r.entities.get(ship.id), trails = r.trails.filter(t => t.ship && !t.torpedo), last = trails.at(-1);
  __pptResults.naval = { sternOffset: e.wakeStern, trails: trails.length, mesh: last?.sprite.isMesh, height: last?.sprite.position.y, renderOrder: last?.sprite.renderOrder };
  if (!last?.sprite.isMesh || e.wakeStern < 90 || last.sprite.renderOrder !== 3) throw Error('舰尾水面尾迹未恢复');
});
await p.screenshot({ path: `${folder}/舰船尾迹.png` });
await p.evaluate(() => {
  const r = __qaRenderer, g = r.game, deep = g.addUnit(0, 'submarine', 1750, 1450), detected = g.addUnit(0, 'submarine', 1750, 1650);
  for (const u of [deep, detected]) u.order = { type: 'move', x: 1900, y: u.y };
  detected.exposedUntil = g.time + 100;
  g.selected = [detected.id]; r.camera.zoom = 1.7; r.centerOn(1750, 1550); r.render(performance.now());
  __pptResults.submarines = [deep, detected].map(u => {
    const e = r.entities.get(u.id), material = e.submergedMaterials[0].mesh.material;
    return { detected: u === detected, height: e.model.position.y, verticalScale: e.model.scale.y / e.scale, material: material.type, opacity: material.opacity };
  });
  if (__pptResults.submarines.some(e => e.height >= 0 || e.material !== 'MeshBasicMaterial')) throw Error('潜艇暴露后未保留水下轮廓');
});
await p.screenshot({ path: `${folder}/潜艇水下轮廓.png` });
await p.evaluate(() => {
  const r = __qaRenderer, g = r.game, u = g.addUnit(0, 'bomber', 800, 1000), target = g.addBuilding(1, 'factory', 1100, 1000);
  u.angle = 0; u.fireTimer = 0; u.order = { type: 'attack', targetId: target.id, x: target.x, y: target.y };
  const start = g.time; let minTravel = Infinity;
  for (let i = 0; i < 2400 && u.order?.type !== 'rearm'; i++) {
    const x = u.x, y = u.y; g.time += .05; g.updateUnit(u, .05);
    if (u.order?.type !== 'rearm') minTravel = Math.min(minTravel, Math.hypot(u.x - x, u.y - y));
  }
  const shots = g.projectiles.filter(p => p.kind === 'bomb' && p.sourceId === u.id).length;
  __pptResults.bomber = { shots, ammo: u.ammo, order: u.order?.type, minTravel, elapsed: g.time - start };
  if (shots !== 4 || u.ammo !== 0 || u.order?.type !== 'rearm' || minTravel < 5) throw Error('轰炸机多轮飞越投弹失败');
  const nuclear = { id: 999999, kind: 'nuclear', owner: 0, hp: 120, age: 8, startX: 1400, startY: 1000, x: 1700, y: 1200, toX: 2200, toY: 1000, angle: 0 };
  g.projectiles.push(nuclear); r.render(performance.now());
  __pptResults.nuclearScale = r.projectileModels.get(nuclear.id).scale.x;
  if (__pptResults.nuclearScale !== 2.2) throw Error('战略弹头显示尺寸未更新');
});
await p.evaluate(async () => {
  const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/audio.js').name;
  const { gameAudio } = await import(url);
  gameAudio.syncNuclearWarnings([{ remaining: 20 }]);
  const earlySilent = !gameAudio.nuclearAlarm.source;
  gameAudio.syncNuclearWarnings([{ remaining: 11 }]);
  const source = gameAudio.nuclearAlarm.source;
  for (let i = 0; i < 100; i++) gameAudio.syncNuclearWarnings([{ remaining: 10 }]);
  __pptResults.alarm = { earlySilent, loop: source?.loop, duration: source?.buffer.duration, sameSource: gameAudio.nuclearAlarm.source === source };
  if (!earlySilent || !source || source.loop || source.buffer.duration !== 11 || !__pptResults.alarm.sameSource) throw Error('实际音频警报时机或循环不正确');
  gameAudio.syncNuclearWarnings([]);
  __pptResults.errors = __qaErrors; __pptResults.glError = __qaRenderer.webgl.getContext().getError();
  if (__qaErrors.length || __pptResults.glError) throw Error('浏览器运行或图形检查失败');
});
const results = await p.evaluate(() => __pptResults);
await fs.writeFile(`${folder}/浏览器验收.json`, JSON.stringify(results, null, 2));
console.log(results);
