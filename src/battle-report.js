import { UNITS, BUILDINGS } from './data.js';

export const REPORT_FIELDS = ['damageDealt', 'damageTaken', 'kills', 'losses', 'buildingsDestroyed', 'buildingsLost', 'unitsProduced', 'repairHP', 'resupplies', 'oilSeconds', 'beaconSeconds'];
export function createBattleStats(since = 0) {
  return { since, complete: since === 0, sides: [0, 1].map(() => Object.fromEntries(REPORT_FIELDS.map(key => [key, 0]))), events: [] };
}
export function battleMetric(game, side, key, amount) {
  if (game.running && game.battleStats?.sides[side] && Number.isFinite(amount) && amount > 0) game.battleStats.sides[side][key] += amount;
}
export function recordBattleDamage(game, target, amount, attacker) {
  const actual = Math.min(target.hp, amount);
  battleMetric(game, target.owner, 'damageTaken', actual);
  if (attacker === 1 - target.owner) battleMetric(game, attacker, 'damageDealt', actual);
  if (amount < target.hp || !game.battleStats || !game.running) return;
  const building = target.kind === 'building';
  battleMetric(game, target.owner, building ? 'buildingsLost' : 'losses', 1);
  if (attacker === 1 - target.owner) battleMetric(game, attacker, building ? 'buildingsDestroyed' : 'kills', 1);
  game.battleStats.events.push({ time: game.time, owner: target.owner, type: target.type, kind: building ? 'buildingLost' : 'unitLost' });
  game.battleStats.events = game.battleStats.events.slice(-32);
}
export function battleReport(game) {
  if (game.online) return game.battleReport || null;
  if (!game.battleStats) return null;
  return { since: game.battleStats.since, complete: game.battleStats.complete, sides: game.battleStats.sides.map((side, i) => ({ ...side, delivered: game.logistics?.[i]?.delivered || 0, intercepted: game.logistics?.[i]?.lost || 0 })), events: [...game.battleStats.events] };
}
export function validateBattleStats(stats, time) {
  return stats && Number.isFinite(stats.since) && stats.since >= 0 && stats.since <= time && typeof stats.complete === 'boolean' &&
    Array.isArray(stats.sides) && stats.sides.length === 2 && stats.sides.every(side => REPORT_FIELDS.every(key => Number.isFinite(side[key]) && side[key] >= 0)) &&
    Array.isArray(stats.events) && stats.events.length <= 32 && stats.events.every(e => Number.isFinite(e.time) && e.time >= stats.since && e.time <= time && [0, 1].includes(e.owner) && (e.kind === 'unitLost' ? Object.hasOwn(UNITS, e.type) : e.kind === 'buildingLost' && Object.hasOwn(BUILDINGS, e.type)));
}
export function battleReportHTML(game) {
  const report = battleReport(game); if (!report) return '';
  const rows = [['击毁部队', 'kills'], ['战损部队', 'losses'], ['摧毁建筑', 'buildingsDestroyed'], ['建筑损失', 'buildingsLost'], ['有效伤害', 'damageDealt'], ['承受伤害', 'damageTaken'], ['新造部队', 'unitsProduced'], ['修复生命', 'repairHP'], ['完成整备', 'resupplies'], ['物资交付', 'delivered'], ['运输损失', 'intercepted'], ['油井控制·分钟', 'oilSeconds'], ['信标控制·分钟', 'beaconSeconds']];
  const value = (side, key) => key.endsWith('Seconds') ? (side[key] / 60).toFixed(1) : Math.round(side[key]).toLocaleString('zh-CN');
  const own = report.sides[0];
  const advice = own.intercepted > own.delivered * .25 ? '后勤损失偏高，下次尝试为运输线路配置防空与海军护航。' : own.losses > own.kills && own.resupplies < 2 ? '交换战损偏高，可尝试保留补给车辆，并将重伤、低弹药部队及时撤回整备。' : own.oilSeconds + own.beaconSeconds < 60 && game.time > 180 ? '中立设施控制时间较短，可以用工程师与护卫编队增加资源和据点收益。' : '结合反制配兵、侦察和整备节奏，再比较下一场的战损与资源控制。';
  const events = report.events.slice(-8).map(e => `<li><time>${Math.floor(e.time / 60).toString().padStart(2, '0')}:${Math.floor(e.time % 60).toString().padStart(2, '0')}</time><span>${e.owner === 0 ? '我方' : '敌方'} ${UNITS[e.type]?.name || BUILDINGS[e.type].name}损失</span></li>`).join('');
  return `<section class="battle-report"><h3>战后复盘</h3>${report.complete ? '' : '<p class="report-note">旧存档仅统计本次读档后的战斗，前段数据未计入。</p>'}<table><thead><tr><th>作战指标</th><th>我方</th><th>对手</th></tr></thead><tbody>${rows.map(([label, key]) => `<tr><th>${label}</th><td>${value(report.sides[0], key)}</td><td>${value(report.sides[1], key)}</td></tr>`).join('')}</tbody></table><p class="report-note">${advice}</p>${events ? `<details><summary>最近关键战损</summary><ol>${events}</ol></details>` : ''}</section>`;
}
