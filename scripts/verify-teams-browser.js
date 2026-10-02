const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const results = [], check = (value, message) => { if (!value) throw new Error(message); };
const savedSidebar = await page.evaluate(() => localStorage.getItem('great-powers-sidebar'));

async function start(width, height, mobile) {
  await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
  await page.goto('http://localhost:4173/');
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(item => new URL(item.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), original = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__teamsQA = this; return original.apply(this, args); };
    window.__teamsErrors = [];
    addEventListener('error', event => __teamsErrors.push(event.message));
    addEventListener('unhandledrejection', event => __teamsErrors.push(String(event.reason)));
  });
  await page.click('[data-faction="asia"]');
  await page.selectOption('#enemy-select', 'asia');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__teamsQA?.entities.size > 0);
  if (!await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
  await page.waitForFunction(() => Math.abs(__teamsQA.viewport.width - innerWidth) < 1);
  await page.evaluate(() => {
    const r = __teamsQA, g = r.game;
    g.paused = true; g.aiTimer = Infinity; g.aiWaveTimer = Infinity;
    g.units = []; g.selected = [];
    for (const ore of g.ore) ore.amount = 0;
    // 用真实游戏对象建立可重复的敌我同阵营展示场景，不改变正式对局规则。
    const units = [];
    for (const owner of [0, 1]) for (const [index, type] of ['tank', 'drone', 'ghost', 'elite', 'jammer', 'rifle'].entries()) {
      const unit = g.addUnit(owner, type, 700 + owner * 270 + index % 3 * 72, 650 + Math.floor(index / 3) * 92);
      unit.angle = owner ? Math.PI : 0; units.push(unit);
    }
    units[1].jammedUntil = g.time + 5;
    units[7].hp = units[7].maxHp * .2;
    g.selected = units.filter(u => u.owner === 0).map(u => u.id);
    g.events.selection?.();
    for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
    g.addBuilding(0, 'radar', 490, g.homeY - 100); g.addBuilding(0, 'power', 460, g.homeY + 100);
    r.camera.zoom = innerWidth < 500 ? .78 : 1.7;
    r.centerOn(910, 710); r.updateFog(); r.render(performance.now()); r.drawMinimap();
    window.__teamsUnits = units;
  });
}

try {
for (const [width, height, mobile] of [[1512,862,false], [390,844,true], [844,390,true]]) {
  await start(width, height, mobile);
  const report = await page.evaluate(() => {
    const r = __teamsQA, g = r.game, units = __teamsUnits;
    const entries = units.map(u => r.entities.get(u.id));
    const paint = entry => {
      let color; entry.model.traverse(mesh => { if (mesh.isMesh && mesh.material.name === '阵营标识') color = mesh.material.color.getHexString(); });
      return color;
    };
    const fills = r.healthBars.filter(bar => bar.entity.kind === 'unit').map(bar => {
      const top = bar.y + (bar.numeric ? 12 : 0), pixel = r.overlay.getImageData(Math.round(bar.x + 9), Math.round(top + 3), 1, 1).data;
      return { id: bar.id, owner: bar.entity.owner, pixel: [...pixel], status: bar.status };
    });
    r.hoveredId = units[6].id; r.render(performance.now());
    const ring = { visible: entries[6].ring.visible, color: entries[6].ring.material.color.getHexString() };
    const rotorCounts = entries.slice(0, 4).map(entry => entry.rotors.length);
    const drone = entries[1], rotorStart = drone.rotors[0].rotation.y, heightStart = drone.model.position.y;
    r.render(performance.now() + 50);
    const pausedStable = rotorStart === drone.rotors[0].rotation.y && heightStart === drone.model.position.y;
    g.paused = false; units[1].x += 3; units[1].angle = .5; r.render(performance.now() + 100); g.paused = true;
    const animated = rotorStart !== drone.rotors[0].rotation.y && drone.pitch < 0 && drone.bank > 0;
    g.fogs[0].visible.fill(false); r.updateFog(); r.render(performance.now() + 150);
    const fogSafe = !entries[6].model.visible && !entries[6].ring.visible && r.healthBars.every(bar => bar.entity.owner === 0);
    g.fogs[0].visible.fill(true); r.hoveredId = null; r.updateFog(); r.render(performance.now() + 200); r.drawMinimap();
    const radar = units.filter(u => u.type === 'tank').map(unit => {
      const x = Math.floor(unit.x / g.world.width * r.minimap.width), y = Math.floor(unit.y / g.world.height * r.minimap.height);
      return { owner: unit.owner, pixel: [...r.mctx.getImageData(x, y, 1, 1).data] };
    });
    const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
    gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const colors = new Set(); for (let i = 0; i < pixels.length; i += 80) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
    return { width: innerWidth, sameFaction: g.players[0].faction === g.players[1].faction, paint: [paint(entries[0]), paint(entries[6])], fills, ring, rotorCounts, pausedStable, animated, fogSafe, radar, sampledColors: colors.size, glError: gl.getError(), overflow: document.documentElement.scrollWidth - innerWidth, errors: __teamsErrors };
  });
  check(report.sameFaction && report.paint[0] === '68d9f2' && report.paint[1] === 'ff7668', '同阵营的机体敌我涂装不明确');
  check(report.fills.some(b => b.owner === 0 && b.pixel[2] > b.pixel[0]) && report.fills.some(b => b.owner === 1 && b.pixel[0] > b.pixel[2]), '真实画布血条未区分蓝青与红色');
  check(report.ring.visible && report.ring.color === 'ff7668', '敌方悬停目标应显示红色目标圈');
  check(JSON.stringify(report.rotorCounts) === '[0,4,0,6]' && report.animated && report.pausedStable, '旋翼、倾斜或暂停动画异常');
  check(report.fogSafe && report.radar[0].pixel[2] > report.radar[0].pixel[0] && report.radar[1].pixel[0] > report.radar[1].pixel[2], '迷雾泄漏或雷达敌我配色异常');
  check(!report.glError && !report.overflow && !report.errors.length && report.sampledColors > 200, `页面或画面异常：${JSON.stringify(report)}`);
  await page.screenshot({ path: `${root}/teams-${width}.png` }); results.push(report);
}
console.log(JSON.stringify(results, null, 2));
} finally {
  await page.evaluate(value => { if (value === null) localStorage.removeItem('great-powers-sidebar'); else localStorage.setItem('great-powers-sidebar', value); }, savedSidebar);
  await page.cdp('Emulation.clearDeviceMetricsOverride'); await page.goto('http://localhost:4173/');
}
