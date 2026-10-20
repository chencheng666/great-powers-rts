import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CHALLENGES, challengeStatus } from '../src/challenges.js';
import { battleReport, battleReportHTML, recordBattleEvent, REPORT_EVENT_LIMIT, validateBattleStats } from '../src/battle-report.js';
import { battleView } from '../server/battle-view.mjs';
import { armyDetailPlan } from '../src/army-detail.js';
import { surfaceMaps } from '../src/model-craft.js';
import { createPersonnel } from '../src/personnel-models.js';
import { personnelLOD } from '../src/personnel-lod.js';

const create=id=>new Game('nato','russia',{},{challengeId:id});
const run=(g,seconds)=>{for(let i=0;i<seconds*20&&g.running;i++)g.update(.05);};

test('挑战固定地图、阵营和标准难度，不开放建造生产和外部收入',()=>{
  for(const id of Object.keys(CHALLENGES)){
    const g=create(id),d=CHALLENGES[id];assert.equal(g.mapId,d.mapId);assert.equal(g.players[0].faction,'china');assert.equal(g.victoryMode,'annihilation');assert.equal(g.battlefieldScale,1);
    assert.equal(g.startBuild(0,'power'),false);assert.equal(g.queueUnit(0,'tank'),false);
    const money=g.players[0].credits;g.updateLogistics(100);assert.equal(g.units.some(u=>u.freight),false);assert.equal(g.players[0].credits,money);
    assert.ok(g.resourceSites.every(s=>s.amount===0));assert.equal(g.units.length,d.force.length);assert.equal(challengeStatus(g).nextIn,d.waves[0].at);
  }
});
test('暂停不触发波次、每波只刷一次，读档保留目标、波次与复盘',()=>{
  const g=create('airshield');g.paused=true;run(g,30);assert.equal(g.time,0);assert.equal(g.challenge.wave,0);g.paused=false;run(g,13);
  assert.equal(g.challenge.wave,1);const count=g.ownedUnits(1).length;g.updateChallenge();assert.equal(g.ownedUnits(1).length,count);
  const restored=Game.fromSave(g.toSave());assert.equal(restored.paused,true);assert.deepEqual(restored.challenge,g.challenge);assert.deepEqual(battleReport(restored),battleReport(g));
  restored.paused=false;restored.updateChallenge();assert.equal(restored.ownedUnits(1).length,count);
});
test('篡改任务、地图、目标与波次的存档被拒绝，旧遭遇战仍能读取',()=>{
  const save=create('corridor').toSave();
  for(const change of [s=>s.config.challengeId='unknown',s=>s.config.mapId='frontier',s=>s.state.challenge.targetId=-1,s=>s.state.challenge.wave=1,s=>s.state.challenge.stars=3,s=>delete s.state.challenge]){
    const s=structuredClone(save);change(s);assert.throws(()=>Game.fromSave(s));
  }
  const ordinary=new Game('china','nato').toSave();assert.equal(Game.fromSave(ordinary).challenge,undefined);
});
test('任务保护目标同帧被毁或超时不能误判获胜，普通歼灭规则不抢先结束任务',()=>{
  const g=create('corridor'),target=g.getEntity(g.challenge.targetId);g.checkVictory();assert.equal(g.running,true);
  g.time=50;target.x=1570;target.y=1030;target.hp=0;g.checkVictory();assert.equal(g.winner,1);assert.equal(g.challenge.stars,0);
  const late=create('corridor');late.time=150;const t=late.getEntity(late.challenge.targetId);t.x=1570;t.y=1030;late.checkVictory();assert.equal(late.winner,1);
});
test('撤离需等待接应且周围无敌军，目标完整与低战损可获三星',()=>{
  const g=create('corridor'),target=g.getEntity(g.challenge.targetId);target.x=1570;target.y=1030;g.time=2;g.checkVictory();assert.equal(g.running,true);
  g.time=46;g.checkVictory();assert.equal(g.running,true);assert.equal(g.challenge.wave,3);
  g.units=g.units.filter(u=>u.owner===0);g.checkVictory();assert.equal(g.winner,0);assert.equal(g.challenge.stars,3);
  assert.match(battleReportHTML(g),/任务完成/);
});
test('雷达防御必须刷完全部波次并清场，保护目标仍存续才能结算',()=>{
  const g=create('airshield');g.time=79;g.checkVictory();assert.equal(g.challenge.wave,3);assert.equal(g.running,true);
  g.units=g.units.filter(u=>u.owner===0);g.checkVictory();assert.equal(g.winner,0);assert.equal(g.challenge.stars,3);
  assert.equal(g.battleStats.events.filter(e=>e.kind==='challengeWave').length,3);
});
test('护航关卡可用正常编队指令和真实战斗完成，不依赖瞬移或无敌',()=>{
  const g=create('corridor');g.selected=g.ownedUnits(0).map(u=>u.id);g.command(1570,1030,true);run(g,150);
  assert.equal(g.winner,0);assert.equal(g.challenge.wave,3);assert.ok(g.battleStats.sides[0].damageDealt>0);assert.ok(g.challenge.stars>=1);
});
test('反蜂群关卡通过调动防御编队应对两翼突击可正常获胜',()=>{
  const original=Math.random;
  try {
    for(let seed=1;seed<=12;seed++){
      let value=seed;Math.random=()=>((value=Math.imul(value,1664525)+1013904223>>>0)/4294967296);
      const g=create('airshield');
      for(let i=0;i<2402&&g.running;i++){
        if(i===760||i===1480){g.selected=g.ownedUnits(0).map(u=>u.id);g.command(1120,i===760?560:900,true);}
        g.update(.05);
      }
      assert.equal(g.winner,0,`寻路时序 ${seed}`);assert.ok(g.getEntity(g.challenge.targetId).hp>0);assert.equal(g.challenge.wave,3);assert.ok(g.battleStats.sides[0].damageDealt>1000);
    }
  } finally {
    Math.random=original;
  }
});
test('复盘有界、深拷贝、保留截断提示，非法文本事件不能进入存档',()=>{
  const g=new Game('china','nato');
  for(let i=0;i<REPORT_EVENT_LIMIT+9;i++)recordBattleEvent(g,{kind:'captured',owner:i%2,type:'oil'});
  assert.equal(g.battleStats.events.length,REPORT_EVENT_LIMIT);assert.equal(g.battleStats.omittedEvents,9);assert.ok(validateBattleStats(g.battleStats,0));
  const report=battleReport(g);report.events[0].type='bad';assert.equal(g.battleStats.events[0].type,'oil');
  assert.match(battleReportHTML(g),/较早的 9 条/);assert.match(battleReportHTML(g),/data-report-filter="resource"/);
  g.battleStats.events[0].type='<img onerror=alert(1)>';assert.equal(validateBattleStats(g.battleStats,0),false);assert.throws(()=>g.toSave());
});
test('战斗中的复盘不向联机泄露，占领和运输事件在结算按席位重排',()=>{
  const g=new Game('china','nato',{},{multiplayer:true});recordBattleEvent(g,{kind:'delivered',owner:1,type:'freightPlane',value:720});
  assert.equal(battleView(g,0).battleReport,null);g.endGame(1);const report=battleView(g,1).battleReport;
  assert.equal(report.events[0].owner,0);assert.equal(report.events[0].value,720);
});
test('大军团人物精模预算有限，选中单位优先；小规模近景与履带细节保留',()=>{
  const units=Array.from({length:240},(_,id)=>({id,type:'rifle',x:id,y:0}));
  const plan=armyDetailPlan(units,1.8,'high',[239],{x:0,y:0});assert.equal(plan.near.size,12);assert.ok(plan.near.has(239));assert.equal(plan.tracks,false);
  assert.equal(armyDetailPlan(units,.8,'high',[],{x:0,y:0}).near.size,0);
  assert.equal(armyDetailPlan(units.slice(0,60),1.8,'high',[],{x:0,y:0}).near.size,60);
  assert.equal(armyDetailPlan(units.slice(0,60),1.8,'high',[],{x:0,y:0}).tracks,true);
  assert.equal(units[0].id,0);
});
test('作战服有迷彩、织物凹凸与粗糙度，间谍仍是黑西装且远景不污染近景',()=>{
  const maps=surfaceMaps('uniform'),data=maps.map.image.data;assert.equal(maps.map,surfaceMaps('uniform').map);assert.notEqual(maps.map,surfaceMaps('fabric').map);
  assert.ok(data.some((v,i)=>i%4===0&&v!==data[i+1]));assert.ok(maps.normalMap&&maps.roughnessMap);
  const soldier=createPersonnel('rifle'),spy=createPersonnel('scout');let uniform,black;
  soldier.traverse(m=>{if(m.isMesh&&m.material.name==='作战服')uniform=m.material;});spy.traverse(m=>{if(m.isMesh&&m.material.name==='黑色西装')black=m.material;});
  const color=uniform.color.clone();personnelLOD(soldier);assert.ok(uniform.color.equals(color));assert.equal(uniform.map,maps.map);assert.equal(black.map,surfaceMaps('fabric').map);
});
