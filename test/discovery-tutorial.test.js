import test from 'node:test';
import assert from 'node:assert/strict';
import {MAPS} from '../src/data.js';
import {discoverMaps,mapCategory,mapBrief,mapSketch} from '../src/map-discovery.js';
import {createTutorial,updateTutorial} from '../src/tutorial.js';
import {battleMetric} from '../src/battle-report.js';
import {Game} from '../src/game.js';
test('地图筛选保持模式白名单，独立任务不会混入普通地图',()=>{
 const ids=Object.keys(MAPS);assert(!discoverMaps(ids).includes('deepblue'));
 assert.deepEqual(discoverMaps(['sixfront'],'all'),['sixfront']);
 assert.deepEqual(discoverMaps(['sixfront'],'sea'),[]);
 assert(discoverMaps(ids,'beginner','灰谷').includes('valleyTraining'));
 assert.equal(discoverMaps(ids,'all','不存在地图').length,0);
 assert.equal(mapCategory('meridian'),'future');assert.match(mapBrief('archipelago').tip,/护航/);
 assert.match(mapSketch('valleyTraining'),/<svg/);assert.match(mapBrief('commanderTrial').special,/解锁/);
});
test('教学不把初始支援算成生产，按实际选择移动建造与生产统计推进',()=>{
 const g=new Game('china','russia',{}, {mapId:'valleyTraining',difficulty:'recruit'}),p=createTutorial(g);
 updateTutorial(p,g);assert.deepEqual(p.done,[false,false,false,false]);
 const u=g.ownedUnits(0)[0];g.selected=[u.id];updateTutorial(p,g);assert.equal(p.done[0],true);
 u.order={type:'move',x:u.x+100,y:u.y};updateTutorial(p,g);assert.equal(p.done[1],true);
 g.addBuilding(0,'power',300,300);updateTutorial(p,g);assert.equal(p.done[2],true);
 g.addUnit(0,'tank',320,320);updateTutorial(p,g);assert.equal(p.done[3],false);
 battleMetric(g,0,'unitsProduced',1);updateTutorial(p,g);assert.equal(p.done[3],true);
 g.selected=[];u.order=null;updateTutorial(p,g);assert(p.done.every(Boolean));
});
test('联网与结束状态不推进教学',()=>{
 const fake={running:true,online:true,selected:[1],ownedUnits:()=>[{id:1,order:{type:'move'}}],ownedBuildings:()=>[]};
 const p=createTutorial(fake);updateTutorial(p,fake);assert(p.done.every(x=>!x));fake.online=false;fake.running=false;updateTutorial(p,fake);assert(p.done.every(x=>!x));
});
