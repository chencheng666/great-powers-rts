const { root, spaceId, pageLabel = 'p1' } = globalThis.COMMAND_INTEL_QA;
const task = await taskSpace(spaceId), page = task.page(pageLabel), fs = await import('node:fs/promises');
const folder = `${root}/releases/v2-command-intel`;
await fs.mkdir(folder, { recursive: true });
const check = (value, message) => { if (!value) throw new Error(message); };
const report = { scope: '受控场景与真实鼠标键盘输入，不代表自然完整对局或弱网验收' };
await page.goto('http://localhost:4173/');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.selectOption('#map-select', 'strategic');
await page.evaluate(async () => {
  const url = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/render.js').name;
  const { Renderer } = await import(url), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__commandQA = this; return render.apply(this, args); };
  window.__qaErrors = []; addEventListener('error', e => __qaErrors.push(e.message));
  addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
});
await page.click('#start-btn');
await page.waitForFunction(() => window.__commandQA?.entities.size > 0, undefined, { timeout: 60000 });
await page.evaluate(() => {
  const r = __commandQA, g = r.game;
  window.__manualUpdate = g.update.bind(g); g.update = () => {};
  g.units = []; g.buildings = []; g.isAI = () => false; g.checkVictory = () => {}; g.updateLogistics = () => {};
  g.addBuilding(0, 'hq', 400, 2000); g.addBuilding(1, 'hq', 6000, 2000);
  g.addBuilding(0, 'radar', 800, 1750); const power = g.addBuilding(0, 'power', 650, 1700);
  const u = g.addUnit(0, 'tank', 800, 1250), c = g.addUnit(0, 'counterIntel', 1000, 1600);
  window.__qaIds = { tank: u.id, counter: c.id, power: power.id };
  // 控制模拟时间低于自动存档阈值，测试不写入玩家的自动存档。
  g.time = 2; g.updateFog(); g.paused = false;
  r.camera.zoom = 1.15; r.centerOn(1100, 1400); r.render(performance.now());
});
const clickWorld = async (x, y, button = 'left') => {
  const p = await page.evaluate(({ x, y }) => { const r = __commandQA, p = r.worldToScreen(x, y), rect = r.canvas.getBoundingClientRect(); return { x: p.x + rect.x, y: p.y + rect.y }; }, { x, y });
  await page.mouse.click(p.x, p.y, { button, label: button === 'right' ? '下达测试航点' : '选择测试装备' });
};
const append = async () => {
  await page.keyboard.down('Shift');
  try { await clickWorld(1400, 1250, 'right'); await clickWorld(1400, 1550, 'right'); }
  finally { await page.keyboard.up('Shift'); }
};
await clickWorld(800, 1250); await clickWorld(1050, 1250, 'right'); await append();
await page.waitForSelector('[data-action="clear-waypoints"]');
report.queue = await page.evaluate(() => {
  const r = __commandQA, u = r.game.getEntity(__qaIds.tank), button = document.querySelector('[data-action="clear-waypoints"]');
  r.render(performance.now());
  return { selected: r.game.selected.includes(u.id), current: u.order, pending: u.orderQueue.length, badge: button.innerText, buttonWidth: button.getBoundingClientRect().width, routes: r.orderRoutes.map(v => ({ points: v.points.length, pending: v.queued.length })) };
});
check(report.queue.selected && report.queue.pending === 2 && report.queue.badge === '2' && report.queue.routes[0].pending === 2, '原生追加航点或面板反馈失败');
await page.screenshot({ path: `${folder}/01-waypoints.png` });
await page.click('[data-action="clear-waypoints"]');
report.clear = await page.evaluate(() => { const u = __commandQA.game.getEntity(__qaIds.tank); return { pending: u.orderQueue.length, currentX: u.order.x }; });
check(report.clear.pending === 0 && Math.abs(report.clear.currentX - 1050) < 1, '清空队列误删当前任务');
await append();
report.march = await page.evaluate(() => {
  const g = __commandQA.game, u = g.getEntity(__qaIds.tank), goals = [[1050, 1250], [1400, 1250], [1400, 1550]], visited = new Set();
  for (let i = 0; i < 600; i++) { __manualUpdate(.05); goals.forEach(([x, y], index) => { if (Math.hypot(u.x - x, u.y - y) < 15) visited.add(index); }); }
  return { visited: [...visited], pending: u.orderQueue.length, finished: !u.order, time: g.time };
});
check(report.march.visited.length === 3 && report.march.finished && report.march.pending === 0 && report.march.time < 40, '实际行军没有完成三段路线');
await page.waitForFunction(() => !document.querySelector('[data-action="clear-waypoints"]'));
await clickWorld(1000, 1600);
await page.waitForSelector('[data-action="counter-intel"]');
await page.waitForFunction(() => document.querySelector('.selection-health').innerText.includes('卫星遮蔽生效'));
report.ready = await page.evaluate(() => ({ state: __commandQA.game.counterIntelState(__commandQA.game.getEntity(__qaIds.counter)), label: document.querySelector('.selection-health').innerText, enabled: document.querySelector('[data-action="counter-intel"]').getAttribute('aria-pressed') }));
await page.screenshot({ path: `${folder}/02-counter-intel-active.png` });
await page.click('[data-action="counter-intel"]');
await page.waitForFunction(() => __commandQA.entities.get(__qaIds.counter).model.getObjectByName('counter_intel_mast').scale.y < .17);
report.disabled = await page.evaluate(() => ({ state: __commandQA.game.counterIntelState(__commandQA.game.getEntity(__qaIds.counter)), label: document.querySelector('.selection-health').innerText, mast: __commandQA.entities.get(__qaIds.counter).model.getObjectByName('counter_intel_mast').scale.y }));
check(report.disabled.state === 'disabled' && report.disabled.label.includes('已关闭'), '反侦察开关或收拢反馈失败');
await page.screenshot({ path: `${folder}/03-counter-intel-disabled.png` });
await page.click('[data-action="counter-intel"]');
await page.waitForFunction(() => __commandQA.entities.get(__qaIds.counter).model.getObjectByName('counter_intel_mast').scale.y > .95);
await page.evaluate(() => { const g = __commandQA.game; g.getEntity(__qaIds.power).hp = 0; g.recalculatePower(); });
await page.waitForFunction(() => document.querySelector('.selection-health').innerText.includes('电力不足'));
report.offline = await page.evaluate(() => ({ state: __commandQA.game.counterIntelState(__commandQA.game.getEntity(__qaIds.counter)), enabled: document.querySelector('[data-action="counter-intel"]').getAttribute('aria-pressed'), label: document.querySelector('.selection-health').innerText }));
check(report.offline.state === 'offline' && report.offline.enabled === 'true', '无法区分开关开启和实际工作');
await page.evaluate(() => { const g = __commandQA.game, p = g.getEntity(__qaIds.power); p.hp = p.maxHp; g.recalculatePower(); });
await page.waitForFunction(() => document.querySelector('.selection-health').innerText.includes('卫星遮蔽生效'));
report.pixels = await page.evaluate(() => {
  const r = __commandQA; r.render(performance.now()); const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
  gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const colors = new Set(); for (let i = 0; i < pixels.length; i += 4096) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  return { colors: colors.size, glError: gl.getError(), errors: __qaErrors };
});
check(report.pixels.colors > 50 && !report.pixels.glError && !report.pixels.errors.length, '场景空白或图形异常');
report.viewports = [];
for (const [width, height] of [[1280, 800], [390, 844]]) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  report.viewports.push(await page.evaluate(() => { const r = __commandQA; r.resize(); r.render(performance.now()); return { width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, glError: r.webgl.getContext().getError() }; }));
}
check(report.viewports.every(v => v.overflow <= 0 && !v.glError), '桌面或窄屏基础渲染失败');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await fs.writeFile(`${folder}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
console.log(report);
