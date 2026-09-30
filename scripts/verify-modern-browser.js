const { root, taskSpaceId } = globalThis.GAME_QA;
const task = await taskSpace(taskSpaceId), page = task.page('p1');
await page.evaluate(() => document.querySelector('#modal').classList.add('hidden'));
await page.click('[data-tab="units"]');
const production = await page.evaluate(() => ({
  types: [...document.querySelectorAll('[data-unit]')].map(b => b.dataset.unit),
  broken: [...document.querySelectorAll('.action-icon img')].filter(i => !i.complete || !i.naturalWidth).length
}));
const expected = ['loiterer', 'jammer', 'laser', 'rocket', 'apc', 'supply', 'destroyer', 'carrier', 'submarine'];
if (production.broken || expected.some(type => !production.types.includes(type))) throw new Error('新单位生产入口或缩略图不完整');
await page.screenshot({ path: `${root}/preview-ocean-start-v5.png` });

const fleet = await page.evaluate(async () => {
  const { Game } = await import('/src/game.js'), { Renderer } = await import('/src/render.js');
  const { unitRadius } = await import('/src/unit-spacing.js');
  const g = new Game('china', 'russia', {}, { mapId: 'ocean', victoryMode: 'annihilation' });
  g.units = []; g.aiTimer = Infinity; g.aiWaveTimer = Infinity;
  const land = [['loiterer', 840, 990], ['jammer', 820, 1110], ['laser', 930, 1230], ['rocket', 820, 1330], ['apc', 870, 1440], ['supply', 780, 1540]];
  for (const [type, x, y] of land) g.addUnit(0, type, x, y);
  const carrier = g.addUnit(0, 'carrier', 1350, 1030), destroyer = g.addUnit(0, 'destroyer', 1480, 1270), sub = g.addUnit(0, 'submarine', 1310, 1450);
  g.addUnit(0, 'frigate', 1170, 1230); g.addUnit(0, 'patrol', 1140, 1480);
  const enemy = g.addUnit(1, 'carrier', 1970, 1150), escort = g.addUnit(1, 'destroyer', 1950, 1430);
  const hiddenSub = g.addUnit(1, 'submarine', 1830, 780);
  for (const fog of g.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  g.updateFog = () => {};
  g.updateElectronicWarfare(.05);
  g.launchProjectile(carrier, enemy, 95, 'carrier');
  g.launchProjectile(g.units.find(u => u.type === 'loiterer'), enemy, 95, 'loiterer');
  g.launchProjectile(g.units.find(u => u.type === 'rocket'), escort, 85, 'rocket');
  for (let n = 0; n < 22; n++) { g.time += .05; g.updateProjectiles(.05); }
  g.selected = [carrier.id, destroyer.id, sub.id];
  const host = document.createElement('div'); host.id = 'modern-verification';
  Object.assign(host.style, { position: 'absolute', inset: '0', zIndex: 1, pointerEvents: 'none' });
  const canvas = document.createElement('canvas'); Object.assign(canvas.style, { width: '100%', height: '100%' });
  const minimap = document.createElement('canvas'); minimap.width = 284; minimap.height = 180;
  host.append(canvas); document.querySelector('#battlefield').prepend(host);
  const renderer = new Renderer(canvas, minimap, g); renderer.camera.zoom = .94; renderer.centerOn(1350, 1230); renderer.render(2000);
  const gl = renderer.webgl.getContext(), pixels = new Uint8Array(canvas.width * canvas.height * 4);
  gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  const colors = new Set(); for (let i = 0; i < pixels.length; i += 40) colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
  const models = expectedTypes => expectedTypes.map(type => {
    const unit = g.units.find(u => u.type === type), entry = renderer.entities.get(unit.id), screen = renderer.worldToScreen(unit.x, unit.y, entry.model.position.y + 8);
    return { type, visible: entry.model.visible, meshes: entry.model.children.length, screen, picked: renderer.pickEntity(screen.x, screen.y)?.id === unit.id, radius: unitRadius(unit) };
  });
  window.__modernQA = { g, renderer, host, carrier, sub, destroyer, canvas };
  const sonar = g.effects.find(effect => effect.type === 'sonar' && effect.sourceId === hiddenSub.id);
  return { colors: colors.size, glError: gl.getError(), draws: renderer.webgl.info.render.calls, world: g.world, projectiles: renderer.projectileModels.size, hiddenSubProtected: !renderer.entities.get(hiddenSub.id).model.visible && !renderer.effects.has(sonar), models: models(['loiterer','jammer','laser','rocket','apc','supply','destroyer','carrier','submarine']) };
});
if (fleet.colors < 1000 || fleet.glError || !fleet.hiddenSubProtected || fleet.models.some(m => !m.visible || !m.picked)) throw new Error(`海战渲染或选取失败：${JSON.stringify(fleet)}`);
await page.screenshot({ path: `${root}/preview-modern-fleet-v5.png` });

const motion = await page.evaluate(() => {
  const {g,renderer,carrier,sub,destroyer} = window.__modernQA;
  const before = [carrier.x,carrier.y,sub.x,sub.y];
  g.selected = [carrier.id,sub.id,destroyer.id]; g.command(1650,1590);
  for (let n=0;n<120;n++) {g.update(.05);renderer.render(2050+n*50);}
  return {moved:Math.hypot(carrier.x-before[0],carrier.y-before[1])>100,subMoved:Math.hypot(sub.x-before[2],sub.y-before[3])>100,water:g.activeUnits(0).filter(u=>['carrier','submarine','destroyer'].includes(u.type)).every(u=>!g.isNavalBlocked(u.x,u.y,18)),wakes:renderer.trails.some(t=>t.ship),glError:renderer.webgl.getContext().getError()};
});
if (!motion.moved || !motion.subMoved || !motion.water || !motion.wakes || motion.glError) throw new Error(`舰队移动失败：${JSON.stringify(motion)}`);
await page.evaluate(() => {window.__modernQA.renderer.dispose();window.__modernQA.host.remove();delete window.__modernQA;});
console.log(JSON.stringify({production,fleet,motion}));
