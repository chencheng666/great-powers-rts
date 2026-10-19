const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1'), fs = await import('node:fs/promises');
const folder = `${root}/releases/october-feedback-qa`, report = {};
const check = (value, message) => { if (!value) throw new Error(message); };
await fs.mkdir(folder, { recursive: true });
await page.goto('http://localhost:4188/');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
if (await page.evaluate(() => document.querySelector('#nickname-dialog').open)) {
  await page.fill('#nickname-dialog input', '反馈验收'); await page.click('#nickname-dialog button[type=submit]');
}
await page.evaluate(async () => {
  window.__feedbackErrors = [];
  addEventListener('error', e => __feedbackErrors.push(e.message));
  addEventListener('unhandledrejection', e => __feedbackErrors.push(String(e.reason)));
  const source = performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === '/src/render.js').name;
  const { Renderer } = await import(source), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) {
    window.__feedbackRenderer = this;
    if (window.__feedbackFailNext) { window.__feedbackFailNext = false; throw new Error('验收模拟：图形设备恢复测试'); }
    return render.apply(this, args);
  };
});
async function launch() {
  try { await page.click('#start-btn'); }
  catch (error) {
    if (!String(error).includes('timed out') || !await page.evaluate(() => !!window.__feedbackRenderer?.game.running)) throw error;
  }
}
await page.selectOption('#map-select', 'sixfront'); await launch();
await page.waitForFunction(() => window.__feedbackRenderer?.game.time > .1, undefined, { timeout: 60000 });
report.six = await page.evaluate(() => {
  const r = __feedbackRenderer, gl = r.webgl.getContext(), data = new Uint8Array(r.canvas.width * r.canvas.height * 4);
  gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const colors = new Set(); for (let i = 0; i < data.length; i += 4096) colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  return { players: r.game.players.length, time: r.game.time, quality: r.quality, postprocessing: !!r.composer, colors: colors.size, glError: gl.getError() };
});
check(report.six.players === 6 && report.six.quality === 'standard' && !report.six.postprocessing && report.six.colors > 100 && !report.six.glError, '六方直接渲染未通过');
await page.screenshot({ path: `${folder}/01-six-direct-render.png` });
const selection = await page.evaluate(() => {
  const r = __feedbackRenderer, g = r.game, origin = g.map.spawns[0];
  window.__feedbackOriginalUpdate = g.update; g.update = () => {};
  g.units = []; g.selected = [];
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  const a = g.addUnit(0, 'tank', origin.x + 400, origin.y + 400);
  const b = g.addUnit(0, 'tank', a.x + 115, a.y), other = g.addUnit(0, 'rifle', a.x + 60, a.y + 110);
  const outside = g.addUnit(0, 'tank', 4500, 4500), enemy = g.addUnit(1, 'tank', a.x + 280, a.y);
  r.centerOn(a.x + 60, a.y); r.camera.zoom = 1.3; r.updateCamera(); r.render(performance.now());
  const entry = r.entities.get(a.id), point = r.worldToScreen(a.x, a.y, entry.model.position.y + entry.topHeight * .5), rect = r.canvas.getBoundingClientRect();
  return { first: a.id, second: b.id, other: other.id, outside: outside.id, enemy: enemy.id, x: point.x + rect.x, y: point.y + rect.y };
});
await page.mouse.click(selection.x, selection.y); await page.mouse.click(selection.x, selection.y, { clickCount: 2 });
report.selection = await page.evaluate(() => [...__feedbackRenderer.game.selected]);
check(report.selection.length === 2 && report.selection.includes(selection.first) && report.selection.includes(selection.second), '原生鼠标双击没有正确选中当前视野同类单位');
await page.screenshot({ path: `${folder}/02-double-selection.png` });
await page.evaluate(id => { const g = __feedbackRenderer.game; g.selected = [id]; g.events.selection?.(); }, selection.other);
await page.keyboard.down('Shift'); await page.mouse.click(selection.x, selection.y); await page.mouse.click(selection.x, selection.y, { clickCount: 2 }); await page.keyboard.up('Shift');
report.shiftSelection = await page.evaluate(() => [...__feedbackRenderer.game.selected]);
check(report.shiftSelection.length === 3 && report.shiftSelection.includes(selection.other), 'Shift双击没有保留原选择');
const before = await page.evaluate(() => { const g = __feedbackRenderer.game; g.update = __feedbackOriginalUpdate; window.__feedbackFailNext = true; return { battleId: g.battleId, time: g.time }; });
await page.waitForFunction(() => document.querySelector('#modal-content h2')?.textContent === '战场显示中断', undefined, { timeout: 10000 });
await page.screenshot({ path: `${folder}/03-recovery-dialog.png` });
await page.click('[data-modal=recover-render]');
await page.waitForFunction(() => document.querySelector('#modal-content h2')?.textContent === '画面已恢复', undefined, { timeout: 30000 });
report.recovery = await page.evaluate(() => ({ battleId: __feedbackRenderer.game.battleId, time: __feedbackRenderer.game.time, paused: __feedbackRenderer.game.paused, quality: __feedbackRenderer.quality }));
check(report.recovery.battleId === before.battleId && report.recovery.paused && report.recovery.time >= before.time, '运行中恢复丢失战局');
await page.click('[data-modal=resume]');
await page.waitForFunction(t => __feedbackRenderer.game.time > t, report.recovery.time, { timeout: 10000 });
await page.click('#menu-btn'); await page.click('[data-modal=discard-menu]');
await page.selectOption('#map-select', 'meridian');
await page.evaluate(() => { window.__feedbackFailNext = true; }); await launch();
await page.waitForFunction(() => document.querySelector('#modal-content h2')?.textContent === '战场显示中断', undefined, { timeout: 30000 });
check(await page.evaluate(() => !document.querySelector('#start-btn').disabled), '启动异常后开始按钮未恢复');
await page.click('[data-modal=recover-render]');
await page.waitForFunction(() => __feedbackRenderer.game.mapId === 'meridian' && __feedbackRenderer.game.time > .1 && document.querySelector('#modal').classList.contains('hidden'), undefined, { timeout: 60000 });
report.startupRecovery = await page.evaluate(() => ({ map: __feedbackRenderer.game.mapId, time: __feedbackRenderer.game.time, errors: __feedbackErrors }));
await page.screenshot({ path: `${folder}/04-lunar-startup-recovery.png` });
check(!report.startupRecovery.errors.length, '验收期间有未处理异常');
await page.evaluate(() => {
  const r = __feedbackRenderer, g = r.game, hq = g.ownedBuildings(0, 'hq')[0];
  g.update = () => {}; g.paused = false;
  const drone = g.addUnit(0, 'drone', hq.x + 280, hq.y + 100);
  g.selected = [drone.id]; g.events.selection?.(); r.centerOn(hq.x + 200, hq.y); r.render(performance.now());
});
await page.click('[data-action=auto-drone]');
check(await page.evaluate(() => !__feedbackRenderer.game.getEntity(__feedbackRenderer.game.selected[0]).autoDrone), '自主值守关闭无效');
await page.click('[data-action=auto-drone]');
check(await page.evaluate(() => __feedbackRenderer.game.getEntity(__feedbackRenderer.game.selected[0]).autoDrone), '自主值守开启无效');
await page.screenshot({ path: `${folder}/06-drone-autonomy.png` });
report.droneControl = true;
const pages = await task.pages(), downloads = pages.find(p => p.label === 'p2') || await task.newPage();
await downloads.goto('http://localhost:4188/downloads/index.html');
await downloads.waitForFunction(() => document.querySelectorAll('#current .file').length > 0);
await downloads.selectOption('#platform-filter', 'windows');
report.downloads = await downloads.evaluate(() => [...document.querySelectorAll('#current .file')].filter(e => getComputedStyle(e).display !== 'none').map(e => ({ platform: e.dataset.platform, label: e.querySelector('a').textContent })));
check(report.downloads.length > 0 && report.downloads.every(e => e.platform === 'windows'), '下载平台筛选无效');
await downloads.screenshot({ path: `${folder}/05-windows-download.png` });
await fs.writeFile(`${folder}/验收记录.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
