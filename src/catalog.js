import { FACTIONS, MAPS } from './data.js';
import { catalogEntries, CATALOG_CATEGORIES } from './catalog-data.js';
import { CatalogPreview } from './catalog-preview.js';
import { prepareVisualAssets, modelThumbnail } from './visual-assets.js';

const escape = text => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const icon = name => `<i data-lucide="${name}"></i>`;

export class Catalog {
  constructor(dialog, { refreshIcons, onClose }) {
    this.dialog = dialog; this.refreshIcons = refreshIcons; this.onClose = onClose; this.options = {}; this.token = 0;
    dialog.innerHTML = `<div class="catalog-heading"><div><small>战区资料库</small><h2 id="catalog-title">装备图鉴</h2></div><button class="icon-btn" data-catalog-close title="关闭图鉴" aria-label="关闭图鉴">${icon('x')}</button></div>
      <div class="catalog-filters"><label>阵营<select id="catalog-faction">${Object.entries(FACTIONS).map(([id,f])=>`<option value="${id}">${f.name}</option>`).join('')}</select></label><label>战区<select id="catalog-map">${Object.entries(MAPS).map(([id,m])=>`<option value="${id}">${m.name}</option>`).join('')}</select></label><label class="catalog-search">搜索<input id="catalog-search" type="search" placeholder="装备名称、职责、型号" autocomplete="off"></label><label class="catalog-current"><input id="catalog-current" type="checkbox">仅当前可用</label></div>
      <div class="catalog-body"><nav class="catalog-index" aria-label="图鉴目录"><div class="catalog-categories" role="tablist">${Object.entries(CATALOG_CATEGORIES).map(([id,name])=>`<button role="tab" data-category="${id}" aria-selected="${id==='all'}">${name}</button>`).join('')}</div><p id="catalog-count" role="status"></p><div id="catalog-list"></div></nav>
      <section class="catalog-page"><div id="catalog-loading" role="status">正在载入装备资料…</div><div id="catalog-detail" hidden><div class="catalog-lead"><div class="catalog-model"><canvas id="catalog-canvas" aria-label="装备三维模型"></canvas><div class="catalog-model-tools"><button class="icon-btn" data-preview="rotate" title="自动旋转" aria-label="自动旋转" aria-pressed="false">${icon('rotate-3d')}</button><button class="icon-btn" data-preview="zoom-in" title="放大模型" aria-label="放大模型">${icon('plus')}</button><button class="icon-btn" data-preview="zoom-out" title="缩小模型" aria-label="缩小模型">${icon('minus')}</button><button class="icon-btn" data-preview="reset" title="重置视角" aria-label="重置视角">${icon('rotate-ccw')}</button></div><span id="catalog-model-status" role="status"></span></div><div id="catalog-summary"></div></div><div id="catalog-notes"></div></div></section></div>`;
    dialog.querySelector('[data-catalog-close]').addEventListener('click', () => this.close());
    dialog.addEventListener('cancel', event => { event.preventDefault(); this.close(); });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) this.close(); } });
    dialog.querySelector('#catalog-search').addEventListener('input', () => { this.options.query = this.value('search'); this.render(); });
    for (const id of ['faction','map','current']) dialog.querySelector(`#catalog-${id}`).addEventListener('change', () => { this.options.faction=this.value('faction');this.options.mapId=this.value('map');this.options.currentOnly=dialog.querySelector('#catalog-current').checked;this.render(); });
    dialog.querySelector('.catalog-categories').addEventListener('click', event => { const b=event.target.closest('[data-category]'); if(b){this.options.category=b.dataset.category;this.render();} });
    dialog.querySelector('#catalog-list').addEventListener('click', event => { const b=event.target.closest('[data-entry]'); if(b) this.select(b.dataset.entry); });
    dialog.querySelector('#catalog-notes').addEventListener('click', event => { const b=event.target.closest('[data-related]'); if(b){this.options.query='';this.options.category='all';this.options.currentOnly=false;dialog.querySelector('#catalog-search').value='';dialog.querySelector('#catalog-current').checked=false;this.selected=b.dataset.related;this.render();dialog.querySelector(`[data-entry="${this.selected}"]`)?.scrollIntoView({block:'nearest'});} });
    dialog.querySelector('.catalog-model-tools').addEventListener('click', event => {
      const action=event.target.closest('[data-preview]')?.dataset.preview;if(!this.preview)return;
      if(action==='rotate'){this.preview.controls.autoRotate=!this.preview.controls.autoRotate;this.rotateState(this.preview.controls.autoRotate);} else if(action==='reset')this.preview.reset();else if(action==='zoom-in')this.preview.zoom(.85);else if(action==='zoom-out')this.preview.zoom(1.15);
    });
  }
  value(key) { return this.dialog.querySelector(`#catalog-${key}`).value; }
  async open({ faction='china', mapId='valley', id=null } = {}) {
    const token=++this.token; this.options={faction,mapId,category:'all',query:'',currentOnly:false};this.selected=id;
    this.dialog.querySelector('#catalog-faction').value=faction;this.dialog.querySelector('#catalog-map').value=mapId;
    this.dialog.querySelector('#catalog-search').value='';this.dialog.querySelector('#catalog-current').checked=false;
    this.dialog.querySelector('#catalog-loading').hidden=false;this.dialog.querySelector('#catalog-loading').textContent='正在载入装备资料…';this.dialog.querySelector('#catalog-detail').hidden=true;
    this.dialog.showModal();this.refreshIcons();
    try { await prepareVisualAssets(); if(token!==this.token||!this.dialog.open)return;this.ready=true;this.render();this.dialog.querySelector(`[data-entry="${this.selected}"]`)?.scrollIntoView({block:'nearest'});this.dialog.querySelector('#catalog-search').focus(); }
    catch(error){if(token===this.token&&this.dialog.open)this.dialog.querySelector('#catalog-loading').textContent=`资料载入失败：${error.message}`;}
  }
  close() { if(!this.dialog.open)return;++this.token;this.preview?.stop();this.dialog.close();this.onClose(); }
  render() {
    if(!this.ready||!this.dialog.open)return;
    this.entries=catalogEntries(this.options);
    if(!this.entries.some(e=>e.id===this.selected))this.selected=this.entries[0]?.id;
    this.dialog.querySelectorAll('[data-category]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.category===this.options.category)));
    this.dialog.querySelector('#catalog-count').textContent=`${this.entries.length} 项资料`;
    this.dialog.querySelector('#catalog-list').innerHTML=this.entries.map(e=>`<button data-entry="${e.id}" aria-pressed="${e.id===this.selected}"><img src="${modelThumbnail(e.model,'#69dce7')}" alt=""><span><strong>${escape(e.name)}</strong><small>${escape(e.role)}${e.availability.available?'':' · 限定'}</small></span></button>`).join('');
    this.select(this.selected);
  }
  select(id) {
    const entry=this.entries?.find(e=>e.id===id);this.selected=id;
    this.dialog.querySelectorAll('[data-entry]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.entry===id)));
    const loading=this.dialog.querySelector('#catalog-loading');loading.hidden=!!entry;this.dialog.querySelector('#catalog-detail').hidden=!entry;
    if(!entry){loading.textContent='没有匹配的资料';this.preview?.stop();return;}
    this.dialog.querySelector('#catalog-summary').innerHTML=`<p class="catalog-classification">${escape(entry.classification)} · ${escape(entry.role)}</p><h3>${escape(entry.name)}</h3><p class="catalog-description">${escape(entry.description)}</p><p class="catalog-availability ${entry.availability.available?'':'limited'}">${icon(entry.availability.available?'check':'lock-keyhole')}${escape(entry.availability.reason)}</p><dl class="catalog-stats">${entry.stats.map(([k,v])=>`<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl><small class="catalog-stat-note">游戏平衡数值，距离为战区单位；基础伤害不含目标克制、装甲朝向及临时效果。</small>`;
    const section=(name,lines)=>lines.length?`<section><h4>${name}</h4><ul>${lines.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></section>`:'';
    this.dialog.querySelector('#catalog-notes').innerHTML=`<div class="catalog-tactical-notes">${section('战术用法',entry.tactics)}${section('弱点与注意',entry.attention)}</div>${section('维修与补给',entry.service)}${entry.related.length?`<section><h4>${entry.kind==='building'?'生产、前置与解锁':'生产设施与科技前置'}</h4><div class="catalog-related">${entry.related.map(e=>`<button data-related="${e.kind}:${e.type}">${icon(e.kind==='building'?'blocks':'crosshair')}${escape(e.name)}</button>`).join('')}</div></section>`:''}${entry.source?`<a class="catalog-source" href="${escape(entry.source)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}公开原型资料</a>`:''}`;
    const status=this.dialog.querySelector('#catalog-model-status');
    try {
      this.preview ||= new CatalogPreview(this.dialog.querySelector('#catalog-canvas'));this.preview.onRotate=v=>this.rotateState(v);
      this.preview.show(entry);this.preview.start();status.textContent='';this.dialog.querySelector('#catalog-canvas').setAttribute('aria-label',`${entry.name}三维模型`);
    }catch(error){this.preview?.stop();status.textContent=`模型预览不可用：${error.message}`;}
    this.dialog.querySelector('.catalog-page').scrollTop=0;this.refreshIcons();
  }
  rotateState(value){this.dialog.querySelector('[data-preview="rotate"]').setAttribute('aria-pressed',String(value));}
}
