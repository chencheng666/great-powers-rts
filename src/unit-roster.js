import { UNITS } from './data.js';
import { unitHealthFor } from './unit-specs.js';

// 原版现代战区退役的概念机体与对地固定翼；科幻战区、独立科幻版沿用原规则。
export const RETIRED_MODERN_UNITS = Object.freeze({ elite:'tank', laser:'aa', railgun:'rocket', aegis:'fighter', relay:'supply', strike:'fighter', bomber:'fighter', navalStrike:'navalFighter' });
export const unitAllowedInRoster = (type, map) => !!UNITS[type] && (!!map?.future || !Object.hasOwn(RETIRED_MODERN_UNITS,type));
export const rosterSpawnType = (type, map) => unitAllowedInRoster(type,map) ? type : RETIRED_MODERN_UNITS[type] || type;

export function migrateRetiredRoster(game) {
  if(game.map.future)return 0;
  let changed=0;
  for(const unit of game.units){
    const type=rosterSpawnType(unit.type,game.map);if(type===unit.type)continue;
    const health=unitHealthFor(game.players[unit.owner].faction,type),ratio=Math.max(0,Math.min(1,unit.hp/unit.maxHp)),d=UNITS[type];
    unit.type=type;unit.maxHp=health;unit.hp=ratio*health;unit.ammo=d.ammo?Math.min(unit.ammo??d.ammo,d.ammo):null;
    unit.stock=d.stock??null;unit.wing=d.wing??null;unit.heat=0;unit.deployProgress=0;unit.targetId=null;
    changed++;
  }
  for(const b of game.buildings){
    b.queue=b.queue.filter(type=>unitAllowedInRoster(type,game.map));
    if(b.active&&!unitAllowedInRoster(b.active.type,game.map)){game.players[b.owner].credits+=b.active.paid||0;b.active=null;changed++;}
  }
  return changed;
}
