import { UNITS, supportsMap } from './data.js';
import { unitAllowedInRoster } from './unit-roster.js';
import { reinforcementProducer } from './frontline-rules.js';
import { snowLandConnected } from './snow-to-sea.js';
import { knownThreats, retreatAIUnits } from './tactical-ai.js';
import { fuelEnabled, fuelProfile, fuelUnitAvailable } from './fuel-rules.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const busy=u=>!!u.reinforcement||u.fuelReturn||u.fuelServiceId||u.deliveryUntil>0&&u.deliveryUntil>u._aiTime||['rearm','restock','board','capture','defuse','collect'].includes(u.order?.type)||u.nuclearEvadeUntil>u._aiTime;

export const frontlineAI = {
  frontlineCount(side,type) {
    return this.ownedUnits(side).filter(u=>u.type===type||u.reinforcement?.type===type&&u.type!==type).length+
      this.ownedBuildings(side).reduce((n,b)=>n+b.queue.filter(t=>t===type).length+Number(b.active?.type===type),0);
  },
  frontlineAIOrder(u,type,goal) {
    if(!goal)return;
    // 相同目标保留已有路径，不能每次思考都清空跨桥和跨海导航。
    if(u.order?.type===type&&distance(u.order,goal)<100)return;
    u.order={type,x:goal.x,y:goal.y};u.path=[];u.pathTimer=0;
  },
  frontlineObjective(side) {
    const home=this.ownedBuildings(side,'hq')[0]||this.map.spawns[side];
    const known=this.enemyUnits(side).filter(u=>this.canSeeEntity(side,u)&&distance(u,home)<850&&!UNITS[u.type].tags.includes('logistics'));
    const threats=known.filter(u=>UNITS[u.type].damage>0);
    if(threats.length){const target=threats.sort((a,b)=>distance(a,home)-distance(b,home))[0];return {phase:'defend',...target};}
    if(this.economyMode==='convoy'){
      const receivers=this.ownedBuildings(side).filter(b=>['refinery','dock'].includes(b.type));
      const convoys=this.economicFreight(side).filter(u=>u.freight.value>0&&u.freight.phase!=='outbound');
      const threat=this.enemyUnits(side).filter(u=>UNITS[u.type].damage>0&&this.canSeeEntity(side,u)&&[...receivers,...convoys].some(v=>distance(u,v)<650)).sort((a,b)=>distance(a,home)-distance(b,home))[0];
      if(threat)return {phase:'defend',...threat};
    }
    const sites=this.beacons.filter(s=>s.owner!==side&&this.hasExploredFor(side,s.x,s.y)&&snowLandConnected(this.map,home,s));
    if(sites.length)return {phase:'advance',...sites.sort((a,b)=>distance(home,a)-distance(home,b))[0]};
    const enemy=this.enemyBuildings(side).filter(b=>this.canSeeEntity(side,b)&&snowLandConnected(this.map,home,b));
    if(enemy.length)return {phase:'advance',...enemy.sort((a,b)=>distance(a,home)-distance(b,home))[0]};
    const bridge=this.map.bridges[(side+Math.floor(this.time/90))%this.map.bridges.length];
    return {phase:'scout',x:(bridge.x1+bridge.x2)/2,y:(bridge.y1+bridge.y2)/2};
  },
  updateFrontlineAI(side) {
    const p=this.players[side],home=this.ownedBuildings(side,'hq')[0];if(!home||this.isControlLocked(side))return;
    retreatAIUnits(this,side);
    const objective=this.frontlineObjective(side);p.frontlinePhase=objective.phase;p.frontlineObjective={x:objective.x,y:objective.y};
    const threats=knownThreats(this,side),count=t=>this.frontlineCount(side,t);
    for(const b of this.ownedBuildings(side))if(b.hp<b.maxHp*.65&&p.credits>250&&!b.repairing)this.toggleRepair(side,b.id);
    if(!p.buildQueue){
      const missing=['refinery','airfield','dock'].find(t=>!this.ownedBuildings(side,t).length);
      const plan=['turret','refinery','turret','airfield','dock'];
      const type=missing||plan[p.aiPlanIndex];
      if(type&&p.credits>(missing?900:this.economyMode==='convoy'?1600:900)&&this.canBuild(side,type)&&this.startBuild(side,type))if(!missing)p.aiPlanIndex++;
    }
    const pending=this.ownedBuildings(side).reduce((n,b)=>n+b.queue.length+Number(!!b.active),0);
    // 运输收入存在交付间隔，预留600资金给维修、弹药和补给线应急；旧采矿局沿用450。
    const committed=this.ownedBuildings(side).reduce((n,b)=>n+b.queue.reduce((v,t)=>v+this.unitCost(side,t),0)+(b.active?Math.max(0,this.unitCost(side,b.active.type)-b.active.paid):0),0);
    const budget=p.credits-(fuelEnabled(this)?850:this.economyMode==='convoy'?600:450)-committed-(p.buildQueue?Math.max(0,600-p.buildQueue.paid):0);
    const choose=(choices)=>choices.find(type=>{
      const d=UNITS[type];return d&&fuelUnitAvailable(this,type)&&unitAllowedInRoster(type,this.map)&&supportsMap(d.map,this.mapId)&&(!d.faction||d.faction===p.faction)&&(!d.requires||this.hasBuilding(side,d.requires))&&this.ownedBuildings(side,reinforcementProducer(this,type)).length&&budget>=this.unitCost(side,type);
    });
    const sites=[...this.oil,...this.beacons,...this.resourceSites.filter(s=>s.type==='depot')].filter(s=>s.owner!==side&&this.hasExploredFor(side,s.x,s.y)&&snowLandConnected(this.map,home,s));
    const ground=this.activeUnits(side).filter(u=>UNITS[u.type].damage>0&&!UNITS[u.type].tags.some(t=>['ship','air'].includes(t)));
    const needs=[...(this.economyMode==='mining'&&count('harvester')<2?['harvester']:[]),...(count('scout')<1?['scout']:[]),...(sites.length&&count('engineer')<2?['engineer']:[]),...(threats.air>0&&count('aa')<Math.max(1,Math.ceil(threats.air/2))?['aa']:[]),...(ground.length>=3&&count('supply')<2?['supply']:[])];
    const strategic=this.time>55&&ground.length>=3?(count('fighter')<1?'fighter':count('frigate')<1?'frigate':fuelEnabled(this)&&this.time>100&&count('tanker')<1?'tanker':fuelEnabled(this)&&this.time>125&&count('supplyShip')<1?'supplyShip':count('airlift')<1?'airlift':count('landing')<1?'landing':this.time>240&&count('destroyer')<1?'destroyer':this.time>420&&count('carrier')<1?'carrier':null):null;
    const strategicOrdered=strategic&&pending<3&&choose([strategic])&&this.queueAIUnit(strategic,side);
    p.aiSavingsTarget=strategic||null;
    if(!strategicOrdered&&pending<4&&budget>150){
      const cycle=['tank','rifle','aa','tank','rocket','supply','rifle','loiterer'];
      const type=choose([...needs,...(!strategic&&ground.length<this.difficulty.combatLimit?[cycle[p.aiUnitCount%cycle.length]]:[])]);
      if(type&&this.queueAIUnit(type,side))p.aiUnitCount++;
    }
    if(!strategic&&!strategicOrdered&&pending<3&&budget>850&&this.time>45){
      const carrier=this.ownedUnits(side,'carrier')[0];
      const air=choose([...(carrier&&count('navalFighter')<4?['navalFighter']:[]),...(count('fighter')<2?['fighter']:[]),...(count('airlift')<1?['airlift']:[]),...(count('helicopter')<2?['helicopter']:[])]);
      if(air)this.queueAIUnit(air,side);
    }
    if(!strategic&&!strategicOrdered&&pending<3&&budget>1100&&this.time>65){
      const fleet=choose([...(count('frigate')<1?['frigate']:[]),...(count('landing')<1?['landing']:[]),...(count('destroyer')<1?['destroyer']:[]),...(count('carrier')<1?['carrier']:[]),...(count('submarine')<1?['submarine']:[])]);
      if(fleet)this.queueAIUnit(fleet,side);
    }
    for(const u of this.activeUnits(side))u._aiTime=this.time;
    for(const engineer of this.activeUnits(side,'engineer').filter(u=>!busy(u))){
      const claimed=new Set(this.activeUnits(side,'engineer').filter(u=>u!==engineer&&u.order?.type==='capture').map(u=>u.order.targetId));
      const priority=s=>this.economyMode==='convoy'?(this.oil.includes(s) ? .65 : s.type==='depot'&&s.amount>0 ? .8 : 1):1;
      const site=sites.filter(s=>!claimed.has(s.id)&&snowLandConnected(this.map,engineer,s)).sort((a,b)=>distance(a,engineer)*priority(a)-distance(b,engineer)*priority(b))[0];
      if(site){engineer.order={type:'capture',targetId:site.id,x:site.x,y:site.y};engineer.path=[];}
    }
    for(const scout of this.activeUnits(side,'scout').filter(u=>!busy(u)))this.frontlineAIOrder(scout,'move',objective.phase==='defend'?home:objective);
    this.coordinateFrontlineForces(side,objective,false);
    this.updateAITransports(side);
    this.updateCruiseAI(side);
    this.updateIntelligenceAI(side);
    if(p.abilityCharge>=100&&p.credits>=1100&&p.abilityCooldown<=0){
      const visible=[...this.enemyUnits(side),...this.enemyBuildings(side)].filter(e=>this.canSeeEntity(side,e));
      if(p.faction==='china'){
        if(objective.phase==='defend'||ground.filter(u=>u.hp<u.maxHp*.7).length>=2)this.castAIAbility(0,0,side);
      }else{
        const clustered=visible.map(e=>({e,score:visible.filter(v=>distance(e,v)<200).length})).sort((a,b)=>b.score-a.score)[0];
        if(clustered?.score>=3)this.castAIAbility(clustered.e.x,clustered.e.y,side);
      }
    }
  },
  coordinateFrontlineForces(side,objective=this.frontlineObjective(side),wave=false) {
    const home=this.ownedBuildings(side,'hq')[0];if(!home)return;
    const units=this.activeUnits(side);for(const u of units)u._aiTime=this.time;
    const ready=units.filter(u=>!busy(u)&&(!fuelProfile(this,u)||u.fuel>30)&&u.hp>=u.maxHp*.45&&(!UNITS[u.type].ammo||u.ammo>UNITS[u.type].ammo*.25));
    const armor=ready.filter(u=>['tank','rifle','rocket','loiterer'].includes(u.type));
    const advance=objective.phase==='defend'||wave&&armor.length>=3||armor.some(u=>u.order?.type==='attackMove');
    const center=armor.length?armor.reduce((p,u)=>({x:p.x+u.x/armor.length,y:p.y+u.y/armor.length}),{x:0,y:0}):home;
    if(advance)for(const u of armor.slice(0,this.difficulty.waveSize)){
      const angle=u.id*2.399,offset=u.type==='rocket'||u.type==='loiterer'?-160:0,heading=Math.atan2(objective.y-center.y,objective.x-center.x);
      this.frontlineAIOrder(u,'attackMove',{x:objective.x+Math.cos(angle)*65+Math.cos(heading)*offset,y:objective.y+Math.sin(angle)*65+Math.sin(heading)*offset});
    }
    const supportPoint={x:center.x+(home.x-center.x)*.16,y:center.y+(home.y-center.y)*.16};
    for(const u of ready.filter(u=>['aa','jammer','abm','counterIntel','supply'].includes(u.type)))if(distance(u,supportPoint)>180)this.frontlineAIOrder(u,'move',supportPoint);
    // 运输机/登陆舰的航路是护航目标，护航不覆盖装载、整备和返航状态。
    const freight=this.economyMode==='convoy'?this.economicFreight(side).filter(u=>u.freight.value>0&&u.freight.phase!=='outbound'):[];
    const convoy=units.find(u=>['airlift','landing'].includes(u.type)&&u.passengers.length&&u.transportStage==='depart')||freight.find(u=>u.type==='freightPlane');
    const escortGoal=convoy||center;
    for(const u of ready.filter(u=>['fighter','navalFighter','helicopter','ewPlane'].includes(u.type))){
      if(u.homeCarrierId&&!u.embarkedIn){const carrier=this.getEntity(u.homeCarrierId);if(carrier&&distance(carrier,escortGoal)>1600)continue;}
      const heading=Math.atan2(objective.y-escortGoal.y,objective.x-escortGoal.x);
      const goal={x:escortGoal.x+Math.cos(heading)*180,y:escortGoal.y+Math.sin(heading)*180};
      this.frontlineAIOrder(u,u.type==='ewPlane'?'move':'attackMove',goal);
    }
    const landing=units.find(u=>u.type==='landing'&&u.passengers.length&&u.transportStage==='depart')||freight.find(u=>u.type==='containerShip');
    const harbor=this.map.harbors[this.nearestEnemySide(side)]?.approach;
    for(const u of ready.filter(u=>['patrol','frigate','destroyer','submarine','carrier'].includes(u.type))){
      if(fuelEnabled(this)&&u.type==='carrier'&&this.carrierAircraft(u).some(p=>p.fuelReturn||p.fuelServiceId)){u.order=null;u.path=[];continue;}
      const goal=landing?this.navalGoal(landing.x+Math.cos(u.id)*260,landing.y+Math.sin(u.id)*260,100):this.time>110?harbor:this.map.harbors[side].approach;
      if(goal)this.frontlineAIOrder(u,'attackMove',goal);
    }
  }
};
