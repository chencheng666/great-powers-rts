import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { OnlineGame } from '../src/online-game.js';
import { battleView } from '../server/battle-view.mjs';
import { executeCommand } from '../server/commands.mjs';
import { validateSave } from '../src/savegame.js';
import { createStrategicModel } from '../src/strategic-models.js';
import { animateStrategicEquipment } from '../src/deterrence-models.js';

const setup = () => {
  const g = new Game('china', 'nato', {}, { mapId: 'strategic', multiplayer: true }); g.units = []; g.time = 10;
  for (const side of [0, 1]) { g.addBuilding(side, 'radar', side ? 5900 : 500, 1800); for (let i = 0; i < 3; i++) g.addBuilding(side, 'power', side ? 5800 : 600, 2400 + i * 100); }
  return g;
};

test('反侦察状态区分关闭、行驶、断电、缺雷达、瘫痪与运输，旧字段默认开启', () => {
  const g = setup(), u = g.addUnit(0, 'counterIntel', 3000, 2000);
  assert.equal(g.counterIntelState(u), 'ready'); delete u.counterIntelEnabled; assert.equal(g.counterIntelState(u), 'ready');
  assert(g.toggleCounterIntel(u)); assert.equal(g.counterIntelState(u), 'disabled'); assert(g.toggleCounterIntel(u));
  u.lastMovedAt = g.time; assert.equal(g.counterIntelState(u), 'moving'); u.lastMovedAt -= 1; assert.equal(g.counterIntelState(u), 'ready');
  u.stunUntil = 20; assert.equal(g.counterIntelState(u), 'stunned'); u.stunUntil = 0;
  u.embarkedIn = 99; assert.equal(g.counterIntelState(u), 'embarked'); assert.equal(g.toggleCounterIntel(u), false); u.embarkedIn = null;
  const radar = g.ownedBuildings(0, 'radar')[0]; radar.hp = 0; assert.equal(g.counterIntelState(u), 'no-radar'); radar.hp = radar.maxHp;
  for (const b of g.ownedBuildings(0, 'power')) b.hp = 0; g.recalculatePower(); assert.equal(g.counterIntelState(u), 'offline');
  u.hp = 0; assert.equal(g.counterIntelState(u), 'unavailable'); assert.equal(g.toggleCounterIntel(u), false);
});

test('开关实际影响卫星遮蔽，不能遮蔽近距侦察或清除已经探索的地形', () => {
  const g = setup(), u = g.addUnit(1, 'counterIntel', 3200, 2080), target = g.addUnit(1, 'tank', 3250, 2080);
  g.players[0].satelliteUntil = 30; g.updateFog(); assert.equal(g.canSeeEntity(0, target), false); assert(g.hasExploredFor(0, target.x, target.y));
  g.toggleCounterIntel(u); g.updateFog(); assert(g.canSeeEntity(0, target));
  g.toggleCounterIntel(u); g.updateFog(); assert.equal(g.canSeeEntity(0, target), false);
  g.addUnit(0, 'scout', 3030, 2080); g.updateFog(); assert(g.canSeeEntity(0, target));
});

test('联机只能切换己方设备，私有状态不发给敌军或观战者，客户端不自行算工作状态', () => {
  const g = setup(), u = g.addUnit(0, 'counterIntel', 1000, 900);
  assert.equal(executeCommand(g, 1, { action: 'counter-intel', id: u.id }), false);
  assert(executeCommand(g, 0, { action: 'counter-intel', id: u.id })); assert.equal(g.counterIntelState(u), 'disabled');
  g.fogs[1].visible.fill(true);
  const own = battleView(g, 0).units.find(v => v.id === u.id), enemy = battleView(g, 1).units.find(v => v.id === u.id);
  assert.equal(own.counterIntelState, 'disabled'); assert.equal(enemy.counterIntelState, undefined); assert.equal(enemy.counterIntelEnabled, undefined);
  assert.equal(battleView(g, 0, new Map(), { spectator: true }).units.find(v => v.id === u.id).counterIntelState, undefined);
  const messages = [], client = new OnlineGame({ seat: 0, config: { mapId: 'strategic' }, view: battleView(g, 0) }, {}, { send: m => { messages.push(m); return true; } });
  assert.equal(client.counterIntelState(client.getEntity(u.id)), 'disabled'); client.toggleCounterIntel(client.getEntity(u.id));
  assert.equal(messages[0].action, 'counter-intel'); assert.equal(client.getEntity(u.id).counterIntelEnabled, false);
  g.isControlLocked = () => true; assert.equal(g.toggleCounterIntel(u), false);
});

test('反侦察开关随存档恢复，损坏类型和错误单位字段拒绝', () => {
  const g = setup(), u = g.addUnit(0, 'counterIntel', 1000, 900); g.multiplayer = false; g.toggleCounterIntel(u);
  const save = g.toSave(); assert.equal(Game.fromSave(save).getEntity(u.id).counterIntelEnabled, false);
  const old = structuredClone(save); delete old.state.units[0].counterIntelEnabled; assert.equal(Game.fromSave(old).counterIntelState(Game.fromSave(old).getEntity(u.id)), 'ready');
  for (const mutate of [v => v.counterIntelEnabled = '开启', v => v.type = 'tank']) {
    const bad = structuredClone(save); mutate(bad.state.units[0]); assert.throws(() => validateSave(bad));
  }
});

test('反侦察桅杆与阵列独立运动且有界，停用平滑收拢，不修改其他机体或根据敌方电网摆动', () => {
  const model = createStrategicModel('counterIntel'), other = model.clone(true);
  const entry = { model, topHeight: 50 }, u = { type: 'counterIntel', owner: 0 }, game = { time: 10, counterIntelState: () => 'ready' };
  const mast = model.getObjectByName('counter_intel_mast'); assert(mast && model.getObjectByName('counter_intel_array'));
  animateStrategicEquipment(entry, u, game, .05); assert.equal(mast.scale.y, 1);
  game.counterIntelState = () => 'disabled';
  for (let i = 0; i < 80; i++) animateStrategicEquipment(entry, u, game, .05);
  assert(mast.scale.y >= .15 && mast.scale.y < .151); assert.equal(other.getObjectByName('counter_intel_mast').scale.y, 1);
  const before = mast.scale.y; animateStrategicEquipment(entry, u, game, 0); assert.equal(mast.scale.y, before);
  u.owner = 1; u.lastMovedAt = 0; animateStrategicEquipment(entry, u, game, 1); assert(mast.scale.y > .9);
});
