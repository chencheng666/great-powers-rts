// 数值均为游戏尺度，不对应现实武器射程、载荷或拦截能力。
export const STRATEGIC_UNITS = {
  helicopter: { name:'反装甲武装直升机', cost:880, time:32, hp:250, speed:125, range:255, damage:46, cooldown:1.7, sight:400, ammo:6, ammoCost:16, rearmTime:14, producer:'airfield', requires:'radar', map:'modern', tags:['air','rotorcraft'], icon:'plane', desc:'低空越障，有限反装甲导弹；不能攻击飞行战机。防空车、制空机可反制，返机场付费整备。' },
  ballistic: { name:'常规战术弹道发射车', cost:1650, time:50, hp:290, speed:48, range:1320, minRange:420, damage:230, cooldown:13, sight:260, ammo:2, ammoCost:150, rearmTime:28, deployTime:5, producer:'armory', requires:'lab', map:'modern', tags:['vehicle','artillery'], icon:'rocket', desc:'常规弹头，不是核武器。停驻展开 5 秒，需实时侦察；高弧线打击发射时的位置，不追踪。最小射程 420，专用反导可拦截，突击可猎杀发射车。' },
  abm: { name:'区域反导车', cost:1300, time:42, hp:250, speed:57, range:490, damage:38, cooldown:2.2, sight:350, ammo:4, ammoCost:55, rearmTime:20, producer:'armory', requires:'lab', map:'modern', tags:['vehicle','support'], icon:'shield-check', desc:'原创游戏系统；有电且存活雷达站接入后，拦截可见常规弹道弹，每发消耗一枚拦截弹，通常需两次命中。不能对地或替代防空车。' },
  counterIntel: { name:'机动反侦察站', cost:760, time:30, hp:220, speed:60, range:320, damage:0, cooldown:1, sight:270, producer:'armory', requires:'radar', map:'strategic', tags:['vehicle','support'], icon:'eye-off', desc:'原创游戏抽象：可手动开关；开启、停稳一秒、有电且雷达存活时，320 范围遮蔽敌方卫星侦察；不遮蔽直接视野或已探索地形。选中查看工作状态与范围。' },
  swarmCarrier: { name:'异构蜂群任务母机', cost:1750, time:52, hp:300, speed:145, range:650, damage:0, cooldown:12, sight:470, ammo:2, ammoCost:120, rearmTime:30, producer:'airfield', requires:'lab', map:'strategic', tags:['air','jet','support'], icon:'network', desc:'限同时一架。攻击移动或右键可见敌人，释放侦察、诱饵、攻击各一机；每批消耗一个任务舱，最多六架子机，24 秒后退出。母机无武装，惧制空；蜂群受激光、防空和干扰反制。', limit:1 },
  swarmScout: { name:'蜂群侦察子机', cost:0, time:1, hp:55, speed:138, range:0, damage:0, cooldown:1, sight:490, map:'strategic', tags:['air','drone','scout','swarm'], icon:'scan-eye', desc:'母机释放的无武装临时侦察机，提供直接视野；不可独立生产、出售或补给。' },
  swarmDecoy: { name:'蜂群诱饵子机', cost:0, time:1, hp:40, speed:130, range:0, damage:0, cooldown:1, sight:180, map:'strategic', tags:['air','drone','swarm'], icon:'scan', desc:'母机释放的临时诱饵，以真实可击落机体吸引敌方自动防空火力；不伪造敌军情报，不保证敌方优先攻击它。' }
};

export function strategicMap() {
  const mirror = (points, prefix) => points.flatMap(([x,y],i) => [0,1].map(side => ({id:`${prefix}-${i}-${side}`,x:side?6400-x:x,y})));
  const blocks = [{x1:2840,y1:240,x2:3560,y2:1040},{x1:2840,y1:3120,x2:3560,y2:3920}];
  const cover = [{x1:1460,y1:740,x2:1940,y2:1040},{x1:1820,y1:3030,x2:2300,y2:3330},{x1:2580,y1:1640,x2:2880,y2:1940}];
  return {name:'战略纵深',sector:'战区 09 · 常规战略对抗实验', fixedScale:true, strategic:true, economyMode:'convoy',world:{width:6400,height:4160,cell:40,fog:80},ore:[],oil:mirror([[1800,560],[1800,3600]],'oil'),beacons:[{id:'beacon-north',x:3200,y:1280},{id:'beacon-center',x:3200,y:2080},{id:'beacon-south',x:3200,y:2880}],barriers:blocks,noBuild:blocks.map(r=>({x1:r.x1-40,y1:r.y1-40,x2:r.x2+40,y2:r.y2+40})),cover:cover.flatMap(r=>[r,{x1:6400-r.x2,y1:r.y1,x2:6400-r.x1,y2:r.y2}]),bridges:[],water:null,dockZones:[]};
}
