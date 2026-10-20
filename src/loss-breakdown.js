import { UNITS } from './data.js';
import { unitCostFor } from './unit-specs.js';
import { equipmentProfile } from './equipment.js';

export const createLossBreakdown = (since,count) => ({since,sides:Array.from({length:count},()=>({}))});

export function recordUnitLoss(game,unit) {
  const stats=game.battleStats;
  if (!game.running || !stats || !Object.hasOwn(UNITS,unit.type) || !game.players[unit.owner]) return;
  stats.unitLosses ||= createLossBreakdown(game.time,game.players.length);
  const side=stats.unitLosses.sides[unit.owner],row=side[unit.type] ||= {count:0,value:0};
  row.count++;
  // 自动货运和临时蜂群不按可生产装备重复估价；这里只统计补充造价，不是实际资金支出。
  if (!unit.temporaryUntil && !unit.swarmParentId && UNITS[unit.type].producer) row.value+=unitCostFor(game.players[unit.owner].faction,unit.type);
}

export function validateLossBreakdown(data,since,time,count) {
  return !!data && Number.isFinite(data.since) && data.since>=since && data.since<=time && Array.isArray(data.sides) && data.sides.length===count &&
    data.sides.every(side=>side&&typeof side==='object'&&!Array.isArray(side)&&Object.entries(side).every(([type,row])=>Object.hasOwn(UNITS,type)&&row&&Number.isSafeInteger(row.count)&&row.count>0&&Number.isSafeInteger(row.value)&&row.value>=0));
}

export function copyLossBreakdown(data,order=data?.sides.map((_,i)=>i)) {
  return data ? {since:data.since,sides:order.map(i=>Object.fromEntries(Object.entries(data.sides[i]).map(([type,row])=>[type,{...row}])))} : null;
}

export function lossBreakdownHTML(game,report) {
  const data=report.unitLosses;
  if (!data) return '<p class="report-note">此战局没有兵种战损记录。</p>';
  const types=[...new Set(data.sides.flatMap(side=>Object.keys(side)))].sort((a,b)=>data.sides.reduce((sum,side)=>sum+(side[b]?.value||0),0)-data.sides.reduce((sum,side)=>sum+(side[a]?.value||0),0)||a.localeCompare(b));
  const value=v=>Math.round(v).toLocaleString('zh-CN');
  const headers=data.sides.map((_,i)=>`<th>${i===0?'我方':data.sides.length===2?'对手':`对手 ${i}`}</th>`).join('');
  const rows=types.map(type=>`<tr><th>${game.map.future?equipmentProfile(game.players[0].faction,type,true).name:UNITS[type].name}</th>${data.sides.map(side=>`<td>${side[type]?.count||0}<small>¤ ${value(side[type]?.value||0)}</small></td>`).join('')}</tr>`).join('');
  const totals=data.sides.map(side=>Object.values(side).reduce((sum,row)=>sum+row.value,0));
  return `<details class="report-metrics report-losses"><summary>兵种战损与估算补充成本</summary><p class="report-note">数量 / 估算补充造价，非实际支出；自动货运、临时蜂群按 0 造价计。${data.since>report.since?'旧存档从本次读档后开始记录兵种战损。':''}</p>${types.length?`<div class="report-table-scroll"><table><thead><tr><th>装备类别</th>${headers}</tr></thead><tbody>${rows}<tr><th>合计补充造价</th>${totals.map(v=>`<td>¤ ${value(v)}</td>`).join('')}</tr></tbody></table></div>`:'<p class="report-note">记录期间没有部队损失。</p>'}</details>`;
}
