import { UNITS } from './data.js';

export const CRUISE = Object.freeze({ capacity: 2, cost: 350, range: 900, minRange: 220, cooldown: 16, damage: 160, rise: .85 });
export function cruiseAvailability(game, unit) {
  if (!unit || unit.type !== 'submarine' || unit.hp <= 0 || unit.embarkedIn || game.map.future) return '当前单位不可使用';
  if (!game.hasBuilding(unit.owner, 'dock') || !game.hasBuilding(unit.owner, 'radar') || !game.hasBuilding(unit.owner, 'lab')) return '需要船坞、雷达站与实验室';
  if (!game.hasPower(unit.owner)) return '电力不足';
  return '';
}
export const submarineCruise = {
  updateCruiseAI(side) {
    if(this.map.future || this.players[side].credits < 1200)return;
    for(const u of this.activeUnits(side,'submarine')) {
      if(cruiseAvailability(this,u) || (u.cruiseReadyAt || 0)>this.time)continue;
      const target=[...this.enemyBuildings(side),...this.enemyUnits(side)].find(t=>{
        const tags=UNITS[t.type]?.tags || [],d=Math.hypot(t.x-u.x,t.y-u.y);
        return !tags.includes('ship')&&!tags.includes('air')&&t.hp>0&&!t.embarkedIn&&d>=CRUISE.minRange&&d<=CRUISE.range&&this.canSeeEntity(side,t);
      });
      if(!target)continue;
      if(!(u.cruiseAmmo>0)&&!this.buyCruise(u))continue;
      this.launchCruiseAt(u.id,target.x,target.y,side);
    }
  },
  buyCruise(unit) {
    if (!unit || !this.running || this.paused || cruiseAvailability(this, unit) || this.isControlLocked(unit.owner)) return false;
    if ((unit.cruiseAmmo || 0) >= CRUISE.capacity || this.players[unit.owner].credits < CRUISE.cost) return false;
    this.players[unit.owner].credits -= CRUISE.cost; unit.cruiseAmmo = (unit.cruiseAmmo || 0) + 1; return true;
  },
  launchCruiseAt(id, x, y, side = 0) {
    const unit = this.getEntity(id);
    if (!this.running || this.paused || !unit || unit.owner !== side || this.isControlLocked(side) || cruiseAvailability(this, unit) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    if (this.time < (unit.stunUntil || 0) || unit.order?.type === 'rearm' || !(unit.cruiseAmmo > 0) || (unit.cruiseReadyAt || 0) > this.time) return false;
    const targets = [...this.enemyUnits(side), ...this.enemyBuildings(side)].filter(target => {
      const tags = UNITS[target.type]?.tags || [], distance = Math.hypot(target.x - unit.x, target.y - unit.y);
      return target.hp > 0 && !target.embarkedIn && !tags.includes('ship') && !tags.includes('air') && this.canSeeEntity(side, target) &&
        Math.hypot(target.x - x, target.y - y) <= Math.max(45, target.size || 0) && distance >= CRUISE.minRange && distance <= CRUISE.range;
    }).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y));
    const target = targets[0]; if (!target) return false;
    unit.cruiseAmmo--; unit.cruiseReadyAt = this.time + CRUISE.cooldown; unit.exposedUntil = this.time + 8; unit.lastFireAt = this.time;
    this.launchProjectile(unit, target, CRUISE.damage, 'cruise');
    const p = this.projectiles.at(-1); p.flightRole = 'sub-launched'; p.sourceHeight = 2; p.targetHeight = 12; p.speed = 240;
    this.effects.push({type:'subLaunch',x:unit.x,y:unit.y,owner:side,age:0,duration:1.4,surface:'water'});
    return true;
  }
};
