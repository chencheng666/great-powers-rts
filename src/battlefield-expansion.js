import { MAPS, WORLD } from './data.js';

export function battlefieldMap(mapId, scale = 1) {
  const source=MAPS[mapId],world=source.world||WORLD;
  if(scale===1)return source;
  if(scale!==1.5)throw new Error('不支持的战场尺寸');
  const rect=r=>Object.fromEntries(Object.entries(r).map(([k,v])=>[k,typeof v==='number'?v*scale:v]));
  const sites=values=>values.map(v=>({...v,x:v.x*scale,y:v.y*scale}));
  return {...source,name:`${source.name} · 纵深`,world:{...world,width:world.width*scale,height:world.height*scale},ore:source.ore.map(([x,y,amount,kind])=>[x*scale,y*scale,amount,kind]),oil:sites(source.oil),beacons:sites(source.beacons),barriers:source.barriers.map(rect),noBuild:source.noBuild.map(rect),bridges:source.bridges.map(rect),water:source.water?rect(source.water):null,dockZones:source.dockZones.map(rect),cover:source.cover?.map(rect)};
}

export const RESOURCE_TYPES = {
  cache:{name:'应急物资箱',amount:300,description:'陆地单位停驻回收；共 300 资金，先侦察再争夺。'},
  salvage:{name:'设备回收场',amount:900,description:'工程师、采矿车或补给车以每秒 45 资金回收，共 900；不在常规战场挖矿。'},
  depot:{name:'中立能源仓',amount:1800,description:'工程师接管后提供 40 电力与前哨视野，按每秒 8 资金转移库存；可依托扩建基地，敌方能重新夺取。'}
};

export function resourceLayout(map) {
  const world=map.world||WORLD,w=world.width,h=world.height;
  const landX=map.water?map.water.x1*.68:w*.40;
  const spots=[['cache',landX,h*.27],['salvage',landX*.92,h*.73],['depot',landX+55,h*.36]];
  return spots.flatMap(([type,x,y])=>[0,1].map(side=>({id:`resource-${type}-${side}`,kind:'resource',type,x:side?w-x:x,y:side?h-y:y,owner:null,amount:RESOURCE_TYPES[type].amount,max:RESOURCE_TYPES[type].amount,progress:0})));
}
