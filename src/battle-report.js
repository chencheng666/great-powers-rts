import { UNITS, BUILDINGS } from './data.js';
import { createLossBreakdown,recordUnitLoss,validateLossBreakdown,copyLossBreakdown,lossBreakdownHTML } from './loss-breakdown.js';

export const REPORT_FIELDS = ['damageDealt', 'damageTaken', 'kills', 'losses', 'buildingsDestroyed', 'buildingsLost', 'unitsProduced', 'repairHP', 'resupplies', 'oilSeconds', 'beaconSeconds'];
export const REPORT_EVENT_LIMIT = 96;
const OPTIONAL_METRICS = ['portRepairCost','portAmmoCost'];
const missionNames = { corridor: '补给走廊', airshield: '低空防线',recon:'静默回传',beachhead:'抢滩接力',lifeline:'深蓝生命线',islandwatch:'列岛守望' };
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
      (e.kind === 'unitLost' ? Object.hasOwn(UNITS, e.type) : e.kind === 'buildingLost' ? Object.hasOwn(BUILDINGS, e.type) : e.kind==='challengeIntel' ? e.type==='recon'&&Number.isInteger(e.value)&&e.value>=1&&e.value<=3 : ['challengeStart','challengeWave','challengeWon','challengeLost'].includes(e.kind) ? Object.hasOwn(missionNames,e.type) : e.kind==='captured' ? Object.hasOwn(resourceNames,e.type) : ['delivered','intercepted'].includes(e.kind)&&['freightPlane','containerShip'].includes(e.type)));
}
const category = kind => ['unitLost','buildingLost'].includes(kind) ? 'loss' : ['captured','delivered','intercepted'].includes(kind) ? 'resource' : 'mission';
export function reportEventLabel(event) {
  const side=event.owner===0?'我方':`敌方${event.owner>1?' '+event.owner:''}`;
  if (event.kind==='unitLost'||event.kind==='buildingLost') return `${side} ${(UNITS[event.type]||BUILDINGS[event.type])?.name||'单位'}损失`;
  if (event.kind==='captured') return `${side}占领${resourceNames[event.type]||'据点'}`;
  if (event.kind==='delivered'||event.kind==='intercepted') return `${side}${event.kind==='delivered'?'物资交付':'运输损失'} · ${Math.round(event.value||0)} 资金`;
  if(event.kind==='challengeIntel')return `静默回传 · 第 ${event.value} 处情报已记录`;
  return `${missionNames[event.type]||'任务'} · ${{challengeStart:'任务开始',challengeWave:`第 ${Math.round(event.value||0)} 波突击`,challengeWon:'任务完成',challengeLost:'任务失败'}[event.kind]||'事件'}`;
}
export function battleReportHTML(game) {
  const report = battleReport(game); if (!report) return '';
  const rows = [['击毁部队', 'kills'], ['战损部队', 'losses'], ['摧毁建筑', 'buildingsDestroyed'], ['建筑损失', 'buildingsLost'], ['有效伤害', 'damageDealt'], ['承受伤害', 'damageTaken'], ['新造部队', 'unitsProduced'], ['修复生命', 'repairHP'], ['完成整备', 'resupplies'], ['物资交付', 'delivered'], ['运输损失', 'intercepted'], ['油井控制·分钟', 'oilSeconds'], ['信标控制·分钟', 'beaconSeconds']];
  rows.push(['港口维修支出','portRepairCost'],['舰艇补弹支出','portAmmoCost']);
  const value = (side, key) => key.endsWith('Seconds') ? ((side[key] || 0) / 60).toFixed(1) : Math.round(side[key] || 0).toLocaleString('zh-CN');
  const own = report.sides[0];
  const advice = own.intercepted > own.delivered * .25 ? '后勤损失偏高，下次尝试为运输线路配置防空与海军护航。' : own.losses > own.kills && own.resupplies < 2 ? '交换战损偏高，可尝试保留补给车辆，并将重伤、低弹药部队及时撤回整备。' : own.oilSeconds + own.beaconSeconds < 60 && game.time > 180 ? '中立设施控制时间较短，可以用工程师与护卫编队增加资源和据点收益。' : '结合反制配兵、侦察和整备节奏，再比较下一场的战损与资源控制。';
  const events = report.events.map(e => `<li data-event-kind="${category(e.kind)}"><time>${Math.floor(e.time / 60).toString().padStart(2, '0')}:${Math.floor(e.time % 60).toString().padStart(2, '0')}</time><span>${reportEventLabel(e)}</span></li>`).join('');
  const table = `<div class="report-table-scroll"><table><thead><tr><th>作战指标</th>${report.sides.map((_,i)=>`<th>${i===0?'我方':report.sides.length===2?'对手':`对手 ${i}`}</th>`).join('')}</tr></thead><tbody>${rows.map(([label, key]) => `<tr><th>${label}</th>${report.sides.map(side=>`<td>${value(side,key)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const overview = [['击毁 / 战损',`${value(own,'kills')} / ${value(own,'losses')}`],['有效伤害',value(own,'damageDealt')],['修复生命',value(own,'repairHP')],['物资交付',value(own,'delivered')]].map(([label,number])=>`<div><small>${label}</small><strong>${number}</strong></div>`).join('');
  return `<section class="battle-report"><h3>战后复盘</h3>${report.complete ? '' : '<p class="report-note">旧存档仅统计本次读档后的战斗，前段数据未计入。</p>'}<div class="report-overview">${overview}</div><p class="report-note">${advice}</p><details open><summary>关键事件时间线 · ${report.events.length} 条</summary><div class="report-filters" role="group" aria-label="复盘事件筛选">${[['all','全部'],['loss','战损'],['resource','资源'],['mission','任务']].map(([key,name])=>`<button type="button" data-report-filter="${key}" aria-pressed="${key==='all'}">${name}</button>`).join('')}</div><p class="report-note">${report.omittedEvents?`较早的 ${report.omittedEvents} 条事件已省略，保留最近 ${REPORT_EVENT_LIMIT} 条。`:'记录关键战损、占领、运输与挑战节点，不是完整录像回放。'}</p><ol class="report-timeline">${events}</ol><p class="report-empty" ${events?'hidden':''}>暂无此类事件</p></details>${lossBreakdownHTML(game,report)}<details class="report-metrics"><summary>双方完整数据对照</summary>${table}</details></section>`;
}
