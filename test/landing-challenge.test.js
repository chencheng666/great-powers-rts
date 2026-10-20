import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { CHALLENGES,beachheadActivity } from '../src/challenges.js';
import { completedChallengeResult,applyChallengeResult,emptyChallengeProfile } from '../src/challenge-profile.js';
import { battleReportHTML } from '../src/battle-report.js';
import { refineLandingCraft,animateLandingCraft,replacedNavalPart,landingCargoLayout,landingDetailPlan } from '../src/naval-presentation.js';
import { surfaceMaps } from '../src/model-craft.js';

const create=()=>new Game('china','asia',{},{challengeId:'beachhead'});
const run=(g,seconds)=>{for(let i=0;i<Math.ceil(seconds*20)&&g.running;i++)g.update(.05);};

test('登陆挑战使用无桥海图，真实载重预装编队，港口与有限维修金可用',()=>{
  const g=create(),ship=g.getEntity(g.challenge.targetId);
  assert.equal(g.mapId,'archipelago');assert.equal(g.map.bridges?.length||0,0);assert.equal(g.nuclearEnabled,false);
  assert.equal(g.transportLoad(ship),11);assert.equal(ship.passengers.length,5);assert.equal(g.ownedBuildings(0,'dock').length,1);
  assert.ok(ship.passengers.every(id=>g.getEntity(id).embarkedIn===ship.id));assert.ok(g.selected.every(id=>!g.getEntity(id).embarkedIn));
  assert.equal(beachheadActivity(g),'capture');assert.equal(g.unloadTransport({...ship,x:1760}),0);
  assert.equal(Game.fromSave(g.toSave()).transportLoad(ship),11);
});

test('通信站需工程师接管与陆战守军驻守，敌军进入或守军离开重新计时',()=>{
  const g=create(),d=CHALLENGES.beachhead;g.time=1;const site=g.getEntity(d.objective.siteId);site.owner=0;
  assert.equal(beachheadActivity(g),'unguarded');const tank=g.ownedUnits(0,'tank')[0];tank.embarkedIn=null;tank.x=2650;tank.y=1540;
  assert.equal(beachheadActivity(g),'holding');g.updateChallenge(.05);assert.equal(g.challenge.beachhead.hold,.05);
  g.updateChallenge();assert.equal(g.challenge.beachhead.hold,.05);
  const enemy=g.addUnit(1,'rifle',2700,1550);assert.equal(beachheadActivity(g),'contested');g.updateChallenge(.05);assert.equal(g.challenge.beachhead.hold,0);
  enemy.hp=0;g.updateChallenge(.05);assert.equal(g.challenge.beachhead.hold,.05);
  tank.x=3000;g.updateChallenge(.05);assert.equal(g.challenge.beachhead.hold,0);
  tank.x=2650;g.paused=true;g.updateChallenge(.05);assert.equal(g.challenge.beachhead.hold,0);
});

test('登陆舰和接管前工程师损失均判负，超时与目标损失优先于完成驻守',()=>{
  for(const type of ['landing','engineer']){const g=create();g.ownedUnits(0,type)[0].hp=0;g.checkVictory();assert.equal(g.winner,1);assert.equal(g.challenge.stars,0);}
  for(const failure of ['timeout','destroyed']){const g=create();g.getEntity('beacon-east').owner=0;g.challenge.beachhead.hold=30;if(failure==='timeout')g.time=240;else g.getEntity(g.challenge.targetId).hp=0;g.checkVictory();assert.equal(g.winner,1);}
});

test('登陆任务可存取载员与驻守进度，拒绝篡改和未占领的计时',()=>{
  const g=create();run(g,1);const save=g.toSave();assert.deepEqual(Game.fromSave(save).challenge,g.challenge);
  for(const mutate of [s=>delete s.state.challenge.beachhead,s=>s.state.challenge.beachhead.hold=-1,s=>s.state.challenge.beachhead.hold=30,s=>s.state.challenge.beachhead.hold=.5,s=>s.state.challenge.beachhead.extra=1,s=>s.config.nuclearEnabled=true]){
    const copy=structuredClone(save);mutate(copy);assert.throws(()=>Game.fromSave(copy));
  }
  g.getEntity('beacon-east').owner=0;g.challenge.beachhead.hold=.5;assert.equal(Game.fromSave(g.toSave()).challenge.beachhead.hold,.5);
});

test('工程师驻站不计战损，三星任务、复盘和成绩档案口径一致',()=>{
  const g=create(),d=CHALLENGES.beachhead;g.time=40;g.challenge.wave=2;g.getEntity(d.objective.siteId).owner=0;
  const engineer=g.ownedUnits(0,'engineer')[0];engineer.hp=0;
  const tank=g.ownedUnits(0,'tank')[0];tank.embarkedIn=null;tank.x=2650;tank.y=1540;
  g.challenge.beachhead.hold=29.99;g.updateChallenge(.05);assert.equal(g.winner,0);assert.equal(g.challenge.stars,3);
  const result=completedChallengeResult(g);assert.equal(result.losses,0);assert.equal(applyChallengeResult(emptyChallengeProfile(),result).profile.results.length,1);
  assert.match(battleReportHTML(g),/抢滩接力 · 任务完成/);
});

test('登陆舰细节有合批预算和共享防滑纹理，跳板随靠岸停驻平滑开合，暂停不跳动',()=>{
  const model=refineLandingCraft(new THREE.Group()),ramp=model.getObjectByName('landing_ramp');assert.ok(ramp);refineLandingCraft(model);assert.equal(model.children.length,2);
  let meshes=0,triangles=0;model.traverse(m=>{if(m.isMesh){meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;assert.ok(m.geometry.attributes.uv);}});
  assert.ok(meshes<=12);assert.ok(triangles<24000);assert.ok(surfaceMaps('deck').normalMap);assert.equal(surfaceMaps('deck').map.userData.surfaceKind,'deck');
  assert.equal(replacedNavalPart('landing','舰艏跳板.002'),true);assert.equal(replacedNavalPart('carrier','舰艏跳板'),false);
  const entry={model},g={map:{water:{x1:1040,x2:2480}},time:10},u={type:'landing',x:2400,lastMovedAt:0};
  animateLandingCraft(entry,u,g,1);assert.ok(ramp.rotation.z<0);const angle=ramp.rotation.z;animateLandingCraft(entry,u,g,0);assert.equal(ramp.rotation.z,angle);
  u.order={type:'move'};animateLandingCraft(entry,u,g,1);assert.ok(ramp.rotation.z>1.5);delete u.order;u.x=1760;animateLandingCraft(entry,u,g,1);assert.ok(ramp.rotation.z>1.56);
  const clone={model:model.clone(true)};animateLandingCraft(clone,{...u,x:2400},g,1);assert.notEqual(clone.model.getObjectByName('landing_ramp').rotation.z,ramp.rotation.z);
  animateLandingCraft(entry,{...u,x:1170},g,1);assert.ok(ramp.rotation.z>1.56);
  const cargo=landingCargoLayout(create().units.filter(u=>u.embarkedIn));assert.equal(cargo.length,5);assert.equal(cargo.filter(p=>p.z===0).length,2);assert.ok(cargo.every(p=>p.x>=-3&&p.x<=7&&p.y===.9));
});

test('友舰占住近岸落点时登陆舰安全停航，不在十米边缘反复抖动阻塞卸载',()=>{
  const g=create(),ship=g.getEntity(g.challenge.targetId),frigate=g.ownedUnits(0,'frigate')[0];ship.x=2340;ship.y=1450;frigate.x=2407;frigate.y=1565;
  g.units=g.units.filter(u=>u.id===ship.id||u.id===frigate.id||u.embarkedIn);g.selected=[ship.id];g.command(2400,1450);run(g,8);
  assert.equal(ship.order,null);assert.ok(Math.hypot(ship.x-2400,ship.y-1450)<37);const position={x:ship.x,y:ship.y};run(g,4);assert.ok(Math.hypot(ship.x-position.x,ship.y-position.y)<.01);
  assert.equal(g.unloadTransport(ship),5);assert.ok(Math.hypot(ship.x-frigate.x,ship.y-frigate.y)>=124);
});

test('载员近景只为有限登陆舰显示，密集战、拉远与敌舰不增加甲板精模',()=>{
  const units=Array.from({length:10},(_,id)=>({id,type:'landing',owner:0,x:id*80,y:0,passengers:[100+id]})),center={x:0,y:0};
  const selected=landingDetailPlan(units,1.5,'high',[9],center);assert.equal(selected.size,4);assert.ok(selected.has(9));
  assert.equal(landingDetailPlan(units,1.5,'standard',[],center).size,2);
  assert.equal(landingDetailPlan(units,1.3,'high',[],center).size,0);assert.equal(landingDetailPlan(units,1.3,'high',[],center,selected).size,4);
  assert.equal(landingDetailPlan(units,1.1,'high',[],center,selected).size,0);assert.deepEqual([...landingDetailPlan(units,.8,'high',[9],center)],[9]);
  const army=[...units,...Array.from({length:120},(_,i)=>({id:i+1000,type:'tank',owner:0,x:i,y:0}))];assert.equal(landingDetailPlan(army,2,'high',[],center).size,1);
  assert.equal(landingDetailPlan(units.map(u=>({...u,owner:1})),2,'high',[9],center).size,0);
});

test('巡逻中的运输单位不能边航行边卸载，停驻后仍使用陆地安全落点',()=>{
  const g=create(),ship=g.getEntity(g.challenge.targetId);ship.x=2400;ship.order={type:'patrol',x:2200,y:1400};assert.equal(g.unloadTransport(ship),0);
  ship.order=null;assert.equal(g.unloadTransport(ship),5);assert.equal(ship.passengers.length,0);assert.ok(g.ownedUnits(0).filter(u=>!['landing','destroyer','frigate'].includes(u.type)).every(u=>g.canOccupyUnit(u,u)));
});

test('正常海运、卸载、陆战与工程师接管指令可完成，多种寻路时序均能通关',()=>{
  const original=Math.random;
  try{
    for(let seed=1;seed<=8;seed++){
      let value=seed;Math.random=()=>((value=Math.imul(value,1664525)+1013904223>>>0)/4294967296);
      const g=create(),ship=g.getEntity(g.challenge.targetId),command=(units,x,y,attack=false)=>{g.selected=units.map(u=>u.id);g.command(x,y,attack);};
      command([ship],seed%2?2399.999972:2400,1450);command(g.activeUnits(0).filter(u=>u.type!=='landing'),2400,1640,true);
      let stage=0;
      for(let i=0;i<4800&&g.running;i++){
        if(stage===0&&ship.x>2360&&!ship.order){assert.equal(g.unloadTransport(ship),5);command(g.activeUnits(0).filter(u=>['tank','rifle','supply'].includes(u.type)),2590,1510,true);stage=1;}
        if(stage===1&&g.time>26){command(g.ownedUnits(0,'engineer'),2650,1540);stage=2;}
        g.update(.05);
      }
      assert.equal(g.winner,0,`寻路时序 ${seed}：${g.challenge.reason}`);assert.equal(stage,2);assert.equal(g.getEntity('beacon-east').owner,0);assert.equal(ship.passengers.length,0);
      assert.ok(g.time<240);assert.ok(g.battleStats.sides[0].damageDealt>500);assert.ok(completedChallengeResult(g).stars>=1);
    }
  }finally{Math.random=original;}
});
