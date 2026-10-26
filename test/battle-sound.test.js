import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../src/data.js';
import { Game } from '../src/game.js';
import { OnlineGame } from '../src/online-game.js';
import { battleView } from '../server/battle-view.mjs';
import { MovementSounds, soundPosition, weaponSound } from '../src/battle-sound.js';
import { SOUND_PROFILES, SoundEffects, synthesizeSound, soundProfile } from '../src/sound-effects.js';

function setup() {
  const game = new Game('china', 'china', {}, { mapId: 'ocean' });
  game.units = []; game.effects = []; game.projectiles = [];
  for (const fog of game.fogs) { fog.visible.fill(true); fog.explored.fill(true); }
  return game;
}
function payload(game, side = 0) {
  game.effects.forEach((effect, i) => effect.networkId ??= i + 1);
  return { seat: side, config: { mapId: 'ocean', battlefieldScale: 1.5, battleId: game.battleId }, view: battleView(game, side) };
}
for (const style of ['rifle', 'tank', 'fighter', 'navalStrike', 'rocket', 'ballistic', 'submarine', 'bomber', 'carrier', 'laser', 'railgun', 'aegis', 'helicopter']) {
  test(`${style} 单机和联机均传递发射事件，重复快照不重播`, () => {
    const game = setup(), local = [], remote = [];
    const client = new OnlineGame(payload(game), { shot: (...args) => remote.push(args) }, {});
    game.events.shot = (...args) => local.push(args);
    const source = game.addUnit(0, style, 900, 900), target = game.addUnit(1, 'tank', 1000, 900);
    if (style === 'carrier') source.wing = 3;
    game.fire(source, target, 10, style);
    const data = payload(game); client.apply(data); client.apply(data);
    assert.equal(local.filter(args => args[2].phase === 'launch').length, 1);
    assert.equal(remote.filter(args => args[2].phase === 'launch').length, 1);
    assert.ok(game.effects.some(e => e.type === 'sound' && e.duration >= .6));
    assert.deepEqual(local.map(a => a[0]), remote.map(a => a[0]));
    const reconnect = [];
    new OnlineGame(data, { shot: (...args) => reconnect.push(args) }, {});
    assert.equal(reconnect.length, 0);
  });
}
test('炸弹释放与落地分别发声，未命中前没有爆炸声音', () => {
  const game = setup(), heard = []; game.events.shot = (...args) => heard.push(args);
  const source = game.addUnit(0, 'bomber', 900, 900), target = game.addUnit(1, 'tank', 900, 900);
  game.fire(source, target, 10, 'bomber');
  assert.deepEqual(heard.map(a => a[0]), ['bomber']);
  for (let i = 0; i < 20; i++) game.updateProjectiles(.05);
  assert.equal(heard.length, 1);
  for (let i = 0; i < 4; i++) game.updateProjectiles(.05);
  assert.deepEqual(heard.map(a => a[0]), ['bomber', 'largeImpact']);
});
test('损毁只发一次声音，维修画面不触发枪声', () => {
  const game = setup(), heard = [], client = new OnlineGame(payload(game), { shot: (...args) => heard.push(args) }, {});
  const target = game.addUnit(1, 'tank', 1000, 900);
  game.damage(target, target.maxHp * 2, 0); game.damage(target, 10, 0);
  game.effects.push({ type: 'shot', style: 'repair', x: 900, y: 900, age: 0, duration: .5 });
  client.apply(payload(game));
  assert.deepEqual(heard.map(a => a[0]), ['vehicleDestroyed']);
});
test('暂停快照不补播，迷雾及隐形单位不通过声音泄露位置', () => {
  const game = setup(), local = []; game.events.shot = (...a) => local.push(a);
  game.fogs[0].visible.fill(false);
  game.fire(game.addUnit(1, 'fighter', 2000, 900), game.addUnit(0, 'tank', 2100, 900), 10, 'fighter');
  assert.equal(local.length, 0); assert.equal(payload(game).view.effects.length, 0);
  game.fogs[0].visible.fill(true); game.effects = [];
  const hidden = game.addUnit(1, 'submarine', 1800, 1900), target = game.addUnit(0, 'destroyer', 2000, 1900);
  game.canSeeEntity = (side, entity) => entity.id !== hidden.id;
  game.fire(hidden, target, 10, 'submarine');
  assert.equal(payload(game).view.effects.filter(e => e.type === 'sound').length, 0);
  const data = payload(game, 1), heard = [];
  const client = new OnlineGame({ ...data, view: { ...data.view, effects: [] } }, { shot: (...a) => heard.push(a) }, {});
  data.view.paused = true; client.apply(data); data.view.paused = false; client.apply(data);
  assert.equal(heard.length, 0);
});
test('舰艇近距反潜与潜艇鱼雷分开，潜艇命中使用水声', () => {
  assert.equal(weaponSound('frigate', { type: 'submarine' }), 'antiSub');
  assert.equal(weaponSound('destroyer', { type: 'submarine' }), 'destroyer');
  const game = setup(), heard = []; game.events.shot = s => heard.push(s);
  game.fire(game.addUnit(0, 'submarine', 900, 900), game.addUnit(1, 'destroyer', 950, 900), 10, 'submarine');
  for (let i = 0; i < 10; i++) game.updateProjectiles(.05);
  assert.deepEqual(heard, ['submarine', 'waterImpact']);
});
const listener = { viewport: { width: 1000, height: 800 }, worldToScreen: (x, y) => ({ x, y }) };
test('移动声根据实际位移淡出，迷雾、离屏、登载和停机单位不发声', () => {
  const unit = { id: 1, type: 'tank', hp: 100, x: 500, y: 400, owner: 0, order: { type: 'move' } };
  const game = { units: [unit], map: {}, canSeeEntity: () => true, aircraftGrounded: () => true };
  const movement = new MovementSounds();
  assert.equal(movement.sample(game, listener, .1).length, 0);
  unit.x += 5; assert.equal(movement.sample(game, listener, .1)[0].kind, 'tracks');
  assert.equal(movement.sample(game, listener, .3).length, 0);
  unit.type = 'fighter'; game.aircraftGrounded = () => false;
  assert.equal(movement.sample(game, listener, .1)[0].kind, 'jet');
  game.aircraftGrounded = () => true;
  assert.equal(movement.sample(game, listener, .3).length, 0);
  unit.type = 'helicopter'; game.aircraftGrounded = () => false;
  assert.equal(movement.sample(game, listener, .1)[0].kind, 'rotor');
  game.canSeeEntity = () => false; assert.equal(movement.sample(game, listener, .1).length, 0);
  game.canSeeEntity = () => true; unit.embarkedIn = 22; assert.equal(movement.sample(game, listener, .1).length, 0);
  unit.embarkedIn = null; unit.x = 5000; assert.equal(movement.sample(game, listener, .1).length, 0);
  movement.reset(); assert.equal(movement.positions.size, 0);
});
test('移动类别合并有上限，镜头距离衰减与声像正确', () => {
  const units = Array.from({ length: 100 }, (_, id) => ({ id, type: 'fighter', hp: 100, x: 500, y: 400 }));
  const game = { units, map: {}, canSeeEntity: () => true, aircraftGrounded: () => false };
  assert.equal(new MovementSounds().sample(game, listener, .1).length, 1);
  assert.equal(soundPosition({ x: 500, y: 400 }, listener).level, 1);
  assert.ok(soundPosition({ x: 950, y: 400 }, listener).pan > 0);
  assert.equal(soundPosition({ x: 5000, y: 400 }, listener).level, 0);
});
function mockContext() {
  const nodes = [];
  const param = () => ({ value: 0, setTargetAtTime() {}, cancelScheduledValues() {} });
  const node = () => { const n = { gain: param(), pan: param(), connect() {}, disconnect() { this.disconnected = true; }, start() {}, stop() { this.stopped = true; } }; nodes.push(n); return n; };
  return { currentTime: 0, sampleRate: 8000, nodes, createBuffer: (_, length) => { const a = new Float32Array(length); return { getChannelData: () => a }; }, createBufferSource: node, createGain: node, createStereoPanner: node };
}
test('同帧不同武器与命中不吞音，同类齐射限频，重要爆炸优先，停止后清理节点', () => {
  const ctx = mockContext(), fx = new SoundEffects(ctx, {}, 3);
  assert.equal(fx.play('tank'), true); assert.equal(fx.play('tank'), false);
  assert.equal(fx.play('missile'), true); assert.equal(fx.play('tank', { phase: 'impact' }), true);
  assert.equal(fx.play('buildingDestroyed', { phase: 'destroy' }), true); assert.equal(fx.voices.size, 3);
  fx.syncMovement([{ kind: 'jet', level: .5, pan: 0 }]); assert.equal(fx.loops.size, 1);
  fx.stop(); assert.equal(fx.voices.size, 0); assert.equal(fx.loops.size, 0);
  const sources = ctx.nodes.filter(n => n.stopped); assert.equal(sources.length, 5);
  sources.forEach(n => n.onended?.()); assert.ok(ctx.nodes.every(n => n.disconnected));
  assert.equal(fx.play('tank'), true); fx.stop();
});
test('所有合成音色有限、非零、有余量；误传维修类型不发声', () => {
  for (const style of Object.keys(SOUND_PROFILES)) {
    const samples = synthesizeSound(style, 8000);
    assert.ok(samples.every(Number.isFinite), style);
    assert.ok(samples.some(v => Math.abs(v) > .01), style);
    assert.ok(samples.every(v => Math.abs(v) < 1), style);
    assert.equal(samples[0], 0);
    assert.ok(Math.abs(samples.at(-1)) < .001, style);
  }
  for (const [style, unit] of Object.entries(UNITS)) if (unit.damage > 0) assert.ok(soundProfile(style), style);
  assert.equal(soundProfile('repair'), null);
  assert.notDeepEqual(synthesizeSound('tank', 8000), synthesizeSound('submarine', 8000));
});

test('真实双客户端 WebSocket 收到导弹发射、命中和损毁声音，席位归属正确', async t => {
  const { mkdtemp, rm } = await import('node:fs/promises'), { tmpdir } = await import('node:os'), { join } = await import('node:path');
  const { WebSocket } = await import('ws'), { createBattleServer } = await import('../server/index.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'great-powers-audio-')), app = createBattleServer({ directory }), sockets = [];
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { sockets.forEach(s => s.terminate()); await new Promise(resolve => app.server.close(resolve)); await rm(directory, { recursive: true, force: true }); });
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  async function connect(name) {
    const response = await fetch(`${origin}/api/session`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie').split(';')[0];
    const ws = new WebSocket(origin.replace('http:', 'ws:') + '/battle-socket', { headers: { Origin: origin, Cookie: cookie } }), messages = [];
    sockets.push(ws); ws.on('message', raw => messages.push(JSON.parse(raw))); return { ws, messages };
  }
  async function wait(client, predicate) {
    const end = Date.now() + 5000;
    while (Date.now() < end) { const i = client.messages.findIndex(predicate); if (i >= 0) return client.messages.splice(i, 1)[0]; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw new Error('等待音效快照超时');
  }
  const send = (client, value) => client.ws.send(JSON.stringify(value)), a = await connect('音效甲'), b = await connect('音效乙');
  await wait(a, m => m.type === 'hello'); await wait(b, m => m.type === 'hello');
  send(a, { type: 'create', mapId: 'ocean', victoryMode: 'quick', faction: 'china' });
  const code = (await wait(a, m => m.type === 'room')).room.code;
  send(b, { type: 'join', code, faction: 'nato' }); await wait(b, m => m.type === 'room');
  send(a, { type: 'ready', ready: true }); send(b, { type: 'ready', ready: true });
  await wait(a, m => m.type === 'room' && m.room.members.every(p => p?.ready)); send(a, { type: 'start' });
  const va = await wait(a, m => m.type === 'battle'), vb = await wait(b, m => m.type === 'battle');
  const heard = [[], []], clients = [va, vb].map((v, i) => new OnlineGame(v, { shot: (...args) => heard[i].push(args) }, {}));
  const game = app.rooms.get(code).game;
  game.units = []; game.updateUnit = () => {}; game.updateBuilding = () => {};
  game.updateFog = () => { game.fogs.forEach(f => { f.visible.fill(true); f.explored.fill(true); }); }; game.updateFog();
  const source = game.addUnit(1, 'fighter', 900, 900), target = game.addUnit(0, 'tank', 950, 900);
  source.fireTimer = 999; game.fire(source, target, target.maxHp * 2, 'fighter');
  for (const [i, socket] of [a, b].entries()) {
    const launch = await wait(socket, m => m.type === 'snapshot' && m.view.effects.some(e => e.type === 'sound' && e.phase === 'launch'));
    clients[i].apply(launch); clients[i].apply(launch);
    assert.equal(heard[i].filter(args => args[2].phase === 'launch').length, 1);
    assert.equal(heard[i].find(args => args[2].phase === 'launch')[1], i === 0 ? 1 : 0);
    const impact = await wait(socket, m => m.type === 'snapshot' && m.view.effects.some(e => e.type === 'sound' && e.phase === 'impact'));
    clients[i].apply(impact); clients[i].apply(impact);
    assert.ok(heard[i].some(args => args[0] === 'explosiveImpact'));
    assert.equal(heard[i].filter(args => args[0] === 'vehicleDestroyed').length, 1);
  }
});
