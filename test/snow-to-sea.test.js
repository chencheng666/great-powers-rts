import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MAPS, UNITS } from '../src/data.js';
import { islandDistance } from '../src/island-map.js';
import { snowSurface, snowEnvironment, snowToSeaMap, snowElevation } from '../src/snow-to-sea.js';
import { navalPath } from '../src/island-navigation.js';
import { terrainHeight } from '../src/visual-detail.js';
import { mapBrief, discoverMaps } from '../src/map-discovery.js';
const make = () => new Game('china','russia',{}, {mapId:'snowtosea',victoryMode:'control'});

test('雪岭入海部署六个独立基地、矿区与港口，出生及资源均在合法地表',()=>{
  const g=make();assert.equal(g.players.length,6);assert.equal(g.players.filter(p=>g.isAI(p.side)).length,5);
  assert.equal(g.ore.length,24);assert.equal(g.resourceSites.length,18);
  for(let side=0;side<6;side++){
    assert.equal(g.ownedBuildings(side).length,6);assert.equal(g.ownedUnits(side,'harvester').length,2);assert.equal(g.ownedUnits(side,'patrol').length,1);
    for(const u of g.ownedUnits(side))assert.equal(UNITS[u.type].tags.includes('ship')?g.isNavalBlocked(u.x,u.y,20):g.isGroundBlocked(u.x,u.y,14),false,`${side} ${u.type}`);
    for(const b of g.ownedBuildings(side).filter(b=>b.type!=='dock'))assert(islandDistance(g.map,b.x,b.y)>b.size);
  }
  for(const p of [...g.ore,...g.oil,...g.beacons,...g.resourceSites])assert(islandDistance(g.map,p.x,p.y)>50,p.id);
});

test('两岸陆军经桥面互通，主河道桥下通航且河水仍阻挡陆军',()=>{
  const g=make();
  for(const bridge of g.map.bridges){const y=(bridge.y1+bridge.y2)/2,x=(bridge.x1+bridge.x2)/2;
    assert.equal(g.isGroundBlocked(x,y,14),false);assert.equal(g.isNavalBlocked(x,y,32),false);
    assert.equal(g.isGroundBlocked(x,y+180,14),true);assert.equal(snowElevation(g.map,x,y),bridge.height+1);assert(terrainHeight(g,x,y)<0);
    const u={...g.ownedUnits(0,'tank')[0],x:bridge.x1-100,y};const path=g.findPath(u,{x:bridge.x2+100,y},0);assert(path.length);assert(Math.hypot(path.at(-1).x-bridge.x2-100,path.at(-1).y-y)<80);
  }
});

test('六方基地都能沿陆路到达其他大陆出生区，舰船能从上游驶入外海',()=>{
  const g=make();
  for(let side=0;side<6;side++){const u=g.ownedUnits(side,'tank')[0],goal=g.map.spawns[(side+2)%6],path=g.findPath(u,goal,150);assert(path.length,`陆军${side}`);assert(Math.hypot(path.at(-1).x-goal.x,path.at(-1).y-goal.y)<230);}
  const ship=g.ownedUnits(0,'patrol')[0],goal={x:4600,y:5450};const path=navalPath(g,ship,goal);assert(path.length);assert(Math.hypot(path.at(-1).x-goal.x,path.at(-1).y-goal.y)<100);
});

test('种子复现高山、雪地、森林、草地、沙地、湿地及海湾，材质与高度使用同一采样',()=>{
  const g=make(),seen=new Set();let peak=0;
  for(let y=120;y<g.world.height;y+=160)for(let x=120;x<g.world.width;x+=160){const s=snowSurface(g.map,x,y);seen.add(s.biome);peak=Math.max(peak,s.height);assert.equal(terrainHeight(g,x,y),s.height);}
  assert(peak>300);for(const biome of ['snow','forest','grass','desert','wetland','water'])assert(seen.has(biome),biome);
  assert.deepEqual(snowSurface(g.map,1312,547),snowSurface(snowToSeaMap(),1312,547));
  assert(snowEnvironment(g.map,950,300,12).snowfall>snowEnvironment(g.map,5500,1900,12).snowfall);
});

test('各港口独立归属，敌方不能在另一席船坞区建造，新地图不进入联机协议',()=>{
  const g=make();g.buildings=g.buildings.filter(b=>b.type!=='dock');
  for(let side=0;side<6;side++){const p=g.map.harbors[side];assert(g.canPlace(side,'dock',p.x,p.y));assert.equal(g.canPlace((side+1)%6,'dock',p.x,p.y),false);}
  assert.throws(()=>new Game('china','russia',{}, {mapId:'snowtosea',multiplayer:true}));
});

test('六方存档往返保留迷雾、地貌与电脑错峰计划，旧六域坐标不变',()=>{
  const g=make();g.update(.5);const restored=Game.fromSave(g.toSave());
  assert.equal(restored.mapId,'snowtosea');assert.equal(restored.units.length,g.units.length);assert.deepEqual(restored.fogs,g.fogs);assert.equal(restored.players[4].nextSnowThink,g.players[4].nextSnowThink);
  assert.notDeepEqual(new Game('china','russia',{}, {mapId:'sixfront'}).map.spawns,g.map.spawns);
});

test('主地图检索入口收敛到雪岭入海，历史地图仍可检索',()=>{
  assert.deepEqual(discoverMaps(Object.keys(MAPS),'recommended'),['snowtosea']);assert(discoverMaps(Object.keys(MAPS),'all').includes('confluence'));assert.match(mapBrief('snowtosea').special,/5个电脑/);
});

test('五个电脑持续采矿、扩建并发出进攻命令，真人席位不被电脑接管',()=>{
  const g=make(),initial=g.units.map(u=>u.id),advanced=new Set();for(let i=0;i<3000;i++){g.update(.05);for(const u of g.units)if(u.order?.type==='attackMove')advanced.add(u.owner);}
  for(let side=1;side<6;side++){const p=g.players[side];assert(p.aiPlanIndex>=3,`扩建${side}:${p.aiPlanIndex}`);assert(g.ore.slice(side*4,side*4+4).some(o=>o.amount<o.max),`采矿${side}`);assert(g.ownedUnits(side).some(u=>!initial.includes(u.id)),`生产${side}`);assert(advanced.has(side),`推进${side}`);}
  assert.equal(g.players[0].aiPlanIndex,0);assert(g.running);
});


test('六个电脑登陆目标都有合法浅岸卸载位，运输机能在陆地安全落下步兵',()=>{
  const g=make();
  for(let side=0;side<6;side++){
    const p=g.map.landingApproaches[side],t=g.addUnit(side,'landing',p.x,p.y),u=g.ownedUnits(side,'rifle')[0];
    assert.equal(g.isNavalBlocked(p.x,p.y,35),false);t.passengers.push(u.id);u.embarkedIn=t.id;assert.equal(g.unloadTransport(t,false,true),1);assert.equal(g.isGroundBlocked(u.x,u.y,6),false);
  }
  const t=g.addUnit(0,'airlift',2400,3440),u=g.ownedUnits(0,'rifle')[1];t.passengers.push(u.id);u.embarkedIn=t.id;assert(g.unloadTransport(t)>0);assert.equal(u.embarkedIn,null);
});
