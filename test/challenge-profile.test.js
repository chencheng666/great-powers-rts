import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CHALLENGE_PROFILE_KEY, CHALLENGE_RESULT_LIMIT, emptyChallengeProfile, validateChallengeProfile, readChallengeProfile, challengeRecords, applyChallengeResult, settleChallengeResult, completedChallengeResult, exportChallengeProfile, parseChallengeExport, mergeChallengeProfiles } from '../src/challenge-profile.js';

const storage = () => { const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}; };
const result = (changes={}) => ({battleId:'challenge-test-00001',challengeId:'corridor',winner:0,stars:3,time:60,health:1,losses:0,at:100,...changes});
function finish() {
  const g=new Game('china','asia',{},{challengeId:'corridor'});
  g.time=50;g.updateChallenge();g.units=g.units.filter(u=>u.owner===0);const target=g.getEntity(g.challenge.targetId);target.x=1570;target.y=1030;g.checkVictory();return g;
}

test('挑战成绩从真实结束战局生成，进行中、联机及非法星级不进入档案',()=>{
  const g=finish(),r=completedChallengeResult(g,100);assert.equal(r.stars,3);assert.equal(r.winner,0);assert.equal(r.losses,0);
  g.running=true;assert.throws(()=>completedChallengeResult(g));g.running=false;g.online=true;assert.throws(()=>completedChallengeResult(g));g.online=false;g.challenge.stars=9;assert.throws(()=>completedChallengeResult(g));
});
test('成功与失败分开计数，低星或更慢战绩不覆盖最佳，最快时间独立记录',()=>{
  let profile=applyChallengeResult(emptyChallengeProfile(),result()).profile;
  profile=applyChallengeResult(profile,result({battleId:'challenge-test-00002',winner:1,stars:0,health:0,time:80})).profile;
  profile=applyChallengeResult(profile,result({battleId:'challenge-test-00003',stars:1,health:.4,losses:3,time:50})).profile;
  assert.deepEqual(challengeRecords(profile).corridor,{attempts:3,wins:2,bestStars:3,fastestTime:50});
  const slower=applyChallengeResult(profile,result({battleId:'challenge-test-00004',time:70}));assert.deepEqual(slower.improved,[]);
  assert.equal(profile.results.length,3);assert.equal(slower.profile.results.length,4);
});
test('同一战局重复打开或复制存档再次结算不累计，普通荣誉与存档键不变',()=>{
  const s=storage(),g=finish();s.setItem('great-powers-player-honors-v1','荣誉原文');s.setItem('great-powers-save-manual-v1','存档原文');
  const a=settleChallengeResult(s,g,100),b=settleChallengeResult(s,g,200);assert.equal(a.status,'recorded');assert.equal(b.status,'duplicate');assert.equal(readChallengeProfile(s).results.length,1);
  assert.equal(s.getItem('great-powers-player-honors-v1'),'荣誉原文');assert.equal(s.getItem('great-powers-save-manual-v1'),'存档原文');
});
test('存储不可用、配额不足和坏 JSON 不重置历史，恢复后可用同一战局重试',()=>{
  const s=storage(),g=finish();assert.deepEqual(readChallengeProfile(s),emptyChallengeProfile());
  s.setItem(CHALLENGE_PROFILE_KEY,JSON.stringify(emptyChallengeProfile()));const old=s.getItem(CHALLENGE_PROFILE_KEY),set=s.setItem;
  s.setItem=()=>{throw Error('配额不足');};assert.throws(()=>settleChallengeResult(s,g),/尚未保存/);assert.equal(s.getItem(CHALLENGE_PROFILE_KEY),old);
  s.setItem=set;assert.equal(settleChallengeResult(s,g).status,'recorded');s.setItem(CHALLENGE_PROFILE_KEY,'{bad');assert.throws(()=>readChallengeProfile(s),/损坏/);assert.equal(s.getItem(CHALLENGE_PROFILE_KEY),'{bad');
  assert.throws(()=>readChallengeProfile({getItem(){throw Error('禁用存储');}}),/无法读取/);
});
test('备份可往返，合并去重、保留最佳且不修改原对象，重复导入幂等',()=>{
  const a=applyChallengeResult(emptyChallengeProfile(),result()).profile;
  const b=applyChallengeResult(a,result({battleId:'challenge-test-00002',stars:1,health:.5,losses:2,time:50})).profile;
  const parsed=parseChallengeExport(JSON.stringify(exportChallengeProfile(b))),merged=mergeChallengeProfiles(a,parsed);
  assert.equal(merged.added,1);assert.equal(a.results.length,1);assert.equal(merged.profile.results.length,2);assert.equal(challengeRecords(merged.profile).corridor.bestStars,3);
  assert.equal(mergeChallengeProfiles(merged.profile,parsed).added,0);
  const conflict=structuredClone(parsed);conflict.results[0].time=70;assert.throws(()=>mergeChallengeProfiles(a,conflict),/不一致/);assert.equal(a.results[0].time,60);
});
test('档案拒绝重复编号、错误类型、虚假星级、越界生命与任务时间',()=>{
  for(const changes of [{battleId:'x'},{challengeId:'__proto__'},{winner:'0'},{stars:2},{losses:99},{health:Infinity},{health:1.1},{time:30},{time:151},{at:-1},{extra:'<script>'}]) {
    assert.throws(()=>validateChallengeProfile({version:1,results:[result(changes)]}));
  }
  assert.throws(()=>validateChallengeProfile({version:1,results:[result(),result()]}));assert.throws(()=>parseChallengeExport('{}'));
  assert.throws(()=>parseChallengeExport(JSON.stringify({format:'great-powers-honors',version:1,profile:emptyChallengeProfile()})),/对应入口/);
  assert.throws(()=>parseChallengeExport('x'.repeat(2*1024*1024+1)),/过大/);
});
test('记录容量耗尽不会静默淘汰历史，已记录战局在满容量时仍可幂等读取',()=>{
  const profile={version:1,results:Array.from({length:CHALLENGE_RESULT_LIMIT},(_,i)=>result({battleId:`challenge-record-${i.toString().padStart(5,'0')}`}))};
  assert.equal(validateChallengeProfile(profile),profile);
  assert.throws(()=>applyChallengeResult(profile,result()),/5000/);assert.equal(applyChallengeResult(profile,profile.results[0]).status,'duplicate');
  assert.throws(()=>mergeChallengeProfiles(profile,{version:1,results:[result()]}),/5000/);assert.equal(profile.results.length,CHALLENGE_RESULT_LIMIT);
});
