const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
const folder = `${root}/docs/wechat-national-day-20261002/images`;
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });

async function start(map) {
  await page.goto('http://localhost:4173/');
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(item => new URL(item.name).pathname.endsWith('/src/render.js')).name;
    const { Renderer } = await import(url), original = Renderer.prototype.render;
    Renderer.prototype.render = function (...args) { window.__articleRenderer = this; return original.apply(this, args); };
  });
  await page.selectOption('#map-select', map);
  await page.selectOption('#enemy-select', 'nato');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__articleRenderer?.entities.size > 0);
  if (!await page.evaluate(() => document.querySelector('#command-sidebar').hidden)) await page.click('#sidebar-btn');
  await page.waitForFunction(() => Math.abs(__articleRenderer.viewport.width - innerWidth) < 1);
}

async function shot(name) {
  const report = await page.evaluate(() => {
    const r = __articleRenderer;
    r.render(performance.now());
    const gl = r.webgl.getContext(), pixels = new Uint8Array(r.canvas.width * r.canvas.height * 4);
    gl.readPixels(0, 0, r.canvas.width, r.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const colors = new Set(); for (let n = 0; n < pixels.length; n += 120) colors.add(`${pixels[n]},${pixels[n + 1]},${pixels[n + 2]}`);
    return { models: r.entities.size, colors: colors.size, glError: gl.getError() };
  });
  if (report.colors < 200 || report.glError) throw new Error(JSON.stringify(report));
  await page.screenshot({ path: `${folder}/${name}` });
  console.log(name, report);
}

await start('frontier');
await page.evaluate(() => {
  const r = __articleRenderer, g = r.game;
  g.paused = true; g.aiTimer = Infinity; g.aiWaveTimer = Infinity; g.units = []; g.selected = [];
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  for (const [type, x, y] of [['loiterer', 790, 710], ['jammer', 890, 710], ['laser', 990, 710], ['rocket', 790, 830], ['apc', 890, 830], ['supply', 990, 830]]) { const u = g.addUnit(0, type, x, y); u.angle = -.3; }
  g.addBuilding(0, 'radar', 610, 770);
  r.camera.zoom = 1.9; r.centerOn(890, 770); r.updateFog(); r.render(performance.now()); r.drawMinimap();
});
await shot('04-support-vehicles.png');
await page.evaluate(() => {
  const r = __articleRenderer, g = r.game;
  g.units = []; g.effects = []; g.projectiles = []; g.selected = [];
  const units = [];
  for (const [type,x,y] of [['tank', 790, 950], ['tank', 850, 1030], ['rocket', 700, 1050], ['laser', 780, 750], ['jammer', 690, 780], ['drone', 910, 760], ['supply', 640, 990]]) { const u = g.addUnit(0,type,x,y); u.angle = 0; units.push(u); }
  const target = g.addUnit(1,'tank',1140,965); target.angle = Math.PI; target.hp *= .68;
  g.addUnit(1,'tank',1230,1060); g.addUnit(1,'rocket',1330,950); g.addUnit(1,'drone',1140,780);
  g.selected = [units[0].id]; g.events.selection?.();
  g.updateElectronicWarfare(.05); g.fire(units[0],target,12,'tank'); g.fire(units[2],target,30,'rocket');
  for (const effect of g.effects) effect.age = .07;
  g.updateProjectiles(.45);
  r.camera.zoom = 1.55; r.centerOn(1010,940); r.updateFog(); r.render(performance.now()); r.drawMinimap();
});
await shot('06-desktop-battle.png');

await start('valley');
await page.evaluate(() => {
  const r=__articleRenderer, g=r.game;
  g.paused=true; g.aiTimer=Infinity; g.aiWaveTimer=Infinity;
  const factory=g.ownedBuildings(0,'factory')[0];
  g.addBuilding(0,'armory',600,g.homeY+170);
  g.addBuilding(0,'radar',535,g.homeY-150);
  g.addUnit(0,'tank',factory.x+95,factory.y+60);
  g.addUnit(0,'apc',factory.x+165,factory.y+100);
  g.selected=[factory.id]; g.events.selection?.();
  r.camera.zoom=1.12; r.centerOn(455,g.homeY+30); r.updateFog(); r.render(performance.now()); r.drawMinimap();
});
await page.waitForSelector('#building-info', { state: 'visible' });
await shot('01-base-and-inspector.png');

await start('ocean');
await page.evaluate(() => {
  const r=__articleRenderer,g=r.game;
  g.paused=true;g.aiTimer=Infinity;g.aiWaveTimer=Infinity;g.units=[];g.selected=[];
  for(const fog of g.fogs){fog.visible.fill(true);fog.explored.fill(true);}
  const carrier=g.addUnit(0,'carrier',1350,1030), destroyer=g.addUnit(0,'destroyer',1480,1270), sub=g.addUnit(0,'submarine',1310,1450);
  g.addUnit(0,'frigate',1170,1230);g.addUnit(0,'patrol',1140,1480);
  const enemy=g.addUnit(1,'carrier',1970,1150);g.addUnit(1,'destroyer',1950,1430);
  g.selected=[carrier.id,destroyer.id,sub.id];g.events.selection?.();
  g.launchProjectile(carrier,enemy,95,'carrier'); g.updateProjectiles(.65);
  r.camera.zoom=1.1;r.centerOn(1510,1260);r.updateFog();r.render(performance.now());r.drawMinimap();
});
await shot('07-ocean-fleet.png');

await start('frontier');
await page.evaluate(() => { const r=__articleRenderer;r.game.paused=true;r.camera.zoom=.43;r.centerOn(r.game.world.width/2,r.game.world.height/2);for(const fog of r.game.fogs){fog.visible.fill(true);fog.explored.fill(true);}r.updateFog();r.render(performance.now());r.drawMinimap(); });
await shot('08-frontier-map.png');
