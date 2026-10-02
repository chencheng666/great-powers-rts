const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const savedSidebar = await page.evaluate(() => localStorage.getItem('great-powers-sidebar'));
const results = [];
const check = (value, message) => { if (!value) throw new Error(message); };

async function start(width, height, mobile) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await page.goto('http://localhost:4173/');
  // 使用页面实际加载的模块 URL，兼容 Vite 热更新查询参数。
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(item => new URL(item.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), original = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__detailsQA = this; return original.apply(this, args); };
    window.__detailsErrors = [];
    addEventListener('error', event => window.__detailsErrors.push(event.message));
    addEventListener('unhandledrejection', event => window.__detailsErrors.push(String(event.reason)));
  });
  await page.selectOption('#map-select', 'frontier');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__detailsQA?.entities.size > 0);
  if (mobile && !await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
  if (mobile) await page.waitForFunction(() => Math.abs(__detailsQA.viewport.width - innerWidth) < 1 && Math.abs(__detailsQA.viewport.height - document.querySelector('#game-canvas').getBoundingClientRect().height) < 1);
  await page.evaluate(() => {
    const r = window.__detailsQA, g = r.game;
    g.aiTimer = Infinity; g.aiWaveTimer = Infinity;
    const b = g.ownedBuildings(0, 'factory')[0]; r.centerOn(b.x, b.y);
  });
}

async function selectFactory() {
  const point = await page.evaluate(() => {
    const r = window.__detailsQA, b = r.game.ownedBuildings(0, 'factory')[0], p = r.worldToScreen(b.x, b.y), rect = r.canvas.getBoundingClientRect();
    return { x: p.x + rect.x, y: p.y + rect.y };
  });
  await page.mouse.click(point.x, point.y, { label: '查看战车工厂信息' });
  check(await page.evaluate(() => __detailsQA.game.getEntity(__detailsQA.game.selected[0])?.type === 'factory'), '点击投影位置应选中战车工厂');
  await page.waitForSelector('#building-info', { state: 'visible' });
}

try {
await start(1512, 862, false);
await selectFactory();
await page.waitForFunction(() => document.querySelector('#building-info').innerText.includes('生产线待命'));
await page.screenshot({ path: `${root}/details-desktop.png` });
await page.click('#building-info [data-inspect="close"]');
await page.mouse.move(750,530);
await page.waitForFunction(() => document.querySelector('#building-info').hidden);
const before = await page.evaluate(() => ({ center: { ...__detailsQA.center }, rally: JSON.stringify(__detailsQA.game.ownedBuildings(0).map(b => b.rallyPoint)) }));
await page.click('#pan-map-btn');
await page.mouse.move(760, 530); await page.mouse.down(); await page.mouse.move(610, 510); await page.mouse.up();
await page.click('#pan-map-btn');
await page.mouse.move(750, 530); await page.mouse.down({ button: 'right' }); await page.mouse.move(550, 510); await page.mouse.up({ button: 'right' });
const after = await page.evaluate(() => ({ center: { ...__detailsQA.center }, rally: JSON.stringify(__detailsQA.game.ownedBuildings(0).map(b => b.rallyPoint)) }));
check(after.center.x > before.center.x + 250 && before.rally === after.rally, '地图拖拽不得误下集结命令');
await page.keyboard.press('H');
const rallyPoint = await page.evaluate(() => {
  const r = __detailsQA, p = r.worldToScreen(740, r.game.homeY + 120), rect = r.canvas.getBoundingClientRect();
  return { x: p.x + rect.x, y: p.y + rect.y };
});
await page.mouse.click(rallyPoint.x, rallyPoint.y, { button: 'right', label: '设置工厂集结点' });
check(await page.evaluate(() => Boolean(__detailsQA.game.ownedBuildings(0, 'factory')[0].rallyPoint)), '右键点击应仍能设置集结点');
await page.click('[data-tab="units"]'); await page.click('[data-unit="tank"]'); await page.click('[data-unit="rifle"]');
const production = await page.evaluate(() => {
  const r = __detailsQA, g = r.game;
  for (let frame = 0; frame < 1000; frame++) { g.update(.05); if (g.units.some(u => u.owner === 0 && u.type === 'tank' && u.deployment)) break; }
  const unit = g.units.find(u => u.owner === 0 && u.type === 'tank' && u.deployment), start = { x: unit.x, y: unit.y };
  for (let frame = 0; frame < 10; frame++) g.update(.05);
  r.render(performance.now()); g.paused = true;
  const infantry = [...r.entities.values()].filter(entry => entry.legs.length);
  return { exitMovement: Math.hypot(unit.x - start.x, unit.y - start.y), door: r.entities.get(unit.deployment.buildingId).entrance.door.scale.y, walkingModels: infantry.length, rallyOrder: unit.order?.type };
});
check(production.exitMovement > 20 && production.door < .1 && production.walkingModels >= 6 && production.rallyOrder === 'move', '出厂、卷帘门、步兵骨架或集结命令异常');
await page.screenshot({ path: `${root}/details-production.png` });
results.push({ desktopPan: { before, after }, production });

for (const [width, height] of [[390,844], [360,740], [844,390]]) {
  await start(width, height, true);
  await selectFactory();
  await page.waitForFunction(() => !document.querySelector('#building-info').hidden);
  const layout = await page.evaluate(() => {
    const r = __detailsQA, rect = document.querySelector('#building-info').getBoundingClientRect(), canvas = r.canvas.getBoundingClientRect();
    const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
    gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let index = 0; index < pixels.length; index += 80) colors.add(`${pixels[index]},${pixels[index+1]},${pixels[index+2]}`);
    const panel = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    const coversControls = [...document.querySelectorAll('.command-toolbar, .camera-tools, #selection-panel')].some(element => {
      const other = element.getBoundingClientRect(); return rect.left < other.right && rect.right > other.left && rect.top < other.bottom && rect.bottom > other.top;
    });
    const inside = rect.left >= canvas.left && rect.right <= canvas.right && rect.top >= canvas.top && rect.bottom <= canvas.bottom;
    return { width: innerWidth, height: innerHeight, panel, inside, coversControls, overflow: document.documentElement.scrollWidth - innerWidth, sampledColors: colors.size, glError: gl.getError(), errors: __detailsErrors };
  });
  await page.screenshot({ path: `${root}/details-mobile-${width}.png` });
  check(layout.inside && !layout.coversControls && !layout.overflow && layout.sampledColors > 200 && !layout.glError && !layout.errors.length, `移动端浮窗遮挡操作区、越界、画面空白或渲染报错：${JSON.stringify(layout)}`);
  await page.click('#building-info [data-inspect="close"]');
  await page.click('#pan-map-btn');
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 });
  const touchStart = await page.evaluate(() => ({ ...__detailsQA.center }));
  await page.cdp('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: width / 2, y: height * .65, id: 1 }] });
  for (let index = 1; index <= 12; index++) await page.cdp('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: width / 2 - index * 3, y: height * .65, id: 1 }] });
  await page.cdp('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const end = await page.evaluate(() => ({ ...__detailsQA.center }));
  check(end.x > touchStart.x + 20, '小幅连续触屏移动必须累积为拖拽');
  await page.click('#pan-map-btn'); await selectFactory();
  results.push({ ...layout, touchPan: end.x - touchStart.x });
  await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
}
console.log(JSON.stringify(results, null, 2));
} finally {
await page.evaluate(value => { if (value === null) localStorage.removeItem('great-powers-sidebar'); else localStorage.setItem('great-powers-sidebar', value); }, savedSidebar);
await page.cdp('Emulation.setTouchEmulationEnabled', { enabled: false });
await page.cdp('Emulation.clearDeviceMetricsOverride'); await page.goto('http://localhost:4173/');
}
