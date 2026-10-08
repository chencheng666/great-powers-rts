import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Game } from '../src/game.js';
import { MAPS,FACTIONS } from '../src/data.js';
import { parseSave } from '../src/savegame.js';
import { createBattleId,validBattleId } from '../src/battle-identity.js';
import { HONOR_KEY,HONOR_RANKS,emptyHonors,validateHonors,readHonors,writeHonors,honorRank,honorProgress,applyHonorResult,settleHonors,exportHonors,parseHonorExport,victoryPraise } from '../src/player-honors.js';
import { honorBadge,honorResultHTML } from '../src/honor-ui.js';

const memory = () => { const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)}; };
const result = (id=0,extra={}) => ({battleId:`test-battle-${String(id).padStart(8,'0')}`,winner:0,difficulty:'standard',mode:'quick',mapId:'valley',faction:'china',time:350,...extra});
const win = (profile,id,extra={}) => applyHonorResult(profile,result(id,extra),1000+id);

test('八阶称号同时要求积分与胜场，门槛递增，最高称号不溢出',()=>{
  assert.equal(HONOR_RANKS.length,8);
  for(const rank of HONOR_RANKS) {
    const profile={...emptyHonors(),points:rank.points,wins:rank.wins};
    assert.equal(honorRank(profile).name,rank.name);
    if(rank.index) {
      assert.ok(rank.points>HONOR_RANKS[rank.index-1].points&&rank.wins>HONOR_RANKS[rank.index-1].wins);
      assert.ok(honorRank({...profile,wins:rank.wins-1}).index<rank.index);
      assert.ok(honorRank({...profile,points:rank.points-1}).index<rank.index);
    }
  }
  assert.equal(honorRank({points:999999,wins:9999}).index,7);
  assert.deepEqual(honorProgress({points:999999,wins:9999}).next,undefined);
  assert.equal(honorProgress({points:999999,wins:9999}).ratio,1);
  const p=honorProgress({points:500,wins:1});assert.equal(p.pointsNeeded,0);assert.equal(p.winsNeeded,2);assert.ok(p.ratio<=1);
});

test('按难度与模式计分，首胜与专家、海战、月表功勋各只奖励一次',()=>{
  for(const [difficulty,base] of [['recruit',100],['standard',160],['veteran',240]])for(const [mode,bonus]of [['quick',0],['annihilation',20],['control',30]]) {
    const first=win(emptyHonors(),0,{difficulty,mode});
    assert.equal(first.gained,base+bonus+80+(difficulty==='veteran'?60:0));
    assert.equal(first.profile.wins,1);assert.equal(first.profile.victories[difficulty],1);assert.equal(first.toRank.index,1);
    const second=win(first.profile,1,{difficulty,mode});assert.equal(second.gained,base+bonus);assert.equal(second.unlocked.length,0);
  }
  let p=emptyHonors();const sea=win(p,2,{mapId:'archipelago'});assert.ok(sea.unlocked.some(a=>a.id==='first-sea'));assert.equal(win(sea.profile,3,{mapId:'ocean'}).gained,160);
  const moon=win(sea.profile,4,{mapId:'meridian'});assert.ok(moon.unlocked.some(a=>a.id==='first-moon'));assert.equal(win(moon.profile,5,{mapId:'meridian'}).gained,160);
});

test('胜场里程碑、五阵营与七域功勋完整解锁，连续胜利不重复奖励',()=>{
  let p=emptyHonors();const maps=Object.keys(MAPS),factions=Object.keys(FACTIONS),counts=new Map();
  for(let i=0;i<105;i++) {
    const settled=win(p,i,{mapId:maps[i%maps.length],faction:factions[i%factions.length],difficulty:'veteran'});
    for(const a of settled.unlocked)counts.set(a.id,(counts.get(a.id)||0)+1);
    if([5,10,25,50,100].includes(i+1))assert.ok(settled.unlocked.some(a=>a.id===`wins-${i+1}`));
    p=settled.profile;
  }
  assert.equal(p.wins,105);assert.equal(p.recent.length,12);assert.equal(p.completedIds.length,105);assert.equal(honorRank(p).index,7);
  for(const id of ['first-win','first-expert','first-sea','first-moon','all-factions','all-maps','wins-5','wins-10','wins-25','wins-50','wins-100'])assert.equal(counts.get(id),1);
  assert.equal(p.recent[0].battleId,result(104).battleId);assert.equal(p.recent[11].battleId,result(93).battleId);
});

test('平局和失败不扣分不降级，结算仅留编号，重复事件不增加任何奖励',()=>{
  const storage=memory(),first=settleHonors(storage,result(0));
  const points=first.profile.points,rank=honorRank(first.profile).index;
  for(const [id,winner]of [[1,1],[2,'draw']]) {
    const settled=settleHonors(storage,result(id,{winner}));assert.equal(settled.gained,0);assert.equal(settled.status,'no-award');assert.equal(settled.profile.points,points);assert.equal(settled.profile.wins,1);assert.equal(honorRank(settled.profile).index,rank);
    assert.equal(settleHonors(storage,result(id)).status,'duplicate');
  }
  assert.equal(settleHonors(storage,result(0)).status,'duplicate');assert.equal(readHonors(storage).wins,1);
});

test('保存与读取使用同一战局编号，重放同一存档再次获胜不重复积分',()=>{
  const storage=memory(),game=new Game('china','nato'),saved=game.toSave();
  assert.ok(validBattleId(game.battleId));assert.equal(saved.config.battleId,game.battleId);
  const completed=g=>settleHonors(storage,{battleId:g.battleId,winner:0,difficulty:'standard',mode:g.victoryMode,mapId:g.mapId,faction:g.players[0].faction,time:g.time});
  assert.equal(completed(game).status,'awarded');
  const loaded=Game.fromSave(parseSave(JSON.stringify(saved)));assert.equal(loaded.battleId,game.battleId);
  assert.equal(completed(loaded).status,'duplicate');assert.equal(readHonors(storage).wins,1);
  const next=new Game('china','nato');assert.notEqual(next.battleId,game.battleId);assert.equal(completed(next).status,'awarded');
  assert.equal(new Set(Array.from({length:100},createBattleId)).size,100);
});

test('旧版存档兼容且原文件指纹稳定，迁移后再保存会保留新编号',()=>{
  const save=new Game('russia','nato').toSave();delete save.config.battleId;
  const a=Game.fromSave(save),b=Game.fromSave(JSON.parse(JSON.stringify(save)));
  assert.ok(a.battleId.startsWith('legacy-'));assert.equal(a.battleId,b.battleId);assert.ok(validBattleId(a.battleId));
  assert.equal(Game.fromSave(a.toSave()).battleId,a.battleId);
  const invalid=structuredClone(save);invalid.config.battleId='<script>';assert.throws(()=>parseSave(JSON.stringify(invalid)));
});

test('存储失败不乐观加分、不留下半份账本，修复后可重试且只领一次',()=>{
  const storage=memory();settleHonors(storage,result(0));const before=storage.getItem(HONOR_KEY),set=storage.setItem;
  storage.setItem=()=>{throw new Error('配额不足');};assert.throws(()=>settleHonors(storage,result(1)),/未被覆盖/);assert.equal(storage.getItem(HONOR_KEY),before);
  storage.setItem=set;assert.equal(settleHonors(storage,result(1)).status,'awarded');assert.equal(settleHonors(storage,result(1)).status,'duplicate');assert.equal(readHonors(storage).wins,2);
  assert.throws(()=>readHonors({getItem(){throw new Error('禁止');}}),/权限/);
});

test('损坏荣誉及不完整结算拒绝写入，不重置原档案',()=>{
  const storage=memory();storage.setItem(HONOR_KEY,'{损坏');assert.throws(()=>settleHonors(storage,result(1)));assert.equal(storage.getItem(HONOR_KEY),'{损坏');
  for(const change of [p=>p.points=-1,p=>p.wins=NaN,p=>p.version=9,p=>p.completedIds=['bad'],p=>p.maps=['unknown'],p=>p.victories.standard=1,p=>p.achievements=['made-up']]) {
    const p=emptyHonors();change(p);assert.throws(()=>validateHonors(p));
  }
  for(const extra of [{winner:false},{difficulty:'unknown'},{mode:'unknown'},{mapId:'unknown'},{faction:'unknown'},{time:NaN},{battleId:'tiny'}])assert.throws(()=>applyHonorResult(emptyHonors(),result(1,extra)));
});

test('导出为独立荣誉档案，校验导入且保持去重编号，不把战局存档当荣誉',()=>{
  const profile=win(emptyHonors(),0).profile,file=exportHonors(profile,1000);
  file.profile.points+=1;assert.notEqual(file.profile.points,profile.points);
  const restored=parseHonorExport(JSON.stringify(exportHonors(profile)));assert.deepEqual(restored,profile);
  assert.equal(applyHonorResult(restored,result(0)).status,'duplicate');
  const storage=memory();writeHonors(storage,restored);assert.deepEqual(readHonors(storage),profile);
  assert.throws(()=>parseHonorExport(JSON.stringify(new Game('china','nato').toSave())),/战局存档/);
  assert.throws(()=>parseHonorExport('{bad'),/JSON/);assert.throws(()=>parseHonorExport('x'.repeat(8*1024*1024+1)),/过大/);
});

test('荣誉结算不修改战力或游戏状态，授勋文案与对应徽章、奖励匹配',()=>{
  const game=new Game('china','nato'),before=JSON.stringify(game.toSave().state),original=emptyHonors(),raw=JSON.stringify(original);
  const settled=win(original,0),html=honorResultHTML(settled,'quick');
  assert.equal(JSON.stringify(original),raw);assert.equal(JSON.stringify(game.toSave().state),before);
  assert.match(html,/前线新锐徽章/);assert.match(html,/\+240/);assert.match(html,/初战告捷/);assert.match(victoryPraise(settled,'quick'),/恭喜晋升/);
  const seen=applyHonorResult(settled.profile,result(0));assert.match(honorResultHTML(seen,'quick'),/不会重复领取/);
  for(const rank of HONOR_RANKS)assert.match(honorBadge(rank),new RegExp(`${rank.name}徽章`));
});

test('八枚真实位图徽章采用四列两行透明图集，可离线打包',()=>{
  const png=readFileSync(new URL('../assets/player-ranks-v1.png',import.meta.url));
  assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16)/png.readUInt32BE(20),2);assert.equal(png[25],6);
  const css=readFileSync(new URL('../src/honors.css',import.meta.url),'utf8');assert.ok(css.includes("url('../assets/player-ranks-v1.png')"));assert.ok(css.includes('prefers-reduced-motion'));
});
