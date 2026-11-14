import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { catalogEntries } from '../src/catalog-data.js';
import { unitAllowedInRoster, RETIRED_MODERN_UNITS } from '../src/unit-roster.js';
import { CHALLENGES } from '../src/challenges.js';
import { UNITS } from '../src/data.js';
import { makeScifiData } from '../variants/taptap/config.mjs';
import * as base from '../src/data.js';

const retired=['elite','laser','railgun','aegis','relay','strike','bomber','navalStrike'];
test('原版现代编制从菜单图鉴和服务端生产移除退役单位，制空、运输及常规陆海军保留',()=>{
 const g=new Game('china','china',{}, {mapId:'ocean'});for(const type of ['armory','airfield','radar','lab','dock'])g.addBuilding(0,type,550,1500);
 for(const type of retired){assert.equal(unitAllowedInRoster(type,g.map),false,type);assert.equal(g.queueUnit(0,type),false,type);assert.equal(catalogEntries({mapId:'ocean'}).some(e=>e.type===type),false,type);}
 for(const type of ['tank','fighter','airlift','rocket','aa','navalFighter'])assert.equal(g.queueUnit(0,type),true,type);
});
test('剧情预置、AI与实际生成入口使用现代替代单位，科幻战区保留原机体',()=>{
 const g=new Game('china','china');for(const type of retired)assert.equal(g.spawnUnit(0,type,600,600).type,RETIRED_MODERN_UNITS[type]);
 const future=new Game('china','china',{}, {mapId:'meridian'});for(const type of retired)assert.equal(future.spawnUnit(0,type,600,600).type,type);
 for(const id of Object.keys(CHALLENGES)){const mission=new Game('china','china',{}, {challengeId:id});if(!mission.map.future)assert.ok(mission.units.every(u=>unitAllowedInRoster(u.type,mission.map)),id);}
 const scifi=makeScifiData(base);for(const type of ['elite','laser','railgun','strike','bomber'])assert.ok(scifi.UNITS[type]&&scifi.UNIT_ORDER.includes(type));
});
test('旧档迁移保留ID、受损比例、选取和机位，退役队列返还实付资金且原存档不修改',()=>{
 const g=new Game('china','china');g.addBuilding(0,'radar',500,500);const b=g.addBuilding(0,'airfield',700,500);b.active={type:'strike',progress:3,paid:120};b.queue=['strike','fighter'];
 const u=g.addUnit(0,'elite',650,600);u.hp=u.maxHp*.4;g.selected=[u.id];const save=g.toSave(),original=JSON.stringify(save),credits=g.players[0].credits;
 const loaded=Game.fromSave(save),unit=loaded.getEntity(u.id);assert.equal(unit.type,'tank');assert.ok(Math.abs(unit.hp/unit.maxHp-.4)<1e-6);assert.equal(unit.ammo,Math.min(u.ammo,UNITS.tank.ammo));assert.deepEqual(loaded.selected,[u.id]);assert.equal(loaded.players[0].credits,credits+120);assert.equal(loaded.getEntity(b.id).active,null);assert.deepEqual(loaded.getEntity(b.id).queue,['fighter']);assert.equal(JSON.stringify(save),original);
});

test('原版制空机不再兼任对地对舰，航母没有抽象对地机群，科幻规则保留',()=>{
 const g=new Game('china','china',{}, {mapId:'ocean'}),jet=g.addUnit(0,'fighter',700,700),tank=g.addUnit(1,'tank',800,700),enemy=g.addUnit(1,'fighter',800,800),carrier=g.addUnit(0,'carrier',1700,1100);
 assert.equal(g.canAttack(jet,tank),false);assert.equal(g.canAttack(jet,enemy),true);assert.equal(g.canAttack(carrier,tank),false);
 const future=new Game('china','china',{}, {mapId:'meridian'});assert.equal(future.canAttack(future.addUnit(0,'fighter',600,600),future.addUnit(1,'tank',800,600)),true);
});
