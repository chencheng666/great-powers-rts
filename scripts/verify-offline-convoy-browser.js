const { root, taskSpaceId, mapId = 'ocean' } = globalThis.GAME_QA;
const robots = mapId === 'meridian', prefix = robots ? 'robots' : 'convoy';
const fs = await import('node:fs/promises');
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const names = (await fs.readdir(`${root}/releases`)).filter(name => /^\d{14}$/.test(name)).sort();
if (!names.length) throw new Error('先运行 npm run package:offline');
const file = `${root}/releases/${names.at(-1)}/Great-Powers-RTS/PLAY.html`;
const report = { file: 'Great-Powers-RTS/PLAY.html' };
const check = (ok, message) => { if (!ok) throw new Error(message); };
const keys = ['great-powers-save-manual-v1', 'great-powers-save-auto-v1', 'great-powers-audio-v1'];
await page.cdp('Network.enable');
await page.cdp('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
let backup;
try {
  await page.goto(`file://${file}`);
  backup = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
  await page.evaluate(() => {
    window.__offlineErrors = []; window.__decodedVoices = [];
    // 明确模拟目标 Linux 设备没有中文系统音色，验证随包 WAV 而非系统语音。
    Object.defineProperty(speechSynthesis, 'getVoices', { value: () => [] });
    addEventListener('error', e => __offlineErrors.push(e.message));
    addEventListener('unhandledrejection', e => __offlineErrors.push(String(e.reason)));
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) {
      if (this.buffer) {
        const data = this.buffer.getChannelData(0);
        __decodedVoices.push({ duration: this.buffer.duration, samples: data.length, rms: Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length), context: this.context.state });
      }
      return start.apply(this, args);
    };
  });
  await page.selectOption('#map-select', mapId); await page.click('#start-btn');
  await page.waitForFunction(() => document.querySelector('#start-screen').style.display === 'none' && document.querySelector('#game-canvas').width > 100, undefined, { timeout: 60000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#game-canvas'), gl = canvas.getContext('webgl2');
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 1024) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size > 150;
  }, undefined, { timeout: 60000 });
  await page.click('#save-btn');
  report.save = await page.evaluate(() => {
    const save = JSON.parse(localStorage.getItem('great-powers-save-manual-v1'));
    return { mode: save.config.economyMode, routes: save.state.logistics.length, ore: save.state.ore.length, miners: save.state.units.filter(u => u.type === 'harvester').length, robots: save.state.units.filter(u => ['rifle', 'engineer', 'scout'].includes(u.type)).map(u => ({ battery: u.battery, ammo: u.ammo })) };
  });
  if (robots) {
    check(report.save.mode === 'mining' && report.save.ore > 0 && report.save.miners > 0 && report.save.robots.length > 0 && report.save.robots.every(u => u.battery > 90 && u.ammo === null), '离线包月表机器人或采矿规则缺失');
    await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('great-powers-save-manual-v1'));
      const robot = save.state.units.find(u => u.owner === 0 && u.type === 'rifle');
      robot.battery = 17.35; robot.order = { type: 'rearm' }; save.state.selected = [robot.id];
      localStorage.setItem('great-powers-save-manual-v1', JSON.stringify(save));
    });
  } else check(report.save.mode === 'convoy' && report.save.routes === 2 && !report.save.ore && !report.save.miners, '离线包不是新版运输经济');
  await page.click('#sound-btn'); await page.click('#audio-test');
  await page.waitForFunction(() => __decodedVoices.some(v => v.duration > .1 && v.duration < 15 && v.rms > .001), undefined, { timeout: 15000 });
  report.render = await page.evaluate(() => {
    const canvas = document.querySelector('#game-canvas'), gl = canvas.getContext('webgl2');
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 1024) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return { colors: colors.size, glError: gl.getError(), errors: __offlineErrors, externalRequests: performance.getEntriesByType('resource').filter(r => /^https?:/.test(r.name)).map(r => r.name), voices: __decodedVoices, chineseSystemVoices: speechSynthesis.getVoices().filter(v => /^zh/.test(v.lang)).length, overflow: document.documentElement.scrollWidth - innerWidth };
  });
  check(!report.render.glError && !report.render.errors.length && !report.render.externalRequests.length && !report.render.overflow, '离线包有渲染错误、外部请求或溢出');
  await page.screenshot({ path: `${root}/releases/${prefix}-offline.png` });
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  await page.click('#continue-btn'); await page.click('[data-modal="load-manual"]');
  await page.waitForFunction(() => document.querySelector('#modal-content').textContent.includes('战局已恢复'));
  report.restored = true;
  if (robots) {
    report.restoredRobot = await page.evaluate(() => document.querySelector('#selection-panel').innerText);
    check(report.restoredRobot.includes('月卫战斗机器人') && report.restoredRobot.includes('电池 18%') && report.restoredRobot.includes('返场充电'), '离线读档没有恢复选中机体、电量和任务');
  }
  await page.click('[data-modal="resume"]');
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  await fs.writeFile(`${root}/releases/${prefix}-offline-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(report);
} finally {
  if (backup) await page.evaluate(values => { for (const [key, value] of Object.entries(values)) value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); }, backup);
  await page.cdp('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
}
