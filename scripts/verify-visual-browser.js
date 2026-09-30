const task = await taskSpace(Number(process.env.EGO_TASK_SPACE));
const page = task.page('p1');
const root = process.cwd();
await page.cdp('Emulation.setDeviceMetricsOverride', { width: 1512, height: 762, deviceScaleFactor: 1, mobile: false });
await page.goto('http://localhost:4173/');
await page.click('#start-btn');
await page.waitForFunction(() => document.querySelector('#start-screen').style.display === 'none');
await page.screenshot({ path: `${root}/preview-realistic-v2.png` });
await page.click('#pause-btn');

const results = [];
for (const mapId of ['valley', 'canyon', 'strait']) {
  const result = await page.evaluate(async mapId => {
    const { Game } = await import('/src/game.js');
    const { Renderer } = await import('/src/render.js');
    await Renderer.prepare();
    const host = document.createElement('div'); host.id = 'visual-verification';
    Object.assign(host.style, { position: 'fixed', inset: '58px 0 0', zIndex: 10000, background: '#111' });
    const canvas = document.createElement('canvas'); Object.assign(canvas.style, { width: '100%', height: '100%' });
    const minimap = document.createElement('canvas'); minimap.width = 284; minimap.height = 180; host.append(canvas); document.body.append(host);
    const game = new Game('china', 'russia', {}, { mapId }); game.units = []; game.buildings = []; game.time = 35;
    for (const fog of game.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
    for (const [type, x, y] of [['hq',410,680],['power',540,385],['refinery',370,425],['factory',580,910],['armory',580,1100],['barracks',380,920],['radar',760,390],['airfield',850,1040],['lab',1450,840],['super',1450,540],['turret',840,790]]) game.addBuilding(0,type,x,y);
    const tank = game.addUnit(0,'tank',660,720); tank.angle=.25; tank.turretAngle=-.1;
    game.addUnit(0,'aa',790,635).angle=.3;
    game.addUnit(0,'harvester',510,580).angle=-.4;
    game.addUnit(0,'rifle',720,810); game.addUnit(0,'engineer',730,830); game.addUnit(0,'scout',760,830);
    const fighter = game.addUnit(0,'fighter',840,535); fighter.angle=-.45;
    game.addUnit(0,'strike',1450,1030).angle=.3;
    game.addUnit(0,'drone',820,900);
    if (mapId==='strait') { game.addBuilding(0,'dock',850,720); game.addUnit(0,'patrol',1020,640).angle=.4; game.addUnit(0,'frigate',1200,850).angle=-.4; }
    const renderer = new Renderer(canvas,minimap,game); renderer.camera.zoom=1.1; renderer.centerOn(920,700); renderer.render(1000);
    const roundtrip = renderer.screenToWorld(...Object.values(renderer.worldToScreen(720,740)));
    const picks = [tank,fighter].map(unit => {
      const model = renderer.entities.get(unit.id).model, screen = renderer.worldToScreen(unit.x,unit.y,model.position.y + (unit.type==='fighter'?7:18));
      const point = renderer.pickPoint(screen.x,screen.y); return {type:unit.type,error:Math.hypot(point.x-unit.x,point.y-unit.y)};
    });
    const airScreen=renderer.worldToScreen(fighter.x,fighter.y,102), a=renderer.screenToWorld(airScreen.x-35,airScreen.y-28), b=renderer.screenToWorld(airScreen.x+35,airScreen.y+28);
    renderer.selectBox(a,b,false);
    const airBox = game.selected.includes(fighter.id);
    const pixelSample=()=>{ const gl=renderer.webgl.getContext(),data=new Uint8Array(canvas.width*canvas.height*4);gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data); return data; };
    const before=pixelSample(); renderer.render(6000); const after=pixelSample(); let movingPixels=0; const colors=new Set();
    for(let i=0;i<after.length;i+=40){colors.add(`${after[i]},${after[i+1]},${after[i+2]}`);if(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2])movingPixels++;}
    game.selected=[tank.id]; game.command(760,720,false); const from={x:tank.x,y:tank.y}; game.update(.1); renderer.render(6100);
    const moved=Math.hypot(tank.x-from.x,tank.y-from.y)>0;
    window.__visualQA={renderer,game,host};
    return { mapId, roundtripError:Math.hypot(roundtrip.x-720,roundtrip.y-740), picks, airBox, movingPixels, sampledColors:colors.size, moved, draws:renderer.webgl.info.render.calls, glError:renderer.webgl.getContext().getError() };
  }, mapId);
  results.push(result);
  await page.screenshot({ path: `${root}/preview-realistic-${mapId}.png` });
  await page.evaluate(() => { window.__visualQA.renderer.dispose(); window.__visualQA.host.remove(); delete window.__visualQA; });
}
console.log(JSON.stringify(results,null,2));
if (results.some(result=>result.roundtripError>.01||result.picks.some(p=>p.error>1)||!result.airBox||!result.movingPixels||result.sampledColors<1000||!result.moved||result.glError)) throw new Error('三维画面或交互验证失败');

await page.cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await page.goto('http://localhost:4173/'); await page.click('#start-btn'); await page.waitForFunction(()=>document.querySelector('#start-screen').style.display==='none');
await page.screenshot({path:`${root}/preview-realistic-mobile.png`});
console.log(await page.evaluate(()=>({mobileWidth:innerWidth,overflow:document.documentElement.scrollWidth-innerWidth,canvasRect:document.querySelector('#game-canvas').getBoundingClientRect().toJSON(),missingImages:[...document.querySelectorAll('.action-icon img')].filter(img=>!img.complete||!img.naturalWidth).length})));
await page.cdp('Emulation.clearDeviceMetricsOverride');
await page.goto('http://localhost:4173/');
