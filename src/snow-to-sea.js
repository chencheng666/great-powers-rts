import { islandDistance, islandIndex } from './island-map.js';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const rect = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
// 固定种子把山脊、地表和植被的变化锁在同一坐标，存档恢复后仍是同一个世界。
export function snowNoise(x, y) {
  const hash = (a, b) => { let h = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ 161116; h = Math.imul(h ^ h >>> 13, 1274126177); return ((h ^ h >>> 16) >>> 0) / 4294967295; };
  const ix = Math.floor(x), iy = Math.floor(y), u = smooth(0, 1, x - ix), v = smooth(0, 1, y - iy);
  return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
}
const river = [[3400,0,210],[3650,900,240],[3420,1600,270],[3850,2450,280],[3720,3100,320],[4380,3900,360],[4680,4520,430]];
export function riverBanks(y) {
  const i = Math.max(0, river.findIndex(p => p[1] >= y) - 1), a = river[i], b = river[Math.min(i + 1, river.length - 1)];
  const t = clamp((y - a[1]) / Math.max(1, b[1] - a[1])), center = a[0] + (b[0] - a[0]) * t, half = a[2] + (b[2] - a[2]) * t;
  return { west: center - half, east: center + half };
}
export function snowBridge(map, x, y, radius = 0) {
  return map.bridges.find(b => x >= b.x1 + radius && x <= b.x2 - radius && y >= b.y1 + radius && y <= b.y2 - radius);
}
export function snowToSeaMap() {
  const width = 7680, height = 5760;
  const westBank = river.map(([x,y,w]) => [x-w,y]), eastBank = river.map(([x,y,w]) => [x+w,y]);
  const spawns = [[800,1320,0],[2060,2520,0],[6040,1260,Math.PI],[6020,2940,Math.PI],[1220,4010,0],[6260,4160,Math.PI]].map(([x,y,angle],side) => ({x,y,angle,side}));
  const mountains = [rect(80,40,1710,760),rect(1330,40,2900,900),rect(3800,40,4800,660),rect(6950,460,7650,2070)];
  const bridges = [1450,2900,3910].map((y,i) => { const b = riverBanks(y); return {...rect(b.west-360,y-90,b.east+360,y+90),height:118,name:['雪松桥','河谷大桥','芦洲桥'][i]}; });
  const harbors = [
    ...[[1300,'west'],[2500,'west'],[1080,'east'],[3070,'east']].map(([y,bank]) => {const b=riverBanks(y),west=bank==='west';return {x:b[bank]+(west?-35:35),y,angle:west?0:Math.PI,approach:{x:b[bank]+(west?170:-170),y}};}),
    {x:2060,y:4715,angle:-Math.PI/2,approach:{x:2060,y:5040}},
    {x:6150,y:4542,angle:-Math.PI/2,approach:{x:6150,y:5000}}
  ];
  const map = {
    name:'雪岭入海',sector:'雪山 · 河谷 · 湿地 · 海湾',snowToSea:true,seed:161116,
    world:{width,height,cell:40,fog:80,terrainCeiling:800},fixedScale:true,cameraNorthMargin:520,maxPlayers:6,singleplayerOnly:true,
    combinedArms:true,connectedMainland:true,naval:true,economyMode:'mining',startingCredits:4200,controlGoal:600,spawns,
    water:rect(0,0,width,height),
    islands:[
      {name:'西岸雪岭与森林河谷',points:[[0,0],...westBank,[3500,4380],[2800,4660],[1500,4800],[0,4600]]},
      {name:'东岸草原与戈壁',points:[...eastBank,[5800,4500],[6800,4720],[7680,4380],[7680,0]]},
      {name:'河口港岛',points:[[3700,4890],[3920,4720],[4210,4800],[4370,5080],[4110,5300],[3790,5220]]},
      {name:'海湾礁岛',points:[[4950,5260],[5110,5130],[5350,5220],[5400,5470],[5100,5530]]}
    ],barriers:mountains,noBuild:[...mountains,...bridges],mountains,bridges,harbors,
    dockZones:harbors.map((p,owner)=>({...rect(p.x-70,p.y-80,p.x+70,p.y+80),owner})),
    beaches:[rect(2500,4470,2920,4870),rect(5630,4340,6100,4780),rect(3610,4850,3880,5220),rect(4170,4800,4450,5180)],
    landingApproaches:[{x:2800,y:4770},{x:2800,y:4770},{x:5900,y:4610},{x:5900,y:4610},{x:3610,y:5000},{x:3610,y:5000}],
    navalObjectives:harbors.map(p=>({...p.approach})),scouts:spawns.map(p=>({x:p.x,y:p.y})),seaEntries:harbors.map(p=>({...p.approach})),
    roads:[[[750,1320],[2170,1200],[3000,1450],[4100,1450],[5800,1260]],[[1980,2520],[3100,2900],[4250,2900],[6000,2940]],[[1200,4000],[3060,3910],[5090,3910],[6200,4160]],[[2200,1200],[2060,2520],[2600,3620],[2800,4380]],[[5800,1260],[5420,2300],[6020,2940],[5800,4190]]],
    cover:[rect(2200,1650,2640,2020),rect(4800,3270,5310,3660)],ore:[],oil:[],resources:[],
    beacons:[{id:'snow-pass',name:'雪岭山口',x:2920,y:1020},{id:'snow-valley',name:'河谷枢纽',x:2890,y:2730},{id:'snow-grass',name:'草原驿站',x:4910,y:2330},{id:'snow-marsh',name:'芦洲河口',x:3100,y:4150},{id:'snow-port',name:'港岛航标',x:4020,y:5030}]
  };
  for(const s of spawns) {
    const point=(dx,dy)=>({x:s.x+Math.cos(s.angle)*dx-Math.sin(s.angle)*dy,y:s.y+Math.sin(s.angle)*dx+Math.cos(s.angle)*dy});
    for(const [dx,dy,kind] of [[510,-320,'gold'],[720,-310,'gold'],[560,440,'gold'],[760,260,'gem']]) {const p=point(dx,dy);if(s.side===5)p.y=Math.min(p.y,4380);map.ore.push([p.x,p.y,6000,kind]);}
    const oil=point(-220,-340);map.oil.push({...oil,id:`snow-oil-${s.side}`});
    for(const [type,dx,dy]of [['cache',610,40],['salvage',850,40],['depot',1010,-90]])map.resources.push({...point(dx,dy),type,id:`snow-${s.side}-${type}`});
  }
  return map;
}

export function snowSurface(map, x, y) {
  const distance=islandDistance(map,x,y),land=smooth(-24,40,distance),n=snowNoise(x/430,y/430);
  let height=-15+23*land,peak=0;
  for(const r of map.mountains){const dx=(x-(r.x1+r.x2)/2)/((r.x2-r.x1)/2),dy=(y-(r.y1+r.y2)/2)/((r.y2-r.y1)/2);const t=Math.max(0,1-dx*dx-dy*dy);peak=Math.max(peak,t*t*(530+snowNoise(x/110,y/110)*140)*(.78+(1-Math.abs(snowNoise(x/230,y/160)*2-1))*.35));}
  const baseFade=map.spawns.reduce((fade,s)=>Math.min(fade,smooth(280,760,Math.hypot(x-s.x,y-s.y))),1);
  height+=land*(peak+(n*14+snowNoise(x/120,y/120)*4)*baseFade);
  // 桥头坡道与桥面采用同一高度场，单位、落点、雾和网格不会互相穿插。
  const bridge=map.bridges.find(b=>x>=b.x1-280&&x<=b.x2+280&&y>=b.y1-45&&y<=b.y2+45);
  if(bridge){const deckX=smooth(bridge.x1-280,bridge.x1,x)*(1-smooth(bridge.x2,bridge.x2+280,x)),deckY=smooth(bridge.y1-45,bridge.y1,y)*(1-smooth(bridge.y2,bridge.y2+45,y));if(distance>=0)height=height+(bridge.height-height)*deckX*deckY;}
  const snow=clamp((1-smooth(600+n*360,1430+n*220,y))*.87+smooth(150,300,height)*.95);
  const desert=smooth(4100,5360,x)*(1-smooth(1730,2650,y))*(1-snow);
  const wetland=smooth(3240,4060,y)*(1-smooth(4580,4900,y))*(1-desert)*smooth(650,260,distance);
  const forest=(1-desert)*(1-snow*.6)*(1-wetland*.7)*(1-smooth(3350,4220,y))*(.5+n*.5);
  const biome=distance<0?'water':snow>.52?'snow':desert>.5?'desert':wetland>.35?'wetland':forest>.55?'forest':'grass';
  return {height,distance,snow,desert,wetland,forest,biome};
}
export function snowEnvironment(map,x,y,time=0) {
  const s=snowSurface(map,x,y),front=.42+.3*Math.sin(time/95+x/3100),snow=s.snow*front,rain=(1-s.snow)*(1-s.desert)*front*.65;
  return {...s,snowfall:snow,rain,wind:.25+.2*Math.sin(time/37),surf:clamp(1-Math.abs(s.distance)/350)*(y>4300?1:.2)};
}
export function snowColor(s) {
  if(s.distance<0)return [35,83,102];
  let c=[110,137,83];const mix=(to,t)=>{c=c.map((v,i)=>v*(1-t)+to[i]*t);};
  mix([61,101,65],s.forest*.65);mix([182,156,99],s.desert);mix([75,112,85],s.wetland);mix([194,208,210],s.snow);
  mix([98,109,112],smooth(110,260,s.height)*(1-s.snow));return c;
}

export function snowElevation(map,x,y){const bridge=snowBridge(map,x,y);return bridge?bridge.height+1:snowSurface(map,x,y).height+1;}

// 两岸由桥连通；离岸港岛仍须运输，不能把整个地图都当成同一块陆地。
export function snowLandConnected(map,a,b){const x=islandIndex(map,a),y=islandIndex(map,b);return x>=0&&y>=0&&(x===y||x<2&&y<2);}
