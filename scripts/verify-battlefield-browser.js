const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1512, height: 862, deviceScaleFactor: 1, mobile: false });
await page.goto('http://localhost:4173/');
const saved = await page.evaluate(() => localStorage.getItem('great-powers-sidebar'));
await page.click('#start-btn');
await page.waitForFunction(() => document.querySelector('#start-screen').style.display === 'none');
if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
await page.click('[data-build="power"]');
await page.waitForFunction(() => document.querySelector('#queue-progress').style.width !== '0%');
const before = await page.evaluate(() => ({ title: document.querySelector('#queue-title').textContent, progress: parseFloat(document.querySelector('#queue-progress').style.width), width: document.querySelector('#game-canvas').getBoundingClientRect().width }));
await page.click('#sidebar-close');
await page.waitForFunction(() => document.querySelector('#game-canvas').getBoundingClientRect().width === innerWidth);
await page.click('#fullscreen-btn');
await page.waitForFunction(() => Boolean(document.fullscreenElement));
const nativeFullscreen = await page.evaluate(() => document.querySelector('#fullscreen-btn').getAttribute('aria-pressed') === 'true');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.fullscreenElement);
await page.keyboard.press('b');
await page.waitForFunction(() => !document.querySelector('#command-sidebar').hidden);
const restored = await page.evaluate(() => ({ title: document.querySelector('#queue-title').textContent, progress: parseFloat(document.querySelector('#queue-progress').style.width), width: document.querySelector('#game-canvas').getBoundingClientRect().width, modalHidden: document.querySelector('#modal').classList.contains('hidden'), radarParent: document.querySelector('#minimap-shell').parentElement.id }));
if (!nativeFullscreen || before.title !== restored.title || restored.progress < before.progress || before.width !== restored.width || !restored.modalHidden || restored.radarParent !== 'command-sidebar') throw new Error('全屏、面板切换或对局保持验证失败');
await page.click('#sidebar-btn');
await page.click('#pause-btn');
// 临时测试战场复用正式渲染与规则，结束后销毁，不向正式页面暴露调试状态。
const density = await page.evaluate(async () => {
  const { Game } = await import('/src/game.js'), { Renderer } = await import('/src/render.js');
  const { unitRadius, unitLayer } = await import('/src/unit-spacing.js');
  const game = new Game('china', 'russia'); game.units = []; game.aiTimer = Infinity; game.aiWaveTimer = Infinity;
  const group = [];
  for (let i = 0; i < 9; i++) group.push(game.addUnit(0, i < 6 ? 'tank' : 'aa', 700 + i % 3 * 25, 680 + Math.floor(i / 3) * 25));
  for (let i = 0; i < 12; i++) group.push(game.addUnit(0, 'rifle', 730 + i % 4 * 8, 785 + Math.floor(i / 4) * 8));
  const jet = game.addUnit(0, 'fighter', 795, 740); group.push(jet);
  group.forEach((unit, index) => { unit.hp = unit.maxHp * (.23 + index % 5 * .15); });
  for (let n = 0; n < 150; n++) game.update(.05);
  for (const fog of game.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  game.selected = group.map(unit => unit.id);
  const host = document.createElement('div'); host.id = 'density-verification';
  Object.assign(host.style, { position: 'absolute', inset: '0', zIndex: 1, pointerEvents: 'none' });
  const canvas = document.createElement('canvas'); Object.assign(canvas.style, { width: '100%', height: '100%' });
  const minimap = document.createElement('canvas'); minimap.width = 284; minimap.height = 180;
  host.append(canvas); document.querySelector('#battlefield').prepend(host);
  const renderer = new Renderer(canvas, minimap, game); renderer.camera.zoom = 1.12; renderer.centerOn(680, 720);
  renderer.render(1000);
  const pixels = renderer.overlay.getImageData(0, 0, renderer.overlayCanvas.width, renderer.overlayCanvas.height).data;
  const bars = renderer.healthBars;
  const intersects = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  let overlaps = 0;
  for (const a of group) for (const b of group) if (a.id < b.id && unitLayer(a) === unitLayer(b) && Math.hypot(a.x - b.x, a.y - b.y) < unitRadius(a) + unitRadius(b) - 1) overlaps++;
  const gl = renderer.webgl.getContext(), data = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, data);
  const colors = new Set(); for (let i = 0; i < data.length; i += 40) colors.add(`${data[i]},${data[i+1]},${data[i+2]}`);
  document.querySelector('#modal').classList.add('hidden');
  const visibleHUD = document.querySelector('#selection-panel'); visibleHUD.innerHTML = '<span class="hud-label">当前选择</span><strong>22 个单位</strong><span>装甲编队</span>';
  window.__densityQA = { renderer, game, host, group, jet };
  return { units: group.length, overlaps, bars: bars.length, barOverlaps: bars.some(a => bars.some(b => a.id !== b.id && intersects(a,b))), overlayColoredPixels: pixels.filter((value, index) => index % 4 === 3 && value > 0).length, sampledColors: colors.size, glError: gl.getError() };
});
await page.screenshot({ path: `${root}/preview-density-v4.png` });
const motion = await page.evaluate(() => {
  const { renderer, game, group, jet } = window.__densityQA;
  const before = { x: group[0].x, y: group[0].y };
  game.selected = group.filter(unit => unit.type !== 'fighter').map(unit => unit.id); game.command(1080, 735);
  for (let i = 0; i < 160; i++) { game.update(.05); renderer.render(1020 + i * 50); }
  const screen = renderer.worldToScreen(jet.x, jet.y, renderer.entities.get(jet.id).model.position.y + 7), picked = renderer.pickEntity(screen.x, screen.y);
  return { moved: Math.hypot(group[0].x - before.x, group[0].y - before.y) > 80, tracks: renderer.trackMesh.count, damageSmoke: renderer.trails.some(trail => trail.damage), jetPicked: picked?.id === jet.id, draws: renderer.webgl.info.render.calls };
});
await page.screenshot({ path: `${root}/preview-convoy-v4.png` });
await page.evaluate(() => { window.__densityQA.renderer.dispose(); window.__densityQA.host.remove(); delete window.__densityQA; });
if (density.overlaps || density.barOverlaps || density.bars < 20 || density.overlayColoredPixels < 1000 || density.sampledColors < 1000 || density.glError || !motion.moved || motion.tracks < 20 || !motion.damageSmoke || !motion.jetPicked) throw new Error('密集部队、血条或动态细节验证失败');

const mobile = [];
for (const [width, height] of [[390,844],[360,740],[844,390]]) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
  await page.goto('http://localhost:4173/'); await page.click('#start-btn');
  await page.waitForFunction(() => document.querySelector('#start-screen').style.display === 'none');
  if (!await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
  await page.waitForFunction(() => document.querySelector('#game-canvas').getBoundingClientRect().bottom >= innerHeight - 1);
  const state = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, overflow: document.documentElement.scrollWidth - innerWidth, canvas: document.querySelector('#game-canvas').getBoundingClientRect().toJSON(), buttonsInside: [...document.querySelectorAll('.top-actions button')].every(button => { const rect = button.getBoundingClientRect(); return rect.x >= 0 && rect.right <= innerWidth && rect.top >= 0; }), radarParent: document.querySelector('#minimap-shell').parentElement.id }));
  mobile.push(state); await page.screenshot({ path: `${root}/preview-battle-wide-${width}.png` });
}
console.log(JSON.stringify({ before, restored, nativeFullscreen, density, motion, mobile }, null, 2));
if (mobile.some(state => state.overflow || !state.buttonsInside || state.radarParent !== 'compact-radar')) throw new Error('移动战场布局验证失败');
await page.evaluate(saved => { if (saved === null) localStorage.removeItem('great-powers-sidebar'); else localStorage.setItem('great-powers-sidebar', saved); }, saved);
await page.cdp('Emulation.clearDeviceMetricsOverride'); await page.goto('http://localhost:4173/');
