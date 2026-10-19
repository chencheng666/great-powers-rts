import { UNITS } from './data.js';

const gap = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);

export const strategicCombat = {
  satelliteShields(side) {
    return this.enemyUnits(side,'counterIntel').filter(u => !u.embarkedIn && this.time >= u.stunUntil && this.time-(u.lastMovedAt??-10) >= 1 && this.hasPower(u.owner) && this.hasBuilding(u.owner,'radar'));
  },

  updateSwarmCarrier(u,dt) {
    if(u.type!=='swarmCarrier')return false;
    const d=UNITS[u.type];
    if(u.order?.type==='attackMove' && u.fireTimer<=0 && u.ammo>0 && !(u.jammedUntil>this.time)) {
      const target=this.enemyUnits(u.owner).concat(this.enemyBuildings(u.owner)).filter(e=>!e.embarkedIn&&this.canSeeEntity(u.owner,e)&&gap(u,e)<=d.range).sort((a,b)=>gap(u,a)-gap(u,b))[0];
      const children=this.units.filter(c=>c.hp>0&&c.swarmParentId===u.id).length;
      if(target && children<=3 && this.unitCapacityUsed(u.owner)+3<=120) {
        for(const [i,type] of ['swarmScout','swarmDecoy','drone'].entries()) {
          const child=this.addUnit(u.owner,type,Math.max(20,Math.min(this.world.width-20,u.x-36+i*36)),Math.max(20,Math.min(this.world.height-20,u.y+55)),true);
          child.temporaryUntil=this.time+24;child.swarmParentId=u.id;
          child.order={type:'attackMove',x:target.x,y:target.y};
        }
        u.ammo--;u.fireTimer=d.cooldown;u.lastFireAt=this.time;
        if(u.owner===0)this.events.notice?.('异构任务舱释放：侦察、诱饵、攻击子机各一架，24 秒任务窗口');
      }
    }
    if(u.order&&['move','attackMove','patrol'].includes(u.order.type)) {
      if(this.patrolStep(u,dt))return true;
      if(gap(u,u.order)>10)this.moveUnit(u,u.order,dt,8);
      else u.order=null;
    }
    return true;
  }
};
