import { FACTIONS, MAPS, AI_DIFFICULTIES, VICTORY_MODES } from './data.js';
import { HONOR_RANKS, HONOR_ACHIEVEMENTS, DIFFICULTY_POINTS, MODE_POINTS, honorProgress, victoryPraise, parseHonorExport } from './player-honors.js';

const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const icon = name => `<i data-lucide="${name}"></i>`;
const number = value => value.toLocaleString('zh-CN');
const duration = value => `${Math.floor(value/60)} 分 ${Math.floor(value%60)} 秒`;

export function honorBadge(rank, className = '') {
  return `<span class="rank-badge ${className}" role="img" aria-label="${rank.name}徽章" style="--badge-x:${rank.index%4/3*100}%;--badge-y:${Math.floor(rank.index/4)*100}%"></span>`;
}

export function honorProgressHTML(profile) {
  const {rank,next,pointsNeeded,winsNeeded}=honorProgress(profile);
  if(!next)return `<div class="honor-next"><strong>最高称号已达成 · ${rank.name}</strong><p>传奇还在续写，每场胜利仍会累积荣誉。</p></div>`;
  return `<div class="honor-next"><strong>下一称号 · ${next.name}</strong><div class="honor-progress-label"><span>荣誉积分</span><span>${number(profile.points)} / ${number(next.points)}</span></div><progress max="${next.points}" value="${Math.min(profile.points,next.points)}" aria-label="晋升积分"></progress><div class="honor-progress-label"><span>累计胜场</span><span>${profile.wins} / ${next.wins}</span></div><progress max="${next.wins}" value="${Math.min(profile.wins,next.wins)}" aria-label="晋升胜场"></progress><p>${pointsNeeded?`还需 ${number(pointsNeeded)} 积分`:'积分条件已达成'} · ${winsNeeded?`还需 ${winsNeeded} 场胜利`:'胜场条件已达成'}</p></div>`;
}

export function honorResultHTML(settlement, mode) {
  const promoted=settlement.toRank.index>settlement.fromRank.index;
  const title=settlement.status==='duplicate'?'本场荣誉已记录':promoted?`晋升 · ${settlement.toRank.name}`:'凯旋授勋';
  const praise=settlement.status==='duplicate'?'这场胜利已经记入履历，积分不会重复领取。你的荣誉依然闪耀。':victoryPraise(settlement,mode);
  const confetti=settlement.status==='awarded'?`<div class="honor-confetti" aria-hidden="true">${Array.from({length:14},(_,i)=>`<b style="--i:${i}"></b>`).join('')}</div>`:'';
  return `<section class="result-honor ${promoted?'is-promoted':''}" aria-label="胜利荣誉">${confetti}<div class="honor-result-lead">${honorBadge(settlement.toRank,'result-badge')}<div><small>${escape(title)}</small><h3>${settlement.toRank.name}</h3><p>${escape(praise)}</p><div class="honor-award-total"><strong>${settlement.gained?`+${settlement.gained}`:'已入档'}</strong><span>${settlement.gained?'本场荣誉积分':`累计 ${number(settlement.profile.points)} 积分`}</span></div></div></div>${settlement.rewards.length?`<dl class="honor-reward-lines">${settlement.rewards.map(r=>`<div><dt>${escape(r.name)}</dt><dd>+${r.points}</dd></div>`).join('')}</dl>`:''}${settlement.unlocked.length?`<p class="honor-unlocked">${icon('medal')}新功勋：${settlement.unlocked.map(a=>a.name).join(' · ')}</p>`:''}<div class="honor-result-summary"><span>累计胜利 <strong>${settlement.profile.wins} 场</strong></span><span>总荣誉 <strong>${number(settlement.profile.points)}</strong></span></div>${honorProgressHTML(settlement.profile)}</section>`;
}

const achievementRequirement = id => ({'first-win':'取得第一场胜利','first-expert':'首次战胜专家 AI','first-sea':'首次在海域战区获胜','first-moon':'首次在子午环阵获胜','all-factions':'使用五个阵营分别获胜','all-maps':'在七张战区分别获胜'}[id] || `累计 ${id.slice(5)} 场胜利`);

export class HonorPanel {
  constructor(dialog, {refreshIcons,onClose,onExport,onImport}) {
    this.dialog=dialog;this.refreshIcons=refreshIcons;this.onClose=onClose;this.onExport=onExport;this.onImport=onImport;this.importToken=0;
    dialog.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    dialog.addEventListener('click',event=>{
      if(event.target.closest('[data-honor-close]'))this.close();
      const command=event.target.closest('[data-honor-command]')?.dataset.honorCommand;
      if(command==='export') { try { if(this.readError)throw new Error('请先恢复可读取的荣誉档案，再导出备份');this.onExport(this.profile);this.feedback='荣誉档案已导出'; } catch(error){this.error=error.message;}this.render(); }
      if(command==='import')dialog.querySelector('[data-honor-file]').click();
      if(command==='cancel-import'){this.pendingImport=null;this.render();}
      if(command==='confirm-import'&&this.pendingImport) { try { this.onImport(this.pendingImport);this.profile=this.pendingImport;this.pendingImport=null;this.error='';this.readError='';this.feedback='荣誉档案已恢复'; } catch(error){this.error=error.message;}this.render(); }
      const tab=event.target.closest('[data-honor-tab]');
      if(tab){this.tab=tab.dataset.honorTab;this.render();dialog.querySelector(`[data-honor-tab="${this.tab}"]`).focus();}
      if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)this.close();}
    });
    dialog.addEventListener('change',async event=>{
      if(!event.target.matches('[data-honor-file]'))return;
      const file=event.target.files[0],token=++this.importToken;event.target.value='';if(!file)return;this.pendingImport=null;
      try { if(file.size>8*1024*1024)throw new Error('荣誉档案文件过大');const imported=parseHonorExport(await file.text());if(token!==this.importToken||!dialog.open)return;this.pendingImport=imported;this.feedback='';this.render();dialog.querySelector('[data-honor-command="cancel-import"]').focus(); }
      catch(error){if(token===this.importToken&&dialog.open){this.error=error.message;this.render();}}
    });
  }
  open(profile, error = '') { if(this.dialog.open)return;this.profile=profile;this.error=error;this.readError=error;this.feedback='';this.pendingImport=null;this.tab='ranks';this.render();this.dialog.showModal(); }
  close() { if(!this.dialog.open)return;++this.importToken;this.dialog.close();this.onClose(); }
  render() {
    const p=this.profile,{rank}=honorProgress(p);
    const highest=p.victories.veteran?'专家':p.victories.standard?'标准':p.victories.recruit?'新兵':'待首胜';
    const pending=this.pendingImport?`<section class="honor-import-confirm" role="alert"><strong>恢复荣誉档案？</strong><p>导入 ${number(this.pendingImport.points)} 积分、${this.pendingImport.wins} 胜的档案，将替换本机 ${number(p.points)} 积分、${p.wins} 胜的荣誉记录，不影响战局存档。不会合并积分。</p><div><button class="secondary-btn" data-honor-command="cancel-import">取消</button><button class="primary-btn" data-honor-command="confirm-import">确认替换</button></div></section>`:'';
    this.dialog.innerHTML=`<header class="honor-heading"><div><small>指挥官履历 · 本机荣誉</small><h2 id="honor-title">荣誉档案</h2></div><div class="honor-heading-actions"><button class="icon-btn" data-honor-command="export" aria-label="导出荣誉档案" title="导出荣誉档案">${icon('download')}</button><button class="icon-btn" data-honor-command="import" aria-label="导入荣誉档案" title="导入荣誉档案">${icon('upload')}</button><button class="icon-btn" data-honor-close aria-label="关闭荣誉档案" title="关闭荣誉档案">${icon('x')}</button></div></header><input type="file" accept=".json,application/json" data-honor-file hidden><div class="honor-panel-content">${this.error?`<p class="honor-warning" role="alert">${escape(this.error)}</p>`:''}${this.feedback?`<p class="honor-feedback" role="status">${escape(this.feedback)}</p>`:''}${pending}<section class="honor-profile-lead">${honorBadge(rank,'profile-badge')}<div><small>等级 ${rank.level} / ${HONOR_RANKS.length}</small><h3>${rank.name}</h3><p>${rank.motto}</p><dl class="honor-profile-stats"><div><dt>荣誉积分</dt><dd>${number(p.points)}</dd></div><div><dt>累计胜场</dt><dd>${p.wins}</dd></div><div><dt>最高获胜难度</dt><dd>${highest}</dd></div></dl></div><div>${honorProgressHTML(p)}</div></section><div class="honor-tabs" role="tablist" aria-label="荣誉资料">${[['ranks','award','荣誉阶梯'],['history','history','胜利战绩'],['rules','circle-help','积分规则']].map(([key,symbol,name])=>`<button role="tab" data-honor-tab="${key}" aria-selected="${this.tab===key}" aria-controls="honor-view">${icon(symbol)}${name}</button>`).join('')}</div><section id="honor-view" role="tabpanel">${this.tab==='ranks'?this.ranksHTML():this.tab==='history'?this.historyHTML():this.rulesHTML()}</section><p class="honor-local-note">本机单机荣誉，不是联网排名；称号不提供战力加成。清理浏览器数据或更换离线文件位置前，可导出备份。</p></div>`;
    this.refreshIcons();
  }
  ranksHTML() {
    const p=this.profile,current=honorProgress(p).rank;
    return `<div class="honor-rank-grid">${HONOR_RANKS.map(rank=>`<article class="honor-rank ${rank.index===current.index?'current':rank.index<current.index?'earned':'locked'}">${honorBadge(rank)}<div><small>等级 ${rank.level} · ${rank.index===current.index?'当前称号':rank.index<current.index?'已点亮':'待晋升'}</small><h4>${rank.name}</h4><p>${number(rank.points)} 积分 · ${rank.wins} 胜</p></div></article>`).join('')}</div><h4 class="honor-section-title">战区功勋</h4><div class="honor-achievements">${HONOR_ACHIEVEMENTS.map(a=>`<div class="honor-achievement ${p.achievements.includes(a.id)?'earned':''}">${icon(p.achievements.includes(a.id)?'badge-check':'medal')}<span><strong>${a.name}</strong><small>${achievementRequirement(a.id)} · +${a.points}</small></span></div>`).join('')}</div>`;
  }
  historyHTML() {
    if(!this.profile.recent.length)return '<p class="honor-empty">下一场胜利，将成为你履历中的第一枚战功。</p>';
    return `<div class="honor-history">${this.profile.recent.map(r=>`<article><div>${icon('flag')}<span><strong>${MAPS[r.mapId].name}</strong><small>${FACTIONS[r.faction].name} · ${AI_DIFFICULTIES[r.difficulty].name} · ${VICTORY_MODES[r.mode].name}</small><small>${new Date(r.at).toLocaleDateString('zh-CN')} · ${duration(r.time)}</small></span></div><strong>+${r.gained}</strong></article>`).join('')}</div><p class="honor-history-note">最近 12 场胜利；累计积分与胜场不受列表长度影响。</p>`;
  }
  rulesHTML() {
    return `<h4 class="honor-section-title">每场胜利</h4><dl class="honor-rules">${Object.entries(DIFFICULTY_POINTS).map(([key,value])=>`<div><dt>${AI_DIFFICULTIES[key].name}难度</dt><dd>+${value}</dd></div>`).join('')}${Object.entries(MODE_POINTS).map(([key,value])=>`<div><dt>${VICTORY_MODES[key].name}模式加分</dt><dd>+${value}</dd></div>`).join('')}</dl><h4 class="honor-section-title">功勋奖励</h4><dl class="honor-rules">${HONOR_ACHIEVEMENTS.map(a=>`<div><dt>${a.name}<small>${achievementRequirement(a.id)}</small></dt><dd>+${a.points}</dd></div>`).join('')}</dl><ul class="honor-rule-notes"><li>晋升须同时达到积分与胜场门槛，详见荣誉阶梯。</li><li>失败与平局不加分，也不扣分、不降级；每项功勋奖励只发一次。</li><li>新版本战局编号随存档保留，同一战局只结算一次。旧版存档按原文件识别，不同旧快照无法可靠关联。</li><li>这是可离线保存的个人履历，不是防篡改的竞技评分，也不改变任何单位属性。</li></ul>`;
  }
}
