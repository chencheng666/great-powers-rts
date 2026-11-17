import { GAME_VERSION } from '../src/version.js';
import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { performance } from 'node:perf_hooks';
import { mkdirSync, writeFileSync } from 'node:fs';
const game=new Game('china','russia',{}, {mapId:'snowtosea',victoryMode:'annihilation'});
const folder=process.argv[2]||`qa/${GAME_VERSION}-long-session`;
const duration=Number(process.argv[3]||1800);if(!Number.isFinite(duration)||duration<60||duration>7200)throw Error('模拟时长必须为60至7200秒');
mkdirSync(folder,{recursive:true});
const fuelReturns=new Set(),fuelRecipients=new Set(),emergencies=new Set();
const receipts=Array.from({length:6},()=>({air:new Set(),sea:new Set()}));
const samples=[],checkpoints=[],produced=Array.from({length:6},()=>new Set()),initial=new Set(game.units.map(u=>u.id));
let seed=391116;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const quantile=(values,p)=>{const v=[...values].sort((a,b)=>a-b);return +(v[Math.min(v.length-1,Math.floor(v.length*p))]||0).toFixed(3);};
const started=performance.now();let next=60;
while(game.time<duration&&game.running){
 const begin=performance.now();game.update(.05);samples.push(performance.now()-begin);
 for(const u of game.units){
  if(!initial.has(u.id)&&!UNITS[u.type].tags.includes('logistics'))produced[u.owner].add(u.type);
  if(u.fuelReturn)fuelReturns.add(u.id);if(u.fuelServiceId)fuelRecipients.add(u.id);if(u.fuelEmergencyAt!==undefined)emergencies.add(u.id);
  if(u.freight?.phase==='outbound'&&u.freight.value===0)receipts[u.owner][u.type==='containerShip'?'sea':'air'].add(u.id);
 }
 if(game.time>=next){
  let snapshot;try{snapshot=game.toSave();}catch(error){writeFileSync(`${folder}/long-session-invalid.json`,JSON.stringify({time:game.time,players:game.players,units:game.units,buildings:game.buildings},null,2));throw error;}const restored=Game.fromSave(snapshot);if(restored.units.length!==game.units.length)throw new Error('长局读档单位丢失');
  checkpoints.push({time:Math.round(game.time),units:game.units.length,buildings:game.buildings.length,effects:game.effects.length,projectiles:game.projectiles.length,heapMB:+(process.memoryUsage().heapUsed/1048576).toFixed(1),p95:quantile(samples.slice(-1200),.95),players:game.players.map(p=>({side:p.side,credits:Math.floor(p.credits),phase:p.frontlinePhase,units:game.ownedUnits(p.side).length,score:p.controlScore,eliminated:p.eliminated,delivered:game.logistics[p.side].delivered,lost:game.logistics[p.side].lost,airReceipts:receipts[p.side].air.size,seaReceipts:receipts[p.side].sea.size}))});
  console.log(JSON.stringify(checkpoints.at(-1)));next+=60;
 }
}
const result={scenario:'未修改资源、生命与胜利规则的五AI单机长局；模拟时间由命令参数指定，自然结束则停止',simulatedSeconds:game.time,wallSeconds:(performance.now()-started)/1000,winner:game.winner,steps:samples.length,medianMs:quantile(samples,.5),p95Ms:quantile(samples,.95),p99Ms:quantile(samples,.99),maxMs:Math.max(...samples),fuelVersion:game.fuelVersion,commandVersion:game.commandVersion,commandStats:game.commandStats,doctrines:game.players.map(p=>p.doctrine||null),fuelReturns:fuelReturns.size,fuelRecipients:fuelRecipients.size,emergencies:emergencies.size,economyMode:game.economyMode,ore:game.ore.length,produced:produced.map(s=>[...s]),receipts:receipts.map(r=>({air:r.air.size,sea:r.sea.size})),checkpoints};
mkdirSync(folder,{recursive:true});writeFileSync(`${folder}/long-session.json`,JSON.stringify(result,null,2));writeFileSync(`${folder}/long-session-save.json`,JSON.stringify(game.toSave()));console.log(JSON.stringify({complete:true,simulatedSeconds:game.time,wallSeconds:result.wallSeconds,p95:result.p95Ms,produced:result.produced}));
