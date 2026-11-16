import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
const game=new Game('china','russia',{}, {mapId:'snowtosea',victoryMode:'annihilation'});
const samples=[],checkpoints=[],produced=Array.from({length:6},()=>new Set()),initial=new Set(game.units.map(u=>u.id));
let seed=391116;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const quantile=(values,p)=>{const v=[...values].sort((a,b)=>a-b);return +(v[Math.min(v.length-1,Math.floor(v.length*p))]||0).toFixed(3);};
const started=performance.now();let next=60;
while(game.time<1800&&game.running){
 const begin=performance.now();game.update(.05);samples.push(performance.now()-begin);
 for(const u of game.units)if(!initial.has(u.id)&&!UNITS[u.type].tags.includes('logistics'))produced[u.owner].add(u.type);
 if(game.time>=next){
  const snapshot=game.toSave();const restored=Game.fromSave(snapshot);if(restored.units.length!==game.units.length)throw new Error('长局读档单位丢失');
  checkpoints.push({time:Math.round(game.time),units:game.units.length,buildings:game.buildings.length,effects:game.effects.length,projectiles:game.projectiles.length,heapMB:+(process.memoryUsage().heapUsed/1048576).toFixed(1),p95:quantile(samples.slice(-1200),.95),players:game.players.map(p=>({side:p.side,credits:Math.floor(p.credits),phase:p.frontlinePhase,units:game.ownedUnits(p.side).length,score:p.controlScore,eliminated:p.eliminated}))});
  console.log(JSON.stringify(checkpoints.at(-1)));next+=60;
 }
}
const result={scenario:'未修改资源、生命与胜利规则的五AI单机长局；模拟时间最多30分钟，自然结束则停止',simulatedSeconds:game.time,wallSeconds:(performance.now()-started)/1000,winner:game.winner,steps:samples.length,medianMs:quantile(samples,.5),p95Ms:quantile(samples,.95),p99Ms:quantile(samples,.99),maxMs:Math.max(...samples),produced:produced.map(s=>[...s]),checkpoints};
mkdirSync('qa/20261116-v39',{recursive:true});writeFileSync('qa/20261116-v39/long-session.json',JSON.stringify(result,null,2));writeFileSync('qa/20261116-v39/long-session-save.json',JSON.stringify(game.toSave()));console.log(JSON.stringify({complete:true,simulatedSeconds:game.time,wallSeconds:result.wallSeconds,p95:result.p95Ms,produced:result.produced}));
