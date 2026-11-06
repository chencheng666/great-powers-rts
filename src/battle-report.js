import { UNITS, BUILDINGS } from './data.js';
import { createLossBreakdown,recordUnitLoss,validateLossBreakdown,copyLossBreakdown,lossBreakdownHTML } from './loss-breakdown.js';
import { THEATER_CHALLENGES } from './theater-data.js';

export const REPORT_FIELDS = ['damageDealt', 'damageTaken', 'kills', 'losses', 'buildingsDestroyed', 'buildingsLost', 'unitsProduced', 'repairHP', 'resupplies', 'oilSeconds', 'beaconSeconds'];
export const REPORT_EVENT_LIMIT = 96;
const OPTIONAL_METRICS = ['portRepairCost','portAmmoCost','industrialIncome','evacuated','mineralDelivery'];
const missionNames = { corridor: '补给走廊', airshield: '低空防线',recon:'静默回传',beachhead:'抢滩接力',lifeline:'深蓝生命线',islandwatch:'列岛守望' };
Object.assign(missionNames,Object.fromEntries(Object.entries(THEATER_CHALLENGES).map(([id,d])=>[id,d.name])));
const theaterEvents = {facilityCaptured:'设施已接管',facilityRestored:'设施已恢复运作',theaterReinforced:'预定增援抵达',theaterStage:'战区阶段变更',evacuated:'人员安全撤离'};
const resourceNames = { oil:'油井',beacon:'雷达信标',depot:'补给仓库' };
export function recordBattleEvent(game,event) {
  if (!game.running || !game.battleStats) return;
  game.battleStats.events.push({ ...event, time: game.time });
  const overflow = Math.max(0,game.battleStats.events.length - REPORT_EVENT_LIMIT);
  game.battleStats.omittedEvents = (game.battleStats.omittedEvents || 0) + overflow;
  if (overflow) game.battleStats.events.splice(0,overflow);
}
export function createBattleStats(since = 0,count = 2) {
  return { since, complete: since === 0, sides: Array.from({length:count},() => Object.fromEntries([...REPORT_FIELDS,...OPTIONAL_METRICS].map(key => [key, 0]))), events: [],unitLosses:createLossBreakdown(since,count) };
}
export function battleMetric(game, side, key, amount) {
  if (game.running && game.battleStats?.sides[side] && Number.isFinite(amount) && amount > 0) game.battleStats.sides[side][key] = (game.battleStats.sides[side][key] || 0) + amount;
}
export function recordBattleDamage(game, target, amount, attacker) {
  const actual = Math.min(target.hp, amount);
  battleMetric(game, target.owner, 'damageTaken', actual);
  if (Number.isInteger(attacker) && attacker !== target.owner) battleMetric(game, attacker, 'damageDealt', actual);
  if (amount < target.hp || !game.battleStats || !game.running) return;
  const building = target.kind === 'building';
  if (!building) recordUnitLoss(game,target);
  battleMetric(game, target.owner, building ? 'buildingsLost' : 'losses', 1);
  if (Number.isInteger(attacker) && attacker !== target.owner) battleMetric(game, attacker, building ? 'buildingsDestroyed' : 'kills', 1);
  recordBattleEvent(game,{ owner: target.owner, type: target.type, kind: building ? 'buildingLost' : 'unitLost' });
}
export function battleReport(game) {
  if (game.online) return game.battleReport || null;
  if (!game.battleStats) return null;
  return { since: game.battleStats.since, complete: game.battleStats.complete, omittedEvents:game.battleStats.omittedEvents||0,unitLosses:copyLossBreakdown(game.battleStats.unitLosses),sides: game.battleStats.sides.map((side, i) => ({ ...side, delivered: game.logistics?.[i]?.delivered || 0, intercepted: game.logistics?.[i]?.lost || 0 })), events: game.battleStats.events.map(e=>({...e})) };
}
export function validateBattleStats(stats, time,count=2) {
  return stats && Number.isFinite(stats.since) && stats.since >= 0 && stats.since <= time && typeof stats.complete === 'boolean' &&
    Array.isArray(stats.sides) && stats.sides.length === count && stats.sides.every(side => REPORT_FIELDS.every(key => Number.isFinite(side[key]) && side[key] >= 0) && OPTIONAL_METRICS.every(key => side[key] === undefined || Number.isFinite(side[key]) && side[key] >= 0)) &&
    (stats.omittedEvents===undefined||Number.isSafeInteger(stats.omittedEvents)&&stats.omittedEvents>=0) &&
    (stats.unitLosses===undefined||validateLossBreakdown(stats.unitLosses,stats.since,time,count)) &&
    Array.isArray(stats.events) && stats.events.length <= REPORT_EVENT_LIMIT && stats.events.every(e => Number.isFinite(e.time) && e.time >= stats.since && e.time <= time && Number.isInteger(e.owner)&&e.owner>=0&&e.owner<count &&
      (e.value===undefined||Number.isFinite(e.value)&&e.value>=0&&e.value<=1e7) &&
      (e.kind === 'unitLost' ? Object.hasOwn(UNITS, e.type) : e.kind === 'buildingLost' ? Object.hasOwn(BUILDINGS, e.type) : Object.hasOwn(theaterEvents,e.kind) ? Object.hasOwn(missionNames,e.type)&&Number.isInteger(e.value) : e.kind==='challengeIntel' ? e.type==='recon'&&Number.isInteger(e.value)&&e.value>=1&&e.value<=3 : ['challengeStart','challengeWave','challengeWon','challengeLost'].includes(e.kind) ? Object.hasOwn(missionNames,e.type) : e.kind==='captured' ? Object.hasOwn(resourceNames,e.type) : ['delivered','intercepted'].includes(e.kind)&&['freightPlane','containerShip'].includes(e.type)));
}
const category = kind => ['unitLost','buildingLost'].includes(kind) ? 'loss' : ['captured','delivered','intercepted'].includes(kind) ? 'resource' : 'mission';
export function reportEventLabel(event) {
  const side=event.owner===0?'我方':`敌方${event.owner>1?' '+event.owner:''}`;
  if (event.kind==='unitLost'||event.kind==='buildingLost') return `${side} ${(UNITS[event.type]||BUILDINGS[event.type])?.name||'单位'}损失`;
  if (event.kind==='captured') return `${side}占领${resourceNames[event.type]||'据点'}`;
  if (event.kind==='delivered'||event.kind==='intercepted') return `${side}${event.kind==='delivered'?'物资交付':'运输损失'} · ${Math.round(event.value||0)} 资金`;
  if(event.kind==='challengeIntel')return `静默回传 · 第 ${event.value} 处情报已记录`;
  if(Object.hasOwn(theaterEvents,event.kind))return `${missionNames[event.type]} · ${theaterEvents[event.kind]}（${event.value}）`;
  return `${missionNames[event.type]||'任务'} · ${{challengeStart:'任务开始',challengeWave:`第 ${Math.round(event.value||0)} 波突击`,challengeWon:'任务完成',challengeLost:'任务失败'}[event.kind]||'事件'}`;
}
export function battleSuggestions(game, report = battleReport(game)) {
  const own = report?.sides?.[0];
  if (!own) return [];
  const suggestions = [];
  if (own.intercepted > 0 && own.intercepted > own.delivered * .25) {
    suggestions.push({ title: '保护补给线', detail: `本局运输损失 ${Math.round(own.intercepted)} 资金。下次把防空与护航舰放在运输线上，海运可换航道或暂缓派船。` });
  }
  if (own.losses > 0 && own.losses > own.kills && own.resupplies < 2) {
    suggestions.push({ title: '把受损部队带回来', detail: `本局战损 ${own.losses} 个单位、完成整备 ${own.resupplies || 0} 次。陆军靠近补给车，飞机与舰艇按 R 返场；分批轮换比持续补造更省资金。` });
  }
  if (!game.challenge && game.time > 180 && own.oilSeconds + own.beaconSeconds < 60) {
    suggestions.push({ title: '给工程师一个任务', detail: '本局油井与信标合计控制不足一分钟。派工程师和护卫接管据点，再根据据点位置安排防守。' });
  }
  if (!game.challenge && game.time > 180 && own.unitsProduced < 3) {
    suggestions.push({ title: '保持生产与供电', detail: '本局新造部队少于三支。右侧可查看队列与倒计时，电力不足会拖慢生产；先用已有部队保护基地和运输线。' });
  }
  if (game.challenge && game.winner !== 0) {
    suggestions.unshift({ title: '先看本关任务', detail: CHALLENGE_REVIEW[game.challenge.id] || '重新查看任务说明和目标完整度；保护指定目标，按任务阶段推进。' });
  }
  if (!suggestions.length) {
    suggestions.push({ title: '下一场换一种打法', detail: '可以比较不同阵营的反制单位，或在战术挑战的作战路线中练习护送、防空和登陆。通关后再尝试提高星级。' });
  }
  return suggestions.slice(0, 3);
}

const CHALLENGE_REVIEW = {
  corridor: '任务运输车抵达撤离区后，还需要等接应开放并清理附近敌军。先保护运输车，再让装甲和防空开路。',
  airshield: '防空单位需要装甲保护。撑过三波突击后清理剩余来袭部队，重伤单位轮换靠近补给车。',
  beachhead: '登陆后按 U 卸载，再让工程师接管通信站。驻守期间留下陆战守军并清理进入警戒圈的敌人。',
  lifeline: '至少保住一个港口。首船损失后仍可调整航道和接收港，保护剩余批次完成海运交付。',
  recon: '侦察员在观察点停稳并脱离敌方视野后才会采集。移动或暴露会中断计时，已完成的情报保留。'
};

export function battleReportHTML(game) {
  const report = battleReport(game); if (!report) return '';
  const rows = [['击毁部队', 'kills'], ['战损部队', 'losses'], ['摧毁建筑', 'buildingsDestroyed'], ['建筑损失', 'buildingsLost'], ['有效伤害', 'damageDealt'], ['承受伤害', 'damageTaken'], ['新造部队', 'unitsProduced'], ['修复生命', 'repairHP'], ['完成整备', 'resupplies'], ['物资交付', 'delivered'], ['运输损失', 'intercepted'], ['油井控制·分钟', 'oilSeconds'], ['信标控制·分钟', 'beaconSeconds']];
  rows.push(['港口维修支出','portRepairCost'],['舰艇补弹支出','portAmmoCost']);
  if(game.challenge?.operation)rows.push(['工业交付','industrialIncome'],['安全撤离人数','evacuated'],['矿物交付','mineralDelivery']);
  const value = (side, key) => key.endsWith('Seconds') ? ((side[key] || 0) / 60).toFixed(1) : Math.round(side[key] || 0).toLocaleString('zh-CN');
  const own = report.sides[0];
  const advice = battleSuggestions(game, report).map(item => `<li><strong>${item.title}</strong><p>${item.detail}</p></li>`).join('');
  const events = report.events.map(e => `<li data-event-kind="${category(e.kind)}"><time>${Math.floor(e.time / 60).toString().padStart(2, '0')}:${Math.floor(e.time % 60).toString().padStart(2, '0')}</time><span>${reportEventLabel(e)}</span></li>`).join('');
  const table = `<div class="report-table-scroll"><table><thead><tr><th>作战指标</th>${report.sides.map((_,i)=>`<th>${i===0?'我方':report.sides.length===2?'对手':`对手 ${i}`}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, key]) => `<tr><th>${label}</th>${report.sides.map(side=>`<td>${value(side,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const overview = [['击毁 / 战损',`${value(own,'kills')} / ${value(own,'losses')}`],['有效伤害',value(own,'damageDealt')],['修复生命',value(own,'repairHP')],['物资交付',value(own,'delivered')]].map(([label,number])=>`<div><small>${label}</small><strong>${number}</strong></div>`).join('');
  return `<section class="battle-report"><h3>战后复盘</h3>${report.complete ? '' : '<p class="report-note">旧存档仅统计本次读档后的战斗，前段数据未计入。</p>'}<div class="report-overview">${overview}</div><section class="battle-suggestions"><h4>下次可以试试</h4><ul>${advice}</ul></section><details open><summary>关键事件时间线 · ${report.events.length} 条</summary><div class="report-filters" role="group" aria-label="复盘事件筛选">${[['all','全部'],['loss','战损'],['resource','资源'],['mission','任务']].map(([key,name])=>`<button type="button" data-report-filter="${key}" aria-pressed="${key==='all'}">${name}</button>`).join('')}</div><p class="report-note">${report.omittedEvents?`较早的 ${report.omittedEvents} 条事件已省略，保留最近 ${REPORT_EVENT_LIMIT} 条。`:'记录关键战损、占领、运输与挑战节点，不是完整录像回放。'}</p><ol class="report-timeline">${events}</ol><p class="report-empty" ${events?'hidden':''}>暂无此类事件</p></details>${lossBreakdownHTML(game,report)}<details class="report-metrics"><summary>双方完整数据对照</summary>${table}</details></section>`;
}
