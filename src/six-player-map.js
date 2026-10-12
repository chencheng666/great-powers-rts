// 六方自由对战候选：每席出生点按同一局部模板旋转，不用两方镜像。
export const SIX_WORLD = Object.freeze({width:5760,height:5760,cell:40,fog:80});
const center={x:2880,y:2880};
export const SIX_SPAWNS=Array.from({length:6},(_,side)=>{const angle=-Math.PI/2+side*Math.PI/3;return {side,x:center.x+Math.cos(angle)*1920,y:center.y+Math.sin(angle)*1920,angle:angle+Math.PI};});
export function sixPoint(side,dx,dy){const s=SIX_SPAWNS[side];return {x:s.x+Math.cos(s.angle)*dx-Math.sin(s.angle)*dy,y:s.y+Math.sin(s.angle)*dx+Math.cos(s.angle)*dy};}
export function sixPlayerMap(){
 const ore=SIX_SPAWNS.flatMap((s,i)=>[[430,-320,4000,'gold'],[700,-340,4000,'gold'],[550,400,4000,'gold'],[760,0,2800,'gem']].map(([dx,dy,amount,kind])=>{const p=sixPoint(i,dx,dy);return[p.x,p.y,amount,kind];}));
 const oil=[],beacons=[];
 for(let i=0;i<6;i++){const a=-Math.PI/2+i*Math.PI/3;ore.push([center.x+Math.cos(a)*520,center.y+Math.sin(a)*520,5000,'gem']);oil.push({id:`six-oil-${i}`,x:center.x+Math.cos(a+Math.PI/6)*1140,y:center.y+Math.sin(a+Math.PI/6)*1140});beacons.push({id:`six-beacon-${i}`,x:center.x+Math.cos(a+Math.PI/6)*660,y:center.y+Math.sin(a+Math.PI/6)*660});}
 return {name:'六域会战',sector:'候选战区08 · 六方自由对战',world:SIX_WORLD,maxPlayers:6,economyMode:'mining',spawns:SIX_SPAWNS,ore,oil,beacons,barriers:[],noBuild:[],bridges:[],water:null,dockZones:[]};
}
export function sixResources(){return SIX_SPAWNS.flatMap((s,side)=>[['cache',520,190,450],['salvage',600,-180,1200],['depot',1050,0,2400]].map(([type,x,y,amount])=>({...sixPoint(side,x,y),id:`six-resource-${side}-${type}`,kind:'resource',type,owner:null,amount,max:amount,progress:0})));}
