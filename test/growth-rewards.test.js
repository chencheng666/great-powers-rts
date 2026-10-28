import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyHonors, applyHonorResult, writeHonors } from '../src/player-honors.js';
import { createBattleId } from '../src/battle-identity.js';
import { growthProgress, growthAppearance, equipAppearance, SHARE_URL, shareText, entrySource } from '../src/growth-rewards.js';
import { Game } from '../src/game.js';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};};
test('奖励随既有荣誉解锁，装备不可越过门槛，不改积分',()=>{
 const s=storage();assert.throws(()=>equipAppearance(s,'jade'));let p=emptyHonors();
 for(const mapId of ['valleyTraining','canyon','valleyTraining'])p=applyHonorResult(p,{battleId:createBattleId(),winner:0,mapId,difficulty:'recruit',mode:'quick',faction:'china',time:120}).profile;
 writeHonors(s,p);const progress=growthProgress(p);assert.equal(progress.trial,true);assert.equal(progress.baseDecor,true);const points=p.points;equipAppearance(s,'jade');assert.equal(growthAppearance(s).theme.id,'jade');assert.equal(progress.profile.points,points);assert.equal(progress.unlocked.length,3);
});
test('异常存储回退原外观，分享不含玩家身份，渠道只接受白名单',()=>{
 const broken={getItem(){throw Error('不可用');}};assert.equal(growthAppearance(broken).theme.id,'standard');
 const text=shareText(growthProgress(emptyHonors()));assert.ok(text.includes(SHARE_URL));assert.ok(text.includes('数字机器莱西奥'));assert.ok(text.includes('github.com'));assert.equal(entrySource({search:'?from=warreport&token=secret'}),'warreport');assert.equal(entrySource({search:'?from=secret'}),'direct');
});
test('成长试炼仅限单机，既有地图仍可直接开始',()=>{
 assert.throws(()=>new Game('china','nato',{}, {mapId:'commanderTrial',multiplayer:true}),/单机/);
 const g=new Game('china','nato',{}, {mapId:'commanderTrial',difficulty:'standard'});assert.equal(g.beginnerSupport,false);assert.equal(g.players[0].credits,g.players[1].credits);
 assert.equal(new Game('china','nato',{}, {mapId:'strait'}).mapId,'strait');
});

test('挑战胜利另行解锁紫晶外观，不增加普通战局荣誉或解锁试炼',()=>{const p=emptyHonors(),g=growthProgress(p,1);assert.ok(g.unlocked.some(r=>r.id==='amethyst'));assert.equal(g.trial,false);assert.equal(g.profile.points,0);});
