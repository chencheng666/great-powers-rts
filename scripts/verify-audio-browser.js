const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const check = (value, message) => { if (!value) throw new Error(message); };
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
await page.goto('http://localhost:4173/');
const keys = ['great-powers-audio-v1', 'great-powers-save-manual-v1', 'great-powers-save-auto-v1', 'great-powers-sidebar'];
const backup = await page.evaluate(keys => Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)])), keys);
try {
  await page.evaluate(() => {
    window.__audioCheck = { contexts: [], sources: [], gains: [], errors: [] };
    addEventListener('unhandledrejection', event => __audioCheck.errors.push(String(event.reason)));
    if (window.speechSynthesis) window.speechSynthesis.getVoices = () => [];
    const Base = window.AudioContext;
    window.AudioContext = class extends Base {
      constructor(...args) { super(...args); __audioCheck.contexts.push(this); }
      createGain() { const n = super.createGain(); __audioCheck.gains.push(n); return n; }
      createBufferSource() {
        const n = super.createBufferSource(), start = n.start.bind(n), stop = n.stop.bind(n);
        n.start = (...args) => { n.__started = true; start(...args); };
        n.stop = (...args) => { n.__stopped = true; stop(...args); };
        n.addEventListener('ended', () => { n.__ended = true; }); __audioCheck.sources.push(n); return n;
      }
    };
  });
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), original = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__audioRenderer = this; return original.apply(this, args); };
  });
  await page.click('#start-btn');
  await page.waitForFunction(() => __audioCheck.sources.some(s => s.loop && s.__started), undefined, { timeout: 60000 });
  await page.waitForFunction(() => window.__audioRenderer?.entities.size > 0, undefined, { timeout: 60000 });
  await page.evaluate(async () => {
    const resource = performance.getEntriesByType('resource').find(r => new URL(r.name).pathname.endsWith('/src/audio.js'));
    window.__gameAudioQA = (await import(resource.name)).gameAudio;
    __audioRenderer.game.paused = false;
    __gameAudioQA.setPaused(false); __gameAudioQA.setSettings({ muted: false, master: .75, voice: .95 });
    __gameAudioQA.clearVoices(); __gameAudioQA.cooldowns.clear();
  });
  await page.click('#sound-btn');
  // 自动化窗口切换会触发后台暂停；在同一页面事件里恢复后验证真实试听监听器。
  await page.evaluate(() => { __audioRenderer.game.paused = false; __gameAudioQA.setPaused(false); document.querySelector('#audio-test').click(); });
  console.log('试听状态', await page.evaluate(() => ({ paused: __gameAudioQA.paused, hidden: document.hidden, gamePaused: __audioRenderer.game.paused, queue: __gameAudioQA.voiceQueue.length, sources: __audioCheck.sources.length })));
  await page.waitForFunction(() => __audioCheck.sources.some(s => !s.loop && s.buffer?.duration > 2 && s.__started && !s.__ended));
  const fallback = await page.evaluate(() => {
    const a = __gameAudioQA, data = new Float32Array(a.analyser.fftSize); a.analyser.getFloatTimeDomainData(data);
    return { context: a.context.state, voiceSeconds: a.currentVoice?.source?.buffer.duration, rms: Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length) };
  });
  check(fallback.context === 'running' && fallback.voiceSeconds > 2, '无中文音色时，试听没有播放随包中文');
  console.log('离线试听通过', fallback);
  await page.evaluate(() => { const s = document.querySelector('[data-audio=music]'); s.value = '47'; s.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.click('#audio-muted');
  await page.waitForFunction(() => __audioCheck.gains[0].gain.value < .001 && !__gameAudioQA.currentVoice);
  const silence = await page.evaluate(() => {
    const a = __gameAudioQA, data = new Float32Array(a.analyser.fftSize); a.analyser.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum, x) => sum + x * x, 0) / data.length);
  });
  check(silence < .001, '静音后仍有明显输出');
  console.log('静音通过', silence);
  await page.click('#audio-muted'); await page.click('#audio-close');
  await page.keyboard.press('Escape');
  if (await page.evaluate(() => document.querySelector('#modal').classList.contains('hidden'))) await page.keyboard.press('Escape');
  await page.click('[data-modal=restart]'); await page.click('[data-modal=confirm-restart]');
  await page.waitForFunction(() => __audioCheck.sources.filter(s => s.loop && !s.__stopped).length === 1);
  check(await page.evaluate(() => __audioCheck.sources.filter(s => s.loop).length >= 2), '重开没有启动新的背景音乐');
  await page.click('#sound-btn');
  check(await page.evaluate(() => document.querySelector('[data-audio=music]').value === '47'), '音量没有持久化');
  await page.screenshot({ path: `${root}/docs/wechat-logistics-20261006/images/10-chinese-voice.png` });
  console.log(JSON.stringify({ fallback, silence, restartOneMusic: true, persisted: true, errors: await page.evaluate(() => __audioCheck.errors) }));
} finally {
  // 退出验证战局后再恢复用户数据，避免离页自动保存覆盖备份。
  if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) {
    if (await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))) await page.click('#modal-close');
    await page.click('#menu-btn'); await page.click('[data-modal=discard-menu]');
  }
  await page.evaluate(values => { for (const [k, v] of Object.entries(values)) v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); }, backup);
}
