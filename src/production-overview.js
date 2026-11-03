import { UNITS } from './data.js';
import { productionDuration } from './battlefield-details.js';

// 包括运输工具内仍然存活的人员；自动物流不是玩家编队。
export function unitInventory(units) {
  const result={infantry:0,vehicles:0,air:0,naval:0,types:{}};
  for(const u of units){
    const d=UNITS[u.type];if(!d||u.hp<=0||d.tags.includes('logistics'))continue;
    result.types[u.type]=(result.types[u.type]||0)+1;
    const domain=d.tags.includes('air')?'air':d.tags.includes('ship')?'naval':d.tags.includes('infantry')?'infantry':'vehicles';
    result[domain]++;
  }
  return result;
}
export function productionOverview(game,side=0) {
  const inventory=unitInventory(game.ownedUnits(side)),types={},facilities=[];
  for(const b of game.ownedBuildings(side)){
    if(!b.active&&!b.queue?.length)continue;
    const current=b.active,remaining=current?Math.max(0,Math.ceil(productionDuration(game,b,current.type)-current.progress)):null;
    const stopped=game.paused?'已暂停':game.map.future&&b.type==='barracks'&&!game.hasPower(side)?'缺电暂停':game.players[side].credits<=0?'缺钱暂停':'';
    facilities.push({id:b.id,producer:b.type,type:current?.type,remaining,queued:b.queue?.length||0,stopped});
    if(current){const entry=types[current.type]??={active:0,queued:0,remaining:null,stopped:''};entry.active++;entry.remaining=entry.remaining===null?remaining:Math.min(entry.remaining,remaining);entry.stopped=stopped;}
    for(const type of b.queue||[]){const entry=types[type]??={active:0,queued:0,remaining:null,stopped:''};entry.queued++;}
  }
  return {inventory,types,facilities};
}
