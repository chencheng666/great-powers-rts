import { UNITS } from './data.js';
import { FRONTLINE_BUILDINGS, FRONTLINE_CAPACITY, frontlineBuilding, reinforcementProducer } from './frontline-rules.js';
import { productionDuration } from './battlefield-details.js';
import { airfieldParking } from './airfield-rules.js';
import { unitRadius } from './unit-spacing.js';
import { riverBanks } from './snow-to-sea.js';
import { runwayCargo, updateCargoAirfield } from './cargo-airfield.js';
import { battleMetric } from './battle-report.js';

const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const clamp = (n,max) => Math.max(45,Math.min(max-45,n));
export const reinforcementDomain = type => UNITS[type].tags.includes('logistics') ? null : UNITS[type].tags.includes('deck') ? 'carrier' : UNITS[type].tags.includes('ship') ? 'dock' : UNITS[type].tags.includes('air') ? 'airfield' : null;

export const frontlineOperations = {
  reinforcementHomes(side,domain) {
    return domain === 'carrier' ? this.ownedUnits(side,'carrier') : this.ownedBuildings(side,domain);
  },
  reinforcementOccupants(home,domain) {
    return this.ownedUnits(home.owner).filter(u => !u.temporaryUntil&&!u.swarmParentId&&reinforcementDomain(u.type) === domain &&
      (u.assignment?.homeId === home.id || domain === 'carrier' && u.homeCarrierId === home.id));
  },
  reinforcementCapacity(side,domain) {
    const homes = this.reinforcementHomes(side,domain),capacity = homes.length * FRONTLINE_CAPACITY[domain];
    const used = this.ownedUnits(side).filter(u=>!u.temporaryUntil&&!u.swarmParentId&&reinforcementDomain(u.type)===domain).length;
    const pending = this.ownedBuildings(side).reduce((sum,b)=>sum+[...b.queue,...(b.active?[b.active.type]:[])].filter(t=>reinforcementDomain(t)===domain).length,0);
    return { capacity, used, pending, free:Math.max(0,capacity-used-pending) };
  },
  reinforcementHome(side,type,preferred=null) {
    const domain=reinforcementDomain(type);if(!domain)return null;
    return this.reinforcementHomes(side,domain).filter(h=>this.reinforcementOccupants(h,domain).length<FRONTLINE_CAPACITY[domain])
      .sort((a,b)=>Number(b.id===preferred)-Number(a.id===preferred)||this.reinforcementOccupants(a,domain).length-this.reinforcementOccupants(b,domain).length||a.id-b.id)[0]||null;
  },
  assignReinforcementHome(u,home) {
    const domain=reinforcementDomain(u.type);if(!domain||!home)return false;
    const used=new Set(this.reinforcementOccupants(home,domain).filter(v=>v!==u).map(v=>v.assignment?.slot??v.carrierSlot));
    let slot=0;while(used.has(slot))slot++;if(slot>=FRONTLINE_CAPACITY[domain])return false;
    u.assignment={homeId:home.id,domain,slot};
    if(domain==='carrier'){u.homeCarrierId=home.id;u.carrierSlot=slot;}
    return true;
  },
  initFrontlineAssignments() {
    for(const u of this.units)if(u.hp>0&&!u.temporaryUntil&&!u.swarmParentId&&reinforcementDomain(u.type)&&!u.assignment&&!UNITS[u.type].tags.includes('logistics')) {
      this.assignReinforcementHome(u,this.reinforcementHome(u.owner,u.type));
    }
  },
  queueReinforcement(side,type) {
    const d=UNITS[type],p=this.players[side];
    if(!this.hasBuilding(side,'hq')||!d?.producer)return false;
    const domain=reinforcementDomain(type);
    if(domain&&this.reinforcementCapacity(side,domain).free<=0)return false;
    const producer=reinforcementProducer(this,type);
    const home=this.ownedBuildings(side,producer).filter(b=>b.queue.length+Number(!!b.active)<6).sort((a,b)=>a.queue.length+Number(!!a.active)-b.queue.length-Number(!!b.active)||a.id-b.id)[0];
    if(!home)return false;
    home.queue.push(type);
    if(side===0){this.events.notice?.(`${d.name}增援已申请${domain?'，编制位置已预留':''}`);this.events.voice?.('queued');}
    return true;
  },
  updateReinforcementQueue(b,dt) {
    if(!['refinery','airfield','dock'].includes(b.type))return;
    if(!this.hasBuilding(b.owner,'hq')||!this.hasPower(b.owner)||this.isControlLocked(b.owner))return;
    if(!b.active&&b.queue.length)b.active={type:b.queue.shift(),progress:0,paid:0};
    const q=b.active;if(!q)return;
    const duration=productionDuration(this,b,q.type),cost=this.unitCost(b.owner,q.type),p=this.players[b.owner];
    const need=Math.min(cost-q.paid,cost/duration*dt);
    if(p.credits+.001<need)return;
    p.credits=Math.max(0,p.credits-need);q.paid+=need;q.progress+=dt;
    if(q.progress<duration&&q.paid<cost-.01)return;
    if(this.time<(b.spawnRetryAt||0))return;
    if(runwayCargo(q.type)&&!this.hasBuilding(b.owner,'airfield')){b.spawnRetryAt=this.time+1;return;}
    const domain=reinforcementDomain(q.type),home=domain?this.reinforcementHome(b.owner,q.type,b.id):b;
    if(!home){b.spawnRetryAt=this.time+1;return;}
    const sea=domain==='dock',entry=sea?{x:3900+b.owner*180,y:this.world.height-120}:this.freightEntry(b.owner,false);
    if(!sea){entry.x=clamp(home.x+(b.owner%2?-200:200),this.world.width);entry.y=home.y<this.world.height/2?70:this.world.height-70;}
    const spawn=sea?this.findSpawn(entry.x,entry.y,q.type):entry;
    if(!spawn){b.spawnRetryAt=this.time+1;return;}
    const u=this.spawnUnit(b.owner,domain?q.type:'freightPlane',spawn.x,spawn.y);
    if(domain)this.assignReinforcementHome(u,home);
    u.reinforcement={type:q.type,homeId:home.id,phase:'inbound',startedAt:this.time,rally:b.rallyPoint?{...b.rallyPoint}:null};
    u.order=domain==='carrier'?{type:'board',targetId:home.id}:{type:'rearm',...(domain?{homeId:home.id}:{})};
    u.angle=u.turretAngle=Math.atan2(home.y-u.y,home.x-u.x);
    b.active=null;
    if(b.owner===0)this.events.notice?.(`${UNITS[q.type].name}已从后方出发`);
  },
  updateReinforcementArrivals(dt) {
    for(const u of this.units){
      if(u.hp<=0)continue;
      if(!u.temporaryUntil&&!u.swarmParentId&&!u.assignment&&reinforcementDomain(u.type)&&!u.reinforcement?.phase?.match(/withdraw|outbound/))this.assignReinforcementHome(u,this.reinforcementHome(u.owner,u.type));
      if(u.assignment){
        const old=this.getEntity(u.assignment.homeId);
        if(!old||old.hp<=0||old.owner!==u.owner){
          delete u.assignment;u.homeCarrierId=null;delete u.carrierSlot;delete u.airfieldOps;
          const home=this.reinforcementHome(u.owner,u.type);
          if(home){this.assignReinforcementHome(u,home);if(u.reinforcement)u.reinforcement.homeId=home.id;this.requestResupply(u,home);}
          else {u.reinforcement={type:u.type,homeId:old?.id||1,phase:'withdraw',startedAt:this.time,rally:null};u.order=null;}
        }
      }
      const r=u.reinforcement;if(!r)continue;
      if(r.phase==='withdraw'||r.phase==='outbound')continue;
      const home=this.getEntity(r.homeId),domain=reinforcementDomain(r.type);
      if(!home||home.hp<=0||home.owner!==u.owner){
        if(!domain){const replacement=this.ownedBuildings(u.owner,'refinery')[0];if(replacement){r.homeId=replacement.id;continue;}if(r.cargo&&r.cargo.stage!=='approach')continue;}
        r.phase='withdraw';r.startedAt=this.time;u.order=null;continue;
      }
      if(!domain)continue;
      const arrived=domain==='carrier'?u.embarkedIn===home.id:domain==='airfield'?u.airfieldOps?.phase==='parked':distance(u,this.shipBerth(u,home))<95;
      if(!arrived)continue;
      if(domain==='dock'){const heading=this.shipBerth(u,home).angle;if(Number.isFinite(heading))u.angle=u.turretAngle=heading;}
      delete u.reinforcement;u.resumeOrder=null;u.order=null;
      battleMetric(this,u.owner,'unitsProduced',1);
      if(r.rally&&!u.embarkedIn)u.order={type:'move',...this.resolveMoveGoal(u,r.rally.x,r.rally.y)};
      if(u.owner===0){this.events.notice?.(`${UNITS[u.type].name}已抵达${domain==='carrier'?'航母':domain==='dock'?'港口':'机场'}`);this.events.voice?.('unitReady');}
    }
  },
  updateReinforcementFlight(u,dt) {
    const r=u.reinforcement;if(!r)return false;
    if(r.phase==='withdraw'||r.phase==='outbound'){
      const entry=UNITS[u.type].tags.includes('ship')?{x:3900+u.owner*180,y:this.world.height-120}:this.freightEntry(u.owner,false);if(!UNITS[u.type].tags.includes('ship'))entry.x=u.x;
      if(distance(u,entry)<90&&this.time-r.startedAt>5){u.hp=0;return true;}
      this.moveUnit(u,entry,dt,40);return true;
    }
    if(reinforcementDomain(r.type))return false;
    if(runwayCargo(r.type))return updateCargoAirfield(this,u,dt);
    const home=this.getEntity(r.homeId);if(!home)return true;
    // 接收区必须是己方仓库周边的安全陆地，不能通过增援点绕过敌方防线。
    let target=r.delivery;
    if(!target){
      const forward=home.spawnAngle??home.angle;
      target=this.findSpawn(home.x+Math.cos(forward)*190,home.y+Math.sin(forward)*190,r.type);
      if(!target){this.cruiseAircraft(u,dt);return true;}
      r.delivery={...target};
    }
    if(distance(u,target)>18){this.moveUnit(u,target,dt,10);return true;}
    r.progress=(r.progress||0)+dt;
    if(r.progress<3)return true;
    const spawn=this.findSpawn(target.x,target.y,r.type);
    if(!spawn)return true;
    const payload=this.spawnUnit(u.owner,r.type,spawn.x,spawn.y);
    payload.deliveryUntil=this.time+3;payload.deliveryKind='parachute';
    if(r.rally)payload.order={type:'move',...this.resolveMoveGoal(payload,r.rally.x,r.rally.y)};
    r.phase='outbound';r.departedAt=this.time;u.order=null;
    battleMetric(this,u.owner,'unitsProduced',1);
    if(u.owner===0){this.events.notice?.(`${UNITS[r.type].name}已空投抵达`);this.events.voice?.('unitReady');}
    return true;
  },
  frontlineHarborAngle(home) {
    const harbor=this.map.harbors?.[home.owner],approach=harbor?.approach;
    return approach?Math.atan2(approach.y-home.y,approach.x-home.x):home.spawnAngle??home.angle;
  },
  frontlineBerth(u,home) {
    const slot=u.assignment?.homeId===home.id?u.assignment.slot:0,harbor=this.map.harbors?.[home.owner];
    if(this.map.snowToSea&&home.owner<4&&harbor){
      const lower=home.owner===1||home.owner===3,west=home.owner<2;
      const y=(lower?[2420,2150,2695,1880,3200,3480]:[1205,945,685,425,165,1670])[slot];
      const bank=riverBanks(y)[west?'west':'east'];
      return {...this.navalGoal(bank+(west?1:-1)*(unitRadius(u)+57),y,unitRadius(u)+10), angle: lower ? -Math.PI/2 : Math.PI/2};
    }
    const center=harbor?.approach||home,angle=this.frontlineHarborAngle(home);
    const across=(slot%3-1)*235,depth=170+Math.floor(slot/3)*235;
    return this.navalGoal(center.x+Math.cos(angle)*depth-Math.sin(angle)*across,center.y+Math.sin(angle)*depth+Math.cos(angle)*across,unitRadius(u)+10);
  },
  landingBoardingPoint(u,transport) {
    const cell=this.world.cell,radius=UNITS[u.type].tags.includes('infantry')?6:14;
    const cx=Math.floor(transport.x/cell),cy=Math.floor(transport.y/cell),key=`${cx}:${cy}:${radius}`;
    this.boardingTerrain??=new Map();
    if(!this.boardingTerrain.has(key)){
      if(this.boardingTerrain.size>=96)this.boardingTerrain.clear();
      const points=[];
      for(let y=Math.max(0,cy-5);y<=Math.min(this.world.height/cell-1,cy+5);y++)for(let x=Math.max(0,cx-5);x<=Math.min(this.world.width/cell-1,cx+5);x++){
        const p={x:(x+.5)*cell,y:(y+.5)*cell};if(!this.isGroundBlocked(p.x,p.y,radius))points.push(p);
      }
      this.boardingTerrain.set(key,points);
    }
    let best=null,score=Infinity;
    for(const p of this.boardingTerrain.get(key)){
      const reach=distance(p,transport);if(reach>145||!this.canOccupyUnit(u,p))continue;
      const value=reach+distance(p,u)*.15;if(value<score){best=p;score=value;}
    }
    return best;
  },
  transportLandingPoint(u,center) {
    if(!center)return null;
    for(let ring=0;ring<8;ring++)for(let i=0;i<12;i++){
      const angle=i*Math.PI/6,radius=ring*90,p={x:center.x+Math.cos(angle)*radius,y:center.y+Math.sin(angle)*radius};
      if(p.x<80||p.y<80||p.x>this.world.width-80||p.y>this.world.height-80||this.isGroundBlocked(p.x,p.y,45))continue;
      if(this.buildings.some(b=>b.hp>0&&distance(b,p)<b.size*.5+85))continue;
      if(this.enemyUnits(u.owner).some(v=>UNITS[v.type].damage>0&&this.canSeeEntity(u.owner,v)&&distance(v,p)<240))continue;
      return p;
    }
    return null;
  },
  frontlineCapability(side,type) {
    const has=t=>this.ownedBuildings(side,t).length>0;
    if(['barracks','factory','armory'].includes(type))return has('refinery');
    if(type==='radar')return has('airfield');
    if(type==='lab'||type==='super')return has('hq')&&has('refinery')&&has('airfield');
    return has(type);
  },
  canBuildFrontline(side,type) {
    if(!FRONTLINE_BUILDINGS.includes(type)||!this.ownedBuildings(side,'hq').length)return false;
    if(type==='dock'&&!this.map.water)return false;
    const d=frontlineBuilding(this,type);return !d.requires||this.hasBuilding(side,d.requires);
  }
};
