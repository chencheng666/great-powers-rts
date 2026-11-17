import { doctrineFactor,commandEnabled } from './command-doctrines.js';
import { UNITS } from './data.js';
import { FUEL, FUEL_SUPPORT, fuelEnabled, fuelProfile } from './fuel-rules.js';
import { snowLandConnected } from './snow-to-sea.js';
const gap=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const manual=u=>['move','attackMove','patrol','attack','board'].includes(u.order?.type);

export const fuelSystem = {
  fuelAirborne(unit) {
    return !this.aircraftGrounded(unit)&&!(unit.type==='airlift'&&this.transportGrounded(unit));
  },
  initUnitFuel(unit) {
    if(!fuelProfile(this,unit))return;
    unit.fuel=FUEL.capacity;
    const support=FUEL_SUPPORT[unit.type];
    if(support){unit.fuelStock=support.stock;if(support.ammoStock)unit.ammoStock=support.ammoStock;}
    if(['tanker','supplyShip'].includes(unit.type))unit.autoFuel=true;
  },
  fuelServiceComplete(unit) {
    if(!fuelProfile(this,unit))return true;
    const support=FUEL_SUPPORT[unit.type];
    return unit.fuel>=99.5&&(!support||unit.fuelStock>=support.stock*.95)&&(!support?.ammoStock||unit.ammoStock>=support.ammoStock*.95);
  },
  fuelMovementTime(unit,dt) {
    if(!fuelProfile(this,unit)||unit.fuel>0)return dt;
    // 飞机耗尽后仅有短时应急滑行/下降能力，陆军与舰艇不能无油继续移动。
    return UNITS[unit.type].tags.includes('air')&&this.fuelAirborne(unit)?dt*.35:0;
  },
  consumeMovementFuel(unit,distance) {
    const profile=fuelProfile(this,unit);if(!profile||unit.embarkedIn)return;
    unit.fuel=Math.max(0,unit.fuel-distance*profile.distance*doctrineFactor(this,unit,'fuelUse'));
  },
  fuelHome(unit) {
    const profile=fuelProfile(this,unit);if(!profile)return null;
    if(unit.homeCarrierId){const carrier=this.getEntity(unit.homeCarrierId);if(carrier?.hp>0&&carrier.owner===unit.owner)return carrier;}
    const type=profile.domain==='air'?'airfield':profile.domain==='sea'?'dock':'refinery';
    const homes=(this.fuelHomeGroups?.get(`${unit.owner}:${type}`)||this.ownedBuildings(unit.owner,type)).filter(b=>b.hp>0).filter(b=>profile.domain!=='land'||snowLandConnected(this.map,unit,b));
    return homes.find(b=>b.id===(unit.order?.homeId||unit.assignment?.homeId))||homes.sort((a,b)=>gap(a,unit)-gap(b,unit))[0]||null;
  },
  nearbyFuelAnchor(unit){
    if(!commandEnabled(this))return null;const domain=fuelProfile(this,unit)?.domain;
    if(domain!=='land')return this.fuelProviderFor(unit);
    return (this.fuelProviderGroups?.get(`${unit.owner}:land`)||this.activeUnits(unit.owner,'supply')).filter(v=>v!==unit&&v.hp>0&&!v.embarkedIn&&!v.reinforcement&&!v.fuelReturn&&v.order?.type!=='restock'&&v.fuel>35&&v.fuelStock>=45&&gap(v,unit)<650&&this.time-(v.lastDamageAt??-10)>3&&this.hasLineOfFire(v,unit)).sort((a,b)=>gap(a,unit)-gap(b,unit))[0]||null;
  },
  fuelStation(unit) {
    const profile=fuelProfile(this,unit);if(!profile||this.time-(unit.lastDamageAt??-10)<=3||!this.hasPower(unit.owner))return null;
    if(unit.embarkedIn){
      const carrier=this.getEntity(unit.embarkedIn);
      return carrier?.type==='carrier'&&carrier.owner===unit.owner&&carrier.hp>0&&this.transportGrounded(carrier)&&this.time-(carrier.lastDamageAt??-10)>3?carrier:null;
    }
    if(this.time-(unit.lastMovedAt??-10)<.5)return null;
    const home=this.fuelHome(unit);if(!home||this.time-(home.lastDamageAt??-10)<=3)return null;
    if(profile.domain==='air')return home.kind==='building'&&this.aircraftGrounded(unit)&&gap(unit,home)<320?home:null;
    if(profile.domain==='sea')return gap(unit,this.shipBerth(unit,home))<=100?home:null;
    return gap(unit,home)<=home.size*.55+45?home:null;
  },
  fillFuelAtStation(unit,dt) {
    const support=FUEL_SUPPORT[unit.type];
    if(unit.fuel>=100&&(!support||unit.fuelStock>=support.stock)&&(!support?.ammoStock||unit.ammoStock>=support.ammoStock))return;
    if(!this.fuelStation(unit))return;
    const p=this.players[unit.owner],gain=Math.min(FUEL.capacity-unit.fuel,FUEL.refillRate*dt*doctrineFactor(this,unit,'service'),p.credits/FUEL.price);
    unit.fuel+=gain;p.credits=Math.max(0,p.credits-gain*FUEL.price);
    if(unit.fuel>=FUEL.ready)delete unit.fuelEmergencyAt;
    if(!support||unit.fuel<99.5)return;
    const stock=Math.min(support.stock-unit.fuelStock,24*dt,p.credits/FUEL.price);
    unit.fuelStock+=stock;p.credits=Math.max(0,p.credits-stock*FUEL.price);
    if(support.ammoStock&&unit.fuelStock>=support.stock*.95){
      const ammo=Math.min(support.ammoStock-unit.ammoStock,6*dt,p.credits/2);unit.ammoStock+=ammo;p.credits=Math.max(0,p.credits-ammo*2);
    }
  },
  transferFuel(provider,unit,dt) {
    const rule=FUEL_SUPPORT[provider.type];
    const profile=fuelProfile(this,unit),domain=provider.type==='tanker'?'air':provider.type==='supplyShip'?'sea':'land';
    if(!rule||!profile||profile.domain!==domain||provider.hp<=0||unit.hp<=0||unit.owner!==provider.owner||unit===provider||unit.embarkedIn||unit.reinforcement||gap(provider,unit)>rule.range||unit.fueledAt===this.time||provider.fuelStock<=0||unit.fuel>=FUEL.ready||this.time-(unit.lastDamageAt??-10)<=3||this.time-(provider.lastDamageAt??-10)<=3)return 0;
    if(domain==='air'&&(this.aircraftGrounded(provider)||this.aircraftGrounded(unit)))return 0;
    if(domain==='sea'&&(this.time-(unit.lastMovedAt??-10)<.5||this.time-(provider.lastMovedAt??-10)<.5))return 0;
    const amount=Math.max(0,Math.min(FUEL.ready-unit.fuel,rule.rate*dt,provider.fuelStock));
    provider.fuelStock-=amount;unit.fuel+=amount;unit.fueledAt=this.time;
    if(amount>0){
      delete unit.fuelEmergencyAt;this.noteCommandStat?.(unit.owner,'transferred',amount);
      if(commandEnabled(this)&&domain==='land'&&unit.fuel>=FUEL.ready&&unit.fuelReturn&&(!UNITS[unit.type].ammo||unit.ammo===UNITS[unit.type].ammo)&&unit.hp>=unit.maxHp-.01)this.restoreCombatOrder(unit);
      if(this.time>=(provider.fuelFXAt||0)){
        provider.fuelFXAt=this.time+.5;
        this.effects.push({type:'fuelTransfer',sourceId:provider.id,targetId:unit.id,x:provider.x,y:provider.y,toX:unit.x,toY:unit.y,owner:unit.owner,age:0,duration:.6});
      }
    }
    return amount;
  },
  fuelProviderFor(unit) {
    const domain=fuelProfile(this,unit)?.domain;if(!domain||domain==='land'||FUEL_SUPPORT[unit.type])return null;
    return (this.fuelProviderGroups?.get(`${unit.owner}:${domain}`)||this.activeUnits(unit.owner,domain==='air'?'tanker':'supplyShip')).filter(p=>p.autoFuel!==false&&!p.reinforcement&&!p.fuelReturn&&p.order?.type!=='rearm'&&p.fuel>35&&p.fuelStock>=15&&(!p.fuelTargetId||p.fuelTargetId===unit.id)&&!manual(p)&&gap(p,unit)<1600&&this.time-(p.lastDamageAt??-10)>3).sort((a,b)=>gap(a,unit)-gap(b,unit))[0]||null;
  },
  beginFuelReturn(unit) {
    if(unit.fuelReturn||unit.reinforcement||unit.embarkedIn)return;
    unit.fuelReturn=true;this.noteCommandStat?.(unit.owner,'returns');
    const provider=this.fuelProviderFor(unit),home=this.fuelHome(unit);
    if(unit.type==='supply'){
      unit.resumeOrder=unit.order;unit.order={type:'restock'};unit.path=[];
    }else{
      this.requestResupply(unit,home?.kind==='building'?home:null);
      if(provider){unit.fuelServiceId=provider.id;provider.fuelTargetId=unit.id;}
    }
    if(unit.owner===0&&this.time-(this.lastFuelNoticeAt??-100)>8){
      this.lastFuelNoticeAt=this.time;
      this.events.notice?.(`${UNITS[unit.type].name}动力不足，${provider?'正在与补给单位会合':home?'自动返场加油':'缺少补给接收点，请派补给单位救援'}`);
    }
  },
  updateFuelSystem(dt) {
    if(!fuelEnabled(this))return;
    this.fuelHomeGroups=new Map();this.fuelProviderGroups=new Map();
    for(const b of this.buildings)if(b.hp>0&&['airfield','dock','refinery'].includes(b.type)){const k=`${b.owner}:${b.type}`;if(!this.fuelHomeGroups.has(k))this.fuelHomeGroups.set(k,[]);this.fuelHomeGroups.get(k).push(b);}
    for(const u of this.units)if(u.hp>0&&['tanker','supplyShip','supply'].includes(u.type)){const k=`${u.owner}:${u.type==='tanker'?'air':u.type==='supply'?'land':'sea'}`;if(!this.fuelProviderGroups.has(k))this.fuelProviderGroups.set(k,[]);this.fuelProviderGroups.get(k).push(u);}
    for(const u of this.units){
      const profile=fuelProfile(this,u);if(!profile||u.hp<=0)continue;
      if(profile.domain==='air'&&!u.embarkedIn&&this.fuelAirborne(u))u.fuel=Math.max(0,u.fuel-profile.idle*dt);
      if(commandEnabled(this)&&u.airfieldOps?.phase==='taxiOut'&&u.order?.type==='rearm'){u.airfieldOps.phase='taxiIn';u.path=[];}
      this.fillFuelAtStation(u,dt);
      if(u.fuel<=0&&profile.domain==='air'&&!u.embarkedIn&&this.fuelAirborne(u)){
        if(u.fuelEmergencyAt===undefined){
          u.fuelEmergencyAt=this.time;this.noteCommandStat?.(u.owner,'emergencies');
          if(u.owner===0&&this.time-(this.lastFuelEmergencyNoticeAt??-100)>8){this.lastFuelEmergencyNoticeAt=this.time;this.events.notice?.(`${UNITS[u.type].name}动力耗尽：20秒内获得供油或安全着陆，否则坠毁。`);}
        }
        if(this.time-u.fuelEmergencyAt>=FUEL.emergencySeconds){this.noteCommandStat?.(u.owner,'fuelLosses');this.damage(u,u.hp*4,null);continue;}
      }else if(u.fuel>0)delete u.fuelEmergencyAt;
      if(u.embarkedIn||u.reinforcement||this.time<(u.nextFuelCheckAt||0))continue;
      u.nextFuelCheckAt=this.time+1;
      const home=this.nearbyFuelAnchor(u)||this.fuelHome(u),need=home?gap(u,home)*profile.distance*doctrineFactor(this,u,'fuelUse')*(commandEnabled(this)?(profile.domain==='land'?2:profile.domain==='sea'?1.6:1.6):(profile.domain==='land'?1.65:1.4))+(commandEnabled(this)?22:14):FUEL.warning;
      const low=u.fuel<=Math.min(85,Math.max(FUEL.warning,need));
      if(low&&!(u.fuelOverrideUntil>this.time)&&!this.fuelStation(u))this.beginFuelReturn(u);
      if(profile.domain==='sea'&&!FUEL_SUPPORT[u.type]&&u.order?.type==='rearm'&&(u.ammo<UNITS[u.type].ammo||u.type==='carrier'&&(u.defenseAmmo??12)<12)&&!u.fuelServiceId&&!this.fuelStation(u)){
        const provider=this.fuelProviderFor(u);if(provider){u.fuelReturn=true;u.fuelServiceId=provider.id;provider.fuelTargetId=u.id;}
      }
      if(u.fuelReturn&&!u.fuelServiceId&&u.fuel<FUEL.ready&&u.type!=='supply'){
        const provider=this.fuelProviderFor(u);if(provider){u.fuelServiceId=provider.id;provider.fuelTargetId=u.id;}
        else if(u.order?.type!=='rearm')this.requestResupply(u,home?.kind==='building'?home:null);
      }
    }
    for(const truck of this.units.filter(u=>u.hp>0&&u.type==='supply'&&!u.embarkedIn&&u.fuelStock>0&&this.time-(u.lastDamageAt??-10)>3)){
      for(const u of this.activeUnits(truck.owner).filter(v=>v!==truck&&fuelProfile(this,v)?.domain==='land'&&gap(truck,v)<=240&&this.hasLineOfFire(truck,v)&&this.time-(v.lastDamageAt??-10)>3).sort((a,b)=>a.fuel-b.fuel||a.id-b.id))this.transferFuel(truck,u,dt);
    }
  },
  updateFuelRecipient(unit,dt) {
    if(!unit.fuelServiceId)return false;
    const provider=this.getEntity(unit.fuelServiceId),rule=provider&&FUEL_SUPPORT[provider.type];
    if(!provider||provider.hp<=0||provider.owner!==unit.owner||!rule||provider.fuelStock<=0||provider.fuelReturn||provider.order?.type==='rearm'||provider.autoFuel===false||manual(provider)||this.time-(unit.lastDamageAt??-10)<=3||this.time-(provider.lastDamageAt??-10)<=3){
      if(provider?.fuelTargetId===unit.id)delete provider.fuelTargetId;
      delete unit.fuelServiceId;unit.path=[];this.requestResupply(unit);return false;
    }
    const air=UNITS[unit.type].tags.includes('air'),distance=gap(unit,provider);
    if(distance>(air?rule.range:rule.range*.8)){this.moveUnit(unit,provider,dt,rule.range*.65);return true;}
    if(air){
      this.transferFuel(provider,unit,dt);
      this.moveUnit(unit,{x:provider.x-Math.cos(provider.angle)*120,y:provider.y-Math.sin(provider.angle)*120},dt*Math.min(1,UNITS[provider.type].speed/UNITS[unit.type].speed),60);
    }else if(this.time-(unit.lastMovedAt??-10)<.5||this.time-(provider.lastMovedAt??-10)<.5)return true;
    if(!air)this.transferFuel(provider,unit,dt);
    if(unit.fuel<FUEL.ready)return true;
    const d=UNITS[unit.type];
    if(!air&&(d.ammo&&unit.ammo<d.ammo||unit.type==='carrier'&&(unit.defenseAmmo??12)<12)&&provider.ammoStock>=1){
      unit.mobileAmmoProgress=Math.min(1,(unit.mobileAmmoProgress||0)+dt);
      if(unit.mobileAmmoProgress>=1&&this.players[unit.owner].credits>=(d.ammoCost??10)){
        if(unit.type==='carrier'&&(unit.defenseAmmo??12)<12)unit.defenseAmmo=(unit.defenseAmmo??12)+1;else unit.ammo++;
        provider.ammoStock--;this.players[unit.owner].credits-=d.ammoCost??10;unit.mobileAmmoProgress=0;
      }
      return true;
    }
    delete provider.fuelTargetId;delete unit.fuelServiceId;delete unit.mobileAmmoProgress;
    this.restoreCombatOrder(unit);return true;
  },
  toggleAutoFuel(unit) {
    if(!fuelEnabled(this)||!['tanker','supplyShip'].includes(unit.type)||unit.hp<=0||this.isControlLocked(unit.owner))return false;
    unit.autoFuel=unit.autoFuel===false;
    return true;
  },
  updateFuelSupport(unit,dt) {
    if(!['tanker','supplyShip'].includes(unit.type)||!fuelEnabled(this)||unit.order?.type==='rearm'||unit.reinforcement)return false;
    if(manual(unit)){
      if(this.patrolStep(unit,dt))return true;
      if(gap(unit,unit.order)>12)this.moveUnit(unit,unit.order,dt,8);else unit.order=null;
      return true;
    }
    if(this.isAI(unit.owner)&&unit.hp<unit.maxHp*.5){this.requestResupply(unit);return true;}
    if(unit.fuel<35||unit.fuelStock<15||unit.type==='supplyShip'&&unit.ammoStock<1){this.beginFuelReturn(unit);return true;}
    if(unit.autoFuel===false){this.cruiseAircraft(unit,dt);return true;}
    let target=this.getEntity(unit.fuelTargetId);
    if(!target||target.hp<=0||target.owner!==unit.owner||target.fuelServiceId!==unit.id){delete unit.fuelTargetId;target=null;}
    if(!target&&this.time>=(unit.nextFuelSearchAt||0)){
      unit.nextFuelSearchAt=this.time+1;
      const domain=unit.type==='tanker'?'air':'sea';
      target=this.activeUnits(unit.owner).filter(u=>u!==unit&&!FUEL_SUPPORT[u.type]&&!u.reinforcement&&!u.fuelServiceId&&fuelProfile(this,u)?.domain===domain&&(u.fuel<60||domain==='sea'&&(u.ammo<UNITS[u.type].ammo||u.type==='carrier'&&(u.defenseAmmo??12)<12))&&gap(u,unit)<1600&&!this.fuelStation(u)&&this.time-(u.lastDamageAt??-10)>3).sort((a,b)=>a.fuel-b.fuel||gap(a,unit)-gap(b,unit))[0];
      if(target){target.fuelReturn=true;this.requestResupply(target);target.fuelServiceId=unit.id;unit.fuelTargetId=target.id;}
    }
    if(target){
      if(unit.type==='tanker'&&this.aircraftGrounded(unit)){unit.order={type:'move',x:target.x,y:target.y};return true;}
      if(gap(unit,target)>FUEL_SUPPORT[unit.type].range*.75)this.moveUnit(unit,target,dt,FUEL_SUPPORT[unit.type].range*.6);
      else if(unit.type==='tanker')this.cruiseAircraft(unit,dt);
      return true;
    }
    if(this.isAI(unit.owner)&&this.time>=(unit.nextFuelEscortAt||0)){
      unit.nextFuelEscortAt=this.time+4;
      const air=unit.type==='tanker',home=this.ownedBuildings(unit.owner,'hq')[0];
      const force=this.activeUnits(unit.owner).filter(u=>UNITS[u.type].damage>0&&!u.reinforcement&&!u.fuelReturn&&fuelProfile(this,u)?.domain===(air?'air':'sea')).sort((a,b)=>a.fuel-b.fuel||gap(a,unit)-gap(b,unit))[0];
      if(force&&home&&gap(force,unit)>650){
        const raw={x:force.x+(home.x-force.x)*.12,y:force.y+(home.y-force.y)*.12};
        const goal=air?{x:Math.round(raw.x/80)*80,y:Math.round(raw.y/80)*80}:this.navalGoal(Math.round(raw.x/80)*80,Math.round(raw.y/80)*80,100);
        unit.order={type:'move',...goal};unit.path=[];return true;
      }
    }
    this.cruiseAircraft(unit,dt);return true;
  }
};
