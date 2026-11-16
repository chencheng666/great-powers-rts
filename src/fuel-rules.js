import { UNITS } from './data.js';

// 动力按百分比与游戏地图距离计算，不对应真实装备的油箱和航程。
export const FUEL = Object.freeze({ capacity:100, warning:30, critical:10, ready:95, refillRate:10, price:1.5, emergencySeconds:20 });
export const FUEL_SUPPORT = Object.freeze({
  supply:{stock:220,range:240,rate:7},
  tanker:{stock:420,range:230,rate:12},
  supplyShip:{stock:680,range:280,rate:9,ammoStock:90}
});
export const FUEL_UNIT_TYPES = ['tanker','supplyShip'];
const PROFILES={air:{domain:'air',distance:.0052,idle:.025},tanker:{domain:'air',distance:.0035,idle:.025},sea:{domain:'sea',distance:.004,idle:0},land:{domain:'land',distance:.009,idle:0}};
export const fuelEnabled = game => game.fuelVersion===1 && !game.multiplayer && !game.map?.future;
export const fuelUnitAvailable = (game,type) => !FUEL_UNIT_TYPES.includes(type)||fuelEnabled(game);
export function fuelProfile(game,unit) {
  if(!fuelEnabled(game)||unit.kind!=='unit'||unit.temporaryUntil||unit.swarmParentId)return null;
  const tags=UNITS[unit.type]?.tags||[];
  if(tags.some(t=>['infantry','drone','logistics'].includes(t)))return null;
  return tags.includes('air')?PROFILES[unit.type==='tanker'?'tanker':'air']:tags.includes('ship')?PROFILES.sea:PROFILES.land;
}
export const fuelReadyForAmmo = (game,unit) => !fuelProfile(game,unit)||unit.fuel>=FUEL.ready;
export function fuelStatus(game,unit) {
  if(!fuelProfile(game,unit))return '';
  if(unit.fuelEmergencyAt!==undefined)return `动力耗尽 · ${Math.max(0,Math.ceil(FUEL.emergencySeconds-(game.time-unit.fuelEmergencyAt)))}秒应急下降`;
  if(unit.fuel<=0)return '动力耗尽 · 等待供油';
  if(unit.fuelServiceId)return '补给会合';
  if(unit.fuelReturn)return '低油返场';
  return unit.fuel<=FUEL.warning?'低油预警':'';
}

export function validFuelState(unit,config,state) {
  const game={fuelVersion:config.fuelVersion,map:{future:false},multiplayer:false},profile=fuelProfile(game,unit),rule=FUEL_SUPPORT[unit.type];
  const fields=['fuel','fuelStock','ammoStock','autoFuel','fuelReturn','fuelServiceId','fuelTargetId','fuelEmergencyAt','mobileAmmoProgress'];
  if(!profile)return !FUEL_UNIT_TYPES.includes(unit.type)&&fields.every(k=>unit[k]===undefined);
  const finite=v=>typeof v==='number'&&Number.isFinite(v),id=v=>Number.isSafeInteger(v)&&v>0&&v!==unit.id;
  if(!finite(unit.fuel)||unit.fuel<0||unit.fuel>FUEL.capacity)return false;
  if(rule?(!finite(unit.fuelStock)||unit.fuelStock<0||unit.fuelStock>rule.stock):unit.fuelStock!==undefined)return false;
  if(rule?.ammoStock?(!finite(unit.ammoStock)||unit.ammoStock<0||unit.ammoStock>rule.ammoStock):unit.ammoStock!==undefined)return false;
  if(FUEL_UNIT_TYPES.includes(unit.type)?typeof unit.autoFuel!=='boolean':unit.autoFuel!==undefined)return false;
  if(unit.fuelReturn!==undefined&&typeof unit.fuelReturn!=='boolean')return false;
  if(unit.fuelServiceId!==undefined){
    if(!id(unit.fuelServiceId)||rule)return false;
    const provider=state.units.find(u=>u.id===unit.fuelServiceId);
    if(provider&&(provider.owner!==unit.owner||provider.type!==(profile.domain==='air'?'tanker':'supplyShip')))return false;
  }
  if(unit.fuelTargetId!==undefined){
    if(!FUEL_UNIT_TYPES.includes(unit.type)||!id(unit.fuelTargetId))return false;
    const target=state.units.find(u=>u.id===unit.fuelTargetId);
    if(target&&(target.owner!==unit.owner||fuelProfile(game,target)?.domain!==(unit.type==='tanker'?'air':'sea')))return false;
  }
  if(unit.fuelEmergencyAt!==undefined&&(profile.domain!=='air'||!finite(unit.fuelEmergencyAt)||unit.fuelEmergencyAt<0||unit.fuelEmergencyAt>state.time||unit.fuel>0))return false;
  if(unit.mobileAmmoProgress!==undefined&&(!finite(unit.mobileAmmoProgress)||unit.mobileAmmoProgress<0||unit.mobileAmmoProgress>2))return false;
  for(const k of ['nextFuelCheckAt','nextFuelSearchAt','nextFuelEscortAt','fuelFXAt','fueledAt'])if(unit[k]!==undefined&&(!finite(unit[k])||unit[k]<0))return false;
  return true;
}
