import { recordBattleEvent } from './battle-report.js';
import { supportsDroneAutonomy } from './drone-autonomy.js';
import { UNITS } from './data.js';
import { LIFELINE, lifelineSummary, freightRules } from './maritime-logistics.js';
import { isIslandWatch, updateWatchOperation, watchSummary, WATCH, validWatchState } from './island-watch.js';
import { THEATER_CHALLENGES, ISLAND_AUXILIARY } from './theater-data.js';
import { initTheater, updateTheater, validTheaterState } from './theater-operations.js';

export const CHALLENGES = {
  ...THEATER_CHALLENGES,
  islandwatch: { name:'列岛守望',mapId:'islandwatch',limit:600,budget:1800,targetType:'hq',targetName:'后方指挥中心',earliestWin:80,freight:true,
    briefing:'护送满载登陆舰前往守望主岛西侧沙滩，停驻后按 U 分批卸载。工程师接管通信、能源与港务三个节点（每站 6 秒，可重复使用），链路接通后护送两批海运物资抵港，再守住节点 20 秒。敌军独占节点 12 秒会切断链路，可派工程师夺回。保住指挥中心与前线港，无需全歼敌军。',
    base:{x:520,y:2540},camera:{x:1590,y:2060},objective:{x:2380,y:1640,radius:430},docks:[{x:2200,y:1720}],
    cargo:['tank','supply','engineer','engineer','rifle','rifle'],
    force:[['landing',1360,2480],['tank',850,2400],['supply',800,2500],['engineer',850,2570],['engineer',900,2610],['rifle',900,2700],['rifle',820,2680],['destroyer',1560,2190],['frigate',1660,1890],['patrol',1790,2360]],
    waves:[{at:65,x:2760,y:1330,units:['rifle','rifle'],goal:{x:2320,y:1470}},{at:135,x:2880,y:1860,units:['tank','rifle'],goal:{x:2260,y:1790}},{at:205,x:2800,y:1250,units:['rifle','rifle'],goal:{x:2600,y:1560}},{at:240,x:1600,y:1120,units:['patrol'],goal:{x:1850,y:1660}}]
  },
  lifeline: { name: '深蓝生命线 · 试航', mapId: 'archipelago', limit: 420, budget: 1200, targetType: 'hq', targetName: '后方指挥中心', earliestWin: 100, freight: true,
    briefing: '护送集装箱船抵港，累计完成 2700 海运物资。每批 900，最多派出 5 批；首船损失不会立即失败。可选择下一班航道、暂停派船或改派友港。舰艇可返港付费维修补弹；至少保住一个接收港和指挥中心，无需全歼敌军。',
    objective: { x: 950, y: 900, radius: 200 }, camera: { x: 1500, y: 1030 }, docks: [{ x: 950, y: 900 }, { x: 950, y: 1600 }],
    force: [['destroyer',1350,1120],['frigate',1460,800],['frigate',1450,1550],['patrol',1650,500],['patrol',1800,1250],['supply',750,1200]],
    waves: [{ at: 25, x: 2320, y: 760, units: ['patrol','patrol'], goal: { x: 1450, y: 900 } }, { at: 85, x: 2300, y: 1480, units: ['frigate'], goal: { x: 1380, y: 1500 } }, { at: 110, x: 2250, y: 520, units: ['patrol','patrol'], goal: { x: 1430, y: 900 } }]
  },
  corridor: { name: '补给走廊', mapId: 'valley', limit: 150, budget: 1400, targetType: 'apc', targetName: '任务运输车',
    briefing: '护送任务运输车抵达东侧撤离区。接应在第 45 秒开放，附近 220 范围内不得有敌军，运输车损失即失败。',
    objective: { x: 1570, y: 1030, radius: 100 },
    force: [['apc',620,1030],['tank',760,940],['tank',760,1110],['rifle',680,870],['rifle',720,850],['rifle',670,1190],['aa',570,1120],['supply',530,960]],
    waves: [{ at: 3, x: 1200, y: 1040, units: ['rifle','rifle','tank'] }, { at: 18, x: 1550, y: 800, units: ['rifle','drone','drone'] }, { at: 32, x: 1700, y: 1160, units: ['tank','rifle','rifle'] }] },
  airshield: { name: '低空防线', mapId: 'valley', limit: 120, budget: 1600, targetType: 'radar', targetName: '前沿雷达站',
    briefing: '保卫前沿雷达站，撑过三轮空地混合突击并清理来袭部队。防空、激光、干扰与装甲需要相互保护。',
    objective: { x: 930, y: 720, radius: 150 },
    force: [['aa',1010,650],['aa',1010,790],['laser',900,840],['jammer',830,610],['tank',1130,720],['tank',1000,760],['rifle',1080,850],['rifle',1080,590],['supply',790,790]],
    waves: [{ at: 12, x: 1390, y: 720, units: ['drone','drone','drone'] }, { at: 42, x: 1300, y: 470, units: ['tank','rifle','drone','drone'] }, { at: 78, x: 1400, y: 1000, units: ['tank','rifle','rifle','drone','drone','drone'] }] },
  beachhead: { name:'抢滩接力',mapId:'archipelago',limit:240,budget:1600,targetType:'landing',targetName:'任务登陆舰',earliestWin:30,
    briefing:'护送满载登陆舰穿越无桥海峡，在东岸停驻卸载。工程师接管东岸通信站，陆战部队守住据点连续 30 秒；敌军进入警戒圈或守军离开会重新计时。登陆舰或接管前的工程师损失即失败，无需全歼敌军。',
    objective:{x:2650,y:1540,radius:240,siteId:'beacon-east'},camera:{x:1200,y:1250},holdTime:30,dock:{x:960,y:1120},
    cargo:['tank','supply','engineer','rifle','rifle'],
    force:[['landing',1170,1400],['tank',900,1370],['supply',880,1450],['engineer',920,1530],['rifle',930,1600],['rifle',890,1640],['destroyer',1350,1200],['frigate',1390,1620]],
    waves:[{at:12,x:2900,y:1490,units:['rifle','rifle'],goal:{x:2650,y:1540}},{at:35,x:2970,y:1250,units:['tank','rifle'],goal:{x:2650,y:1540}},{at:55,x:2970,y:1840,units:['rifle','rifle','rifle'],goal:{x:2650,y:1540}}] },
  recon: { name:'静默回传',mapId:'strategic',limit:210,budget:1200,targetType:'scout',targetName:'情报侦察员',earliestWin:18,
    briefing:'依次抵近三个观察点，停稳且脱离敌方视野后连续采集 6 秒，再让侦察员返回撤离区。移动、受击或暴露会中断当前点的计时，已完成情报保留。无需全歼敌军，侦察员损失即失败。',
    objective:{x:800,y:2080,radius:130},camera:{x:950,y:2080},scanTime:6,
    nodes:[{name:'北侧通道',x:1700,y:1720,radius:110},{name:'中部补给线',x:2700,y:2140,radius:110},{name:'纵深观测区',x:3900,y:2580,radius:110}],
    force:[['scout',800,2080],['tank',1050,1950],['tank',1060,2210],['rifle',920,1880],['rifle',920,2280],['aa',740,2170],['supply',650,2000]],
    waves:[{at:7,x:1900,y:2040,units:['rifle','rifle'],patrol:{x:2100,y:2340}},{at:28,x:2860,y:1910,units:['tank','rifle'],patrol:{x:2700,y:2470}},{at:60,x:3920,y:2290,units:['rifle','aa'],patrol:{x:4210,y:2740}}] }
};

export function challengeDefinition(game) { return Object.hasOwn(CHALLENGES,game.challenge?.id) ? CHALLENGES[game.challenge.id] : null; }
export function challengeLosses(game) {
  if (challengeDefinition(game)?.operation) return game.battleStats.sides[0].losses + (game.logistics[0].seaControl?.lostBatches.length || 0);
  if (challengeDefinition(game)?.freight) return Math.max(0, game.challenge.initialCount - game.ownedUnits(0).filter(u => !UNITS[u.type].tags.includes('logistics')).length) + game.logistics[0].seaControl.lostBatches.length;
  return game.challenge.id==='beachhead'?game.battleStats.sides[0].losses:Math.max(0,game.challenge.initialCount-game.ownedUnits(0).length);
}
export function beachheadActivity(game) {
  const d=challengeDefinition(game);if(!d?.holdTime)return null;
  if(game.getEntity(d.objective.siteId)?.owner!==0)return 'capture';
  const inside=u=>!u.embarkedIn&&u.hp>0&&Math.hypot(u.x-d.objective.x,u.y-d.objective.y)<=d.objective.radius;
  if(game.ownedUnits(1).some(inside))return 'contested';
  if(!game.ownedUnits(0).some(u=>inside(u)&&UNITS[u.type].damage>0&&!UNITS[u.type].tags.some(t=>['air','ship'].includes(t))))return 'unguarded';
  return 'holding';
}
export const BEACHHEAD_ACTIVITY_LABELS={capture:'等待工程师接管',contested:'敌军进入警戒圈 · 重新计时',unguarded:'缺少陆战守军 · 重新计时',holding:'据点安全 · 驻守计时'};
export const RECON_ACTIVITY_LABELS={complete:'情报齐备 · 等待撤离',transported:'运输中 · 无法采集',stunned:'瘫痪 · 采集暂停',travel:'前往下一观察点',moving:'移动中 · 等待停稳',recovering:'刚受攻击 · 采集暂停',detected:'被敌方发现 · 采集中断',scanning:'静默采集中'};
export function reconActivity(game,target) {
  const d=challengeDefinition(game),intel=game.challenge?.intel;
  if (!d?.nodes || !target || !intel) return null;
  if (intel.completed===d.nodes.length) return 'complete';
  const node=d.nodes[intel.completed];
  if (target.embarkedIn) return 'transported';
  if (target.stunUntil>game.time) return 'stunned';
  if (Math.hypot(target.x-node.x,target.y-node.y)>node.radius) return 'travel';
  if (game.time-(target.lastMovedAt??-10)<.5) return 'moving';
  if (game.time-(target.lastDamageAt??-10)<1) return 'recovering';
  if (game.canSeeEntity(1,target)) return 'detected';
  return 'scanning';
}
export function challengeStatus(game) {
  const d = challengeDefinition(game); if (!d) return null;
  const target = game.getEntity(game.challenge.targetId), next = d.waves[game.challenge.wave];
  const remaining = game.units.filter(u => u.owner === 1 && u.hp > 0).length;
  return { definition: d, target, remaining, nextIn: next ? Math.max(0, Math.ceil(next.at - game.time)) : null,
    activity:d.holdTime?beachheadActivity(game):reconActivity(game,target),seconds: Math.max(0, Math.ceil(d.limit - game.time)), health: target ? Math.ceil(target.hp / target.maxHp * 100) : 0 };
}

export function validChallengeState(state, config, time, entities, sites=[]) {
  if (!state) return config.challengeId === undefined;
  const d = Object.hasOwn(CHALLENGES,state.id) ? CHALLENGES[state.id] : null;
  const intel=state.intel;
  const validIntel=d?.nodes ? intel && Object.keys(intel).length===2 && Number.isInteger(intel.completed) && intel.completed>=0 && intel.completed<=d.nodes.length &&
    Number.isFinite(intel.progress) && intel.progress>=0 && intel.progress<d.scanTime && (intel.completed<d.nodes.length||intel.progress===0) && intel.completed*d.scanTime+intel.progress<=time+.001 : intel===undefined;
  const beachhead=state.beachhead,validBeachhead=d?.holdTime ? beachhead&&Object.keys(beachhead).length===1&&Number.isFinite(beachhead.hold)&&beachhead.hold>=0&&beachhead.hold<d.holdTime&&beachhead.hold<=time+.001&&(beachhead.hold===0||sites.some(s=>s.id===d.objective.siteId&&s.owner===0)) : beachhead===undefined;
  return !!d && config.challengeId === state.id && config.mapId === d.mapId && config.battlefieldScale === 1 && config.difficulty === 'standard' && config.victoryMode === 'annihilation' &&
    validIntel && validBeachhead && validWatchState(state,config,time,entities,sites) && validTheaterState(state,config,time,entities) && (!(d.nodes||d.holdTime) || config.nuclearEnabled===false) &&
    time < d.limit && Number.isInteger(state.wave) && state.wave >= 0 && state.wave <= d.waves.length &&
    d.waves.slice(0,state.wave).every(w => w.at <= time) && (!d.waves[state.wave] || d.waves[state.wave].at > time) &&
    Number.isInteger(state.targetId) && entities.some(e => e.id === state.targetId && e.type === d.targetType && e.owner === 0 && e.hp > 0) &&
    Number.isInteger(state.initialCount) && state.initialCount === d.force.length && state.stars === 0 && state.reason === '';
}

export const challengeCombat = {
  initChallenge(id) {
    const d = Object.hasOwn(CHALLENGES,id) ? CHALLENGES[id] : null; if (!d) return;
    this.units = []; this.buildings = [];
    const baseY=d.base?.y||d.camera?.y||720,baseX=d.base?.x||240;
    this.addBuilding(0,'hq',baseX,baseY); this.addBuilding(0,'power',baseX+120,baseY-140); this.addBuilding(0,'factory',baseX+160,baseY+90);
    if(d.nodes||d.operation)this.addBuilding(0,'barracks',baseX+40,baseY-280);
    for(const [type,x,y] of d.extraBuildings||[])this.addBuilding(0,type,x,y);
    if(d.dock)this.addBuilding(0,'dock',d.dock.x,d.dock.y);
    if(d.docks)for(const point of d.docks)this.addBuilding(0,'dock',point.x,point.y);
    let target;
    for (const [type,x,y] of d.force) { const u = this.addUnit(0,type,x,y); if (type === d.targetType && !target) target = u; }
    if (d.targetType === 'radar') target = this.addBuilding(0,'radar',d.objective.x,d.objective.y);
    if (d.targetType === 'hq') target = this.ownedBuildings(0, 'hq')[0];
    if(d.cargo)for(const type of d.cargo){
      const u=this.ownedUnits(0).find(u=>u.type===type&&!u.embarkedIn);
      const transport=d.targetType==='landing'?target:this.ownedUnits(0,'landing')[0];
      if(u&&this.canBoardTransport(u,transport)){transport.passengers.push(u.id);u.embarkedIn=transport.id;u.x=transport.x;u.y=transport.y;}
    }
    this.players.forEach(p => { p.credits = p.side === 0 ? d.budget : 0; p.unitCount = this.ownedUnits(p.side).length; });
    this.resourceSites.forEach(site=>{site.amount=0;});
    this.challenge = { id, targetId: target.id, wave: 0, initialCount: d.force.length, stars: 0, reason: '' };
    initTheater(this,id==='islandwatch'?ISLAND_AUXILIARY:d);
    if(id==='islandwatch')this.challenge.watch={hold:0,raids:[0,0,0]};
    if (d.freight) {
      this.logistics[0].seaControl = { paused: false, lane: 'coastal', homeId: this.ownedBuildings(0,'dock')[0].id, dispatched: 0, airDispatched: 0, recoverySpent: 0, receipts: [], lostBatches: [] };
      this.logistics[0].nextSea = 3; this.logistics[0].nextAir = 30;
    }
    if(d.nodes)this.challenge.intel={completed:0,progress:0};
    if(d.holdTime)this.challenge.beachhead={hold:0};
    recordBattleEvent(this,{kind:'challengeStart',owner:0,type:id});
    this.selected = this.ownedUnits(0).filter(u=>!u.embarkedIn).map(u=>u.id);
    this.events.notice?.(`${d.name}：${d.briefing}`);
  },
  updateChallenge(dt=0) {
    const d = challengeDefinition(this); if (!d || !this.running || this.paused) return;
    const target = this.getEntity(this.challenge.targetId);
    const finish = (win,reason) => {
      this.challenge.reason = reason;
      this.challenge.stars = win ? 1 + Number(target.hp / target.maxHp >= .7) + Number(challengeLosses(this)<=1) : 0;
      recordBattleEvent(this,{kind:win?'challengeWon':'challengeLost',owner:0,type:this.challenge.id}); this.endGame(win?0:1);
    };
    // 同帧目标被毁优先判负，不把抵达坐标或清场误判为胜利。
    if (!target || target.hp <= 0) { finish(false,`${d.targetName}被摧毁`); return; }
    if (this.time >= d.limit) { finish(false,'任务时限已到'); return; }
    if (d.freight) {
      const rules=freightRules(this);
      const s = lifelineSummary(this);
      if (!s.ports.length) { finish(false,'接收港全部损失，海运通道中断'); return; }
      if (!isIslandWatch(this) && !d.operation && s.delivered >= rules.goal) { finish(true,'海运物资交付达标，港口与指挥中心存续'); return; }
      if ((rules.batches - s.control.lostBatches.length) * 900 < rules.goal) { finish(false,'运输损失超过补发额度，无法完成交付'); return; }
      if(isIslandWatch(this)){
        const watch=watchSummary(this);
        if(watch.captured<3&&!this.ownedUnits(0,'engineer').length){finish(false,'工程师全部损失，无法恢复节点链路');return;}
        updateWatchOperation(this,Math.max(0,Math.min(.05,dt)));
        if(this.challenge.watch.hold>=WATCH.hold-1e-9){finish(true,'登陆据点、能源链路与两批海运补给全部保障完成');return;}
      }
    }
    if(d.holdTime&&this.getEntity(d.objective.siteId)?.owner!==0&&!this.ownedUnits(0,'engineer').length){finish(false,'工程师损失，无法接管通信站');return;}
    while (this.challenge.wave < d.waves.length && this.time >= d.waves[this.challenge.wave].at) {
      const index = this.challenge.wave++, wave = d.waves[index];
      wave.units.forEach((type,i) => {
        const u=this.addUnit(1,type,wave.x+(i%3)*55,wave.y+Math.floor(i/3)*60);
        if(supportsDroneAutonomy(u))u.autoDrone=false;
        u.order=wave.patrol?{type:'patrol',x:wave.patrol.x+(i%3)*55,y:wave.patrol.y+Math.floor(i/3)*60,originX:u.x,originY:u.y,destinationX:wave.patrol.x+(i%3)*55,destinationY:wave.patrol.y+Math.floor(i/3)*60}:{type:'attackMove',x:wave.goal?.x??target.x,y:wave.goal?.y??target.y};
      });
      recordBattleEvent(this,{kind:'challengeWave',owner:1,type:this.challenge.id,value:index+1});
      this.events.notice?.(d.nodes?'侦察区有巡逻活动，请留意视野与撤离线路':`第 ${index+1} / ${d.waves.length} 波突击已抵达`);
    }
    const result=updateTheater(this,Math.max(0,Math.min(.05,dt)));
    if(result){finish(result.win,result.reason);return;}
    if(d.holdTime){
      const progress=this.challenge.beachhead;
      progress.hold=beachheadActivity(this)==='holding'?Math.min(d.holdTime,progress.hold+Math.max(0,Math.min(.05,dt))):0;
      if(progress.hold>=d.holdTime-1e-9){finish(true,'东岸通信站已接管，登陆部队完成驻守');return;}
    }
    if(d.nodes){
      const intel=this.challenge.intel,activity=reconActivity(this,target);
      if(activity==='scanning'){
        intel.progress=Math.min(d.scanTime,intel.progress+Math.max(0,Math.min(.05,dt)));
        if(intel.progress>=d.scanTime-1e-9){
          intel.completed++;intel.progress=0;
          recordBattleEvent(this,{kind:'challengeIntel',owner:0,type:this.challenge.id,value:intel.completed});
          this.events.notice?.(`情报 ${intel.completed} / ${d.nodes.length} 已记录${intel.completed===d.nodes.length?'，请让侦察员安全撤离':''}`);
        }
      }else intel.progress=0;
      if(intel.completed===d.nodes.length&&!target.embarkedIn&&Math.hypot(target.x-d.objective.x,target.y-d.objective.y)<=d.objective.radius&&!this.canSeeEntity(1,target)){finish(true,'全部情报已带回，侦察员安全撤离');return;}
    }
    if (this.challenge.id === 'corridor' && this.time >= 45 && Math.hypot(target.x-d.objective.x,target.y-d.objective.y) <= d.objective.radius && !this.ownedUnits(1).some(u=>Math.hypot(u.x-d.objective.x,u.y-d.objective.y)<220)) { finish(true,'运输车安全抵达，撤离区已肃清'); return; }
    if (this.challenge.id === 'airshield' && this.challenge.wave === d.waves.length && this.ownedUnits(1).length === 0) { finish(true,'雷达站存续，全部来袭部队已清除'); return; }
  }
};
