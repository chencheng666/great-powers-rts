import { UNITS } from './data.js';
import { commandEnabled,doctrineFactor } from './command-doctrines.js';
import { fuelProfile } from './fuel-rules.js';
import { snowLandConnected } from './snow-to-sea.js';
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const isLandingShip = type => type==='landing'||type==='amphibious';
const leg=(from,to,reach=700)=>{const d=gap(from,to),t=Math.min(1,reach/Math.max(1,d));return {x:from.x+(to.x-from.x)*t,y:from.y+(to.y-from.y)*t};};
export function missionFuelNeed(game,u,goal){
  const profile=fuelProfile(game,u);if(!profile)return 0;
  const home=game.nearbyFuelAnchor?.(u)||game.fuelHome(u),queue=profile.domain==='air'?game.ownedUnits(u.owner).filter(v=>v.order?.type==='rearm'&&v.assignment?.homeId===u.assignment?.homeId).length:0;
  const direct=gap(u,goal)+(home?gap(goal,home):gap(goal,u)),factor=profile.domain==='land'?1.85:profile.domain==='sea'?1.35:1.18;
  return Math.max(35,direct*profile.distance*factor*doctrineFactor(game,u,'fuelUse')+18+Math.min(10,queue*2));
}
export function unitMissionReady(game,u,goal){return u.hp>=u.maxHp*.65&&!u.reinforcement&&!u.embarkedIn&&!u.fuelReturn&&!u.fuelServiceId&&!['rearm','restock','board','capture','collect','defuse'].includes(u.order?.type)&&(!fuelProfile(game,u)||u.fuel>=missionFuelNeed(game,u,goal))&&(!UNITS[u.type].ammo||u.type==='amphibious'||u.ammo>=Math.ceil(UNITS[u.type].ammo*.5));}
export const jointOperations={
  knownIslandObjective(side){
    const home=this.ownedBuildings(side,'hq')[0];if(!home||!commandEnabled(this))return null;
    return this.beacons.filter(b=>b.owner!==side&&this.hasExploredFor(side,b.x,b.y)&&!snowLandConnected(this.map,home,b)).sort((a,b)=>gap(home,a)-gap(home,b))[0]||null;
  },
  reserveLandingTeams(side){
    if(!commandEnabled(this))return;const objective=this.knownIslandObjective(side),engineers=this.ownedUnits(side,'engineer');
    for(const u of engineers)if(u.landTransportId){const t=this.getEntity(u.landTransportId);if(!objective||!t||t.hp<=0||t.owner!==side)delete u.landTransportId;}
    if(!objective)return;
    for(const t of this.activeUnits(side).filter(u=>(isLandingShip(u.type)||u.type==='airlift')&&!u.reinforcement)){
      if(engineers.some(u=>u.landTransportId===t.id)||t.passengers.some(id=>this.getEntity(id)?.type==='engineer'))continue;
      const u=engineers.filter(u=>!u.landTransportId&&!u.embarkedIn&&!u.reinforcement&&!u.deliveryUntil&&!u.order).sort((a,b)=>gap(a,t)-gap(b,t))[0];
      if(u)u.landTransportId=t.id;
    }
  },
  noteCommandStat(side,key,value=1){if(!commandEnabled(this))return;this.commandStats??=this.players.map(()=>({returns:0,emergencies:0,fuelLosses:0,transferred:0}));this.commandStats[side][key]+=value;},
  prepareJointTask(side,objective,armor,wave){
    if(!commandEnabled(this))return null;
    const p=this.players[side],home=this.ownedBuildings(side,'hq')[0];if(!home)return null;
    const center=armor.length?armor.reduce((a,u)=>({x:a.x+u.x/armor.length,y:a.y+u.y/armor.length}),{x:0,y:0}):home;
    const waypoint=leg(center,objective);
    for(const u of armor){if(fuelProfile(this,u)&&u.fuel<missionFuelNeed(this,u,waypoint))this.beginFuelReturn(u);else if(u.hp<u.maxHp*.65||UNITS[u.type].ammo&&u.ammo<Math.ceil(UNITS[u.type].ammo*.5))this.requestResupply(u);}
    const ready=armor.filter(u=>unitMissionReady(this,u,waypoint)),aa=this.activeUnits(side,'aa').filter(u=>unitMissionReady(this,u,waypoint));
    const old=p.jointTask,changed=!old||gap(old,objective)>400||old.phase==='defend'&&objective.phase!=='defend';
    if(changed)p.jointTask={phase:'assemble',since:this.time,x:objective.x,y:objective.y};
    const task=p.jointTask;
    if(objective.phase==='defend'){task.phase='defend';return {advance:true,ready,goal:objective};}
    if(task.phase==='defend')task.phase='assemble';
    const origin={x:home.x+(objective.x-home.x)*.22,y:home.y+(objective.y-home.y)*.22};
    const assembled=ready.filter(u=>gap(u,origin)<540).length;
    const visibleAir=this.enemyUnits(side).some(u=>UNITS[u.type].tags.includes('air')&&UNITS[u.type].damage>0&&this.canSeeEntity(side,u)&&gap(u,objective)<1200);
    if(task.phase==='advance'&&(ready.length<2||ready.length<armor.length*.4)){task.phase='recover';task.since=this.time;}
    if(task.phase==='recover'&&ready.length>=3){task.phase='assemble';task.since=this.time;}
    if(task.phase==='assemble'&&ready.length>=3&&(!visibleAir||aa.length)&&((assembled>=Math.min(ready.length,4)&&this.time-task.since>8)||wave&&this.time-task.since>35||this.time-task.since>80)){task.phase='advance';task.since=this.time;}
    if(task.phase!=='advance')for(const u of ready)this.frontlineAIOrder(u,'move',this.resolveMoveGoal(u,origin.x+(u.id%4-1.5)*65,origin.y+(Math.floor(u.id/4)%3-1)*65));
    return {advance:task.phase==='advance',ready,goal:waypoint};
  },
  commandJointMove(x,y,side=0){
    if(!commandEnabled(this)||this.paused||this.isControlLocked(side)||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>this.world.width||y>this.world.height)return false;
    const units=[...new Set(this.selected)].map(id=>this.getEntity(id)).filter(u=>u?.kind==='unit'&&u.owner===side&&u.hp>0&&!u.embarkedIn&&!u.reinforcement&&!UNITS[u.type].tags.includes('logistics'));
    if(!units.length)return false;
    const home=this.ownedBuildings(side,'hq')[0]||units[0],center=units.reduce((a,u)=>({x:a.x+u.x/units.length,y:a.y+u.y/units.length}),{x:0,y:0});
    for(const u of units){
      if(u.fuelReturn||u.order?.type==='rearm'||u.order?.type==='restock')continue;
      u.jointMission={x,y,side,stage:'assemble',since:this.time,group:units.map(v=>v.id),rally:{x:center.x+(home.x-center.x)*.08,y:center.y+(home.y-center.y)*.08}};
      if(!unitMissionReady(this,u,leg(u,{x,y}))){if(fuelProfile(this,u)&&u.fuel<missionFuelNeed(this,u,leg(u,{x,y})))this.beginFuelReturn(u);else this.requestResupply(u);continue;}
      const ship=UNITS[u.type].tags.includes('ship'),ground=!ship&&!UNITS[u.type].tags.includes('air');
      if(ground&&!snowLandConnected(this.map,u,{x,y})){delete u.jointMission;if(side===0)this.events.notice?.('跨海目标需要先登舰或登机，陆军留在本岸');continue;}
      u.jointMission={x,y,side,stage:'assemble',since:this.time,group:units.map(v=>v.id),rally:{x:center.x+(home.x-center.x)*.08,y:center.y+(home.y-center.y)*.08}};
      u.order=null;u.path=[];u.orderQueue=[];
    }
    this.orderMode=null;this.events.notice?.('编队先集结再推进，油弹不足单位先整补');return true;
  },
  updateJointMissions(){
    if(!commandEnabled(this)||this.time<(this.nextJointCheck||0))return;this.nextJointCheck=this.time+.75;
    for(const u of this.units){const m=u.jointMission;if(!m||u.hp<=0||u.embarkedIn||u.reinforcement)continue;
      if(u.fuelReturn||u.fuelServiceId||['rearm','restock','board','capture'].includes(u.order?.type))continue;
      const group=m.group.map(id=>this.getEntity(id)).filter(v=>v?.hp>0&&v.jointMission?.since===m.since&&v.jointMission?.x===m.x&&v.jointMission?.y===m.y&&!v.fuelReturn&&!v.embarkedIn);
      const sameLayer=v=>UNITS[v.type].tags.includes('ship')===UNITS[u.type].tags.includes('ship')&&UNITS[v.type].tags.includes('air')===UNITS[u.type].tags.includes('air');
      const layer=group.filter(sameLayer),ready=layer.filter(v=>gap(v,v.jointMission.rally)<280);
      if(m.stage==='assemble'&&(ready.length>=Math.ceil(layer.length*.75)||this.time-m.since>35))m.stage='advance';
      const goal=m.stage==='assemble'?m.rally:leg(u,m);
      if(gap(u,m)<90){delete u.jointMission;continue;}
      const rear=['aa','supply','jammer','abm','counterIntel','tanker','supplyShip'].includes(u.type)&&m.stage==='advance',heading=Math.atan2(m.y-u.y,m.x-u.x);
      this.frontlineAIOrder(u,m.stage==='advance'&&!rear?'attackMove':'move',this.resolveMoveGoal(u,goal.x+(u.id%3-1)*60-(rear?Math.cos(heading)*160:0),goal.y+(Math.floor(u.id/3)%3-1)*60-(rear?Math.sin(heading)*160:0)));
    }
  }
};
