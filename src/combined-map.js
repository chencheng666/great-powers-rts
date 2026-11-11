const width = 6400;
const height = 4320;
const mirrorPoint = ([x, y]) => [width - x, y];
const bothSides = points => [points, points.map(mirrorPoint)];
const rect = (x1, y1, x2, y2) => ({ x1, y1, x2, y2 });
const mirrorRect = ({ x1, y1, x2, y2 }) => rect(width - x2, y1, width - x1, y2);

export function combinedMap() {
  const westCoast = [[1380,4320],[1520,3880],[1410,3460],[1580,3070],[1640,2520],[1640,2330],[1920,2110],[2330,1910],[2790,1740]];
  const mainland = [[0,0],[width,0],[width,height], ...westCoast.map(mirrorPoint),
    [3200,1660], ...westCoast.slice().reverse(), [0,height]];
  const centralIsland = [[2720,2520],[2880,2340],[3200,2280],[3520,2340],[3680,2520],[3630,2790],[3440,2940],[3200,2990],[2960,2940],[2770,2790]];
  const reef = [[2320,3530],[2510,3420],[2690,3530],[2670,3740],[2460,3830],[2290,3700]];
  const ridges = [
    rect(2800,550,3600,900), rect(2650,1300,3750,1560),
    rect(1120,650,1920,1220), rect(4480,650,5280,1220),
    rect(430,2660,1170,3360), rect(5230,2660,5970,3360)
  ];
  const port = { x:1560, y:2450, angle:0, approach:{x:1910,y:2450} };
  const beaches = [rect(1500,2820,1740,3170), rect(2630,2500,2910,2780)];
  const roads = [
    [[470,2140],[1080,1830],[1660,1540],[2090,1110],[3200,1090]],
    [[1660,1540],[1560,2450]],
    [[2090,1110],[2120,440],[2600,360],[3200,360]],
    [[2820,2620],[3200,2590]]
  ];
  const resourcePairs = [
    ['cache',1040,1990], ['salvage',1730,1370], ['depot',2350,1030], ['depot',3020,2640]
  ];
  return {
    name: '山海会战', sector: '大型海陆空战区', fixedScale: true, combinedArms: true, naval: true,
    world: { width, height, cell:40, fog:80 }, ore: [], bridges: [],
    water: rect(0, 0, width, height),
    islands: [
      { name:'北部大陆', points:mainland },
      { name:'中部港岛', points:centralIsland },
      { name:'西南礁岛', points:reef },
      { name:'东南礁岛', points:reef.map(mirrorPoint) }
    ],
    ridges, barriers:ridges, noBuild:ridges,
    cover:[rect(1960,730,2260,1010),rect(4140,730,4440,1010)],
    roads:roads.flatMap(bothSides),
    beaches:[...beaches,...beaches.map(mirrorRect)],
    landingApproaches:[{x:1700,y:3010},{x:4700,y:3010}],
    navalObjectives:[{x:2670,y:2110},{x:3730,y:2110}],
    scouts:[{x:2810,y:1090},{x:3590,y:1090}],
    harbors:[port,{x:width-port.x,y:port.y,angle:Math.PI,approach:{x:width-port.approach.x,y:port.approach.y}}],
    dockZones:[rect(1480,2340,1610,2560),rect(4790,2340,4920,2560)],
    seaEntries:[{x:1920,y:4170},{x:4480,y:4170}],
    startingCredits: 3400, controlGoal: 600,
    beacons:[
      {id:'combined-pass',name:'北部山口',x:3200,y:360},
      {id:'combined-valley',name:'中部谷道',x:3200,y:1090},
      {id:'combined-island',name:'港岛信标',x:3200,y:2590}
    ],
    oil:[{id:'oil-combined-west',x:1420,y:1960},{id:'oil-combined-east',x:4980,y:1960}],
    resources:resourcePairs.flatMap(([type,x,y],i)=>bothSides([[x,y]]).map(([[px,py]],side)=>({id:`combined-${i}-${side}`,type,x:px,y:py})))
  };
}
