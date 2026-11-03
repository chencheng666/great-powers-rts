import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';

function setup() {
  const g=new Game('china','russia',{}, {mapId:'frontier',victoryMode:'annihilation'});
  g.units=[];g.buildings=[];g.time=20;g.aiTimer=g.aiWaveTimer=1e6;
  g.players.forEach(p=>{p.credits=100000;});
  g.fogs.forEach(f=>{f.visible.fill(true);f.explored.fill(true);});
  return g;
}
function patrol(g,u){g.selected=[u.id];g.orderMode='patrol';g.command(1000,1000);return structuredClone(u.order);}
function advance(g,u,seconds){for(let i=0;i<seconds*20;i++){g.time+=.05;g.updateUnit(u,.05);}}

test('补给车执行往返巡逻并为途经友军提供有限补给，不被自动追车覆盖',()=>{
  const g=setup(),u=g.addUnit(0,'supply',700,1000),tank=g.addUnit(0,'tank',800,1150);
  tank.hp-=50;tank.ammo-=4;const route=patrol(g,u),credits=g.players[0].credits,stock=u.stock;
  advance(g,u,1);assert(u.x>740);assert(tank.hp>tank.maxHp-50);assert(tank.ammo>UNITS.tank.ammo-4);
  assert(g.players[0].credits<credits);assert(u.stock<stock);assert.equal(u.order.type,'patrol');
  advance(g,u,4);assert.equal(u.order.x,route.originX);assert.equal(u.serviceTargetId,null);
  g.stopSelected();advance(g,u,.5);assert.equal(u.order,null);
});

test('空库存且无工厂仍能巡逻撤离，关闭自动保障不会禁用手动巡逻',()=>{
  const g=setup(),u=g.addUnit(0,'supply',700,1000);u.stock=0;u.autoSupply=false;patrol(g,u);
  advance(g,u,1);assert(u.x>740);assert.equal(u.stock,0);assert.equal(u.order.type,'patrol');
});

test('补给车巡逻缺货先回厂付费补满，随后继续原路线，巡逻端点可以保存恢复',()=>{
  const g=setup();g.addBuilding(0,'factory',600,1000);g.addBuilding(0,'power',500,1200);g.recalculatePower();
  const u=g.addUnit(0,'supply',700,1000);u.stock=0;const route=patrol(g,u),credits=g.players[0].credits;
  advance(g,u,.1);assert.equal(u.order.type,'restock');assert.deepEqual(u.resumeOrder,route);
  advance(g,u,8);assert.equal(u.order.type,'patrol');assert.equal(u.resumeOrder,null);assert(u.stock>0);assert(g.players[0].credits<credits);
  const restored=Game.fromSave(g.toSave());assert.deepEqual(restored.getEntity(u.id).order,u.order);
});
