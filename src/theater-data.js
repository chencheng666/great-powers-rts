const baseForce = (x,y) => [['tank',x+260,y-80],['tank',x+260,y+90],['rifle',x+180,y-200],['rifle',x+180,y+210],
  ['aa',x+80,y-90],['supply',x+60,y+120],['engineer',x+160,y],['engineer',x+100,y+200]];
const node = (name,type,x,y,health=.45,owner=1) => ({name,type,x,y,health,owner});
const wave = (at,x,y,units,goal) => ({at,x,y,units,goal});

export const THEATER_CHALLENGES = {
  deepblue: {name:'深蓝生命线',mapId:'deepblue',limit:660,budget:2200,targetType:'hq',targetName:'保障指挥中心',earliestWin:120,freight:true,
    briefing:'护送货船穿越独立远海群岛，累计交付 2700 物资。外海与近岸两条航路绕开中部岛礁；下一班航道和接收港可在海运面板调整。最多五批，至少保住一港与指挥中心。',
    base:{x:520,y:2630},camera:{x:1980,y:1700},objective:{x:1220,y:1000,radius:250},docks:[{x:1220,y:1000},{x:1210,y:2380}],
    force:[['destroyer',1760,1650],['destroyer',2040,2450],['frigate',1850,1000],['patrol',2200,1250],['patrol',2600,2450],['supply',820,2600]],
    waves:[wave(50,3700,2000,['patrol','patrol'],{x:1900,y:2300}),wave(130,3600,850,['frigate'],{x:1900,y:1050}),wave(230,3700,2600,['destroyer'],{x:1700,y:2250})]},
  seabreach: {name:'海峡风云',mapId:'seabreach',limit:900,budget:3000,targetType:'hq',targetName:'西岸指挥中心',earliestWin:120,freight:true,operation:'seabreach',
    briefing:'登陆东岸沙滩，工程师接管并修复前哨电站与整备厂（至少 60% 完好度）。保护前线港接收两批物资，再接管纵深通信枢纽并守住 25 秒。前哨失守或损毁会暂停任务，修复后可继续；工程师可以重复作业。',
    base:{x:550,y:1770},camera:{x:2150,y:1850},objective:{x:3930,y:1350,radius:260},docks:[{x:2750,y:2200},{x:1120,y:2470}],
    cargo:['tank','supply','engineer','engineer','rifle','rifle'],
    force:[['landing',1510,1840],['tank',930,1700],['supply',890,1800],['engineer',940,1850],['engineer',980,1900],['rifle',990,1960],['rifle',920,2010],['destroyer',1790,1750],['frigate',1940,2150]],
    facilities:[node('滩头电站','power',3010,1940),node('前哨整备厂','factory',3180,1770),node('纵深通信枢纽','radar',3930,1350)],
    waves:[wave(100,3520,2220,['rifle','rifle'],{x:3010,y:1940}),wave(220,3900,2500,['tank','rifle'],{x:3180,y:1770}),wave(350,4400,1100,['tank','aa'],{x:3930,y:1350})]},
  farshore: {name:'远东 · 寒境守望',mapId:'farshore',limit:660,budget:2400,targetType:'apc',targetName:'物资运输车',earliestWin:60,operation:'convoy',
    briefing:'护送任务运输车穿过寒区山口到达不冻港。工程师先接管并把两个整备节点修到 75%；北侧公路较短，南侧河谷可绕过首轮拦截。运输车抵港并停稳 15 秒完成任务，途中可撤回工厂整备，天气不改变命中率。',
    base:{x:430,y:1700},camera:{x:1100,y:1650},objective:{x:3920,y:1810,radius:170},docks:[{x:4100,y:1810}],extraBuildings:[['power',430,1990]],
    force:[['apc',740,1700],...baseForce(650,1700)],
    facilities:[node('山前补给站','factory',1260,1560),node('滨海中转站','factory',2640,1810)],
    waves:[wave(45,2200,800,['tank','rifle'],{x:1330,y:1010}),wave(125,2390,2500,['rifle','rifle','drone'],{x:2050,y:2280}),wave(225,3500,1500,['tank','aa'],{x:3000,y:1820})]},
  passwatch: {name:'山口防线',mapId:'passwatch',limit:360,budget:2000,targetType:'radar',targetName:'后方通信枢纽',earliestWin:220,operation:'defense',fixedForce:true,
    briefing:'以固定编队守住通信枢纽，撑过四轮预警突击。北山口与南河谷均可通行；受损部队回西侧整备厂轮换。第 110 秒仅有一次友方增援。波次全部结束后清除来袭部队，不能无限生产。',
    base:{x:420,y:1330},camera:{x:1510,y:1300},objective:{x:1000,y:1330,radius:200},
    force:[...baseForce(600,1300),['rocket',680,1450],['tank',1140,760],['tank',1140,1830]],facilities:[],
    reinforcement:{at:110,x:520,y:1180,units:['tank','rifle','supply']},
    waves:[wave(25,2550,760,['tank','rifle','rifle'],{x:1000,y:1330}),wave(80,2600,1830,['tank','drone','drone'],{x:1000,y:1330}),wave(145,2500,760,['tank','tank','rifle'],{x:1000,y:1330}),wave(220,2480,1830,['rocket','tank','rifle'],{x:1000,y:1330})]},
  homebound: {name:'归航行动',mapId:'homebound',limit:720,budget:2600,targetType:'hq',targetName:'救援指挥中心',earliestWin:70,operation:'evacuation',
    briefing:'保护港区集结人员，使用登陆舰分批送往东南安全出口。四批人员每批三人，至少撤离三批；靠近集结区并保持安全 6 秒自动登舰，出口安全停驻 5 秒后结算。运力可重复使用，重复上下船不重复计数；人员和舰船损失计入任务。安全区电台损坏时可用工程师修复。',
    base:{x:480,y:2260},camera:{x:2350,y:1900},objective:{x:3340,y:2640,radius:240},docks:[{x:2370,y:1690}],extraBuildings:[['power',480,2520]],
    collection:{x:2380,y:1900,radius:300},
    force:[...baseForce(1200,1900),['landing',2740,1930],['landing',2820,2260],['destroyer',3020,1830],['frigate',3210,2210]],
    facilities:[node('安全区接应电台','radar',3650,2600,1,0)],
    waves:[wave(60,1820,1040,['rifle','rifle'],{x:2350,y:1900}),wave(150,1730,2600,['tank','rifle'],{x:2350,y:1900}),wave(230,3600,1400,['patrol','patrol'],{x:3020,y:2250}),wave(320,2020,1050,['tank','drone'],{x:2350,y:1900})]},
  ironworks: {name:'钢铁走廊',mapId:'ironworks',limit:660,budget:2200,targetType:'hq',targetName:'工业接管指挥中心',earliestWin:80,operation:'industry',
    briefing:'接管电站、铁路货场和两座加工厂。工程师可持续付费修复，完整度决定产出；电站、货场中断或厂区被争夺时停产。每厂最多产出 1600，累计恢复 2400 工业产值后完成任务。反复易主和修复不会刷新配额，铁路不提供额外隐藏收入。',
    base:{x:430,y:1440},camera:{x:1820,y:1450},objective:{x:2750,y:1440,radius:250},force:baseForce(580,1440),
    facilities:[node('能源总变电站','power',1180,1240),node('铁路货运站','radar',2070,1700),node('北加工厂','factory',2670,1180),node('南加工厂','armory',3170,1990)],
    waves:[wave(75,3350,1250,['tank','rifle'],{x:2670,y:1180}),wave(160,3740,2170,['tank','rifle'],{x:3170,y:1990}),wave(250,2440,420,['drone','drone','rifle'],{x:2070,y:1700}),wave(360,3760,1440,['rocket','tank'],{x:2670,y:1180})]},
  sentinel: {name:'战略警戒',mapId:'sentinel',limit:420,budget:3200,targetType:'hq',targetName:'战略保障指挥中心',earliestWin:240,operation:'sentinel',
    briefing:'纯常规保护任务，核规则关闭。接管并修复三个分散预警节点，保持至少两个节点联网，累计预警值达到 180。目标设施受袭或断电会暂停积累；最后一轮威胁解除后完成任务。反导车负责拦截，防空与装甲负责保护，不必摧毁地图上的所有建筑。',
    base:{x:650,y:2080},camera:{x:2350,y:2070},objective:{x:2700,y:2080,radius:300},extraBuildings:[['power',650,2340]],
    force:[...baseForce(1100,2080),['abm',1850,2070],['counterIntel',1600,2160],['aa',2350,1350],['tank',2320,2700]],
    facilities:[node('北侧预警站','radar',2140,1260),node('中央链路站','radar',2700,2080),node('南侧预警站','radar',2140,2900)],
    waves:[wave(65,3400,1250,['drone','drone'],{x:2140,y:1260}),wave(135,3540,2800,['tank','rifle'],{x:2140,y:2900}),wave(215,3760,2100,['ballistic','tank','drone'],{x:2700,y:2080})]},
  moonsea: {name:'明日 · 月海基地',mapId:'moonsea',limit:720,budget:2600,targetType:'hq',targetName:'月海核心舱',earliestWin:80,operation:'moon',
    briefing:'工程机器人恢复太阳能阵列与通信中继，采矿车在月表就地取材。节点间距不超过 1300，完好度至少 60% 才能接通；储能不足会暂停远端链路，不封锁基本指令。累计交付 1800 矿物，并保持全网和不少于 120 储能持续 30 秒。常规坦克仍消耗弹药。',
    base:{x:430,y:1600},camera:{x:1500,y:1620},objective:{x:2500,y:1460,radius:250},extraBuildings:[['refinery',650,1760]],
    force:[...baseForce(650,1600),['harvester',800,1480],['harvester',890,1790],['relay',1050,1590]],
    facilities:[node('西侧太阳能阵列','power',1570,1510),node('月海通信中继','radar',2510,1460),node('东侧太阳能阵列','power',3580,1520)],
    waves:[wave(80,2620,1020,['rifle','rifle'],{x:1570,y:1510}),wave(190,3560,2800,['tank','rifle'],{x:2510,y:1460}),wave(320,3890,1100,['drone','drone','rifle'],{x:3580,y:1520})]}
};

export const THEATER_RULES = Object.freeze({ capture:6, repairRate:30, repairCost:.25, functional:.6, contestRadius:190, industryCap:1600, industryGoal:2400, storage:300, linkRange:1300 });

export const ISLAND_AUXILIARY = {
  name:'侧翼设施',operation:'island-support',limit:600,waves:[],objective:{x:1100,y:580},
  briefing:'北侧机场修复到 60% 且通电后，提供一次战斗机增援和后续整备；东南雷达扩展侦察。两处均需登陆接管，可选择先完成主岛任务。',
  facilities:[node('北岛机场','airfield',1100,580),node('东南观察站','radar',3940,2660)]
};
