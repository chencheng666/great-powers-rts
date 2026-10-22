import { theaterDefinition, theaterFacilities, theaterNetwork } from './theater-operations.js';

export function theaterSummary(game) {
  const d=theaterDefinition(game),s=game.challenge?.operation;
  if(!d?.operation||!s)return '';
  if(d.operation==='island-support')return `机场增援${s.produced[0]?'已抵达':'未启用'} · 可选侧翼目标`;
  if(d.operation==='convoy')return `抵港停驻 ${Math.floor(s.hold)} / 15 秒`;
  if(d.operation==='defense')return `突击 ${game.challenge.wave} / ${d.waves.length} · ${s.reinforced?'增援已抵达':'等待增援'}`;
  if(d.operation==='evacuation')return `安全撤离 ${s.value} / 9 人`;
  if(d.operation==='industry')return `工业交付 ${Math.floor(s.value)} / 2400`;
  if(d.operation==='sentinel')return `预警值 ${Math.floor(s.value)} / 180`;
  if(d.operation==='moon')return `矿物 ${Math.floor(s.mined)} / 1800 · 储能 ${Math.floor(s.energy)} / 300`;
  return `${['恢复前哨','保障海运','稳定纵深'][s.phase]} · 驻守 ${Math.floor(s.hold)} / 25 秒`;
}

export function theaterPanelHTML(game,icon) {
  const d=theaterDefinition(game),s=game.challenge?.operation;if(!d?.operation||!s)return '';
  const nodes=theaterFacilities(game),network=theaterNetwork(game),next=d.waves[game.challenge.wave];
  const rows=nodes.map((n,i)=>{
    const e=n.entity,health=Math.max(0,Math.ceil(e.hp/e.maxHp*100));
    const state=e.hp<=0?'可修复遗址':e.owner!==0?'待接管':!network.connected[i]?'待修复或受争夺':network.powered?'已联网':'缺电';
    return `<li class="${network.connected[i]?'complete':'current'}"><button type="button" data-theater-focus="${e.id}" title="定位${n.definition.name}">${icon(e.hp<=0?'wrench':network.connected[i]?'check':'map-pin')}<span>${n.definition.name}</span><small>${health}% · ${state}</small></button></li>`;
  }).join('');
  const evac=d.operation==='evacuation'?`<ol class="recon-objectives">${s.evacuation.map((b,i)=>`<li>第 ${i+1} 批 · ${{waiting:'等待接运',aboard:'运输途中',saved:'安全抵达',lost:'人员损失'}[b.status]}${b.progress>0?` · ${b.progress.toFixed(1)} 秒`:''}</li>`).join('')}</ol>`:'';
  return `<section class="challenge-objectives"><h3>${d.name}</h3><p>${d.briefing}</p><dl><div><dt>当前进度</dt><dd>${theaterSummary(game)}</dd></div><div><dt>剩余时间</dt><dd>${Math.max(0,Math.ceil(d.limit-game.time))} 秒</dd></div><div><dt>下一波突击</dt><dd>${next?`${Math.max(0,Math.ceil(next.at-game.time))} 秒`:'已全部出现'}</dd></div><div><dt>设施供电</dt><dd>${network.powered?'正常':'不足'}</dd></div></dl><ol class="recon-objectives">${rows}</ol>${evac}<button class="secondary-btn" data-theater-focus="objective">${icon('flag')} 定位任务终点</button>${d.collection?`<button class="secondary-btn" data-theater-focus="collection">${icon('users')} 定位集合区</button>`:''}<p>完成任务获一星；保护目标剩余生命至少 70% 加一星；战损不超过一支加一星。任务记录与遭遇战荣誉分别保存。</p></section>`;
}
