const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const check = (value, message) => { if (!value) throw new Error(message); };
const results = [];
const storageKeys = ['great-powers-save-manual-v1', 'great-powers-save-auto-v1', 'great-powers-quality', 'great-powers-sidebar'];
await page.goto('http://localhost:4173/');
const originalStorage = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), storageKeys);

async function instrument() {
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(item => new URL(item.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), original = Renderer.prototype.render;
    window.__sessionQA = null; window.__sessionErrors = []; window.__sessionVoices = []; window.__sessionGl = [];
    const error = console.error.bind(console); console.error = (...args) => { __sessionErrors.push(args.map(String).join(' ')); error(...args); };
    addEventListener('error', event => __sessionErrors.push(event.message));
    addEventListener('unhandledrejection', event => __sessionErrors.push(String(event.reason)));
    Renderer.prototype.render = function (...args) {
      window.__sessionQA = this;
      const gl = this.webgl.getContext(), before = gl.getError();
      if (before) __sessionGl.push({ phase: '帧前', error: before, time: this.game.time });
      const result = original.apply(this, args), after = gl.getError();
      if (after) __sessionGl.push({ phase: '帧后', error: after, time: this.game.time });
      return result;
    };
  });
}

async function newBattle(mapId = 'meridian', width = 1512, height = 900) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await page.goto('http://localhost:4173/'); await instrument();
  await page.selectOption('#map-select', mapId); await page.selectOption('#enemy-select', 'nato');
  await page.click('#start-btn'); await page.waitForFunction(() => window.__sessionQA?.entities.size > 0);
  if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
}

async function menuWithoutSave() {
  if (await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))) await page.click('#modal-close');
  await page.click('#menu-btn'); await page.click('[data-modal="discard-menu"]');
  await page.waitForSelector('#start-screen', { state: 'visible' });
}

try {
  await newBattle();
  await page.keyboard.press('Escape');
  const snapshot = await page.evaluate(() => {
    const r = __sessionQA, g = r.game;
    g.players[0].credits = 4321; g.queueUnit(0, 'tank'); g.startBuild(0, 'power');
    const own = g.ownedUnits(0, 'tank')[0]; g.selected = [own.id]; g.command(850, g.homeY);
    g.paused = false; for (let i = 0; i < 40; i++) g.update(.05); g.paused = true;
    r.centerOn(760, g.homeY); r.camera.zoom = 1.25; r.updateCamera();
    return { state: g.toSave().state, center: { ...r.center }, zoom: r.camera.zoom };
  });
  await page.click('[data-modal="save"]');
  check(await page.evaluate(() => JSON.parse(localStorage.getItem('great-powers-save-manual-v1')).state.players[0].credits > 4000), '手动保存未写入实际资源');
  await page.selectOption('[data-quality]', 'standard');
  check(await page.evaluate(() => !__sessionQA.ambientPass.enabled), '流畅画质应关闭环境遮蔽');
  await page.selectOption('[data-quality]', 'high');
  await page.screenshot({ path: `${root}/session-pause.png` });
  const downloadPromise = page.waitForEvent('download', { timeout: 15000 });
  await page.click('[data-modal="export"]');
  const download = await downloadPromise; await download.saveAs(`${root}/releases/session-qa-save.json`);
  check((await download.suggestedFilename()).endsWith('.json'), '导出应为 JSON 存档');
  await page.click('[data-modal="menu"]'); await page.click('[data-modal="save-menu"]');
  check(await page.evaluate(() => document.querySelectorAll('.world-overlay').length === 0), '返回主界面没有清理旧渲染器');
  await page.screenshot({ path: `${root}/session-main-menu.png` });

  await page.reload(); await instrument();
  await page.click('#continue-btn'); await page.click('[data-modal="load-manual"]');
  await page.waitForFunction(() => window.__sessionQA?.game.paused && document.querySelector('#modal-content').innerText.includes('战局已恢复'));
  const restored = await page.evaluate(() => ({ state: __sessionQA.game.toSave().state, center: __sessionQA.center, zoom: __sessionQA.camera.zoom, overlays: document.querySelectorAll('.world-overlay').length }));
  check(JSON.stringify(restored.state) === JSON.stringify(snapshot.state), '刷新后读档资源、命令、队列、迷雾或 AI 不一致');
  check(restored.overlays === 1 && restored.zoom === snapshot.zoom && restored.center.x === snapshot.center.x, '读档应恢复镜头且只有一个渲染循环');
  results.push({ saveReload: true, export: true, qualityToggle: true, stateTime: restored.state.time });
  await page.click('[data-modal="resume"]');
  await page.waitForFunction(() => __sessionQA.game.time > 3);
  await page.keyboard.press('Escape');
  await page.click('[data-modal="load"]');
  const beforeCorrupt = await page.evaluate(() => { window.__beforeCorrupt = __sessionQA; return __sessionQA.game.time; });
  await page.setInputFiles('#save-file', [`${root}/test/fixtures/corrupt-save.json`]);
  await page.waitForFunction(() => document.querySelector('#menu-toast-container').innerText.includes('版本不兼容'));
  check(await page.evaluate(time => __sessionQA === __beforeCorrupt && __sessionQA.game.time === time, beforeCorrupt), '损坏存档替换了当前战局');
  await page.setInputFiles('#save-file', [`${root}/releases/session-qa-save.json`]);
  await page.waitForFunction(time => __sessionQA?.game.time === time && __sessionQA.game.paused && document.querySelector('#modal-content').innerText.includes('战局已恢复'), snapshot.state.time);
  check(await page.evaluate(time => Math.abs(__sessionQA.game.time - time) < .0001, snapshot.state.time), '导入文件未恢复导出时的时间');
  results.push({ importRoundtrip: true, corruptSavePreservesBattle: true });

  await page.click('[data-modal="resume"]');
  await page.evaluate(() => {
    const g = __sessionQA.game; g.time = 45.1;
  });
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('great-powers-save-auto-v1')).state.time >= 45);
  const autoCheck = await page.evaluate(() => ({ manual: JSON.parse(localStorage.getItem('great-powers-save-manual-v1')).state.time, auto: JSON.parse(localStorage.getItem('great-powers-save-auto-v1')).state.time }));
  check(autoCheck.manual < 4 && autoCheck.auto > 45, '自动存档不得覆盖手动存档'); results.push({ autoCheck });

  await page.evaluate(() => {
    const r = __sessionQA, g = r.game, voice = g.events.voice;
    g.events.voice = key => { __sessionVoices.push(key); voice(key); };
    const own = g.ownedUnits(0, 'tank')[0], enemy = g.ownedUnits(1, 'tank')[0];
    own.x = 850; own.y = g.homeY + 100; enemy.x = 1080; enemy.y = own.y;
    g.selected = [own.id]; g.updateFog(); r.centerOn(800, g.homeY);
    g.damage(own, 42, 1); r.render(performance.now());
  });
  await page.waitForSelector('#attack-alert', { state: 'visible' });
  check(await page.evaluate(() => __sessionVoices.includes('unitUnderAttack')), '部队受击未触发中文警报');
  await page.evaluate(() => { const r = __sessionQA; r.game.paused = true; r.centerOn(2000, r.game.homeY); });
  await page.click('#attack-alert');
  check(await page.evaluate(() => __sessionQA.center.x < 1200), '受击警报无法定位目标');
  await page.screenshot({ path: `${root}/session-attack-alert.png` });
  check(await page.evaluate(() => {
    const r = __sessionQA, gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4); gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 120) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    window.__pixelCheck = { colors: colors.size, glError: gl.getError(), errors: __sessionErrors, stages: __sessionGl }; console.log(JSON.stringify(__pixelCheck)); return colors.size > 300 && !__pixelCheck.glError && !__sessionErrors.length && !__sessionGl.length;
  }), '画面空白或存在 WebGL / JavaScript 错误');
  results.push({ attackVoice: true, locateAttack: true, pixels: await page.evaluate(() => __pixelCheck) });

  await menuWithoutSave();
  await newBattle('valley', 1280, 800);
  await page.keyboard.press('Escape'); await page.click('[data-modal="resume"]');
  await page.screenshot({ path: `${root}/session-valley-desktop.png` });
  const layout = await page.evaluate(() => {
    const actions = document.querySelector('.top-actions').getBoundingClientRect(), resources = document.querySelector('.resources').getBoundingClientRect();
    return { actionsRight: actions.right, width: innerWidth, resourceOverlap: resources.right > actions.left, overflow: document.documentElement.scrollWidth > innerWidth, errors: __sessionErrors };
  });
  check(layout.actionsRight <= layout.width && !layout.resourceOverlap && !layout.overflow && !layout.errors.length, '桌面顶栏重叠或越界');
  results.push({ desktop1280: layout });
  await menuWithoutSave();
  console.log(JSON.stringify(results, null, 2));
} finally {
  // 恢复测试前的用户存档与界面偏好，不把验证用战局留作真实进度。
  if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) {
    if (await page.evaluate(() => !document.querySelector('#modal').classList.contains('hidden'))) await page.click('#modal-close');
    if (await page.evaluate(() => document.querySelector('#start-screen').style.display === 'none')) await menuWithoutSave();
  }
  await page.evaluate(values => { for (const [key, value] of Object.entries(values)) value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); }, originalStorage);
}
