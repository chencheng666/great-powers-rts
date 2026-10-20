import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { battleReport, battleReportHTML, validateBattleStats } from '../src/battle-report.js';
import { battleView } from '../server/battle-view.mjs';
import { UNITS } from '../src/data.js';
import { unitCostFor } from '../src/unit-specs.js';

test('兵种战损按实际阵营补充价累计，不重复计算超额伤害，建筑另计',()=>{
  const g=new Game('china','asia',{},{multiplayer:true}),u=g.addUnit(1,'drone',1000,700);
  g.damage(u,u.hp+100,0);g.damage(u,100,0);const data=g.battleStats.unitLosses;
  assert.deepEqual(data.sides[1].drone,{count:1,value:unitCostFor('asia','drone')});
  const b=g.ownedBuildings(1,'factory')[0];g.damage(b,b.hp,0);assert.equal(data.sides[1].factory,undefined);assert.equal(g.battleStats.sides[0].buildingsDestroyed,1);
});
test('货运与临时无人机只计数量，兵种汇总不受时间线截断影响',()=>{
  const g=new Game('china','nato',{},{multiplayer:true});
  const temporary=g.addUnit(0,'drone',600,600,true);g.damage(temporary,1e6,1);
  const freight=g.launchFreight(0);g.damage(freight,1e6,1);
  assert.deepEqual(g.battleStats.unitLosses.sides[0].drone,{count:1,value:0});assert.equal(g.battleStats.unitLosses.sides[0].freightPlane.value,0);
  for(let i=0;i<110;i++){const u=g.addUnit(1,'rifle',1000,600);g.damage(u,1e6,0);}
  assert.equal(g.battleStats.events.length,96);assert.equal(g.battleStats.unitLosses.sides[1].rifle.count,110);assert.equal(g.battleStats.unitLosses.sides[1].rifle.value,UNITS.rifle.cost*110);
  const report=battleReport(g);report.unitLosses.sides[1].rifle.count=0;assert.equal(g.battleStats.unitLosses.sides[1].rifle.count,110);
});
test('旧存档从读档时开始兵种统计，不补造历史；六席旧档无统计也可继续保存',()=>{
  const g=new Game('china','nato',{},{multiplayer:true});g.time=20;const save=g.toSave();delete save.state.battleStats.unitLosses;
  const restored=Game.fromSave(save);assert.equal(restored.battleStats.unitLosses.since,20);assert.match(battleReportHTML(restored),/本次读档后开始/);
  const six=new Game('china','nato',{},{mapId:'sixfront'});
  if(six.playerCount!==6)throw Error('六席测试地图标识不正确');
  const old=six.toSave();delete old.state.battleStats;const recovered=Game.fromSave(old);assert.equal(recovered.battleStats.unitLosses.sides.length,6);assert.doesNotThrow(()=>recovered.toSave());
});
test('汇总在联机战斗中不泄露，第二席和六席结束后按我方视角重排',()=>{
  const g=new Game('china','asia',{},{multiplayer:true}),u=g.addUnit(1,'tank',1000,600);g.damage(u,1e6,0);
  assert.equal(battleView(g,0).battleReport,null);g.endGame(0);const report=battleView(g,1).battleReport;
  assert.equal(report.unitLosses.sides[0].tank.count,1);assert.equal(report.unitLosses.sides[1].tank,undefined);
  const six=new Game('china','asia',{},{mapId:'sixfront',multiplayer:true}),s=six.addUnit(4,'tank',2000,1600);six.damage(s,1e6,0);six.endGame(0);
  const reordered=battleView(six,4).battleReport;assert.equal(reordered.unitLosses.sides[0].tank.count,1);assert.equal(reordered.unitLosses.sides[4].tank,undefined);
});
test('坏汇总数据与非法装备不能进入存档，空汇总仍有明确状态',()=>{
  const g=new Game('china','nato');assert.match(battleReportHTML(g),/没有部队损失/);
  for(const row of [{bad:{count:1,value:1}},{tank:{count:-1,value:100}},{tank:{count:1,value:NaN}},{tank:{count:1.5,value:100}}]){
    const stats=structuredClone(g.battleStats);stats.unitLosses.sides[0]=row;assert.equal(validateBattleStats(stats,g.time),false);
  }
  const stats=structuredClone(g.battleStats);stats.unitLosses.sides=[];assert.equal(validateBattleStats(stats,g.time),false);
});
