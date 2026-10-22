import { strategicMap } from './strategic-data.js';

const oval = (x, y, rx, ry) => Array.from({ length: 16 }, (_, i) => {
  const a = i * Math.PI / 8, r = 1 + Math.sin(i * 2.1) * .06;
  return [Math.round(x + Math.cos(a) * rx * r), Math.round(y + Math.sin(a) * ry * r)];
});
const island = (name, x, y, rx, ry) => ({ name, points: oval(x, y, rx, ry) });
const common = (name, width = 4480, height = 3200) => ({
  name, sector: '山海防线 · 单机战区', missionOnly: true, fixedScale: true,
  world: { width, height, cell: 40, fog: 80 }, ore: [], oil: [], beacons: [], resources: [],
  barriers: [], noBuild: [], bridges: [], dockZones: [], cover: [], water: null,
});
const coast = (name, width = 4480, height = 3200) => ({ ...common(name, width, height), naval: true,
  water: { x1: 0, y1: 0, x2: width, y2: height }, islands: [], beaches: [], harbors: [],
});

export function theaterMaps() {
  const deepblue = coast('深蓝航道', 5120, 3520);
  deepblue.islands = [island('西岸保障岛',700,2600,590,690), island('北港岛',850,760,600,570),
    island('航道中转岛',2800,1700,440,570),island('东部礁链',4330,600,490,350),island('南部岩岛',4270,2900,360,360)];
  deepblue.harbors = [{x:1220,y:1000,angle:0,approach:{x:1610,y:1160}},{x:1210,y:2380,angle:0,approach:{x:1600,y:2220}}];
  deepblue.beaches = [{x1:3100,y1:1460,x2:3370,y2:1860},{x1:1130,y1:2420,x2:1400,y2:2740}];
  deepblue.freight = {goal:2700,entry:{x:4820,y:1700},lanes:{direct:[{x:3560,y:2300},{x:2100,y:2250}],coastal:[{x:3700,y:1160},{x:1940,y:900}]}};
  deepblue.beacons = [{id:'deepblue-relay',x:2930,y:1720}];

  const seabreach = coast('海峡风云',5120,3520);
  seabreach.islands = [{name:'西岸出发区',points:[[0,0],[1140,0],[1280,740],[1160,1780],[1290,2750],[1100,3520],[0,3520]]},
    {name:'东岸纵深岛',points:[[2780,600],[3420,350],[4730,600],[5120,1120],[5120,3520],[2850,3520],[2570,2770],[2680,1850],[2500,1200]]},
    island('北侧观察岛',1930,500,260,280),island('南侧中转岛',1950,2920,290,320)];
  seabreach.beaches=[{x1:1080,y1:1580,x2:1400,y2:2000},{x1:2440,y1:1660,x2:2840,y2:2110}];
  seabreach.harbors=[{x:2750,y:2200,angle:Math.PI,approach:{x:2300,y:2190}},{x:1120,y:2470,angle:0,approach:{x:1520,y:2400}}];
  seabreach.freight={goal:1800,entry:{x:1570,y:120},lanes:{direct:[{x:2180,y:900},{x:2180,y:1700}],coastal:[{x:1550,y:1300},{x:1750,y:2170}]}};
  seabreach.roads=[[[2830,1910],[3180,1740],[3650,1300],[4320,1180]],[[3180,1740],[3450,2560],[4460,2800]]];

  const farshore = coast('远东 · 寒境守望',5120,3200);
  farshore.climate='cold'; farshore.islands=[{name:'寒境大陆',points:[[0,0],[4180,0],[4320,700],[4150,1600],[4260,2450],[4120,3200],[0,3200]]},island('外海灯塔岛',4800,600,160,230)];
  farshore.barriers=[{x1:1640,y1:0,x2:1900,y2:850},{x1:1640,y1:1170,x2:1900,y2:2100},{x1:1640,y1:2460,x2:1900,y2:3200},
    {x1:2900,y1:550,x2:3240,y2:1640},{x1:2900,y1:2040,x2:3240,y2:3200}];
  farshore.noBuild=[...farshore.barriers];farshore.ridges=farshore.barriers;
  farshore.harbors=[{x:4100,y:1810,angle:0,approach:{x:4600,y:1810}}];
  farshore.roads=[[[450,1700],[1200,1700],[1500,1010],[2160,1010],[2700,1810],[4100,1810]],[[1200,1700],[1450,2280],[2100,2280],[2700,1810]]];

  const passwatch=common('山口防线',3840,2560);
  passwatch.ridges=[{x1:1500,y1:0,x2:1900,y2:600},{x1:1500,y1:940,x2:1900,y2:1660},{x1:1500,y1:2010,x2:1900,y2:2560}];
  passwatch.barriers=[...passwatch.ridges];passwatch.noBuild=[...passwatch.barriers];
  passwatch.roads=[[[420,1330],[1050,1330],[1340,760],[2090,760],[3350,1230]],[[1050,1330],[1350,1830],[2140,1830],[3350,1230]]];
  passwatch.cover=[{x1:1240,y1:630,x2:1450,y2:880},{x1:1240,y1:1710,x2:1450,y2:1950}];

  const homebound=coast('归航行动',4480,3200);
  homebound.islands=[{name:'受护港区',points:[[0,0],[2460,0],[2500,700],[2360,1420],[2570,2150],[2380,3200],[0,3200]]},island('外海安全岛',3800,2640,450,430)];
  homebound.harbors=[{x:2370,y:1690,angle:0,approach:{x:2820,y:1690}}];
  homebound.beaches=[{x1:2310,y1:1760,x2:2660,y2:2100},{x1:3280,y1:2480,x2:3530,y2:2800}];
  homebound.roads=[[[420,2260],[1100,2260],[1740,1880],[2400,1880]],[[1100,2260],[1060,1400],[1740,1880]],[[1060,1400],[750,750]]];
  homebound.settlements=[{x:1000,y:1400},{x:1550,y:2100},{x:700,y:750}];
  for(const center of homebound.settlements)for(let i=0;i<6;i++){
    const x=center.x+(i%3)*135-150,y=center.y+Math.floor(i/3)*160-100;
    homebound.barriers.push({x1:x-36,y1:y-27,x2:x+36,y2:y+27});
  }
  homebound.noBuild=[...homebound.barriers];

  const ironworks=common('钢铁走廊',4480,2880); ironworks.industrial=true;
  ironworks.barriers=[{x1:1360,y1:520,x2:1770,y2:1050},{x1:2300,y1:1800,x2:2770,y2:2380},{x1:3440,y1:390,x2:3760,y2:1050}];
  ironworks.noBuild=[...ironworks.barriers];
  ironworks.roads=[[[400,1440],[4100,1440]],[[1200,650],[1200,2260]],[[2080,720],[2080,2280]],[[3100,700],[3100,2350]]];
  ironworks.railway=[[180,1720],[4280,1720]];

  const sentinel={...strategicMap(),name:'战略警戒',sector:'山海防线 · 常规防卫',missionOnly:true,fixedScale:true,resources:[]};
  const moonsea=common('明日 · 月海基地',4480,3200);moonsea.future=true;moonsea.economyMode='mining';
  moonsea.ore=[[650,1440,4200,'gold'],[1050,2300,3600,'gem'],[2510,1320,5400,'gold'],[3650,2300,4800,'gem']];
  moonsea.barriers=[{x1:1540,y1:500,x2:2030,y2:1180},{x1:2680,y1:1780,x2:3150,y2:2500}];
  moonsea.noBuild=[...moonsea.barriers];
  moonsea.cover=[{x1:1400,y1:1660,x2:1690,y2:1810},{x1:3440,y1:1690,x2:3730,y2:1840}];
  moonsea.craters=[{x:1810,y:810,radius:420},{x:2900,y:2100,radius:410},{x:3750,y:550,radius:270}];
  return {deepblue,seabreach,farshore,passwatch,homebound,ironworks,sentinel,moonsea};
}
