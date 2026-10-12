import test from 'node:test';import assert from 'node:assert/strict';import {Game} from '../src/game.js';import {MAPS} from '../src/data.js';import {SIX_SPAWNS} from '../src/six-player-map.js';import {createSave,validateSave} from '../src/savegame.js';import {executeCommand} from '../server/commands.mjs';
const seats=Array.from({length:6},(_,i)=>({faction:i%2?'nato':'china',controlType:'human'}));
const make=()=>new Game('china','nato',{}, {mapId:'sixfront',multiplayer:true,players:seats});
test('六方同阵营可重复选择，基地矿车资源完整且出生安全资源路径差不超过5%',()=>{
 const g=make();assert.equal(g.players.length,6);assert.equal(g.fogs.length,6);assert.equal(g.world.width,5760);assert.equal(g.ore.length,30);assert.equal(g.resourceSites.length,18);const lengths=[];
 for(let side=0;side<6;side++){assert.equal(g.ownedBuildings(side).length,5);assert.equal(g.ownedUnits(side,'harvester').length,2);assert.deepEqual(g.map.spawns[side],SIX_SPAWNS[side]);const u=g.ownedUnits(side,'harvester')[0],o=g.ore.slice(side*4,side*4+3).sort((a,b)=>Math.hypot(a.x-u.x,a.y-u.y)-Math.hypot(b.x-u.x,b.y-u.y))[0];const path=g.findPath(u,o,25);assert(path.length);const points=[u,...path];lengths.push(points.slice(1).reduce((n,p,i)=>n+Math.hypot(p.x-points[i].x,p.y-points[i].y),0));}
 assert((Math.max(...lengths)-Math.min(...lengths))/Math.min(...lengths)<=.05,JSON.stringify(lengths));
});
test('六方矿点真实消耗并交付资金，真人席位生产不受AI接管',()=>{
 const g=make(),credits=g.players.map(p=>p.credits);for(let i=0;i<1800;i++)g.update(.05);for(let s=0;s<6;s++){assert(g.players[s].credits>credits[s]);assert(g.ore.slice(s*4,s*4+3).some(o=>o.amount<o.max));assert.equal(g.players[s].aiPlanIndex,0);}assert.equal(g.running,true);
});
test('被淘汰席位停止指令和收益，全局仅剩最后存活者时结束',()=>{
 const g=make();g.buildings=g.buildings.filter(b=>b.owner!==4);g.checkVictory();assert(g.players[4].eliminated);assert(g.running);assert.equal(executeCommand(g,4,{action:'train',unitType:'tank'}),false);g.buildings=g.buildings.filter(b=>b.owner===2);g.checkVictory();assert.equal(g.winner,2);
});
test('六人存档用版本2，旧双人仍版本1；读档不重复生成基地且拒绝越界owner',()=>{
 const g=make();g.multiplayer=false;const save=createSave(g);assert.equal(save.version,2);const restored=Game.fromSave(save);assert.equal(restored.players.length,6);assert.equal(restored.units.length,g.units.length);assert.equal(restored.ore.length,30);assert.equal(restored.playerCount,6);const old=createSave(new Game('china','nato'));assert.equal(old.version,1);assert.equal(Game.fromSave(old).players.length,2);const bad=structuredClone(save);bad.state.units[0].owner=6;assert.throws(()=>validateSave(bad));
});

test('六方混合AI仅执行AI席位计划，生产上限40包含排队单位',()=>{
 const g=new Game('china','nato',{}, {mapId:'sixfront',multiplayer:true,players:seats.map((p,i)=>({...p,controlType:i%2?'ai':'human'}))});
 for(let i=0;i<650;i++)g.update(.05);for(const p of g.players)if(p.controlType==='human')assert.equal(p.aiPlanIndex,0);else assert(p.aiPlanIndex>0);
 const factory=g.ownedBuildings(0,'factory')[0];while(g.ownedUnits(0).length<40)g.addUnit(0,'tank',1500+g.units.length*2,1500);assert.equal(g.queueUnit(0,'tank'),false);
});

test('六方蜂群计入生产预留名额，旧双人超过40仍可排队',()=>{
 const g=new Game('asia','china',{}, {mapId:'sixfront',multiplayer:true}),factory=g.ownedBuildings(0,'factory')[0];while(g.ownedUnits(0).length<35)g.addUnit(0,'tank',1800+g.units.length*2,1800);factory.queue.push('tank');g.addBuilding(0,'super',2800,1000);g.addBuilding(0,'power',2600,1000);g.addBuilding(0,'power',2400,1000);g.recalculatePower();g.players[0].abilityCharge=100;const credits=g.players[0].credits;assert.equal(g.castAbility(2880,960),false);assert.equal(g.players[0].credits,credits);assert.equal(g.players[0].abilityCharge,100);
 const old=new Game('china','nato');while(old.ownedUnits(0).length<41)old.addUnit(0,'tank',1000+old.units.length*2,500);assert.equal(old.queueUnit(0,'tank'),true);
});
