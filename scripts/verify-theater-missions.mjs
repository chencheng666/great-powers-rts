import { Game } from '../src/game.js';
import { UNITS } from '../src/data.js';
import { THEATER_CHALLENGES } from '../src/theater-data.js';
import { CHALLENGES } from '../src/challenges.js';
import { WATCH_NODES } from '../src/island-watch.js';
import { theaterFacilities } from '../src/theater-operations.js';
import { writeFileSync } from 'node:fs';

// 只使用玩家可执行的移动、攻击移动、接管及卸载，不改血量、资源、迷雾和胜负。
const ids=process.argv.slice(2).length?process.argv.slice(2):[...Object.keys(THEATER_CHALLENGES),'islandwatch'];
const results=[];
for(const id of ids){
  const g=new Game('china','asia',{}, {challengeId:id}),d=CHALLENGES[id];
  const commands=new Map();let current=0,lastLog=-1;
  const move=(units,point,attack=false,key='move')=>{
    const usable=units.filter(u=>u.hp>0&&!u.embarkedIn&&!['rearm','restock'].includes(u.order?.type));
    const command=`${key}:${Math.round(point.x)}:${Math.round(point.y)}`;
    if(!usable.length||usable.every(u=>commands.get(u.id)===command&&(u.order||Math.hypot(u.x-point.x,u.y-point.y)<(usable.length>1?230:16))))return;
    g.selected=usable.map(u=>u.id);g.command(point.x,point.y,attack);for(const u of usable)commands.set(u.id,command);
  };
  const army=()=>g.activeUnits(0).filter(u=>UNITS[u.type].damage>0&&!UNITS[u.type].tags.includes('ship'));
  const fleet=()=>g.activeUnits(0).filter(u=>UNITS[u.type].damage>0&&UNITS[u.type].tags.includes('ship'));
  function orders(){
    const nodes=theaterFacilities(g),engineers=g.activeUnits(0,'engineer');
    if(id==='islandwatch'){
      const ship=g.activeUnits(0,'landing')[0],point={x:1990,y:1580};
      if(ship?.passengers.length&&!ship.unloadQueue){if(Math.hypot(ship.x-point.x,ship.y-point.y)<100&&!ship.order&&g.time-(ship.lastMovedAt??-10)>.5)g.unloadTransport(ship);else move([ship],point,false,'landing');}
      move(fleet(),{x:1750,y:1800},true,'escort');
      move(army(),{x:2430,y:1650},true,'guard');move(g.activeUnits(0,'supply'),{x:2450,y:1750},false,'supply');
      const site=WATCH_NODES.map(n=>g.getEntity(n.id)).find(n=>n.owner!==0);
      if(site)for(const u of engineers)if(u.order?.targetId!==site.id)move([u],site,false,'capture');
      return;
    }
    if(d.operation==='defense'){
      const enemies=g.ownedUnits(1).filter(u=>g.canSeeEntity(0,u));
      const goal=enemies[0]||{x:1120,y:1330};move(army(),goal,true,'defense');move(g.activeUnits(0,'supply'),{x:950,y:1400});return;
    }
    if(d.operation==='evacuation'){
      move(army(),{x:2220,y:1830},true,'shore');move(g.activeUnits(0,'supply'),{x:2090,y:1900});
      move(fleet(),{x:2950,y:2180},true,'escort');
      for(const ship of g.activeUnits(0,'landing'))move([ship],ship.passengers.length?{x:3280,y:2640}:{x:2610,y:1900},false,ship.passengers.length?'exit':'collect');
      return;
    }
    if(id==='deepblue'){
      const enemies=g.ownedUnits(1).filter(u=>g.canSeeEntity(0,u));
      move(fleet(),enemies[0]||{x:2000,y:1780},true,'escort');return;
    }
    if(d.operation==='seabreach'){
      const ship=g.activeUnits(0,'landing')[0];
      if(ship?.passengers.length&&!ship.unloadQueue){if(Math.hypot(ship.x-2550,ship.y-1900)<130&&!ship.order&&g.time-(ship.lastMovedAt??-10)>.5)g.unloadTransport(ship);else move([ship],{x:2550,y:1900},false,'landing');}
      move(fleet(),{x:2320,y:2150},true,'escort');
    }
    while(current<nodes.length&&nodes[current].entity.owner===0&&nodes[current].entity.hp>=nodes[current].entity.maxHp*.95)current++;
    const incomplete=nodes.find(n=>n.entity.owner!==0||n.entity.hp<n.entity.maxHp*.7);
    const node=nodes[current]||incomplete;
    const goal=node?.entity||d.objective;
    move(army(),{x:goal.x+140,y:goal.y+85},true,'advance');
    move(g.activeUnits(0,'supply'),{x:goal.x-80,y:goal.y+90},false,'supply');
    if(node)for(const u of engineers){
      const e=node.entity,known=g.hasExploredFor(0,e.x,e.y);
      if(u.order?.type==='capture'&&u.order.targetId===e.id)continue;
      if(!army().some(guard=>Math.hypot(guard.x-e.x,guard.y-e.y)<330))continue;
      move([u],known?e:{x:e.x-100,y:e.y+90},false,known?'capture':'approach');
    }
    if(d.operation==='convoy'&&!node)move(g.ownedUnits(0,'apc'),d.objective,false,'exit');
    if(d.operation==='sentinel'&&!node){
      const enemies=g.ownedUnits(1).filter(u=>g.canSeeEntity(0,u));if(enemies.length)move(army(),enemies[0],true,'clear');
    }
  }
  for(let tick=0;g.running&&tick<Math.min(d.limit,Number(process.env.MAX_SECONDS)||d.limit)*20+5;tick++){
    if(tick%40===0)orders();g.update(.05);
    if(Math.floor(g.time/60)!==lastLog){lastLog=Math.floor(g.time/60);console.log(id,Math.floor(g.time),{node:current,health:Math.round((g.getEntity(g.challenge.targetId)?.hp||0)),remaining:g.ownedUnits(0).length,enemies:g.ownedUnits(1).length,value:Math.round(g.challenge.operation?.value||0),hold:Math.round(g.challenge.operation?.hold||0),mined:Math.round(g.challenge.operation?.mined||0),freight:g.logistics[0].seaControl?.receipts});}
    if(tick%400===0&&g.running){const save=g.toSave();Game.fromSave(save);if(process.env.DIAGNOSE_THEATER)writeFileSync(`/tmp/theater-${id}.json`,JSON.stringify(save));}
  }
  console.log('结果',id,{winner:g.winner,time:Math.round(g.time),reason:g.challenge.reason,stars:g.challenge.stars});
  results.push({id,winner:g.winner,time:Math.round(g.time),reason:g.challenge.reason,stars:g.challenge.stars});
  if(g.winner!==0){console.log('未完成节点',theaterFacilities(g).map(n=>[n.definition.name,n.entity.owner,Math.round(n.entity.hp/n.entity.maxHp*100)]));console.log('部队位置',JSON.stringify(g.units.map(u=>({type:u.type,owner:u.owner,x:u.x,y:u.y,hp:u.hp,order:u.order,passengers:u.passengers,embarkedIn:u.embarkedIn,unloadQueue:u.unloadQueue,unloadBlocked:u.unloadBlocked,lastMovedAt:u.lastMovedAt,freight:u.freight,path:u.path,motionGoal:u.motionGoal,progress:u.navalProgress,stalled:u.navalStalled,occupiable:g.canOccupyUnit(u,u)}))));process.exitCode=1;}
}
if(process.env.REPORT_PATH)writeFileSync(process.env.REPORT_PATH,JSON.stringify({description:'正常模拟指令通关，每20秒校验存档恢复；不是人工完整试玩录像。',results},null,2));
