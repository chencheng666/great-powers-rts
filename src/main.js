import { createIcons, icons } from 'lucide';
import { BUILDINGS, BUILD_ORDER, FACTIONS, MAPS, PRODUCERS, UNITS, UNIT_ORDER, VICTORY_MODES } from './data.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { modelThumbnail } from './visual-assets.js';
import { gameAudio } from './audio.js';
import { buildingInformation, placeBuildingPanel, productionDuration } from './battlefield-details.js';
import { teamVisual } from './team-visuals.js';
import { equipmentProfile, equipmentModel, EQUIPMENT_SYSTEMS } from './equipment.js';
import { weatherState, inCover } from './tactical-rules.js';
import './styles.css';
import './mobile.css';
import './phase2.css';
import './visual-v2.css';
import './battlefield-details.css';
import './future.css';

const $ = selector => document.querySelector(selector);
const fmt = amount => Math.floor(amount).toLocaleString('zh-CN');
const seconds = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const selectionStatus = entity => {
  const d = UNITS[entity.type];
  return `生命 ${Math.ceil(entity.hp)} / ${Math.ceil(entity.maxHp)}${entity.type === 'harvester' ? ` · 矿石 ${Math.floor(entity.cargo)} / 210` : ''}${d?.ammo ? ` · 弹药 ${entity.ammo} / ${d.ammo}` : ''}${entity.type === 'apc' ? ` · 乘员 ${entity.passengers.length} / ${d.capacity}` : ''}${entity.type === 'supply' ? ` · 库存 ${Math.floor(entity.stock)} / ${d.stock}` : ''}${entity.type === 'carrier' ? ` · 舰载机 ${entity.wing} / ${d.wing}` : ''}${entity.type === 'laser' ? ` · 热量 ${Math.ceil(entity.heat)}%${entity.overheated ? ' 冷却中' : ''}` : ''}${entity.type === 'rocket' ? ` · 展开 ${entity.deployProgress.toFixed(1)} / 2 秒` : ''}${entity.type === 'submarine' ? entity.exposedUntil > state.game.time ? ' · 暴露' : ' · 潜航' : ''}${entity.jammedUntil > state.game.time ? ' · 受干扰' : ''}${entity.order?.type === 'rearm' || entity.order?.type === 'restock' ? ' · 返场补给' : ''}`;
};
const icon = name => `<i data-lucide="${name}"></i>`;
const refreshIcons = () => createIcons({ icons });

const state = {
  game: null,
  renderer: null,
  faction: 'china',
  mapId: 'valley',
  victoryMode: 'quick',
  difficulty: 'standard',
  tab: 'build',
  keys: new Set(),
  drag: null,
  panning: null,
  cameraPanMode: false,
  pointerPosition: null,
  touchStart: null,
  inspectorId: null,
  dismissedInspectorId: null,
  inspectorContent: '',
  inspectorAt: 0,
  touchPoints: new Map(),
  touchLast: null,
  touchPan: false,
  touchPinching: false,
  pinchDistance: 0,
  groups: {},
  lastUI: 0,
  lastFrame: 0,
  loopToken: 0,
  modalMode: null,
  lastPower: true,
  lastSelection: '',
  sidebarCollapsed: false
};

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = collapsed;
  $('#command-sidebar').hidden = collapsed;
  $('#compact-radar').hidden = !collapsed;
  if (collapsed) $('#compact-radar').append($('#minimap-shell'));
  else $('#command-sidebar').insertBefore($('#minimap-shell'), $('.sidebar-tabs'));
  $('#app').classList.toggle('battle-wide', collapsed);
  document.documentElement.classList.toggle('battle-wide', collapsed);
  $('#sidebar-btn').setAttribute('aria-expanded', String(!collapsed));
  $('#sidebar-btn').title = $('#sidebar-btn').ariaLabel = collapsed ? '展开指挥面板' : '收起指挥面板';
  $('#sidebar-btn').innerHTML = icon(collapsed ? 'panel-right-open' : 'panel-right-close');
  try { localStorage.setItem('great-powers-sidebar', collapsed ? 'collapsed' : 'expanded'); } catch { /* 浏览器禁用本地存储时，当前对局仍可切换面板。 */ }
  refreshIcons();
  requestAnimationFrame(() => state.renderer?.resize());
}

function updateFullscreenControl() {
  const active = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  $('#fullscreen-btn').title = $('#fullscreen-btn').ariaLabel = active ? '退出全屏' : '进入全屏';
  $('#fullscreen-btn').setAttribute('aria-pressed', String(active));
  $('#fullscreen-btn').innerHTML = icon(active ? 'minimize' : 'maximize');
  state.keys.clear(); refreshIcons();
  requestAnimationFrame(() => state.renderer?.resize());
}

async function toggleFullscreen() {
  const app = $('#app');
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      if (document.exitFullscreen) await document.exitFullscreen();
      else document.webkitExitFullscreen();
    } else if (app.requestFullscreen) await app.requestFullscreen();
    else if (app.webkitRequestFullscreen) app.webkitRequestFullscreen();
    else toast('当前浏览器不支持网页全屏，可收起指挥面板扩大战场', true);
  } catch { toast('无法进入全屏，请检查浏览器的全屏权限', true); }
  updateFullscreenControl();
}

function drawFactionPicker() {
  const enemyChoice = $('#enemy-select').value || 'random';
  $('#faction-list').innerHTML = Object.entries(FACTIONS).map(([key, faction]) => `
    <button class="faction-option ${state.faction === key ? 'active' : ''}" data-faction="${key}" style="--faction-color:${faction.color}">
      <span class="faction-symbol">${faction.symbol}</span>
      <span><strong>${faction.name}</strong><small>${EQUIPMENT_SYSTEMS[key].country}原型 · ${faction.summary}</small></span>
      <span class="faction-role">${faction.role}</span>
    </button>`).join('');
  $('#enemy-select').innerHTML = '<option value="random">随机阵营</option>' + Object.entries(FACTIONS).map(([key, value]) => `<option value="${key}">${value.name}${key === state.faction ? ' · 镜像对战' : ''}</option>`).join('');
  $('#enemy-select').value = enemyChoice;
  $('#faction-list').querySelectorAll('button').forEach(button => button.addEventListener('click', () => { state.faction = button.dataset.faction; drawFactionPicker(); }));
}

function toast(message, danger = false) {
  const container = $('#toast-container');
  const item = document.createElement('div'); item.className = `toast${danger ? ' danger' : ''}`; item.textContent = message;
  container.appendChild(item);
  setTimeout(() => { item.style.opacity = '0'; item.style.transition = 'opacity .3s'; setTimeout(() => item.remove(), 300); }, 2800);
  while (container.children.length > 3) container.firstElementChild.remove();
}

function beep(style, owner = 0) {
  gameAudio.shot(style, owner);
}

async function startGame() {
  const button = $('#start-btn');
  if (button.disabled) return;
  gameAudio.stopBattle();
  gameAudio.unlock().catch(() => {});
  button.disabled = true;
  button.innerHTML = `${icon('loader-circle')} 战场部署中`;
  refreshIcons();
  try {
    await Renderer.prepare();
  } catch (error) {
    toast(`战场素材载入失败：${error.message}`, true);
    button.disabled = false;
    button.innerHTML = `${icon('play')} 开始作战`;
    refreshIcons();
    return;
  }
  state.renderer?.dispose();
  const enemyChoice = $('#enemy-select').value;
  const candidates = Object.keys(FACTIONS).filter(key => key !== state.faction);
  const enemy = enemyChoice === 'random' ? candidates[Math.floor(Math.random() * candidates.length)] : enemyChoice;
  state.difficulty = $('#difficulty-select').value;
  state.mapId = $('#map-select').value;
  state.game = new Game(state.faction, enemy, { notice: toast, shot: beep, voice: key => gameAudio.say(key), selection: updateSelection, end: showResult }, { victoryMode: state.victoryMode, difficulty: state.difficulty, mapId: state.mapId });
  try {
    state.renderer = new Renderer($('#game-canvas'), $('#minimap'), state.game);
  } catch (error) {
    state.game = null;
    state.renderer = null;
    toast(`无法初始化三维战场，请检查浏览器硬件加速：${error.message}`, true);
    button.disabled = false;
    button.innerHTML = `${icon('play')} 开始作战`;
    refreshIcons();
    return;
  }
  button.disabled = false;
  button.innerHTML = `${icon('play')} 开始作战`;
  refreshIcons();
  $('#start-screen').style.display = 'none';
  window.scrollTo(0, 0);
  $('#side-faction').textContent = FACTIONS[state.faction].name;
  $('#faction-short').textContent = `我方：${FACTIONS[state.faction].name}`;
  $('#enemy-short').textContent = `敌方：${FACTIONS[enemy].name}`;
  $('#battle-status').textContent = '战斗进行中';
  $('#battle-objective').textContent = VICTORY_MODES[state.victoryMode].description;
  $('.battlefield').classList.toggle('future', !!state.game.map.future);
  $('#mission-label').textContent = `${VICTORY_MODES[state.victoryMode].name} · ${state.game.map.name}`;
  $('#minimap-map').textContent = state.game.map.name;
  $('#minimap-sector').textContent = state.game.map.sector;
  $('#modal').classList.add('hidden');
  state.modalMode = null;
  state.groups = {};
  state.cameraPanMode = false; state.panning = null; state.drag = null; state.pointerPosition = null;
  state.touchPoints.clear(); state.touchStart = state.touchLast = null; state.touchPan = state.touchPinching = false;
  state.inspectorId = state.dismissedInspectorId = null; $('#building-info').hidden = true; updatePanControl();
  state.lastPower = state.game.hasPower(0); state.lastSelection = '';
  $('#audio-panel').hidden = true; $('#sound-btn').setAttribute('aria-expanded', 'false');
  const battle = state.game;
  gameAudio.startBattle().then(ok => { if (!ok && state.game === battle) toast('声音未能启动，可在声音设置中重试', true); });
  state.tab = 'build';
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'build'));
  updateUI(true);
  updateSelection();
  state.lastFrame = 0;
  const token = ++state.loopToken;
  requestAnimationFrame(now => frame(now, token));
}

function frame(now, token) {
  if (!state.game || token !== state.loopToken) return;
  const currentGame = state.game;
  const dt = state.lastFrame ? Math.max(0, Math.min(0.05, (now - state.lastFrame) / 1000)) : 0;
  state.lastFrame = now;
  if (state.keys.has('arrowleft') || state.keys.has('a-pan')) state.renderer.pan(-320 * dt, 0);
  if (state.keys.has('arrowright') || state.keys.has('d-pan')) state.renderer.pan(320 * dt, 0);
  if (state.keys.has('arrowup') || state.keys.has('w-pan')) state.renderer.pan(0, -320 * dt);
  if (state.keys.has('arrowdown') || state.keys.has('s-pan')) state.renderer.pan(0, 320 * dt);
  if (state.pointerPosition && !state.panning && !state.touchPoints.size && !state.game.paused && $('#modal').classList.contains('hidden')) {
    const { x, y } = state.pointerPosition, { width, height } = state.renderer.viewport;
    const edge = 16, dx = x < edge ? -1 : x > width - edge ? 1 : 0, dy = y < edge ? -1 : y > height - edge ? 1 : 0;
    if (dx || dy) state.renderer.pan(dx * 450 * dt, dy * 450 * dt);
  }
  state.game.update(dt);
  gameAudio.setPaused(state.game.paused || document.hidden);
  state.renderer.render(now);
  updateBuildingInspector(now);
  $('#zoom-level').textContent = `${Math.round(state.renderer.camera.zoom * 100)}%`;
  if (now - state.lastUI > 180) { updateUI(); state.lastUI = now; }
  if (currentGame === state.game && (state.game.running || state.game.paused)) requestAnimationFrame(next => frame(next, token));
}

function updateUI(force = false) {
  const g = state.game;
  if (!g) return;
  const p = g.players[0];
  if (g.victoryMode === 'control') $('#battle-objective').textContent = `信标积分 ${Math.floor(p.controlScore)} : ${Math.floor(g.players[1].controlScore)} / 240`;
  const environmentStatus = $('#environment-status');
  environmentStatus.hidden = !g.map.future;
  if (g.map.future) { const weather = weatherState(g.map, g.time); environmentStatus.textContent = `${weather.phase === 'storm' ? '离子扰动' : weather.phase === 'warning' ? '扰动预警' : '通信稳定'} · ${Math.ceil(weather.remaining)} 秒`; }
  $('#credits').textContent = fmt(p.credits);
  $('#power').textContent = `${p.powerIn} / ${p.powerOut}`;
  $('.resource.power').classList.toggle('warning', !g.hasPower(0));
  if (state.lastPower !== g.hasPower(0)) { gameAudio.say(g.hasPower(0) ? 'powerRestored' : 'powerLow'); state.lastPower = g.hasPower(0); }
  if (p.credits < 5 && (p.buildQueue || g.ownedBuildings(0).some(b => b.active))) gameAudio.say('fundsLow');
  $('#army').textContent = g.ownedUnits(0).length;
  $('#clock').textContent = seconds(g.time);
  $('#battle-status').textContent = !g.hasPower(0) ? '电力不足' : g.pendingBuilding ? '等待部署建筑' : g.pendingAbility ? '选择技能目标' : g.paused ? '战斗暂停' : '战斗进行中';
  const q = p.buildQueue;
  const activeProducer = g.ownedBuildings(0).find(b => b.active) || g.ownedBuildings(0).find(b => b.queue.length);
  if (g.pendingBuilding) {
    $('#queue-title').textContent = BUILDINGS[g.pendingBuilding].name; $('#queue-time').textContent = '准备部署'; $('#queue-detail').textContent = '在基地附近的空地上左键放置'; $('#queue-progress').style.width = '100%';
  } else if (q) {
    const d = BUILDINGS[q.type]; $('#queue-title').textContent = d.name; $('#queue-time').textContent = `${Math.ceil(d.time - q.progress)} 秒`;
    $('#queue-detail').textContent = p.credits < 5 ? '资金不足，建造暂停' : '建造中 · 资金随进度扣除'; $('#queue-progress').style.width = `${q.progress / d.time * 100}%`;
  } else if (activeProducer?.active) {
    const a = activeProducer.active, d = UNITS[a.type]; $('#queue-title').textContent = equipmentProfile(p.faction, a.type).name;
    const duration = productionDuration(g, activeProducer, a.type);
    $('#queue-time').textContent = `${Math.max(0, Math.ceil(duration - a.progress))} 秒`; $('#queue-detail').textContent = `${BUILDINGS[activeProducer.type].name} · 队列 ${activeProducer.queue.length} 项`;
    $('#queue-progress').style.width = `${Math.min(100, a.progress / duration * 100)}%`;
  } else if (activeProducer?.queue.length) {
    const type = activeProducer.queue[0];
    $('#queue-title').textContent = equipmentProfile(p.faction, type).name;
    $('#queue-time').textContent = '排队中';
    $('#queue-detail').textContent = `${BUILDINGS[activeProducer.type].name} · 队列 ${activeProducer.queue.length} 项`;
    $('#queue-progress').style.width = '0%';
  } else {
    $('#queue-title').textContent = '建造序列'; $('#queue-time').textContent = '待命'; $('#queue-detail').textContent = '选择建筑或生产单位开始部署'; $('#queue-progress').style.width = '0%';
  }
  $('#queue-cancel').hidden = !(g.pendingBuilding || q || activeProducer);
  $('#queue-cancel').title = g.pendingBuilding || q ? '取消建筑建造并返还已支付资金' : '取消当前单位生产并返还已支付资金';
  const selectedEntity = g.selected.length === 1 ? g.getEntity(g.selected[0]) : null;
  const healthLabel = $('#selection-panel .selection-health');
  if (selectedEntity && healthLabel) healthLabel.textContent = selectionStatus(selectedEntity);
  updateSidebar(force);
}

function updateSidebar(force = false) {
  const g = state.game; if (!g) return;
  const root = $('#sidebar-content');
  const queues = g.ownedBuildings(0).filter(b => PRODUCERS.includes(b.type)).map(b => `${b.type}:${b.active?.type || ''}:${b.queue.join(',')}`).join(';');
  const key = `${state.tab}:${queues}:${g.players[0].buildQueue?.type || ''}:${g.pendingBuilding || ''}:${g.ownedBuildings(0).map(b => b.type).join(',')}:${g.players[0].abilityCharge >= 100}:${Math.floor(g.players[0].abilityCharge / 5)}:${g.players[0].abilityCooldown > 0}:${g.players[0].credits < 650}`;
  if (!force && root.dataset.renderKey === key) return;
  root.dataset.renderKey = key;
  const p = g.players[0], faction = FACTIONS[p.faction];
  if (state.tab === 'build') {
    root.innerHTML = `<p class="content-subhead">基地设施 · 按顺序解锁</p><div class="action-list">${BUILD_ORDER.filter(type => (!BUILDINGS[type].naval || g.map.water) && (!BUILDINGS[type].map || BUILDINGS[type].map === g.mapId)).map(type => {
      const d = BUILDINGS[type], locked = !g.canBuild(0, type), queued = p.buildQueue?.type === type || g.pendingBuilding === type;
      const label = locked ? `需要 ${BUILDINGS[d.requires]?.name || '指挥中心'}` : d.desc;
      return `<button class="action-card ${locked ? 'locked' : ''} ${queued ? 'queued' : ''}" data-build="${type}" ${locked || p.buildQueue || g.pendingBuilding ? 'disabled' : ''} title="${d.desc}"><span class="action-icon"><img src="${modelThumbnail(equipmentModel(p.faction, type, g.map.future), teamVisual(0).color)}" alt=""></span><span class="action-text"><strong>${d.name}</strong><small>${label}</small></span><span class="action-cost">¤ ${fmt(d.cost)}<small>${d.time} 秒</small></span></button>`;
    }).join('')}</div>`;
    root.querySelectorAll('[data-build]').forEach(button => button.addEventListener('click', () => { if (g.startBuild(0, button.dataset.build)) updateUI(true); }));
  } else if (state.tab === 'units') {
    root.innerHTML = PRODUCERS.map(producer => {
      const types = UNIT_ORDER.filter(type => UNITS[type].producer === producer && (!UNITS[type].faction || UNITS[type].faction === p.faction) && (!UNITS[type].naval || g.map.water) && (!UNITS[type].map || UNITS[type].map === g.mapId));
      if (!types.length) return '';
      const facilities = g.ownedBuildings(0, producer), count = facilities.reduce((sum,b) => sum + b.queue.length + (b.active ? 1 : 0),0);
      return `<section class="production-group" data-producer="${producer}"><h3><span>${BUILDINGS[producer].name}</span><small>${!facilities.length ? '未部署' : count ? `${count} 项生产任务` : '待命'}</small>${count ? `<button class="icon-btn" data-cancel-producer="${producer}" title="取消${BUILDINGS[producer].name}当前生产" aria-label="取消${BUILDINGS[producer].name}当前生产">${icon('x')}</button>` : ''}</h3><div class="action-list">${types.map(type => {
        const d = UNITS[type], locked = !g.hasBuilding(0, d.producer) || d.requires && !g.hasBuilding(0, d.requires);
        const profile = equipmentProfile(p.faction, type);
        const label = locked ? `需要 ${!g.hasBuilding(0, d.producer) ? BUILDINGS[d.producer].name : BUILDINGS[d.requires].name}` : d.desc;
        return `<button class="action-card ${locked ? 'locked' : ''}" data-unit="${type}" ${locked ? 'disabled' : ''} title="${profile.category} · ${profile.country}：${profile.description}；游戏定位：${d.desc}"><span class="action-icon"><img src="${modelThumbnail(equipmentModel(p.faction, type, g.map.future), teamVisual(0).color)}" alt=""></span><span class="action-text"><strong>${profile.name}</strong><small>${label} · ${profile.category}</small></span><span class="action-cost">¤ ${fmt(g.unitCost(0, type))}<small>${d.time} 秒</small></span></button>`;
      }).join('')}</div></section>`;
    }).join('');
    root.querySelectorAll('[data-unit]').forEach(button => button.addEventListener('click', () => { if (!g.queueUnit(0, button.dataset.unit)) toast('生产队列已满', true); updateUI(true); }));
    root.querySelectorAll('[data-cancel-producer]').forEach(button => button.addEventListener('click', () => {
      const facilities = g.ownedBuildings(0, button.dataset.cancelProducer), facility = facilities.find(b => b.active) || facilities.find(b => b.queue.length);
      if (facility) g.cancelUnitProduction(0, facility.id);
      updateUI(true);
    }));
  } else {
    const ready = g.hasBuilding(0, 'super') && g.hasPower(0) && p.abilityCharge >= 100 && p.abilityCooldown <= 0 && p.credits >= 650;
    root.innerHTML = `<div class="tactic-panel" style="--faction-color:${faction.color}"><div class="tactic-banner"><strong>${faction.role}</strong><p>${faction.summary}<br>${faction.perk}</p></div><div class="ability-card"><div class="ability-card-header"><strong>${faction.ability}</strong>${icon('crosshair')}</div><p>${faction.abilityDesc}</p><div class="ability-charge"><div style="width:${p.abilityCharge}%"></div></div><div class="ability-meta"><span>充能 ${Math.floor(p.abilityCharge)}%</span><span>消耗 ¤ 650</span></div><button class="ability-button" id="ability-button" ${ready ? '' : 'disabled'}>${ready ? p.faction === 'china' ? '启动全域屏障' : '选择打击区域' : !g.hasBuilding(0, 'super') ? '需要战略武器站' : !g.hasPower(0) ? '电力不足' : p.abilityCooldown > 0 ? `冷却 ${Math.ceil(p.abilityCooldown)} 秒` : p.credits < 650 ? '资金不足' : '正在充能'}</button></div><div class="tactic-details"><div>黄矿：每份 1 资金 · 宝石：每份 2 资金</div><div>中立油井：每座 +11 资金/秒</div><div>雷达信标：占领后获得中央视野与小地图</div><div>断电：炮塔与雷达停用，高级生产减速</div><div>胜利目标：${VICTORY_MODES[g.victoryMode].description}</div></div></div>`;
    $('#ability-button').addEventListener('click', () => {
      if (p.faction === 'china') g.castAbility(0, 0);
      else { g.pendingAbility = true; toast('左键选择已侦察的技能目标区域'); }
      updateUI(true);
    });
  }
  refreshIcons();
}

function updateSelection() {
  const g = state.game; if (!g) return;
  const selected = g.selected.map(id => g.getEntity(id)).filter(Boolean);
  const selectionKey = selected.map(entity => entity.id).join(',');
  if (selectionKey !== state.lastSelection) { state.dismissedInspectorId = null; gameAudio.selection(selected); state.lastSelection = selectionKey; }
  const panel = $('#selection-panel');
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (!selected.length) panel.innerHTML = `<span class="hud-label">当前选择</span><strong>未选择单位</strong><span>${touch ? '轻点选择 · 拖动地图' : '左键选择 · 框选部队 · 右键下达命令'}</span>`;
  else if (selected.length === 1) {
    const e = selected[0], profile = e.kind === 'unit' ? equipmentProfile(g.players[e.owner].faction, e.type) : null, name = profile ? profile.name : BUILDINGS[e.type].name;
    const actions = e.kind === 'building' ? `<div class="selection-actions"><button type="button" data-action="repair" class="${e.repairing ? 'active' : ''}" title="${e.hp >= e.maxHp && !e.repairing ? '建筑完好' : e.repairing ? '停止维修' : '维修建筑'}" ${e.hp >= e.maxHp && !e.repairing ? 'disabled' : ''}>${icon('wrench')}</button>${e.type === 'hq' ? '' : `<button type="button" data-action="sell" title="出售建筑，返还一半造价">${icon('coins')}</button>`}</div>` : e.type === 'apc' ? `<div class="selection-actions"><button type="button" data-action="unload" title="乘员下车" aria-label="乘员下车">${icon('log-out')}</button></div>` : '';
    panel.innerHTML = `<span class="hud-label">当前选择${profile ? ` · ${profile.category}` : ''}</span><strong>${name}</strong><span class="selection-health">${selectionStatus(e)}</span>${profile ? `<span class="equipment-detail" title="${profile.description}">${profile.description}${inCover(g.map, e) ? ' · 掩体内' : ''}</span>` : ''}${actions}`;
    panel.querySelector('[data-action="repair"]')?.addEventListener('click', () => { g.toggleRepair(0, e.id); updateSelection(); });
    panel.querySelector('[data-action="sell"]')?.addEventListener('click', () => { g.sellBuilding(0, e.id); updateUI(true); });
    panel.querySelector('[data-action="unload"]')?.addEventListener('click', () => { g.unloadTransport(e); updateSelection(); });
    refreshIcons();
  } else panel.innerHTML = `<span class="hud-label">当前选择</span><strong>${selected.length} 个单位</strong><span>${touch ? '选择指令后轻点目标' : '右键移动或攻击 · A 攻击移动 · S 停止'}</span>`;
}

function updatePanControl() {
  $('#pan-map-btn').setAttribute('aria-pressed', String(state.cameraPanMode));
  $('#game-canvas').classList.toggle('pan-mode', state.cameraPanMode);
  $('#game-canvas').classList.toggle('panning', Boolean(state.panning?.moved || state.panning?.button !== undefined && state.panning.button !== 2));
}

function updateBuildingInspector(now) {
  const g = state.game, r = state.renderer, panel = $('#building-info');
  if (!g || !r || !$('#modal').classList.contains('hidden') || g.pendingBuilding || g.pendingAbility || state.panning || state.touchPan || state.touchPinching || state.drag?.moved) { panel.hidden = true; return; }
  const selected = g.selected.length === 1 ? g.getEntity(g.selected[0]) : null;
  const hovered = now - (r.hoverChangedAt || now) > 350 ? g.getEntity(r.hoveredId) : null;
  const entity = selected?.kind === 'building' ? selected : hovered?.kind === 'building' ? hovered : null;
  const data = buildingInformation(g, entity);
  if (!data || data.id === state.dismissedInspectorId) { panel.hidden = true; return; }
  const anchor = r.entityAnchor(entity);
  if (anchor.x < -20 || anchor.y < -20 || anchor.x > r.viewport.width + 20 || anchor.y > r.viewport.height + 20) { panel.hidden = true; return; }
  const content = JSON.stringify(data);
  if (content !== state.inspectorContent && (state.inspectorId !== data.id || now - state.inspectorAt > 180)) {
    state.inspectorAt = now; state.inspectorContent = content; state.inspectorId = data.id;
    panel.classList.toggle('enemy', !data.own);
    panel.style.setProperty('--team-color', teamVisual(entity.owner).color);
    const actions = data.own ? `<div class="building-info-actions"><button class="icon-btn ${data.repairing ? 'active' : ''}" data-inspect="repair" title="${data.repairing ? '停止维修' : '维修建筑'}" aria-label="${data.repairing ? '停止维修' : '维修建筑'}" ${g.paused || data.ratio === 1 && !data.repairing ? 'disabled' : ''}>${icon('wrench')}</button>${data.producer ? `<button class="icon-btn" data-inspect="rally" title="设置集结点" aria-label="设置集结点" ${g.paused ? 'disabled' : ''}>${icon('flag')}</button><button class="icon-btn" data-inspect="cancel" title="取消此设施当前生产" aria-label="取消此设施当前生产" ${g.paused || !data.production && !data.queue ? 'disabled' : ''}>${icon('circle-x')}</button>` : ''}${entity.type !== 'hq' ? `<button class="icon-btn" data-inspect="sell" title="出售建筑，返还 ${Math.floor(data.cost / 2)} 资金" aria-label="出售建筑" ${g.paused ? 'disabled' : ''}>${icon('coins')}</button>` : ''}</div>` : '';
    panel.innerHTML = `<div class="building-info-heading"><img src="${modelThumbnail(equipmentModel(g.players[entity.owner].faction, entity.type, g.map.future), teamVisual(entity.owner).color)}" alt=""><div><strong>${data.name}</strong><small>${data.own ? '我方' : '敌方'} · ${data.faction}</small></div><button class="icon-btn building-info-close" data-inspect="close" title="关闭建筑信息" aria-label="关闭建筑信息">${icon('x')}</button></div><div class="building-info-health"><span>生命 ${data.health} / ${data.maxHealth}</span><strong>${data.status}</strong></div><div class="building-info-track"><div style="width:${data.ratio * 100}%"></div></div><p class="building-info-description">${data.description}</p><div class="building-info-stats"><div><small>电力</small><strong>${data.power >= 0 ? '+' : ''}${data.power}</strong></div><div><small>造价</small><strong>¤ ${fmt(data.cost)}</strong></div><div><small>建造</small><strong>${data.time} 秒</strong></div></div>${data.own && data.producer ? `<div class="building-info-production"><div><span>${data.production?.name || '生产线待命'}</span><span>${data.production ? `${data.production.remaining} 秒` : ''}</span></div><div class="building-info-track"><div style="width:${(data.production?.progress || 0) * 100}%"></div></div><small>队列 ${data.queue} 项${data.rally ? ' · 已设置集结点' : ''}</small></div>` : ''}${actions}`;
    refreshIcons();
  }
  panel.hidden = false;
  panel.style.maxHeight = `${Math.max(80, r.viewport.height - 16)}px`;
  const canvasRect = r.canvas.getBoundingClientRect();
  const obstacles = [...$('#battlefield').querySelectorAll('.battle-hud, .camera-tools, .command-toolbar, .compact-radar:not([hidden]), .toast')].map(element => { const rect = element.getBoundingClientRect(); return { x: rect.x - canvasRect.x, y: rect.y - canvasRect.y, width: rect.width, height: rect.height }; });
  const rect = panel.getBoundingClientRect(), point = placeBuildingPanel(anchor, rect, r.viewport, obstacles);
  panel.style.left = `${point.x}px`; panel.style.top = `${point.y}px`;
}

function showModal(title, body, actions, kicker = '指挥系统') {
  state.modalMode = title;
  $('#modal-content').innerHTML = `<div class="modal-kicker">${kicker}</div><h2>${title}</h2>${body}<div class="modal-actions">${actions}</div>`;
  $('#modal').classList.remove('hidden');
  refreshIcons();
}

function showHelp() {
  if (state.game?.running) state.game.paused = true;
  gameAudio.setPaused(true);
  showModal('操作说明', `<p>${VICTORY_MODES[state.game?.victoryMode || 'quick'].description}即可获胜。采矿车会自动采集，工程师可右键占领中立油井。步兵右键友方运输车上车，选中运输车点下车按钮或按 U。补给车停驻后自动维修补弹；火箭炮自动展开，潜艇需要声呐探测。</p>
    <div class="keyline"><span>选择 / 框选部队</span><kbd>左键 / 拖动</kbd></div>
    <div class="keyline"><span>移动 / 攻击目标</span><kbd>右键</kbd></div>
    <div class="keyline"><span>攻击移动 / 停止</span><kbd>A / S</kbd></div>
    <div class="keyline"><span>选中所有作战单位</span><kbd>空格</kbd></div>
    <div class="keyline"><span>保存 / 选择编队</span><kbd>Ctrl+1~9 / 1~9</kbd></div>
    <div class="keyline"><span>平移 / 缩放</span><kbd>右键或中键拖动 / 滚轮</kbd></div>
    <div class="keyline"><span>拖拽地图模式 / 集结点</span><kbd>M / 选中工厂后右键</kbd></div>
    <div class="keyline"><span>全屏 / 收起指挥面板</span><kbd>F / B</kbd></div>
    <div class="keyline"><span>暂停 / 返回基地</span><kbd>Esc / H</kbd></div>`, '<button class="primary-btn" data-modal="resume">进入战场</button>');
}

function showPause() {
  if (!state.game || !state.game.running) return;
  state.game.paused = true;
  gameAudio.setPaused(true);
  $('#pause-btn').innerHTML = icon('play'); refreshIcons();
  showModal('战斗暂停', `<p>前线暂时安静了。继续指挥，或重新部署一场遭遇战。</p><p>当前战斗时长：${seconds(state.game.time)}</p>`, '<button class="primary-btn" data-modal="resume">继续作战</button><button class="secondary-btn" data-modal="restart">重新开始</button>', '战场控制');
}

function showResult(winner) {
  const win = winner === 0;
  const draw = winner === 'draw';
  gameAudio.setPaused(false); gameAudio.say(draw ? 'draw' : win ? 'victory' : 'defeat');
  $('#battle-status').textContent = draw ? '双方平局' : win ? '任务完成' : '任务失败';
  showModal(draw ? '战役平局' : win ? '战役胜利' : '战役失利', `<p>${draw ? '双方战力同时耗尽。' : win ? `敌方已失去继续作战的能力，${state.game.map.name}由你控制。` : '我方战力已耗尽。调整经济与部队组合，再来一局。'}</p><p>${state.game.map.name} · ${VICTORY_MODES[state.game.victoryMode].name} · ${state.game.difficulty.name}难度 · 作战时间 ${seconds(state.game.time)} · 剩余部队 ${state.game.ownedUnits(0).length} · 占领油井 ${state.game.oil.filter(o => o.owner === 0).length} · 信标 ${state.game.beacons.filter(site => site.owner === 0).length}</p>`, '<button class="primary-btn" data-modal="restart">再战一局</button><button class="secondary-btn" data-modal="menu">选择阵营</button>', draw ? '战局结束' : win ? '任务完成' : '战线告急');
}

function closeModal() {
  $('#modal').classList.add('hidden');
  state.modalMode = null;
  if (state.game?.winner !== null && state.game?.winner !== undefined) {
    state.game = null;
    gameAudio.stopBattle();
    $('#start-screen').style.display = '';
    return;
  }
  if (state.game?.paused) { state.game.paused = false; $('#pause-btn').innerHTML = icon('pause'); refreshIcons(); }
  gameAudio.setPaused(false);
}

function canvasPoint(event) { const rect = $('#game-canvas').getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function clearOrderButtons() { $('#move-btn').classList.remove('active'); $('#attack-btn').classList.remove('active'); }

function setupControls() {
  const canvas = $('#game-canvas');
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', event => {
    const g = state.game, r = state.renderer; if (!g || !g.running) return;
    const p = canvasPoint(event); canvas.setPointerCapture(event.pointerId);
    if (event.pointerType === 'touch') {
      state.touchPoints.set(event.pointerId, p);
      state.touchLast = p;
      state.touchStart = p;
      if (state.touchPoints.size > 1) {
        state.touchPinching = true; state.drag = null; r.dragBox = null;
        const [a, b] = [...state.touchPoints.values()]; state.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        return;
      }
    }
    if (event.pointerType !== 'touch' && (event.button === 2 || event.button === 1 || event.button === 0 && (event.altKey || state.cameraPanMode && !g.pendingBuilding && !g.pendingAbility && !g.orderMode))) { state.panning = { ...p, start: p, button: event.button, moved: false }; updatePanControl(); return; }
    if (g.paused) return;
    if (event.button === 0) { state.drag = { start: r.screenToWorld(p.x, p.y), end: r.screenToWorld(p.x, p.y), moved: false, additive: event.shiftKey }; }
  });
  canvas.addEventListener('pointermove', event => {
    const g = state.game, r = state.renderer; if (!g || !r) return;
    const p = canvasPoint(event); r.pointer = r.screenToWorld(p.x, p.y);
    state.pointerPosition = event.pointerType === 'touch' ? null : p;
    const hoveredId = r.pickEntity(p.x, p.y)?.id ?? null;
    if (hoveredId !== r.hoveredId) {
      r.hoverChangedAt = performance.now();
      if (g.selected.length !== 1 || g.getEntity(g.selected[0])?.kind !== 'building') state.dismissedInspectorId = null;
    }
    r.hoveredId = hoveredId;
    if (event.pointerType === 'touch') {
      state.touchPoints.set(event.pointerId, p);
      if (state.touchPoints.size > 1) {
        const [a, b] = [...state.touchPoints.values()];
        const next = Math.hypot(a.x - b.x, a.y - b.y);
        if (state.pinchDistance > 0) r.zoomAt(next / state.pinchDistance, (a.x + b.x) / 2, (a.y + b.y) / 2);
        state.pinchDistance = next; state.touchPinching = true; return;
      }
      if (state.touchLast && (state.touchPan || Math.hypot(p.x - state.touchStart.x, p.y - state.touchStart.y) > 8)) {
        state.touchPan = true; r.pan(state.touchLast.x - p.x, state.touchLast.y - p.y);
        state.drag = null; r.dragBox = null;
      }
      state.touchLast = p; return;
    }
    if (state.panning) {
      state.panning.moved ||= Math.hypot(p.x - state.panning.start.x, p.y - state.panning.start.y) > 6;
      if (state.panning.moved) { r.pan(state.panning.x - p.x, state.panning.y - p.y); state.panning.x = p.x; state.panning.y = p.y; }
      updatePanControl(); return;
    }
    if (state.drag) { state.drag.end = r.pointer; state.drag.moved = Math.hypot(state.drag.end.x - state.drag.start.x, state.drag.end.y - state.drag.start.y) > 9; r.dragBox = state.drag.moved && !g.pendingBuilding && !g.pendingAbility && !g.orderMode ? state.drag : null; }
  });
  canvas.addEventListener('pointerup', event => {
    const g = state.game, r = state.renderer; if (!g || !r || !g.running) return;
    const p = canvasPoint(event), world = g.pendingBuilding || state.drag?.moved ? r.screenToWorld(p.x, p.y) : r.pickPoint(p.x, p.y);
    if (event.pointerType === 'touch') {
      state.touchPoints.delete(event.pointerId);
      if (state.touchPan || state.touchPinching) {
        state.drag = null; r.dragBox = null;
        if (state.touchPoints.size === 0) { state.touchPan = false; state.touchPinching = false; state.pinchDistance = 0; state.touchLast = null; }
        return;
      }
      state.touchLast = null;
    }
    if (state.panning) { const pan = state.panning; state.panning = null; updatePanControl(); if (pan.button !== 2 || pan.moved) return; }
    if (g.paused) return;
    if (event.button === 2) {
      if (g.pendingAbility) { g.pendingAbility = false; toast('已取消技能定位'); }
      else if (g.orderMode) { g.orderMode = null; clearOrderButtons(); }
      else if (g.pendingBuilding) { toast('建筑等待部署，左键选择合适位置'); }
      else g.command(world.x, world.y);
      updateUI(true); return;
    }
    if (event.button !== 0) return;
    if (g.pendingBuilding) { if (!g.placeBuilding(0, g.pendingBuilding, world.x, world.y)) toast('此处无法部署，请靠近己方建筑并避开障碍', true); updateUI(true); }
    else if (g.pendingAbility) { if (!g.castAbility(world.x, world.y)) toast('技能未就绪，或目标区域尚未侦察', true); updateUI(true); }
    else if (g.orderMode === 'rally') { g.command(world.x, world.y); g.orderMode = null; }
    else if (g.orderMode === 'attackMove' || g.orderMode === 'move') { g.command(world.x, world.y, g.orderMode === 'attackMove'); clearOrderButtons(); }
    else if (state.drag?.moved) r.selectBox(state.drag.start, world, state.drag.additive);
    else { state.dismissedInspectorId = null; g.selectAt(world.x, world.y, event.shiftKey); }
    state.drag = null; r.dragBox = null;
  });
  canvas.addEventListener('pointercancel', event => { state.drag = null; state.panning = null; updatePanControl(); state.touchPoints.delete(event.pointerId); if (!state.touchPoints.size) { state.touchPan = false; state.touchPinching = false; } if (state.renderer) state.renderer.dragBox = null; });
  canvas.addEventListener('pointerleave', () => { state.pointerPosition = null; if (state.renderer) state.renderer.hoveredId = null; });
  canvas.addEventListener('wheel', event => { if (!state.renderer) return; event.preventDefault(); const p = canvasPoint(event); state.renderer.zoomAt(event.deltaY < 0 ? 1.09 : 1 / 1.09, p.x, p.y); }, { passive: false });
  $('#minimap').addEventListener('pointerdown', event => { if (!state.renderer || !state.game?.hasRadarIntel(0)) return; const rect = event.currentTarget.getBoundingClientRect(); state.renderer.centerOn((event.clientX - rect.left) / rect.width * state.game.world.width, (event.clientY - rect.top) / rect.height * state.game.world.height); });
  $('#minimap').addEventListener('pointermove', event => { if (!(event.buttons & 1) || !state.renderer || !state.game?.hasRadarIntel(0)) return; const rect = event.currentTarget.getBoundingClientRect(); state.renderer.centerOn((event.clientX - rect.left) / rect.width * state.game.world.width, (event.clientY - rect.top) / rect.height * state.game.world.height); });
  window.addEventListener('keydown', event => {
    if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey || event.altKey) && !/^[1-9]$/.test(event.key)) return;
    if (event.key === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement)) { event.preventDefault(); toggleFullscreen(); return; }
    const g = state.game; if (!g || $('#start-screen').style.display !== 'none') return;
    const key = event.key.toLowerCase();
    if (key === 'f' && !event.repeat) { event.preventDefault(); toggleFullscreen(); return; }
    if (key === 'b' && !event.repeat) { event.preventDefault(); setSidebarCollapsed(!state.sidebarCollapsed); return; }
    if (key === 'm' && !event.repeat) { event.preventDefault(); state.cameraPanMode = !state.cameraPanMode; updatePanControl(); return; }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
    if (key.startsWith('arrow')) state.keys.add(key);
    if (key === 'escape') { if (!$('#modal').classList.contains('hidden')) closeModal(); else showPause(); return; }
    if (!g.running || g.paused || !$('#modal').classList.contains('hidden')) return;
    if (key >= '1' && key <= '9') {
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); state.groups[key] = [...g.selected]; toast(`编队 ${key} 已保存`); }
      else if (state.groups[key]) { g.selected = state.groups[key].filter(id => g.getEntity(id)?.owner === 0); updateSelection(); const target = g.getEntity(g.selected[0]); if (target && event.shiftKey) state.renderer.centerOn(target.x, target.y); }
    } else if (key === ' ') { g.selectAllCombat(); }
    else if (key === 'a') { g.orderMode = 'attackMove'; clearOrderButtons(); $('#attack-btn').classList.add('active'); toast('左键指定攻击移动目标'); }
    else if (key === 's') { g.stopSelected(); clearOrderButtons(); }
    else if (key === 'h') state.renderer.centerOn(280, state.game.homeY);
    else if (key === 'u') { for (const id of state.game.selected) state.game.unloadTransport(state.game.getEntity(id)); updateSelection(); }
  });
  window.addEventListener('keyup', event => state.keys.delete(event.key.toLowerCase()));
  window.addEventListener('resize', () => state.renderer?.resize());
  window.addEventListener('blur', () => state.keys.clear());
  new ResizeObserver(() => state.renderer?.resize()).observe($('#battlefield'));
  document.addEventListener('fullscreenchange', updateFullscreenControl);
  document.addEventListener('webkitfullscreenchange', updateFullscreenControl);
  $('#fullscreen-btn').addEventListener('click', toggleFullscreen);
  $('#sidebar-btn').addEventListener('click', () => setSidebarCollapsed(!state.sidebarCollapsed));
  $('#sidebar-close').addEventListener('click', () => setSidebarCollapsed(true));
  $('#pan-map-btn').addEventListener('click', () => { state.cameraPanMode = !state.cameraPanMode; updatePanControl(); });
  for (const [id, factor] of [['zoom-out-btn', 1 / 1.15], ['zoom-in-btn', 1.15]]) $( `#${id}`).addEventListener('click', () => { const r = state.renderer; if (r) r.zoomAt(factor, r.viewport.width / 2, r.viewport.height / 2); });
  $('#building-info').addEventListener('click', event => {
    const action = event.target.closest('[data-inspect]')?.dataset.inspect, g = state.game, id = state.inspectorId;
    if (action === 'close') { state.dismissedInspectorId = id; $('#building-info').hidden = true; return; }
    if (!g || g.paused) return;
    if (action === 'repair') g.toggleRepair(0, id);
    if (action === 'sell') g.sellBuilding(0, id);
    if (action === 'cancel') g.cancelUnitProduction(0, id);
    if (action === 'rally') { g.selected = [id]; g.orderMode = 'rally'; state.cameraPanMode = false; updatePanControl(); }
    updateSelection(); updateUI(true);
  });
  $('#move-btn').addEventListener('click', () => { if (!state.game) return; state.game.orderMode = 'move'; clearOrderButtons(); $('#move-btn').classList.add('active'); toast('在战场上指定移动目标'); });
  $('#attack-btn').addEventListener('click', () => { if (!state.game) return; state.game.orderMode = 'attackMove'; clearOrderButtons(); $('#attack-btn').classList.add('active'); toast('在战场上指定攻击移动目标'); });
  $('#all-btn').addEventListener('click', () => state.game?.selectAllCombat());
  $('#stop-btn').addEventListener('click', () => { state.game?.stopSelected(); clearOrderButtons(); });
  $('#home-btn').addEventListener('click', () => state.renderer?.centerOn(280, state.game.homeY));
  $('#queue-cancel').addEventListener('click', () => {
    const g = state.game; if (!g) return;
    if (g.pendingBuilding || g.players[0].buildQueue) g.cancelBuilding(0);
    else {
      const producer = g.ownedBuildings(0).find(b => b.active) || g.ownedBuildings(0).find(b => b.queue.length);
      if (producer) g.cancelUnitProduction(0, producer.id);
    }
    updateUI(true);
  });
  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => { state.tab = tab.dataset.tab; document.querySelectorAll('.tab').forEach(item => { item.classList.toggle('active', item === tab); item.setAttribute('aria-selected', item === tab ? 'true' : 'false'); }); updateSidebar(true); }));
  $('#help-btn').addEventListener('click', showHelp);
  $('#pause-btn').addEventListener('click', () => { if (state.game?.paused) closeModal(); else showPause(); });
  $('#sound-btn').addEventListener('click', () => {
    $('#audio-panel').hidden = !$('#audio-panel').hidden;
    $('#sound-btn').setAttribute('aria-expanded', String(!$('#audio-panel').hidden));
    gameAudio.unlock().then(ok => { if (ok && state.game && !gameAudio.music) gameAudio.startBattle(); }).catch(() => {});
  });
  $('#audio-close').addEventListener('click', () => { $('#audio-panel').hidden = true; $('#sound-btn').setAttribute('aria-expanded', 'false'); });
  $('#audio-muted').addEventListener('change', event => { gameAudio.setSettings({ muted: event.target.checked }); updateAudioControls(); });
  document.querySelectorAll('[data-audio]').forEach(slider => slider.addEventListener('input', () => { gameAudio.setSettings({ [slider.dataset.audio]: Number(slider.value) / 100 }); updateAudioControls(); }));
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#audio-panel, #sound-btn')) { $('#audio-panel').hidden = true; $('#sound-btn').setAttribute('aria-expanded', 'false'); } });
  $('#start-btn').addEventListener('click', startGame);
  document.querySelectorAll('[data-victory]').forEach(button => button.addEventListener('click', () => {
    state.victoryMode = button.dataset.victory;
    document.querySelectorAll('[data-victory]').forEach(option => option.classList.toggle('active', option === button));
  }));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('click', event => { if (event.target === $('#modal')) closeModal(); const action = event.target.closest('[data-modal]')?.dataset.modal; if (!action) return; if (action === 'resume') closeModal(); else if (action === 'restart') startGame(); else if (action === 'menu') { state.game = null; gameAudio.stopBattle(); $('#modal').classList.add('hidden'); $('#start-screen').style.display = ''; } });
}

function updateAudioControls() {
  const settings = gameAudio.settings;
  $('#audio-muted').checked = settings.muted;
  document.querySelectorAll('[data-audio]').forEach(slider => { slider.value = Math.round(settings[slider.dataset.audio] * 100); });
  document.querySelectorAll('[data-audio-value]').forEach(output => { output.value = `${Math.round(settings[output.dataset.audioValue] * 100)}%`; });
  $('#sound-btn').innerHTML = icon(settings.muted || !settings.master ? 'volume-x' : 'volume-2'); refreshIcons();
}

drawFactionPicker();
$('#map-select').innerHTML = Object.entries(MAPS).map(([id, map]) => `<option value="${id}">${map.name} · ${map.sector}</option>`).join('');
setupControls();
try { setSidebarCollapsed(localStorage.getItem('great-powers-sidebar') === 'collapsed'); } catch { setSidebarCollapsed(false); }
updateAudioControls();
refreshIcons();
Renderer.prepare().catch(() => {});
