import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
test('桥面遮挡上下层坦克舰船直射，驶离桥面恢复且不挡同层或空中',()=>{
 const g=new Game('china','russia',{}, {mapId:'ocean',multiplayer:true}),w=g.map.water,b=g.map.bridges[0],x=(w.x1+w.x2)/2,y=(b.y1+b.y2)/2;
 const tank=g.addUnit(0,'tank',x,y),ship=g.addUnit(1,'patrol',x,y),other=g.addUnit(1,'tank',x+40,y),air=g.addUnit(1,'drone',x,y);
 assert.equal(g.canAttack(tank,ship),false);assert.equal(g.canAttack(ship,tank),false);
 assert.equal(g.canAttack(tank,other),true);assert.equal(g.canAttack(ship,air),true);
 ship.y=b.y2+40;assert.equal(g.canAttack(tank,ship),true);assert.equal(g.canAttack(ship,tank),true);
 tank.x=w.x1-50;ship.y=y;assert.equal(g.canAttack(tank,ship),true);
});
test('没有桥的海图和陆地图不增加桥梁射界限制',()=>{
 const g=new Game('china','russia',{}, {mapId:'archipelago',multiplayer:true}),w=g.map.water;
 const a=g.addUnit(0,'tank',w.x1-10,300),b=g.addUnit(1,'patrol',w.x1+30,300);assert.equal(g.canAttack(a,b),true);
});
