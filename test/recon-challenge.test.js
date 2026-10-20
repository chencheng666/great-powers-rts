import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CHALLENGES,challengeStatus,reconActivity } from '../src/challenges.js';
import { battleReportHTML,validateBattleStats } from '../src/battle-report.js';
import { completedChallengeResult,applyChallengeResult,emptyChallengeProfile,exportChallengeProfile,parseChallengeExport } from '../src/challenge-profile.js';

const create=()=>new Game('china','nato',{}, {challengeId:'recon',nuclearEnabled:true});
const run=(g,s)=>{for(let i=0;i<s*20&&g.running;i++)g.update(.05);};
const atNode=g=>{const u=g.getEntity(g.challenge.targetId),n=CHALLENGES.recon.nodes[g.challenge.intel.completed];u.x=n.x;u.y=n.y;u.order=null;u.lastMovedAt=-10;g.units=g.units.filter(v=>v.owner===0);g.fogs[1].visible.fill(false);g.fogTimer=1e9;return u;};

test('纵深侦察使用战略地图但关闭核规则，目标无武装且观察点与出口可达',()=>{
  const g=create(),d=CHALLENGES.recon;assert.equal(g.world.width,6400);assert.equal(g.nuclearEnabled,false);assert.equal(g.getEntity(g.challenge.targetId).type,'scout');
  assert.deepEqual(g.challenge.intel,{completed:0,progress:0});
  for(const p of [...d.nodes,d.objective])assert.equal(g.isGroundBlocked(p.x,p.y,10),false);
  assert.equal(challengeStatus(g).activity,'travel');assert.equal(g.canBuild(0,'power'),false);
});

test('停稳且脱离敌方视野连续采集，移动受击暴露瘫痪与登乘中断，已完成资料保留',()=>{
  const g=create(),u=atNode(g);run(g,2);assert.ok(g.challenge.intel.progress>1.9);
  for(const [flag,value]of [['lastMovedAt',g.time],['lastDamageAt',g.time],['stunUntil',g.time+2],['embarkedIn',123]]){
    g.challenge.intel.progress=2;u[flag]=value;g.updateChallenge(.05);assert.equal(g.challenge.intel.progress,0,flag);u[flag]=flag==='embarkedIn'?null:-10;
  }
  g.challenge.intel.progress=2;g.fogs[1].visible.fill(true);assert.equal(reconActivity(g,u),'detected');g.updateChallenge(.05);assert.equal(g.challenge.intel.progress,0);
  g.fogs[1].visible.fill(false);run(g,6.1);assert.equal(g.challenge.intel.completed,1);assert.equal(g.challenge.intel.progress,0);
  run(g,1);assert.equal(g.challenge.intel.completed,1);assert.match(battleReportHTML(g),/第 1 处情报已记录/);
});

test('暂停、无时间步与重复调用不会刷采集，巡逻不会凭隐藏目标位置生成追踪指令',()=>{
  const g=create(),u=atNode(g);g.paused=true;run(g,5);assert.equal(g.time,0);assert.equal(g.challenge.intel.progress,0);
  g.paused=false;g.updateChallenge();assert.equal(g.challenge.intel.progress,0);
  g.time=7;g.updateChallenge();assert.equal(g.challenge.wave,1);
  for(const enemy of g.ownedUnits(1)){assert.equal(enemy.order.type,'patrol');assert.notEqual(enemy.order.x,u.x);assert.equal(enemy.autoDrone,undefined);}
});

test('侦察进度、巡逻和情报事件能存取，非法进度及核开关不能混入挑战档',()=>{
  const g=create();atNode(g);run(g,2);const save=g.toSave(),loaded=Game.fromSave(save);assert.deepEqual(loaded.challenge,g.challenge);
  assert(loaded.paused);assert.ok(validateBattleStats(loaded.battleStats,loaded.time));
  for(const mutate of [s=>s.state.challenge.intel.completed=4,s=>s.state.challenge.intel.progress=6,s=>s.state.challenge.intel.progress=-1,s=>s.state.challenge.intel.completed=3,s=>delete s.state.challenge.intel,s=>s.config.nuclearEnabled=true]){
    const bad=structuredClone(save);mutate(bad);assert.throws(()=>Game.fromSave(bad));
  }
  const mixed=new Game('china','nato',{}, {challengeId:'corridor'});run(mixed,4);assert.doesNotThrow(()=>Game.fromSave(mixed.toSave()),'修复混合波次错误附加无人机字段导致无法保存');
});

test('采齐情报不直接获胜，目标存续、撤离位置和时限共同判定，失败优先',()=>{
  const g=create();g.time=70;g.challenge.wave=3;g.challenge.intel.completed=3;const u=g.getEntity(g.challenge.targetId);
  u.x=3900;u.y=2580;g.checkVictory();assert(g.running);u.x=800;u.y=2080;u.hp=0;g.checkVictory();assert.equal(g.winner,1);
  const late=create();late.time=210;late.challenge.intel.completed=3;late.checkVictory();assert.equal(late.winner,1);
  const early=create();early.checkVictory();assert(early.running);
});

test('正常指令下协同护送侦察、采集并撤离，多种寻路时序可完成且成绩能备份',()=>{
  const original=Math.random;
  try{
    for(let seed=1;seed<=8;seed++){
      let random=seed;Math.random=()=>((random=Math.imul(random,1664525)+1013904223>>>0)/4294967296);
      const g=create(),u=g.getEntity(g.challenge.targetId),d=CHALLENGES.recon;
      const escort=(x,y)=>{g.selected=g.ownedUnits(0).filter(v=>v.id!==u.id).map(v=>v.id);g.command(x,y,true);};
      escort(2760,2160);let stage=-1;
      for(let i=0;i<4201&&g.running;i++){
        if(stage!==g.challenge.intel.completed){stage=g.challenge.intel.completed;if(stage===2)escort(3970,2360);const p=d.nodes[stage]||d.objective;g.selected=[u.id];g.command(p.x-(stage<3?85:0),p.y-(stage<3?30:0));}
        g.update(.05);
      }
      assert.equal(g.winner,0,`寻路时序 ${seed}`);assert.equal(g.challenge.intel.completed,3);assert.ok(g.time<210);assert.equal(u.hp,u.maxHp);
      assert.equal(g.battleStats.events.filter(e=>e.kind==='challengeIntel').length,3);
      const result=completedChallengeResult(g,1000),profile=applyChallengeResult(emptyChallengeProfile(),result).profile;
      assert.deepEqual(parseChallengeExport(JSON.stringify(exportChallengeProfile(profile))),profile);
    }
  }finally{Math.random=original;}
});
