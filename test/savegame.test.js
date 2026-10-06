import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MAPS } from '../src/data.js';
import { createSave, parseSave, readSave, SAVE_KEYS, writeSave } from '../src/savegame.js';

const advance = (g, seconds) => { for (let i = 0; i < seconds * 20 && g.running; i++) g.update(.05); };
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('六张地图完整保存双方资源、队列、迷雾、AI 和时间，不重复部署基地', () => {
  for (const mapId of Object.keys(MAPS)) {
    const g = new Game('china', 'nato', {}, { mapId, difficulty: 'veteran', victoryMode: 'control' });
    g.startBuild(0, 'power'); g.queueUnit(0, 'tank'); g.queueUnit(0, 'rifle');
    advance(g, 4);
    const save = createSave(g, { center: { x: 900, y: 800 }, zoom: 1.2 });
    const notices = [], restored = Game.fromSave(parseSave(JSON.stringify(save)), { notice: message => notices.push(message) });
    assert.equal(restored.paused, true); assert.equal(restored.running, true);
    assert.equal(restored.mapId, mapId); assert.equal(restored.difficulty.name, '专家');
    assert.deepEqual(restored.toSave().state, save.state);
    assert.equal(restored.fog, restored.fogs[0]); assert.deepEqual(notices, []);
    restored.paused = false; advance(restored, 2);
    assert.ok(restored.time > save.state.time);
    assert.ok(restored.ownedBuildings(0, 'factory')[0].active.progress > save.state.buildings.find(b => b.owner === 0 && b.type === 'factory').active.progress);
    assert.ok(restored.units.every(u => Number.isFinite(u.x) && Number.isFinite(u.y)));
  }
});

test('存档独立拷贝，读取后新单位编号不重复，选中及移动命令保持', () => {
  const g = new Game('russia', 'russia'), tank = g.ownedUnits(0, 'tank')[0];
  g.selected = [tank.id]; g.command(800, g.homeY);
  const save = g.toSave();
  g.players[0].credits += 1000; g.units[0].cargo = 90;
  const restored = Game.fromSave(save); restored.paused = false;
  assert.equal(restored.players[0].credits, 1550);
  assert.deepEqual(restored.selected, [tank.id]); assert.equal(restored.getEntity(tank.id).order.type, 'move');
  const existing = new Set([...restored.units, ...restored.buildings].map(e => e.id));
  assert.ok(!existing.has(restored.addUnit(0, 'rifle', 700, 700).id));
  const x = restored.getEntity(tank.id).x; advance(restored, 2);
  assert.ok(restored.getEntity(tank.id).x > x);
});

test('存档保留运输车乘员、返场弹药、飞行中投射物和待部署建筑', () => {
  const g = new Game('china', 'russia', {}, { mapId: 'meridian' });
  const apc = g.addUnit(0, 'apc', 700, 700), rifle = g.addUnit(0, 'rifle', 705, 700);
  rifle.order = { type: 'board', targetId: apc.id }; g.boardTransport(rifle, .05);
  const jet = g.addUnit(0, 'aegis', 760, 700); jet.ammo = 0; jet.order = { type: 'rearm' }; jet.resumeOrder = { type: 'move', x: 1000, y: 750 };
  const rocket = g.addUnit(0, 'rocket', 800, 700), target = g.ownedUnits(1, 'tank')[0];
  g.launchProjectile(rocket, target, 80, 'rocket'); g.pendingBuilding = 'power';
  const restored = Game.fromSave(g.toSave());
  assert.deepEqual(restored.getEntity(apc.id).passengers, [rifle.id]); assert.equal(restored.getEntity(rifle.id).embarkedIn, apc.id);
  assert.equal(restored.getEntity(jet.id).ammo, 0); assert.equal(restored.getEntity(jet.id).resumeOrder.type, 'move');
  assert.equal(restored.projectiles.length, 1); assert.equal(restored.pendingBuilding, 'power');
  restored.paused = false; advance(restored, 1);
  assert.ok(restored.projectiles[0].age > 0);
});

test('手动与自动存档分开，自动保存不覆盖手动进度', () => {
  const storage = memoryStorage(), g = new Game('china', 'russia');
  writeSave(storage, 'manual', g.toSave()); advance(g, 3); writeSave(storage, 'auto', g.toSave());
  assert.equal(readSave(storage, 'manual').state.time, 0);
  assert.ok(readSave(storage, 'auto').state.time > 2);
  assert.equal(readSave(memoryStorage(), 'manual'), null);
  const old = storage.getItem(SAVE_KEYS.manual);
  assert.throws(() => writeSave({ setItem() { throw new Error('空间不足'); } }, 'manual', g.toSave()), /导出/);
  assert.equal(storage.getItem(SAVE_KEYS.manual), old);
});

test('损坏、未知版本、恶意字段、错误模型和迷雾尺寸拒绝读取', () => {
  const g = new Game('china', 'russia'), original = g.toSave();
  assert.throws(() => parseSave('{bad'), /JSON/);
  const corruptions = [
    s => { s.version = 999; }, s => { s.config.mapId = 'unknown'; },
    s => { s.state.units[0].type = 'missing'; }, s => { s.state.units[0].x = null; },
    s => { s.state.units[0].id = s.state.units[1].id; }, s => { s.state.fogs[0].explored.pop(); },
    s => { s.state.players[0].buildQueue = { type: 'power' }; },
    s => { s.state.units[0].__proto__ = { injected: true }; Object.defineProperty(s.state.units[0], '__proto__', { value: {}, enumerable: true }); }
  ];
  for (const change of corruptions) {
    const save = structuredClone(original); change(save);
    assert.throws(() => parseSave(JSON.stringify(save)));
  }
  assert.deepEqual(g.toSave().state, original.state);
  g.running = false; assert.throws(() => g.toSave(), /结束/);
});
