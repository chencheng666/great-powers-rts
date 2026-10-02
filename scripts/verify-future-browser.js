const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const reports = [], check = (value, message) => { if (!value) throw new Error(message); };
const savedSidebar = await page.evaluate(() => localStorage.getItem('great-powers-sidebar'));

try {
  for (const [width, height, mobile] of [[1512,862,false], [390,844,true], [844,390,true]]) {
    await page.cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    await page.goto('http://localhost:4173/');
    await page.evaluate(async () => {
      const url = performance.getEntriesByType('resource').find(item => new URL(item.name).pathname.endsWith('/src/render.js')).name;
      const { Renderer } = await import(url), original = Renderer.prototype.render;
      Renderer.prototype.render = function (...args) { window.__futureQA = this; return original.apply(this, args); };
      window.__futureErrors = [];
      addEventListener('error', event => __futureErrors.push(event.message));
      addEventListener('unhandledrejection', event => __futureErrors.push(String(event.reason)));
    });
    await page.selectOption('#map-select', 'meridian');
    await page.selectOption('#enemy-select', 'nato');
    await page.click('[data-victory="control"]');
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__futureQA?.entities.size > 0);
    if (await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
    await page.click('[data-tab="units"]');
    check(await page.evaluate(() => document.querySelector('[data-unit="tank"]').textContent.includes('99A')), '装备卡未显示真实原型名');
    if (!await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
    await page.waitForFunction(() => Math.abs(__futureQA.viewport.width - innerWidth) < 1);
    await page.evaluate(() => {
      const r = __futureQA, g = r.game;
      g.paused = true; g.time = 105; g.aiTimer = Infinity; g.aiWaveTimer = Infinity;
      g.units = []; g.effects = []; g.selected = [];
      // 正式模型与规则的固定展示场景；截图不是修改难度后的对局胜率证明。
      for (const [type,x,y] of [['hq',820,980],['factory',770,1190],['armory',970,1280],['lab',1140,790],['power',940,650],['airfield',710,770],['radar',780,640]]) g.addBuilding(0,type,x,y);
      const units = [];
      for (const [type,x,y] of [['tank',1190,1000],['railgun',1120,1200],['relay',1130,900],['aegis',1230,620],['rocket',1000,1120],['drone',1230,840],['rifle',1000,800]]) {
        const unit = g.addUnit(0,type,x,y); unit.angle = 0; units.push(unit);
      }
      const enemy = g.addUnit(1,'tank',1440,1070); enemy.angle = Math.PI; enemy.hp *= .75;
      g.addUnit(1,'rocket',1500,1150); g.addUnit(1,'aegis',1560,650); g.addUnit(1,'drone',1440,850);
      for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
      g.beacons[1].owner = 0; g.players[0].controlScore = 52; g.players[1].controlScore = 36; g.recalculatePower(); g.updateElectronicWarfare(.05);
      g.fire(units[0],enemy,12,'tank'); g.fire(units[1],enemy,18,'railgun'); g.fire(units[4],enemy,30,'rocket');
      for (const effect of g.effects) effect.age = .08;
      g.updateProjectiles(.5);
      g.selected = [units[0].id]; g.events.selection?.();
      r.camera.zoom = innerWidth < 500 ? .7 : innerHeight < 500 ? .78 : 1.12;
      r.centerOn(innerWidth < 500 ? 1270 : 1170, 980); r.updateFog(); r.render(performance.now()); r.drawMinimap();
      window.__futureUnits = units;
    });
    const report = await page.evaluate(() => {
      const r = __futureQA, g = r.game, gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
      gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      const colors = new Set(); for (let i = 0; i < pixels.length; i += 80) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
      const units = __futureUnits.map(u => ({ type:u.type, model:r.entities.get(u.id).model.name, height:r.entities.get(u.id).topHeight, jammed:u.jammedUntil > g.time }));
      const buildings = [...r.entities.values()].filter(e => e.entity.kind === 'building' && e.entity.owner === 0).map(e => {
        let floor = Infinity; e.model.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.computeBoundingBox(); floor = Math.min(floor,mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld).min.y); } });
        return { model:e.model.name, height:e.topHeight, floor, sprite:!!e.sprite, anchor:r.entityAnchor(e.entity) };
      });
      const h = document.querySelector('.top-left').getBoundingClientRect(), tools = document.querySelector('.camera-tools').getBoundingClientRect();
      const effects = [...r.effects.values()].map(e => e.children.length);
      return { width:innerWidth,map:g.mapId,mode:g.victoryMode,units,buildings,effects,projectiles:r.projectileModels.size,colors:colors.size,glError:gl.getError(),overflow:document.documentElement.scrollWidth-innerWidth,hudOverlap:h.bottom>tools.top,selection:document.querySelector('#selection-panel').textContent,errors:__futureErrors };
    });
    check(report.map === 'meridian' && report.mode === 'control', '地图或胜利模式未生效');
    check(report.units.some(u => u.model === 'tank_china') && report.units.some(u => u.model === 'railgun') && report.units.some(u => u.model === 'aegis') && report.units.some(u => u.model === 'relay'), '新模型未实际部署');
    check(report.buildings.every(b => !b.sprite && b.model.startsWith('future_') && b.height > 20 && b.floor >= 0), '科幻建筑不完整、深入地底或血条高度错误');
    check(report.effects.includes(5) && report.projectiles > 0, '曳光、碎屑、冲击波或实体弹药未绘制');
    check(report.selection.includes('99A') && !report.hudOverlap, `装备信息或战场工具发生遮挡：${JSON.stringify(report)}`);
    check(!report.glError && !report.overflow && !report.errors.length && report.colors > 200, `页面或画面异常：${JSON.stringify(report)}`);
    await page.screenshot({ path:`${root}/future-${width}.png` }); reports.push(report);
  }
  console.log(JSON.stringify(reports,null,2));
} finally {
  await page.evaluate(value => { if (value === null) localStorage.removeItem('great-powers-sidebar'); else localStorage.setItem('great-powers-sidebar',value); }, savedSidebar);
  await page.cdp('Emulation.clearDeviceMetricsOverride'); await page.goto('http://localhost:4173/');
}
