import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { cargoAirfieldRoute } from '../src/cargo-airfield.js';
import { airfieldRunwayAvailable, onAirfieldPavement } from '../src/airfield-rules.js';
import { TreeContactGrid, trailSamples } from '../src/terrain-contact.js';
import { createRhythmSamples, RHYTHM_SECONDS } from '../src/procedural-rhythm.js';
import { LAND_AIRCRAFT_LENGTHS } from '../src/model-scale.js';

test('重装货机锁定跑道、在机坪交付一次，存档恢复后沿跑道离场',()=>{
 const game=new Game('china','russia',{}, {mapId:'snowtosea'});game.players[0].credits=20000;
 assert(game.queueUnit(0,'tank'));const warehouse=game.ownedBuildings(0,'refinery')[0], airport=game.ownedBuildings(0,'airfield')[0];
 const initial=game.ownedUnits(0,'tank').length;
 game.updateReinforcementQueue(warehouse,100);
 const plane=game.ownedUnits(0,'freightPlane')[0], request=plane.reinforcement, route=cargoAirfieldRoute(airport,game.world);
 const stages=[];
 for(let i=0;i<1000&&request.cargo?.stage!=='taxiOut';i++){
   game.time+=.05;game.updateReinforcementFlight(plane,.05);
   const stage=request.cargo.stage;if(stages.at(-1)!==stage)stages.push(stage);
   if(stage==='roll'){assert.equal(game.aircraftGrounded(plane),true);assert.equal(plane.y,route.turn.y);assert.equal(airfieldRunwayAvailable(game,{owner:0},airport),false);}
 }
 assert.deepEqual(stages,['approach','glide','roll','taxiIn','unload','taxiOut']);
 assert.equal(game.ownedUnits(0,'tank').length,initial+1);
 assert(onAirfieldPavement((plane.x-airport.x)*7.2/airport.size,(plane.y-airport.y)*7.2/airport.size));
 const restored=Game.fromSave(game.toSave()), resumed=restored.getEntity(plane.id);
 for(let i=0;i<500&&resumed.reinforcement.phase!=='outbound';i++){restored.time+=.05;restored.updateReinforcementFlight(resumed,.05);}
 assert.equal(resumed.reinforcement.phase,'outbound');
 assert.equal(restored.ownedUnits(0,'tank').length,initial+1);
});

test('树木只受可见的连续接触影响，脚印按步距交替并跳过跳帧',()=>{
 const near={x:20,z:0},far={x:21,z:27},unseen={x:31,z:0};
 const grid=new TreeContactGrid([near,far,unseen]);
 assert.deepEqual(grid.cross({x:0,y:0},{x:42,y:0},12,10,x=>x<30),[near]);
 assert.deepEqual(grid.cross({x:0,y:0},{x:130,y:0},12,11,()=>true),[]);
 assert.equal(near.fallenAt,10);assert.equal(far.fallenAt,undefined);assert.equal(unseen.fallenAt,undefined);
 const sample={};assert.deepEqual(trailSamples(sample,{x:0,y:0,time:0},8),[]);
 const marks=trailSamples(sample,{x:18,y:0,time:.4},8);
 assert.deepEqual(marks.map(p=>[p.x,p.y]),[[8,-2.2],[16,2.2]]);
 assert.deepEqual(trailSamples(sample,{x:130,y:0,time:.45},8),[]);
});

test('河港每个泊位有独立岸线并远离桥体，空中比例和原创节奏边界可复现',()=>{
 const game=new Game('china','russia',{}, {mapId:'snowtosea'});
 for(const dock of game.buildings.filter(b=>b.type==='dock'&&b.owner<4)){
   const points=Array.from({length:6},(_,slot)=>game.frontlineBerth({type:'frigate',assignment:{homeId:dock.id,slot}},dock));
   for(const [index,p] of points.entries()){
     assert(!game.isNavalBlocked(p.x,p.y,48));
     assert(game.map.bridges.every(b=>p.y<b.y1-95||p.y>b.y2+95));
     assert(points.slice(0,index).every(v=>Math.abs(v.y-p.y)>220));
   }
 }
 assert(LAND_AIRCRAFT_LENGTHS.tanker>LAND_AIRCRAFT_LENGTHS.airlift);
 assert(LAND_AIRCRAFT_LENGTHS.swarmCarrier<LAND_AIRCRAFT_LENGTHS.airlift);
 const sample=createRhythmSamples(8000);
 assert.equal(sample.length,Math.round(8000*RHYTHM_SECONDS));
 assert(sample.every(a=>Number.isFinite(a)&&Math.abs(a)<1));
 assert(sample.some(a=>Math.abs(a)>.3));assert.deepEqual(sample,createRhythmSamples(8000));
});
