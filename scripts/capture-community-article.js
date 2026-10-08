const { root, taskSpaceId, url = 'http://127.0.0.1:5177/' } = globalThis.ARTICLE_CAPTURE;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const folder = `${root}/docs/wechat-community-20261008`;
await page.goto(url);
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
if (await page.evaluate(() => document.querySelector('#nickname-dialog').open)) {
  await page.fill('#nickname-dialog input', '共创试玩');
  await page.click('#nickname-dialog button[type=submit]');
}
await page.evaluate(async () => {
  const load = path => import(performance.getEntriesByType('resource').find(e => new URL(e.name).pathname === path).name);
  const { Renderer } = await load('/src/render.js'), render = Renderer.prototype.render;
  Renderer.prototype.render = function (...args) { window.__articleRenderer = this; return render.apply(this, args); };
  const { CatalogPreview } = await load('/src/catalog-preview.js'), show = CatalogPreview.prototype.show;
  CatalogPreview.prototype.show = function (...args) { window.__articlePreview = this; return show.apply(this, args); };
  const { GameAudio } = await load('/src/audio.js'), unlock = GameAudio.prototype.unlock;
  GameAudio.prototype.unlock = function (...args) { window.__articleAudio = this; return unlock.apply(this, args); };
  window.__articleErrors = [];
  addEventListener('error', e => __articleErrors.push(e.message));
  addEventListener('unhandledrejection', e => __articleErrors.push(String(e.reason)));
});
await page.screenshot({ path: `${folder}/images/01-home.png` });
await page.click('#honor-profile-btn');
await page.screenshot({ path: `${folder}/images/09-honor-current.png` });
await page.click('[data-honor-tab=rules]');
await page.screenshot({ path: `${folder}/images/10-honor-rules.png` });
await page.click('[data-honor-close]');
await page.click('#menu-catalog-btn');
await page.waitForFunction(() => window.__articlePreview?.frame && document.querySelector('#catalog-summary h3').textContent.includes('99A'));
await page.screenshot({ path: `${folder}/images/05-catalog-tank.png` });
await page.click('[data-category=infantry]'); await page.click('[data-entry="unit:rifle"]');
await page.screenshot({ path: `${folder}/images/06-catalog-personnel.png` });
await page.selectOption('#catalog-map', 'meridian');
await page.screenshot({ path: `${folder}/images/07-catalog-robot.png` });
await page.selectOption('#catalog-map', 'archipelago'); await page.click('[data-category=naval]'); await page.click('[data-entry="unit:destroyer"]');
await page.screenshot({ path: `${folder}/images/08-catalog-ship.png` });
await page.click('[data-catalog-close]');
await page.selectOption('#map-select', 'valley'); await page.selectOption('#enemy-select', 'nato'); await page.click('#start-btn');
await page.waitForFunction(() => window.__articleRenderer?.entities.size > 0);
await page.evaluate(() => {
  const r = __articleRenderer, g = r.game; g.paused = true; g.aiTimer = g.aiWaveTimer = 100000;
  const factory = g.ownedBuildings(0, 'factory')[0];
  g.selected = [factory.id]; g.events.selection?.();
  r.setViewMode('immersive'); r.camera.zoom = 1.2; r.centerOn(460, g.homeY); r.updateFog(); r.render();
});
await page.waitForSelector('#building-info', { state: 'visible' });
await page.screenshot({ path: `${folder}/images/02-singleplayer-base.png` });
// 在隔离演示局中布置双方单位，记录实际模拟产生的交火，而非合成特效。
await page.evaluate(() => {
  const r = __articleRenderer, g = r.game, y = g.homeY;
  g.units = []; g.selected = []; g.effects = []; g.projectiles = [];
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  const own = [
    g.addUnit(0, 'tank', 780, y - 60), g.addUnit(0, 'tank', 760, y + 65),
    g.addUnit(0, 'rocket', 650, y + 110), g.addUnit(0, 'supply', 640, y - 60),
    g.addUnit(0, 'laser', 730, y - 160), g.addUnit(0, 'drone', 820, y - 150),
  ];
  const enemies = [g.addUnit(1, 'tank', 1070, y - 60), g.addUnit(1, 'tank', 1100, y + 70), g.addUnit(1, 'rocket', 1170, y + 130), g.addUnit(1, 'drone', 1090, y - 140)];
  for (const u of enemies) u.angle = Math.PI;
  g.selected = own.slice(0, 3).map(u => u.id); g.events.selection?.(); g.command(1050, y, true);
  r.camera.zoom = 1.65; r.centerOn(950, y); r.updateFog(); r.render();
  window.__articleDemoStart = g.time;
});
if (!await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
await page.evaluate(() => {
  const r = __articleRenderer, g = r.game;
  g.paused = false;
  const canvas = r.canvas;
  const stream = canvas.captureStream(30), audio = window.__articleAudio;
  if (audio?.context && audio.master) {
    window.__articleAudioCapture = audio.context.createMediaStreamDestination();
    audio.master.connect(__articleAudioCapture);
    for (const track of __articleAudioCapture.stream.getAudioTracks()) stream.addTrack(track);
  }
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
  window.__articleRecorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6000000 });
  window.__articleChunks = []; window.__articleRecording = true;
  __articleRecorder.ondataavailable = e => { if (e.data.size) __articleChunks.push(e.data); };
  __articleRecorder.onstop = () => {
    const blob = new Blob(__articleChunks, { type: mimeType });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '实机交火-原始录制.webm'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000); stream.getTracks().forEach(track => track.stop());
    if (window.__articleAudioCapture) audio.master.disconnect(__articleAudioCapture);
    __articleRecording = false; g.paused = true;
  };
  __articleRecorder.start(); setTimeout(() => __articleRecorder.stop(), 8000);
});
const downloadPromise = page.waitForEvent('download', { timeout: 25000 });
await page.waitForFunction(() => __articleRenderer.game.time >= __articleDemoStart + 2);
await page.screenshot({ path: `${folder}/images/03-singleplayer-combat.png` });
const download = await downloadPromise;
await download.saveAs(`${folder}/videos/实机交火-原始录制.webm`);
const report = await page.evaluate(() => {
  const r = __articleRenderer; r.render(); const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
  gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const colors = new Set(); for (let i = 0; i < pixels.length; i += 120) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
  return { colors: colors.size, glError: gl.getError(), errors: __articleErrors, timeAdvanced: r.game.time - __articleDemoStart, width: r.canvas.width, height: r.canvas.height };
});
if (report.glError || report.colors < 100 || report.errors.length) throw new Error(JSON.stringify(report));
console.log(report);
