const { root, taskSpaceId } = globalThis.GAME_QA, phase = globalThis.DUAL_PHASE || 'setup';
const fs = await import('node:fs/promises'), task = await taskSpace(taskSpaceId), folder = `${root}/releases/animation-tactics-qa`;
await fs.mkdir(folder, { recursive: true });
if (phase === 'setup') {
  for (const [label, url] of [['p1', 'http://127.0.0.1:4173/'], ['p2', 'http://localhost:4182/']]) {
    const page = task.page(label); await page.goto(url);
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').findLast(e => new URL(e.name).pathname === '/src/render.js').name;
      const { Renderer } = await import(url), render = Renderer.prototype.render;
      Renderer.prototype.render = function (...args) { window.__qaRenderer = this; return render.apply(this, args); };
      window.__qaErrors = []; addEventListener('error', e => __qaErrors.push(e.message));
      addEventListener('unhandledrejection', e => __qaErrors.push(String(e.reason)));
      document.addEventListener('visibilitychange', e => e.stopImmediatePropagation(), true);
    });
    await page.click('#online-btn'); await page.waitForFunction(() => !document.querySelector('[data-online=create]').disabled);
  }
  const p = task.page('p1'), q = task.page('p2'); await p.click('[data-online=create]');
  await p.waitForFunction(() => document.querySelector('#room-code').textContent.length === 6);
  const code = await p.evaluate(() => document.querySelector('#room-code').textContent);
  await q.fill('#join-code', code); await q.click('[data-online=join]'); await q.waitForFunction(() => !document.querySelector('#online-room').hidden);
  await q.click('[data-online=ready]'); await p.click('[data-online=ready]');
  await p.waitForFunction(() => !document.querySelector('[data-online=start]').disabled, undefined, { timeout: 90000 }); await p.click('[data-online=start]');
  for (const page of [p, q]) await page.waitForFunction(() => window.__qaRenderer?.game.online, undefined, { timeout: 90000 });
  console.log({ code, ready: true });
} else {
  const report = {};
  for (const label of ['p1', 'p2']) {
    const page = task.page(label); await page.cdp('Page.bringToFront', {});
    report[label] = await page.evaluate(async () => {
      const r = __qaRenderer, g = r.game; r.setViewMode('immersive'); r.camera.zoom = 2.4; r.centerOn(g.world.width / 2, g.world.height / 2);
      g.selected = g.units.filter(u => u.owner === 0 && ['tank', 'rifle'].includes(u.type)).map(u => u.id);
      g.command(g.world.width / 2 + (g.seat ? 40 : -40), g.world.height / 2);
      const frames = [];
      for (let i = 0; i < 75; i++) {
        await new Promise(requestAnimationFrame);
        frames.push({ time: g.time, units: g.units.filter(u => ['tank', 'rifle'].includes(u.type)).map(u => {
          const e = r.entities.get(u.id); return { id: u.id, x: u.x, y: u.y, phase: e?.animation?.phase, turret: e?.animation?.turret, barrel: e?.barrel?.position.x, weapon: e?.weapon?.position.x, upper: e?.upperBody?.rotation.y, rifle: e?.weaponPose?.position.x, track: e?.tracks?.[0]?.userData.trackFrame };
        }) });
      }
      return { seat: g.seat, battle: g.battleId, frames, errors: __qaErrors };
    });
    const data = report[label], units = data.frames.flatMap(f => f.units);
    const gaps = data.frames.slice(1).filter((f, i) => f.time === data.frames[i].time && f.units.some(u => u.barrel && u.barrel !== data.frames[i].units.find(a => a.id === u.id)?.barrel)).length;
    if (data.errors.length || !gaps || Math.min(...units.map(u => u.barrel || 0)) > -.05 || units.some(u => Math.abs(u.upper || 0) > 1.101 || (u.weapon || 0) !== 0)) throw new Error(`客户端 ${label} 动画异常`);
    await page.screenshot({ path: `${folder}/联机客户端-${label}.png` }); console.log({ label, seat: data.seat, continuousRecoilFrames: gaps });
  }
  if (report.p1.battle !== report.p2.battle || report.p1.seat === report.p2.seat) throw new Error('双客户端未进入同一战局');
  await fs.writeFile(`${folder}/双客户端原始帧.json`, JSON.stringify(report));
  // 通过实际客户端认输指令触发服务端结算，不在客户端伪造胜负或统计。
  await task.page('p2').evaluate(() => __qaRenderer.game.client.send({ type: 'leave' }));
  const results = {};
  for (const label of ['p1', 'p2']) {
    const page = task.page(label); await page.waitForSelector('.battle-report');
    results[label] = await page.evaluate(() => ({ rows: document.querySelectorAll('.battle-report tbody tr').length, report: __qaRenderer.game.battleReport, errors: __qaErrors }));
    if (results[label].rows !== 13 || !results[label].report || results[label].errors.length) throw new Error('战后复盘缺失');
    await page.screenshot({ path: `${folder}/战后复盘-${label}.png` });
  }
  if (results.p1.report.sides[0].damageDealt !== results.p2.report.sides[1].damageDealt) throw new Error('第二席位复盘未正确镜像');
  await fs.writeFile(`${folder}/联网战后复盘.json`, JSON.stringify(results, null, 2)); console.log('两席位统计一致，实际结算页面已通过');
}
