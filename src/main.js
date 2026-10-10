import { isDesktop, desktopInvoke, desktopNotice } from './desktop.js';
import { createIcons, icons } from 'lucide';
import { BUILDINGS, BUILD_ORDER, FACTIONS, MAPS, PRODUCERS, UNITS, UNIT_ORDER, VICTORY_MODES, supportsMap } from './data.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { modelThumbnail } from './visual-assets.js';
import { gameAudio } from './audio.js';
import { buildingInformation, placeBuildingPanel, productionDuration } from './battlefield-details.js';
import { teamVisual } from './team-visuals.js';
import { equipmentProfile, equipmentModel, EQUIPMENT_SYSTEMS } from './equipment.js';
import { weatherState, inCover } from './tactical-rules.js';
import { parseSave, readSave, SAVE_LIMIT, writeSave } from './savegame.js';
import './styles.css';
import './mobile.css';
import './phase2.css';
import './visual-v2.css';
import './battlefield-details.css';
import './future.css';
import { isLunarRobot, lunarBuildingProfile } from './lunar-robots.js';
import './session.css';
import './visual-v3.css';
import './player-feedback.css';
import { Catalog } from './catalog.js';
import { CatalogSession } from './catalog-data.js';
import './catalog.css';
import { HONOR_KEY, readHonors, writeHonors, exportHonors, emptyHonors, honorProgress, settleHonors } from './player-honors.js';
import { HonorPanel, honorBadge, honorResultHTML } from './honor-ui.js';
import './honors.css';
import { INTELLIGENCE_RULES } from './intelligence.js';
import './intelligence.css';
import { OnlineClient } from './online-client.js';
import { OnlineGame } from './online-game.js';
import './online.css';
import { battleReportHTML } from './battle-report.js';
import './battle-report.css';

const $ = selector => document.querySelector(selector);
const fmt = amount => Math.floor(amount).toLocaleString('zh-CN');
const seconds = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
const selectionStatus = entity => {
  const d = UNITS[entity.type];
  if (entity.kind === 'unit' && isLunarRobot(state.game.map, entity.type)) return `机体 ${Math.ceil(entity.hp)} / ${Math.ceil(entity.maxHp)} · 电池 ${Math.ceil(entity.battery)}%${entity.order?.type === 'rearm' ? entity.battery <= 0 ? ' · 电池耗尽，等待供电救援' : ' · 返场充电／维修' : ''}${entity.stunUntil > state.game.time ? ' · 瘫痪' : ''}`;
  return `生命 ${Math.ceil(entity.hp)} / ${Math.ceil(entity.maxHp)}${entity.type === 'harvester' ? ` · 矿石 ${Math.floor(entity.cargo)} / 210` : ''}${d?.ammo ? ` · 弹药 ${entity.ammo} / ${d.ammo}` : ''}${d?.capacity ? ` · 载重 ${state.game.transportLoad(entity)} / ${d.capacity} 格 · ${entity.passengers.length} 单位` : ''}${entity.type === 'supply' ? ` · 库存 ${Math.floor(entity.stock)} / ${d.stock} · ${entity.autoSupply !== false ? '自动保障' : '驻点保障'}` : ''}${entity.type === 'carrier' ? ` · 舰载机 ${entity.wing} / ${d.wing}` : ''}${entity.type === 'laser' ? ` · 热量 ${Math.ceil(entity.heat)}%${entity.overheated ? ' 冷却中' : ''}` : ''}${entity.type === 'rocket' ? ` · 展开 ${entity.deployProgress.toFixed(1)} / 2 秒` : ''}${entity.type === 'submarine' ? state.game.submarineSurfaced(entity) ? ' · 港口浮航' : entity.exposedUntil > state.game.time ? ' · 暴露' : ' · 潜航' : ''}${entity.jammedUntil > state.game.time ? ' · 受干扰' : ''}${entity.order?.type === 'rearm' || entity.order?.type === 'restock' ? ' · 返场补给' : ''}`;
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
  sidebarCollapsed: false,
  loading: false,
  nextAutoAt: 45,
  autoSaveFailed: false,
  alertId: null
};

function localHonorProfile() {
  try { return {profile:readHonors(localStorage),error:''}; }
  catch(error) { return {profile:emptyHonors(),error:error.message}; }
}

function updateHonorOverview() {
  const {profile,error}=localHonorProfile(),{rank,next,pointsNeeded,winsNeeded}=honorProgress(profile);
  $('#honor-btn').innerHTML=honorBadge(rank);
  $('#honor-btn').title=`玩家荣誉 · ${rank.name}`;
  $('#commander-title').textContent=`${rank.name} · 等级 ${rank.level}`;
  $('#honor-profile-btn').innerHTML=`${honorBadge(rank)}<span><strong>${rank.name}</strong><small>${error?'荣誉暂不可读':`${fmt(profile.points)} 荣誉 · ${profile.wins} 场胜利`}</small><small>${error?'打开档案查看详情':next?`下一阶 ${next.name} · 还需 ${pointsNeeded} 分、${winsNeeded} 胜`:'最高称号已点亮 · 传奇仍在继续'}</small></span>${icon('chevron-right')}`;
  refreshIcons();
}

const honorSession=new CatalogSession();
const honorPanel=new HonorPanel($('#honor-dialog'),{refreshIcons,onImport:profile=>{writeHonors(localStorage,profile);updateHonorOverview();},onExport:profile=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify(exportHonors(profile),null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download=`大国崛起-荣誉档案-${new Date().toISOString().slice(0,10)}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
},onClose:()=>{
  honorSession.close(state.game,document.hidden);
  if(state.game?.running) { gameAudio.setPaused(state.game.paused);$('#pause-btn').innerHTML=icon(state.game.paused?'play':'pause');refreshIcons(); }
}});

function openHonors() {
  if(state.loading||honorPanel.dialog.open||catalog.dialog.open)return;
  const game=$('#start-screen').style.display==='none'?state.game:null;
  honorSession.open(game);state.keys.clear();state.drag=null;state.panning=null;state.pointerPosition=null;
  if(state.renderer)state.renderer.dragBox=null;
  updatePanControl();$('#audio-panel').hidden=true;$('#sound-btn').setAttribute('aria-expanded','false');
  if(game?.running)gameAudio.setPaused(true);
  const {profile,error}=localHonorProfile();honorPanel.open(profile,error);
}

const catalogSession = new CatalogSession();
const catalog = new Catalog($('#catalog-dialog'), { refreshIcons, onClose: () => {
  catalogSession.close(state.game, document.hidden);
  if (state.game?.running) {
    gameAudio.setPaused(state.game.paused);
    $('#pause-btn').innerHTML = icon(state.game.paused ? 'play' : 'pause');
    refreshIcons();
  }
} });

function openCatalog(entity = null) {
  if (state.loading || catalog.dialog.open || honorPanel.dialog.open) return;
  const game = $('#start-screen').style.display === 'none' ? state.game : null;
  const selected = entity || game?.getEntity(game.selected[0]);
  catalogSession.open(game);
  state.keys.clear(); state.drag = null; state.panning = null; state.pointerPosition = null;
  if (state.renderer) state.renderer.dragBox = null;
  updatePanControl();
  $('#audio-panel').hidden = true; $('#sound-btn').setAttribute('aria-expanded', 'false');
  if (game?.running) gameAudio.setPaused(true);
  catalog.open({ faction: selected ? game.players[selected.owner].faction : game?.players[0].faction || state.faction, mapId: game?.mapId || $('#map-select').value, id: selected ? `${selected.kind}:${selected.type}` : 'unit:tank' });
}

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
    if (isDesktop()) { const active = await desktopInvoke('desktop_fullscreen'); $('#fullscreen-btn').setAttribute('aria-pressed', String(active)); $('#fullscreen-btn').ariaLabel = active ? '退出全屏' : '进入全屏'; $('#fullscreen-btn').innerHTML = icon(active ? 'minimize' : 'maximize'); refreshIcons(); state.keys.clear(); requestAnimationFrame(() => state.renderer?.resize()); return; }
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
    <button class="faction-option ${state.faction === key ? 'active' : ''}" data-faction="${key}" aria-pressed="${state.faction === key}" style="--faction-color:${faction.color}">
      <span class="faction-symbol">${icon({ china: 'shield', russia: 'flame', nato: 'crosshair', asia: 'radar', middleeast: 'radio-tower' }[key])}</span>
      <span><strong>${faction.name}</strong><small>${EQUIPMENT_SYSTEMS[key].country}原型 · ${faction.summary}</small></span>
      <span class="faction-role">${faction.role}</span>
    </button>`).join('');
  $('#enemy-select').innerHTML = '<option value="random">随机阵营</option>' + Object.entries(FACTIONS).map(([key, value]) => `<option value="${key}">${value.name}${key === state.faction ? ' · 镜像对战' : ''}</option>`).join('');
  $('#enemy-select').value = enemyChoice;
  $('#faction-list').querySelectorAll('button').forEach(button => button.addEventListener('click', () => { state.faction = button.dataset.faction; drawFactionPicker(); }));
  refreshIcons();
}

function toast(message, danger = false) {
  const container = $('#start-screen').style.display !== 'none' || !$('#modal').classList.contains('hidden') ? $('#menu-toast-container') : $('#toast-container');
  const item = document.createElement('div'); item.className = `toast${danger ? ' danger' : ''}`; item.textContent = message;
  container.appendChild(item);
  setTimeout(() => { item.style.opacity = '0'; item.style.transition = 'opacity .3s'; setTimeout(() => item.remove(), 300); }, 2800);
  while (container.children.length > 3) container.firstElementChild.remove();
}

function beep(style, owner = 0) {
  gameAudio.shot(style, owner);
}

async function startGame(save = null, onlinePayload = null) {
  const button = $('#start-btn');
  if (state.loading) return;
  state.loading = true;
  gameAudio.unlock().catch(() => {});
  button.disabled = true;
  button.innerHTML = `${icon('loader-circle')} 战场部署中`;
  refreshIcons();
  try {
    await Renderer.prepare();
  } catch (error) {
    toast(`战场素材载入失败：${error.message}`, true);
    button.disabled = false;
    state.loading = false;
    button.innerHTML = `${icon('play')} 单机作战`;
    refreshIcons();
    return;
  }
  ++state.loopToken;
  gameAudio.stopBattle();
  state.renderer?.dispose();
  const enemyChoice = $('#enemy-select').value;
  const candidates = Object.keys(FACTIONS).filter(key => key !== state.faction);
  const enemy = enemyChoice === 'random' ? candidates[Math.floor(Math.random() * candidates.length)] : enemyChoice;
  state.difficulty = $('#difficulty-select').value;
  state.mapId = $('#map-select').value;
  const events = { notice: toast, shot: beep, voice: key => gameAudio.say(key), selection: updateSelection, end: showResult };
  state.game = onlinePayload ? new OnlineGame(onlinePayload, events, onlineClient) : save ? Game.fromSave(save, events) : new Game(state.faction, enemy, events, { victoryMode: state.victoryMode, difficulty: state.difficulty, mapId: state.mapId,battlefieldScale:$('#expanded-map').checked?1.5:1 });
  if (onlinePayload) { state.faction=state.game.players[0].faction;state.mapId=state.game.mapId;state.victoryMode=state.game.victoryMode;state.difficulty='standard'; }
  if (save) {
    state.faction = state.game.players[0].faction; state.mapId = save.config.mapId;
    state.victoryMode = save.config.victoryMode; state.difficulty = save.config.difficulty;
    $('#map-select').value = state.mapId; $('#difficulty-select').value = state.difficulty;
    $('#expanded-map').checked=state.game.battlefieldScale===1.5;
    drawFactionPicker(); $('#enemy-select').value = state.game.players[1].faction;
    document.querySelectorAll('[data-victory]').forEach(option => option.classList.toggle('active', option.dataset.victory === state.victoryMode));
  }
  try {
    state.renderer = new Renderer($('#game-canvas'), $('#minimap'), state.game);
  } catch (error) {
    state.game = null;
    state.renderer = null;
    toast(`无法初始化三维战场，请检查浏览器硬件加速：${error.message}`, true);
    button.disabled = false;
    state.loading = false;
    button.innerHTML = `${icon('play')} 单机作战`;
    refreshIcons();
    return;
  }
  button.disabled = false;
  state.loading = false;
  button.innerHTML = `${icon('play')} 单机作战`;
  refreshIcons();
  $('#start-screen').style.display = 'none';
  if (onlinePayload) state.renderer.centerOn(state.game.homeX,state.game.homeY);
  window.scrollTo(0, 0);
  $('#side-faction').textContent = FACTIONS[state.faction].name;
  $('#faction-short').textContent = `我方：${FACTIONS[state.faction].name}`;
  $('#enemy-short').textContent = `敌方：${state.game.enemyFaction.name}${onlinePayload?' · '+onlinePayload.room.members[1-onlinePayload.seat].name:''}`;
  $('#battle-status').textContent = '战斗进行中';
  $('#battle-objective').textContent = VICTORY_MODES[state.victoryMode].description;
  $('.battlefield').classList.toggle('future', !!state.game.map.future);
  $('#mission-label').textContent = `${VICTORY_MODES[state.victoryMode].name} · ${state.game.map.name}`;
  $('#minimap-map').textContent = state.game.map.name;
  $('#minimap-sector').textContent = state.game.map.sector;
  $('#modal').classList.add('hidden');
  state.modalMode = null;
  state.groups = {};
  for (const [key, ids] of Object.entries(save?.view?.groups || {})) if (/^[1-9]$/.test(key) && Array.isArray(ids)) state.groups[key] = ids.filter(id => state.game.getEntity(id)?.owner === 0);
  state.cameraPanMode = false; state.panning = null; state.drag = null; state.pointerPosition = null;
  state.touchPoints.clear(); state.touchStart = state.touchLast = null; state.touchPan = state.touchPinching = false;
  state.inspectorId = state.dismissedInspectorId = null; $('#building-info').hidden = true; updatePanControl();
  state.lastPower = state.game.hasPower(0); state.lastSelection = '';
  state.keys.clear(); state.nextAutoAt = state.game.time + 45; state.autoSaveFailed = false;
  $('#pause-btn').innerHTML = icon(save ? 'play' : 'pause');
  $('#attack-alert').hidden = true; state.alertId = null;
  if (save?.view?.center && Number.isFinite(save.view.center.x) && Number.isFinite(save.view.center.y)) {
    if (Number.isFinite(save.view.zoom)) state.renderer.camera.zoom = Math.max(.35, Math.min(2.2, save.view.zoom));
    state.renderer.centerOn(save.view.center.x, save.view.center.y);
  }
  $('#audio-panel').hidden = true; $('#sound-btn').setAttribute('aria-expanded', 'false');
  const battle = state.game;
  gameAudio.startBattle().then(ok => { if (state.game === battle) { gameAudio.setPaused(battle.paused); if (!ok) toast('声音未能启动，可在声音设置中重试', true); } });
  state.tab = 'build';
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.tab === 'build'));
  updateUI(true);
  updateSelection();
  state.lastFrame = 0;
  const token = ++state.loopToken;
  requestAnimationFrame(now => frame(now, token));
  if (save) showModal('战局已恢复', `<p>${state.game.map.name} · ${seconds(state.game.time)} · ${state.game.faction.name}</p>`, `<button class="primary-btn" data-modal="resume">${icon('play')} 继续作战</button><button class="secondary-btn" data-modal="menu">返回主界面</button>`);
  if(onlinePayload&&!state.game.running)showResult(state.game.winner);
  refreshIcons();
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
  if (!state.game.online && state.game.running && !state.game.paused && state.game.time >= state.nextAutoAt) {
    saveProgress('auto', false); state.nextAutoAt = state.game.time + 45;
  }
  gameAudio.setPaused(state.game.paused || document.hidden);
  state.renderer.render(now);
  updateBuildingInspector(now);
  $('#zoom-level').textContent = `${Math.round(state.renderer.camera.zoom * 100)}%`;
  $('#battle-view-btn').setAttribute('aria-pressed', String(state.renderer.viewMode === 'immersive'));
  if (now - state.lastUI > 180) { updateUI(); state.lastUI = now; }
  if (currentGame === state.game && (state.game.running || state.game.paused)) requestAnimationFrame(next => frame(next, token));
}

function updateUI(force = false) {
  const g = state.game;
  if (!g) return;
  const p = g.players[0];
  updateAttackAlert();
  const incoming=g.players[1].cyberPending,ownPending=p.cyberPending,locked=g.isControlLocked(0),cyber=$('#cyber-status');
  cyber.hidden=!incoming&&!ownPending&&!locked&&!g.hasBuilding(0,'super');
  cyber.classList.toggle('hostile',!!incoming||locked);$('.topbar').classList.toggle('cyber-active',!cyber.hidden);$('.battlefield').classList.toggle('cyber-disrupted',locked);
  cyber.textContent=locked?`链路干扰 ${Math.ceil(p.cyberLockedUntil-g.time)} 秒 · 自动还击保留`:incoming?`网络攻击预警 ${Math.ceil(incoming.executeAt-g.time)} 秒`:ownPending?`网络攻击排程 ${Math.ceil(ownPending.executeAt-g.time)} 秒`:!g.hasPower(0)?'网络战 · 供电中断':p.cyberCharge>=INTELLIGENCE_RULES.cyberCharge?'网络攻击已就绪':`网络战充能 ${Math.ceil(Math.max(0,INTELLIGENCE_RULES.cyberCharge-(p.cyberCharge||0)))} 秒`;
  if(locked){state.drag=null;state.renderer.dragBox=null;}
  $('#save-btn').disabled = !g.running || !!g.online;
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
  $('#battle-status').textContent = g.online && onlineClient.socket?.readyState !== WebSocket.OPEN ? '连接中断，正在重连' : g.online && g.paused ? `等待对手重连 ${Math.max(0,Math.ceil(((g.room?.deadline||Date.now())-Date.now())/1000))} 秒` : !g.hasPower(0) ? '电力不足' : g.pendingBuilding ? '等待部署建筑' : g.pendingAbility ? '选择技能目标' : g.paused ? '战斗暂停' : g.online ? '联网对战' : '战斗进行中';
  const q = p.buildQueue;
  const activeProducer = g.ownedBuildings(0).find(b => b.active) || g.ownedBuildings(0).find(b => b.queue.length);
  if (g.pendingBuilding) {
    $('#queue-title').textContent = lunarBuildingProfile(g.map.future, g.pendingBuilding, BUILDINGS[g.pendingBuilding]).name; $('#queue-time').textContent = '准备部署'; $('#queue-detail').textContent = g.placingBuilding ? '在基地附近的空地上左键放置' : '点击已完成的建筑，再选择部署位置'; $('#queue-progress').style.width = '100%';
  } else if (q) {
    const d = lunarBuildingProfile(g.map.future, q.type, BUILDINGS[q.type]); $('#queue-title').textContent = d.name; $('#queue-time').textContent = `${Math.ceil(d.time - q.progress)} 秒`;
    $('#queue-detail').textContent = p.credits < 5 ? '资金不足，建造暂停' : '建造中 · 资金随进度扣除'; $('#queue-progress').style.width = `${q.progress / d.time * 100}%`;
  } else if (activeProducer?.active) {
    const a = activeProducer.active, d = UNITS[a.type]; $('#queue-title').textContent = equipmentProfile(p.faction, a.type, g.map.future).name;
    const duration = productionDuration(g, activeProducer, a.type);
    $('#queue-time').textContent = `${Math.max(0, Math.ceil(duration - a.progress))} 秒`; $('#queue-detail').textContent = `${lunarBuildingProfile(g.map.future, activeProducer.type, BUILDINGS[activeProducer.type]).name} · ${g.map.future && activeProducer.type === 'barracks' && !g.hasPower(0) ? '缺电暂停' : `队列 ${activeProducer.queue.length} 项`}`;
    $('#queue-progress').style.width = `${Math.min(100, a.progress / duration * 100)}%`;
  } else if (activeProducer?.queue.length) {
    const type = activeProducer.queue[0];
    $('#queue-title').textContent = equipmentProfile(p.faction, type, g.map.future).name;
    $('#queue-time').textContent = '排队中';
    $('#queue-detail').textContent = `${lunarBuildingProfile(g.map.future, activeProducer.type, BUILDINGS[activeProducer.type]).name} · 队列 ${activeProducer.queue.length} 项`;
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
  const key = `${state.tab}:${queues}:${g.players[0].buildQueue?.type || ''}:${g.pendingBuilding || ''}:${g.ownedBuildings(0).map(b => b.type).join(',')}:${g.players[0].abilityCharge >= 100}:${Math.floor(g.players[0].abilityCharge / 5)}:${g.players[0].abilityCooldown > 0}:${g.players[0].credits < 650}:${g.players[0].credits < 1000}:${Math.ceil(Math.max(0, (g.players[0].satelliteReadyAt || 0) - g.time))}:${Math.ceil(Math.max(0, (g.players[0].satelliteUntil || 0) - g.time))}:${g.hasPower(0)}`;
  const intelligenceKey=`${Math.floor(g.players[0].cyberCharge||0)}:${!!g.players[0].cyberPending}:${g.isControlLocked(0)}`;
  if (!force && root.dataset.renderKey === key&&root.dataset.intelligenceKey===intelligenceKey) return;
  root.dataset.renderKey = key;
  root.dataset.intelligenceKey=intelligenceKey;
  const p = g.players[0], faction = FACTIONS[p.faction];
  if (state.tab === 'build') {
    root.innerHTML = `<p class="content-subhead">基地设施 · 按顺序解锁</p><div class="action-list">${BUILD_ORDER.filter(type => (!BUILDINGS[type].naval || g.map.water) && (!BUILDINGS[type].map || BUILDINGS[type].map === g.mapId)).map(type => {
      const d = lunarBuildingProfile(g.map.future, type, BUILDINGS[type]), locked = !g.canBuild(0, type), queued = p.buildQueue?.type === type || g.pendingBuilding === type;
      const label = locked ? `需要 ${lunarBuildingProfile(g.map.future, d.requires, BUILDINGS[d.requires])?.name || '指挥中心'}` : d.desc;
      const ready = g.pendingBuilding === type;
      return `<button class="action-card ${locked ? 'locked' : ''} ${queued ? 'queued' : ''}" data-build="${type}" ${!ready && (locked || p.buildQueue || g.pendingBuilding) ? 'disabled' : ''} title="${ready ? '建造完成，点击部署' : d.desc}"><span class="action-icon"><img src="${modelThumbnail(equipmentModel(p.faction, type, g.map.future), teamVisual(0).color)}" alt=""></span><span class="action-text"><strong>${d.name}</strong><small>${ready ? '已完成 · 点击部署' : label}</small></span><span class="action-cost">${ready ? '部署' : `¤ ${fmt(d.cost)}`}<small>${ready ? '待命' : `${d.time} 秒`}</small></span></button>`;
    }).join('')}</div>`;
    root.querySelectorAll('[data-build]').forEach(button => button.addEventListener('click', () => {
      if (g.pendingBuilding === button.dataset.build) { g.placingBuilding = true; g.orderMode = null; clearOrderButtons(); updateUI(true); }
      else if (g.startBuild(0, button.dataset.build)) updateUI(true);
    }));
  } else if (state.tab === 'units') {
    root.innerHTML = PRODUCERS.map(producer => {
      const types = UNIT_ORDER.filter(type => (type !== 'harvester' || g.economyMode === 'mining') && UNITS[type].producer === producer && (!UNITS[type].faction || UNITS[type].faction === p.faction) && (!UNITS[type].naval || g.map.water) && supportsMap(UNITS[type].map, g.mapId));
      if (!types.length) return '';
      const facilities = g.ownedBuildings(0, producer), count = facilities.reduce((sum,b) => sum + b.queue.length + (b.active ? 1 : 0),0);
      const producerName = lunarBuildingProfile(g.map.future, producer, BUILDINGS[producer]).name;
      return `<section class="production-group" data-producer="${producer}"><h3><span>${producerName}</span><small>${!facilities.length ? '未部署' : count ? `${count} 项生产任务` : '待命'}</small>${count ? `<button class="icon-btn" data-cancel-producer="${producer}" title="取消${producerName}当前生产" aria-label="取消${producerName}当前生产">${icon('x')}</button>` : ''}</h3><div class="action-list">${types.map(type => {
        const d = UNITS[type], locked = !g.hasBuilding(0, d.producer) || d.requires && !g.hasBuilding(0, d.requires);
        const profile = equipmentProfile(p.faction, type, g.map.future);
        const label = locked ? `需要 ${lunarBuildingProfile(g.map.future, !g.hasBuilding(0, d.producer) ? d.producer : d.requires, BUILDINGS[!g.hasBuilding(0, d.producer) ? d.producer : d.requires]).name}` : isLunarRobot(g.map, type) ? '电池驱动 · 电力充能' : d.desc;
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
    root.innerHTML = `<div class="tactic-panel" style="--faction-color:${faction.color}"><div class="tactic-banner"><strong>${faction.role}</strong><p>${faction.summary}<br>${faction.perk}</p></div><div class="ability-card"><div class="ability-card-header"><strong>${faction.ability}</strong>${icon('crosshair')}</div><p>${faction.abilityDesc}</p><div class="ability-charge"><div style="width:${p.abilityCharge}%"></div></div><div class="ability-meta"><span>充能 ${Math.floor(p.abilityCharge)}%</span><span>消耗 ¤ 650</span></div><button class="ability-button" id="ability-button" ${ready ? '' : 'disabled'}>${ready ? p.faction === 'china' ? '启动协同电子防护' : '选择打击区域' : !g.hasBuilding(0, 'super') ? '需要战略武器站' : !g.hasPower(0) ? '电力不足' : p.abilityCooldown > 0 ? `冷却 ${Math.ceil(p.abilityCooldown)} 秒` : p.credits < 650 ? '资金不足' : '正在充能'}</button></div><div class="tactic-details"><div>黄矿：每份 1 资金 · 宝石：每份 2 资金</div><div>中立油井：每座 +11 资金/秒</div><div>雷达信标：占领后获得中央视野与小地图</div><div>断电：炮塔与雷达停用，高级生产减速</div><div>胜利目标：${VICTORY_MODES[g.victoryMode].description}</div></div></div>`;
    $('#ability-button').addEventListener('click', () => {
      if (p.faction === 'china') g.castAbility(0, 0);
      else { g.pendingAbility = true; toast('左键选择已侦察的技能目标区域'); }
      updateUI(true);
    });
    const cooldown = Math.ceil(Math.max(0, (p.satelliteReadyAt || 0) - g.time));
    const satelliteReady = g.hasBuilding(0, 'radar') && g.hasBuilding(0, 'lab') && g.hasPower(0) && p.credits >= 1000 && !cooldown;
    root.querySelector('.tactic-details').firstElementChild.textContent = g.economyMode === 'mining' ? '月表矿石：黄矿 1／宝石 2 资金' : '空运每批 720、海运每批 900。最短班次间隔 36／60 秒，前班退出后再发下一班，卸货到账。';
    root.querySelector('.tactic-details').insertAdjacentHTML('beforebegin', `<div class="ability-card"><div class="ability-card-header"><strong>侦察卫星</strong>${icon('satellite')}</div><p>全图视野 8 秒 · 潜航仍需声呐 · 冷却 120 秒</p><div class="ability-meta"><span>${(p.satelliteUntil || 0) > g.time ? '卫星过境中' : cooldown ? `冷却 ${cooldown} 秒` : '待命'}</span><span>¤ 1,000</span></div><button class="ability-button" id="satellite-button" ${satelliteReady ? '' : 'disabled'}>${icon('satellite')} ${satelliteReady ? '请求卫星侦察' : !g.hasBuilding(0, 'lab') || !g.hasBuilding(0, 'radar') ? '需要雷达站与实验室' : !g.hasPower(0) ? '电力不足' : cooldown ? '卫星重新部署中' : '资金不足'}</button></div>`);
    $('#satellite-button').addEventListener('click', () => { g.activateSatellite(0); updateUI(true); });
    const cyberReady=g.hasBuilding(0,'super')&&g.hasPower(0)&&!p.cyberPending&&(p.cyberCharge||0)>=INTELLIGENCE_RULES.cyberCharge&&p.credits>=INTELLIGENCE_RULES.cyberCost&&!g.isControlLocked(0);
    root.querySelector('.tactic-details').insertAdjacentHTML('beforebegin',`<div class="ability-card"><div class="ability-card-header"><strong>指令链路干扰</strong>${icon('network')}</div><p>120 秒充能 · 12 秒预警 · 干扰新指令 4 秒<br>部队仍自动还击；源站摧毁或断电立即解除。</p><div class="ability-meta"><span>${Math.floor(p.cyberCharge||0)} / 120 秒</span><span>¤ 500</span></div><button id="cyber-button" class="ability-button" ${cyberReady?'':'disabled'}>${icon('radio-tower')}${cyberReady?'排程网络攻击':p.cyberPending?'攻击已排程':!g.hasBuilding(0,'super')?'需要战略武器站':!g.hasPower(0)?'电力不足':p.credits<500?'资金不足':'网络系统充能中'}</button></div>`);
    $('#cyber-button').addEventListener('click',()=>{g.launchCyber(0);updateUI(true);});
    root.querySelector('.tactic-details').insertAdjacentHTML('beforeend','<div>物资箱：陆军回收 300；设备回收场：工程师／矿车／补给车回收 900。</div><div>能源仓：工程师接管，40 电力、有限 1800 库存，可作为扩建前哨。</div>');
  }
  refreshIcons();
}

function updateSelection() {
  const g = state.game; if (!g) return;
  const selected = g.selected.map(id => g.getEntity(id)).filter(Boolean);
  $('#unload-btn').hidden = !selected.some(e => e.kind === 'unit' && UNITS[e.type].capacity);
  $('#resupply-btn').hidden = !selected.some(e => e.kind === 'unit' && !['harvester', 'supply'].includes(e.type) && !UNITS[e.type].tags.includes('logistics'));
  const selectionKey = selected.map(entity => entity.id).join(',');
  if (selectionKey !== state.lastSelection) { state.dismissedInspectorId = null; gameAudio.selection(selected); state.lastSelection = selectionKey; }
  const panel = $('#selection-panel');
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (!selected.length) panel.innerHTML = `<span class="hud-label">当前选择</span><strong>未选择单位</strong><span>${touch ? '轻点选择 · 拖动地图' : '左键选择 · 框选部队 · 右键下达命令'}</span>`;
  else if (selected.length === 1) {
    const e = selected[0], profile = e.kind === 'unit' ? equipmentProfile(g.players[e.owner].faction, e.type, g.map.future) : null, name = profile ? profile.name : lunarBuildingProfile(g.map.future, e.type, BUILDINGS[e.type]).name;
    const actions = e.kind === 'building' ? `<div class="selection-actions"><button type="button" data-action="repair" class="${e.repairing ? 'active' : ''}" title="${e.hp >= e.maxHp && !e.repairing ? '建筑完好' : e.repairing ? '停止维修' : '维修建筑'}" ${e.hp >= e.maxHp && !e.repairing ? 'disabled' : ''}>${icon('wrench')}</button>${e.type === 'hq' ? '' : `<button type="button" data-action="sell" title="出售建筑，返还一半造价">${icon('coins')}</button>`}</div>` : e.type === 'apc' ? `<div class="selection-actions"><button type="button" data-action="unload" title="乘员下车" aria-label="乘员下车">${icon('log-out')}</button></div>` : '';
    const robot = e.kind === 'unit' && isLunarRobot(g.map, e.type);
    const unitActions = e.kind === 'unit' && e.owner === 0 && !UNITS[e.type].tags.includes('logistics') ? `<div class="selection-actions">${UNITS[e.type].capacity ? `<button type="button" data-action="unload" title="卸载部队" aria-label="卸载部队">${icon('log-out')}</button>` : ''}${robot || UNITS[e.type].ammo || UNITS[e.type].tags.some(t => ['air', 'ship'].includes(t)) ? `<button type="button" data-action="resupply" title="${robot ? '返回充电维修' : '返回基地维修补给'}" aria-label="${robot ? '返回充电维修' : '返回基地维修补给'}">${icon(robot ? 'battery-charging' : 'fuel')}</button>` : ''}${e.type === 'supply' ? `<button type="button" data-action="auto-supply" class="${e.autoSupply !== false ? 'active' : ''}" aria-pressed="${e.autoSupply !== false}" title="自动寻找保障目标" aria-label="自动寻找保障目标">${icon('scan-search')}</button>` : ''}</div>` : '';
    panel.innerHTML = `<span class="hud-label">当前选择${profile ? ` · ${profile.category}` : ''}</span><strong>${name}</strong><span class="selection-health">${selectionStatus(e)}</span>${profile ? `<span class="equipment-detail" title="${profile.description}">${profile.description}${inCover(g.map, e) ? ' · 掩体内' : ''}</span>` : ''}${e.kind === 'building' ? actions : unitActions}`;
    if (e.type === 'carrier') {
      panel.querySelector('.selection-health').textContent = `生命 ${Math.ceil(e.hp)} / ${e.maxHp} · 实体舰载机 ${g.carrierAircraft(e).length} / 3 · 甲板 ${e.passengers.length} 架${e.order?.type === 'rearm' ? ' · 返港整备' : ''}`;
      const launch = panel.querySelector('[data-action="unload"]');
      if (launch) { launch.title = '舰载机起飞'; launch.setAttribute('aria-label', '舰载机起飞'); launch.innerHTML = icon('plane-takeoff'); }
    }
    if (e.freight) panel.querySelector('.selection-health').textContent += ` · ${e.freight.phase === 'unloading' ? `卸货 ${Math.floor(e.freight.progress)} 秒` : e.freight.phase === 'outbound' ? '空载返航' : e.freight.holding ? '等待接收航线' : '物资运输中'} · 待交付 ¤ ${e.freight.value}`;
    if (e.type === 'harvester') panel.insertAdjacentHTML('beforeend', `<div class="selection-actions"><button type="button" data-action="recycle" title="回收矿车，按剩余生命返还一半造价" aria-label="回收矿车">${icon('coins')}</button></div>`);
    if (!panel.querySelector('.selection-actions')) panel.insertAdjacentHTML('beforeend', '<div class="selection-actions"></div>');
    panel.querySelector('.selection-actions').insertAdjacentHTML('beforeend', `<button type="button" data-action="catalog" title="查看图鉴" aria-label="查看图鉴">${icon('book-open')}</button>`);
    panel.querySelector('[data-action="catalog"]').addEventListener('click', () => openCatalog(e));
    panel.querySelector('[data-action="recycle"]')?.addEventListener('click', () => { g.sellHarvester(0, e.id); updateUI(true); });
    panel.querySelector('[data-action="repair"]')?.addEventListener('click', () => { g.toggleRepair(0, e.id); updateSelection(); });
    panel.querySelector('[data-action="sell"]')?.addEventListener('click', () => { g.sellBuilding(0, e.id); updateUI(true); });
    panel.querySelector('[data-action="unload"]')?.addEventListener('click', () => { g.unloadTransport(e); updateSelection(); });
    panel.querySelector('[data-action="resupply"]')?.addEventListener('click', () => { if (!g.paused) g.requestResupply(e); updateSelection(); });
    panel.querySelector('[data-action="auto-supply"]')?.addEventListener('click', () => { if (!g.paused) g.toggleAutoSupply(e); updateSelection(); });
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
  if (!g || !r || !$('#modal').classList.contains('hidden') || g.placingBuilding || g.pendingAbility || state.panning || state.touchPan || state.touchPinching || state.drag?.moved) { panel.hidden = true; return; }
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
  const obstacles = [...$('#battlefield').querySelectorAll('.battle-hud, .camera-tools, .command-toolbar, .compact-radar:not([hidden]), .attack-alert:not([hidden]), .toast')].map(element => { const rect = element.getBoundingClientRect(); return { x: rect.x - canvasRect.x, y: rect.y - canvasRect.y, width: rect.width, height: rect.height }; });
  const rect = panel.getBoundingClientRect(), point = placeBuildingPanel(anchor, rect, r.viewport, obstacles);
  panel.style.left = `${point.x}px`; panel.style.top = `${point.y}px`;
}

function showModal(title, body, actions, kicker = '指挥系统') {
  state.modalMode = title;
  $('#modal').classList.remove('victory-result');
  $('#modal-content').innerHTML = `<div class="modal-kicker">${kicker}</div><h2>${title}</h2>${body}<div class="modal-actions">${actions}</div>`;
  $('#modal').classList.remove('hidden');
  refreshIcons();
}

function saveProgress(slot = 'manual', feedback = true) {
  if (state.game?.online) { if(feedback)toast('联网战局由服务器维护，刷新页面可重连');return false; }
  if (!state.game?.running) return false;
  try {
    const save = state.game.toSave({ center: { ...state.renderer.center }, zoom: state.renderer.camera.zoom, groups: state.groups });
    writeSave(localStorage, slot, save);
    if (isDesktop()) desktopInvoke('desktop_backup', { slot, contents: JSON.stringify(save) }).catch(e => toast(`本地备份失败：${e}`, true));
    if (feedback) toast(`进度已保存 · ${seconds(save.state.time)}`);
    state.autoSaveFailed = false; updateContinueControl();
    return true;
  } catch (error) {
    if (feedback || !state.autoSaveFailed) toast(error.message, true);
    state.autoSaveFailed = true;
    return false;
  }
}

function availableSaves() {
  return ['manual', 'auto'].map(slot => {
    try { return { slot, save: readSave(localStorage, slot) }; }
    catch (error) { return { slot, save: null, error: error.message }; }
  });
}

function updateContinueControl() {
  const saves = availableSaves(), latest = saves.filter(item => item.save).sort((a, b) => b.save.savedAt - a.save.savedAt)[0]?.save;
  $('#continue-btn').disabled = !latest;
  $('#save-summary').textContent = latest ? `${MAPS[latest.config.mapId].name} · ${seconds(latest.state.time)} · ${new Date(latest.savedAt).toLocaleString('zh-CN')}` : saves.some(item => item.error) ? '本地存档不可读取，可导入备份文件' : '暂无保存的战局';
}

function showLoadMenu() {
  if (state.game?.running) { state.game.paused = true; gameAudio.setPaused(true); }
  const rows = availableSaves().map(({ slot, save, error }) => `<div class="save-slot"><div><strong>${slot === 'manual' ? '手动存档' : '自动存档'}</strong><small>${save ? `${MAPS[save.config.mapId].name} · ${FACTIONS[save.state.players[0].faction].name} · ${seconds(save.state.time)}<br>${new Date(save.savedAt).toLocaleString('zh-CN')}` : error ? '存档不可读取，请导入备份文件' : '暂无存档'}</small></div><button class="icon-btn" data-modal="load-${slot}" title="读取${slot === 'manual' ? '手动' : '自动'}存档" aria-label="读取${slot === 'manual' ? '手动' : '自动'}存档" ${save ? '' : 'disabled'}>${icon('folder-open')}</button></div>`).join('');
  showModal('继续战局', `${state.game?.running ? '<p>读取前先备份当前战局到自动存档。</p>' : ''}${rows}`, `<button class="secondary-btn" data-modal="import">${icon('upload')} 导入存档</button><button class="primary-btn" data-modal="resume">${state.game ? '返回战场' : '返回'}</button>`);
}

async function loadProgress(slot) {
  if (state.loading) return;
  try {
    // 先读出目标存档，再备份当前战局，避免自动存档被覆盖后读错目标。
    const save = readSave(localStorage, slot);
    if (!save) throw new Error('未找到此存档');
    if (state.game?.running && !saveProgress('auto', true)) return;
    await startGame(save);
  } catch (error) { toast(error.message, true); }
}

async function exportProgress() {
  if (!state.game?.running) return;
  try {
    const save = state.game.toSave({ center: { ...state.renderer.center }, zoom: state.renderer.camera.zoom, groups: state.groups });
    if (isDesktop()) { if (await desktopInvoke('desktop_export', { contents: JSON.stringify(save) })) toast('存档文件已导出'); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(save)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url;
    anchor.download = `Great-Powers-save-${Date.now()}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('存档文件已导出');
  } catch (error) { toast(error.message, true); }
}

function requestMainMenu() {
  if(state.game?.online&&state.game.running){showModal('退出联网对战','<p>退出将判定本局认输。战斗仍在继续。</p>','<button class="primary-btn" data-modal="resume">继续作战</button><button class="secondary-btn" data-modal="online-leave">认输并返回</button>');return;}
  if (!state.game?.running) { returnToMenu(); return; }
  state.game.paused = true; state.keys.clear(); gameAudio.setPaused(true);
  showModal('返回主界面', `<p>${state.game.map.name} · 当前进度 ${seconds(state.game.time)}</p><p>是否保存本次战局？</p>`, `<button class="primary-btn" data-modal="save-menu">${icon('save')} 保存并返回</button><button class="secondary-btn" data-modal="discard-menu">不保存返回</button><button class="secondary-btn" data-modal="resume">取消</button>`);
}

function returnToMenu() {
  if(state.game?.online)onlineClient.leave();
  ++state.loopToken; state.keys.clear(); state.game = null;
  state.renderer?.dispose(); state.renderer = null; gameAudio.stopBattle();
  state.drag = state.panning = state.pointerPosition = null;
  state.touchPoints.clear(); state.inspectorId = state.dismissedInspectorId = null;
  $('#building-info').hidden = true; $('#attack-alert').hidden = true; $('#audio-panel').hidden = true;
  $('#toast-container').replaceChildren(); $('#modal').classList.add('hidden'); state.modalMode = null;
  $('#start-screen').style.display = ''; $('#pause-btn').innerHTML = icon('pause');
  updateContinueControl(); refreshIcons();
  updateHonorOverview();
}

function updateAttackAlert() {
  const g = state.game, alerts = (g.attackAlerts || []).filter(alert => g.time - alert.at < 7);
  const alert = alerts.sort((a, b) => Number(b.building) - Number(a.building) || b.at - a.at)[0];
  const panel = $('#attack-alert'); panel.hidden = !alert;
  if (!alert) { state.alertId = null; return; }
  const label = alert.building ? lunarBuildingProfile(g.map.future, alert.type, BUILDINGS[alert.type]).name : equipmentProfile(g.players[0].faction, alert.type, g.map.future).name;
  $('#attack-alert-title').textContent = alert.building ? '基地遭到攻击' : '部队遭到攻击';
  $('#attack-alert-detail').textContent = `${label} · ${alerts.length > 1 ? `${alerts.length} 处受袭` : '请求支援'}`;
  state.alertId = alert.id;
}

function locateAttack() {
  const alert = state.game?.attackAlerts?.find(item => item.id === state.alertId);
  if (alert) state.renderer.centerOn(alert.x, alert.y);
}

function showHelp() {
  if (state.game?.running) state.game.paused = true;
  gameAudio.setPaused(true);
  showModal('操作说明', `<p>${VICTORY_MODES[state.game?.victoryMode || 'quick'].description}即可获胜。常规地图依靠运输机和集装箱船交付物资，子午月表保留自动采矿；工程师可占领油井。补给车自动维护陆军，舰艇和潜艇按 R 返港维修补弹。兼容舰载机右键本方航母着舰，选中航母按 U 起飞。运输单位按 U 卸载，潜艇需要声呐探测。</p>
    <div class="keyline"><span>选择 / 框选部队</span><kbd>左键 / 拖动</kbd></div>
    <div class="keyline"><span>移动 / 攻击目标</span><kbd>右键</kbd></div>
    <div class="keyline"><span>攻击移动 / 停止</span><kbd>A / S</kbd></div>
    <div class="keyline"><span>返场整备 / 卸载或起飞</span><kbd>R / U</kbd></div>
    <div class="keyline"><span>选中所有作战单位</span><kbd>空格</kbd></div>
    <div class="keyline"><span>保存 / 选择编队</span><kbd>Ctrl+1~9 / 1~9</kbd></div>
    <div class="keyline"><span>平移 / 缩放</span><kbd>右键或中键拖动 / 滚轮</kbd></div>
    <div class="keyline"><span>拖拽地图模式 / 集结点</span><kbd>M / 选中工厂后右键</kbd></div>
    <div class="keyline"><span>全屏 / 收起指挥面板</span><kbd>F / B</kbd></div>
    <div class="keyline"><span>暂停 / 返回基地</span><kbd>Esc / H</kbd></div>`, '<button class="primary-btn" data-modal="resume">进入战场</button>');
}

function showPause() {
  if (!state.game || !state.game.running) return;
  if(state.game.online){showModal('联网对战','<p>战斗继续进行，双方只能在掉线重连期间共同暂停。</p>','<button class="primary-btn" data-modal="resume">返回战场</button><button class="secondary-btn" data-modal="menu">退出对战</button>');return;}
  state.game.paused = true;
  gameAudio.setPaused(true);
  $('#pause-btn').innerHTML = icon('play'); refreshIcons();
  const graphics = `<label class="graphics-setting">画质<select data-quality aria-label="画质"><option value="high" ${state.renderer.quality === 'high' ? 'selected' : ''}>精细</option><option value="standard" ${state.renderer.quality === 'standard' ? 'selected' : ''}>流畅</option></select></label>`;
  showModal('战斗暂停', `<p>${state.game.map.name} · 当前战斗时长 ${seconds(state.game.time)}</p>${graphics}`, `<button class="primary-btn" data-modal="resume">${icon('play')} 继续作战</button><button class="secondary-btn" data-modal="save">${icon('save')} 保存进度</button><button class="secondary-btn" data-modal="load">${icon('folder-open')} 读取存档</button><button class="secondary-btn" data-modal="export">${icon('download')} 导出存档</button><button class="secondary-btn" data-modal="menu">${icon('house')} 返回主界面</button><button class="secondary-btn" data-modal="restart">${icon('rotate-ccw')} 重新开始</button>`, '战场控制');
}

function showResult(winner) {
  const game=state.game,win=winner===0,draw=winner==='draw';
  if(game.online){gameAudio.say(draw?'draw':win?'victory':'defeat');if(win)gameAudio.celebrate(false);showModal(draw?'战局平局':win?'对战胜利':'重整旗鼓',`<p>${game.map.name} · ${seconds(game.time)} · 战绩由服务器结算</p>${battleReportHTML(game)}`,'<button class="primary-btn" data-modal="online-lobby">返回对战大厅</button><button class="secondary-btn" data-modal="menu">返回主界面</button>');return;}
  let settlement,error='';
  try {
    settlement=settleHonors(localStorage,{battleId:game.battleId,winner,difficulty:state.difficulty,mode:game.victoryMode,mapId:game.mapId,faction:game.players[0].faction,time:game.time});
  } catch(failure) { error=failure.message; }
  if(state.lastResultBattleId!==game.battleId) {
    state.lastResultBattleId=game.battleId;
    gameAudio.setPaused(false);gameAudio.say(draw?'draw':win?'victory':'defeat');
    if(win&&settlement?.status==='awarded')gameAudio.celebrate(settlement.toRank.index>settlement.fromRank.index);
  }
  $('#battle-status').textContent = draw ? '双方平局' : win ? '任务完成' : '任务失败';
  const award=win&&settlement?honorResultHTML(settlement,game.victoryMode):`<p>${draw?'双方战力同时耗尽，战局以平局结束。':win?`${game.map.name}由你控制。这场胜利值得庆祝。`:'一场失利不会抹去你的战绩。整备部队，再次出发。'}</p>${!win?'<p>荣誉积分不会减少，已获得的称号始终保留。</p>':''}`;
  showModal(draw?'战役平局':win?'战役胜利':'重整旗鼓',`${award}<p class="result-battle-summary">${game.map.name} · ${VICTORY_MODES[game.victoryMode].name} · ${game.difficulty.name}难度 · ${seconds(game.time)} · 剩余部队 ${game.ownedUnits(0).length} · 油井 ${game.oil.filter(o=>o.owner===0).length} · 信标 ${game.beacons.filter(site=>site.owner===0).length}</p>${error?'<p class="honor-warning" id="honor-save-warning" role="alert"></p>':''}`,`${error?`<button class="secondary-btn" data-modal="retry-honor">${icon('refresh-cw')} 重试保存荣誉</button>`:''}<button class="primary-btn" data-modal="restart">${icon('play')} 再战一局</button><button class="secondary-btn" data-modal="honors">${icon('award')} 荣誉档案</button><button class="secondary-btn" data-modal="menu">${icon('house')} 返回主界面</button>`,draw?'战局结束':win?'凯旋归来':'征途仍在继续');
  if(error)$('#honor-save-warning').textContent=error;
  $('#modal .modal-actions').insertAdjacentHTML('beforebegin', battleReportHTML(game));
  if(win)$('#modal').classList.add('victory-result');
  state.keys.clear();updateHonorOverview();
}

function closeModal() {
  $('#modal').classList.add('hidden');
  state.modalMode = null;
  if (state.game?.winner !== null && state.game?.winner !== undefined) {
    returnToMenu();
    return;
  }
  if (state.game?.paused) { state.game.paused = false; $('#pause-btn').innerHTML = icon('pause'); refreshIcons(); }
  gameAudio.setPaused(false);
}

function canvasPoint(event) { const rect = $('#game-canvas').getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }
function clearOrderButtons() { for (const id of ['move-btn', 'attack-btn', 'patrol-btn']) $(`#${id}`).classList.remove('active'); }

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
    if (event.pointerType !== 'touch' && (event.button === 2 || event.button === 1 || event.button === 0 && (event.altKey || state.cameraPanMode && !g.placingBuilding && !g.pendingAbility && !g.orderMode))) { state.panning = { ...p, start: p, button: event.button, moved: false }; updatePanControl(); return; }
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
    if (state.drag) { state.drag.end = r.pointer; state.drag.moved = Math.hypot(state.drag.end.x - state.drag.start.x, state.drag.end.y - state.drag.start.y) > 9; r.dragBox = state.drag.moved && !g.placingBuilding && !g.pendingAbility && !g.orderMode ? state.drag : null; }
  });
  canvas.addEventListener('pointerup', event => {
    const g = state.game, r = state.renderer; if (!g || !r || !g.running) return;
    const p = canvasPoint(event), world = g.placingBuilding || state.drag?.moved ? r.screenToWorld(p.x, p.y) : r.pickPoint(p.x, p.y);
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
      else if (g.placingBuilding) { g.placingBuilding = false; toast('已退出部署，建筑仍保留在建造面板'); }
      else g.command(world.x, world.y);
      updateUI(true); return;
    }
    if (event.button !== 0) return;
    if (g.pendingBuilding && g.placingBuilding) { if (!g.placeBuilding(0, g.pendingBuilding, world.x, world.y)) toast('此处无法部署，请靠近己方建筑并避开障碍', true); updateUI(true); }
    else if (g.pendingAbility) { if (!g.castAbility(world.x, world.y)) toast('技能未就绪，或目标区域尚未侦察', true); updateUI(true); }
    else if (g.orderMode === 'rally') { g.command(world.x, world.y); g.orderMode = null; }
    else if (['attackMove', 'move', 'patrol'].includes(g.orderMode)) { g.command(world.x, world.y, g.orderMode === 'attackMove'); clearOrderButtons(); }
    else if (state.drag?.moved) r.selectBox(state.drag.start, world, state.drag.additive);
    else { state.dismissedInspectorId = null; g.selectAt(world.x, world.y, event.shiftKey); }
    state.drag = null; r.dragBox = null;
  });
  canvas.addEventListener('pointercancel', event => { state.drag = null; state.panning = null; updatePanControl(); state.touchPoints.delete(event.pointerId); if (!state.touchPoints.size) { state.touchPan = false; state.touchPinching = false; } if (state.renderer) state.renderer.dragBox = null; });
  canvas.addEventListener('pointerleave', () => { state.pointerPosition = null; if (state.renderer) state.renderer.hoveredId = null; });
  canvas.addEventListener('wheel', event => { if (!state.renderer) return; event.preventDefault(); const p = canvasPoint(event); state.renderer.zoomAt(event.deltaY < 0 ? 1.09 : 1 / 1.09, p.x, p.y); }, { passive: false });
  $('#minimap').addEventListener('pointerdown', event => { if (!state.renderer || !state.game?.hasRadarIntel(0) || state.game.isControlLocked(0)) return; const rect = event.currentTarget.getBoundingClientRect(); state.renderer.centerOn((event.clientX - rect.left) / rect.width * state.game.world.width, (event.clientY - rect.top) / rect.height * state.game.world.height); });
  $('#minimap').addEventListener('pointermove', event => { if (!(event.buttons & 1) || !state.renderer || !state.game?.hasRadarIntel(0) || state.game.isControlLocked(0)) return; const rect = event.currentTarget.getBoundingClientRect(); state.renderer.centerOn((event.clientX - rect.left) / rect.width * state.game.world.width, (event.clientY - rect.top) / rect.height * state.game.world.height); });
  document.addEventListener('click',event=>{
    const g=state.game;if(!g?.running||!g.isControlLocked(0)||$('#start-screen').style.display!=='none')return;
    if(event.target.closest('[data-build],[data-unit],[data-cancel-producer],[data-action]:not([data-action="catalog"]),[data-inspect]:not([data-inspect="close"]),#move-btn,#attack-btn,#patrol-btn,#stop-btn,#unload-btn,#resupply-btn,#ability-button,#satellite-button,#cyber-button')){event.preventDefault();event.stopImmediatePropagation();toast('指令链路暂受干扰，部队仍自动还击',true);}
  },true);
  window.addEventListener('keydown', event => {
    if (catalog.dialog.open || honorPanel.dialog.open) return;
    if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
    if ((event.ctrlKey || event.metaKey || event.altKey) && !/^[1-9]$/.test(event.key)) return;
    if (event.key === 'Escape' && (document.fullscreenElement || document.webkitFullscreenElement || isDesktop() && $('#fullscreen-btn').getAttribute('aria-pressed') === 'true')) { event.preventDefault(); toggleFullscreen(); return; }
    const g = state.game; if (!g || $('#start-screen').style.display !== 'none') return;
    const key = event.key.toLowerCase();
    if (key === 'f' && !event.repeat) { event.preventDefault(); toggleFullscreen(); return; }
    if (key === 'b' && !event.repeat) { event.preventDefault(); setSidebarCollapsed(!state.sidebarCollapsed); return; }
    if (key === 'm' && !event.repeat) { event.preventDefault(); state.cameraPanMode = !state.cameraPanMode; updatePanControl(); return; }
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
    if (key.startsWith('arrow')) state.keys.add(key);
    if (key === 'escape') { if (g.placingBuilding) { g.placingBuilding = false; updateUI(true); } else if (g.orderMode) { g.orderMode = null; clearOrderButtons(); } else if (!$('#modal').classList.contains('hidden')) closeModal(); else showPause(); return; }
    if (!g.running || g.paused || !$('#modal').classList.contains('hidden')) return;
    if(g.isControlLocked(0)&&['a','p','s','u','r'].includes(key))return;
    if (key >= '1' && key <= '9') {
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); state.groups[key] = [...g.selected]; toast(`编队 ${key} 已保存`); }
      else if (state.groups[key]) { g.selected = state.groups[key].filter(id => g.getEntity(id)?.owner === 0); updateSelection(); const target = g.getEntity(g.selected[0]); if (target && event.shiftKey) state.renderer.centerOn(target.x, target.y); }
    } else if (key === ' ') { g.selectAllCombat(); }
    else if (key === 'a') { g.placingBuilding = false; g.orderMode = 'attackMove'; clearOrderButtons(); $('#attack-btn').classList.add('active'); toast('左键指定攻击移动目标'); }
    else if (key === 'p') { g.placingBuilding = false; g.orderMode = 'patrol'; clearOrderButtons(); $('#patrol-btn').classList.add('active'); }
    else if (key === 's') { g.stopSelected(); clearOrderButtons(); }
    else if (key === 'h') state.renderer.centerOn(state.game.homeX||280, state.game.homeY);
    else if (key === 'u') { for (const id of state.game.selected) state.game.unloadTransport(state.game.getEntity(id)); updateSelection(); }
    else if (key === 'r') { for (const id of state.game.selected) state.game.requestResupply(state.game.getEntity(id)); updateSelection(); }
  });
  window.addEventListener('keyup', event => state.keys.delete(event.key.toLowerCase()));
  window.addEventListener('resize', () => state.renderer?.resize());
  window.addEventListener('blur', () => state.keys.clear());
  new ResizeObserver(() => state.renderer?.resize()).observe($('#battlefield'));
  document.addEventListener('fullscreenchange', updateFullscreenControl);
  document.addEventListener('webkitfullscreenchange', updateFullscreenControl);
  $('#fullscreen-btn').addEventListener('click', toggleFullscreen);
  $('#catalog-btn').addEventListener('click', () => openCatalog());
  $('#menu-catalog-btn').addEventListener('click', () => openCatalog());
  $('#honor-btn').addEventListener('click', openHonors);
  $('#honor-profile-btn').addEventListener('click', openHonors);
  $('#sidebar-btn').addEventListener('click', () => setSidebarCollapsed(!state.sidebarCollapsed));
  $('#sidebar-close').addEventListener('click', () => setSidebarCollapsed(true));
  $('#pan-map-btn').addEventListener('click', () => { state.cameraPanMode = !state.cameraPanMode; updatePanControl(); });
  for (const [id, factor] of [['zoom-out-btn', 1 / 1.15], ['zoom-in-btn', 1.15]]) $( `#${id}`).addEventListener('click', () => { const r = state.renderer; if (r) r.zoomAt(factor, r.viewport.width / 2, r.viewport.height / 2); });
  $('#battle-view-btn').addEventListener('click', () => { const r = state.renderer; if (r) r.setViewMode(r.viewMode === 'immersive' ? 'tactical' : 'immersive'); });
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
  $('#move-btn').addEventListener('click', () => { if (!state.game) return; state.game.placingBuilding = false; state.game.orderMode = 'move'; clearOrderButtons(); $('#move-btn').classList.add('active'); toast('在战场上指定移动目标'); });
  $('#attack-btn').addEventListener('click', () => { if (!state.game) return; state.game.placingBuilding = false; state.game.orderMode = 'attackMove'; clearOrderButtons(); $('#attack-btn').classList.add('active'); toast('在战场上指定攻击移动目标'); });
  $('#patrol-btn').addEventListener('click', () => { if (!state.game) return; state.game.placingBuilding = false; state.game.orderMode = 'patrol'; clearOrderButtons(); $('#patrol-btn').classList.add('active'); });
  $('#unload-btn').addEventListener('click', () => { const g = state.game; if (!g || g.paused) return; for (const id of [...g.selected]) g.unloadTransport(g.getEntity(id)); updateSelection(); });
  $('#resupply-btn').addEventListener('click', () => { const g = state.game; if (!g || g.paused) return; for (const id of g.selected) g.requestResupply(g.getEntity(id)); updateSelection(); });
  $('#toolbar-toggle').addEventListener('click', () => {
    const collapsed = $('#command-toolbar').classList.toggle('collapsed');
    $('#toolbar-toggle').setAttribute('aria-expanded', String(!collapsed));
    $('#toolbar-toggle').setAttribute('aria-label', collapsed ? '展开部队指令' : '收起部队指令');
    $('#toolbar-toggle').title = collapsed ? '展开部队指令' : '收起部队指令';
    $('#toolbar-toggle').innerHTML = icon(collapsed ? 'chevron-left' : 'chevron-right'); refreshIcons();
  });
  $('#all-btn').addEventListener('click', () => state.game?.selectAllCombat());
  $('#stop-btn').addEventListener('click', () => { state.game?.stopSelected(); clearOrderButtons(); });
  $('#home-btn').addEventListener('click', () => state.renderer?.centerOn(state.game.homeX||280, state.game.homeY));
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
  $('#save-btn').addEventListener('click', () => saveProgress());
  $('#menu-btn').addEventListener('click', requestMainMenu);
  $('#continue-btn').addEventListener('click', showLoadMenu);
  $('#import-btn').addEventListener('click', importDesktopOrWeb);
  $('#attack-alert').addEventListener('click', locateAttack);
  $('#save-file').addEventListener('change', async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file || state.loading) return;
    try {
      if (file.size > SAVE_LIMIT) throw new Error('存档文件过大，无法读取');
      const save = parseSave(await file.text());
      if (state.game?.running && !saveProgress('auto', true)) return;
      await startGame(save);
    } catch (error) { toast(error.message, true); }
  });
  $('#sound-btn').addEventListener('click', () => {
    $('#audio-panel').hidden = !$('#audio-panel').hidden;
    $('#sound-btn').setAttribute('aria-expanded', String(!$('#audio-panel').hidden));
    gameAudio.unlock().then(ok => { if (ok && state.game && !gameAudio.music) gameAudio.startBattle(); }).catch(() => {});
  });
  $('#audio-close').addEventListener('click', () => { $('#audio-panel').hidden = true; $('#sound-btn').setAttribute('aria-expanded', 'false'); });
  $('#audio-test').addEventListener('click', () => { gameAudio.unlock().then(ok => { if (ok) gameAudio.say('welcome', { preview: true }); }).catch(() => {}); });
  $('#audio-voice').addEventListener('change', event => { gameAudio.setSettings({ voiceURI: event.target.value }); });
  window.speechSynthesis?.addEventListener('voiceschanged', updateVoiceOptions);
  $('#audio-muted').addEventListener('change', event => { gameAudio.setSettings({ muted: event.target.checked }); updateAudioControls(); });
  document.querySelectorAll('[data-audio]').forEach(slider => slider.addEventListener('input', () => { gameAudio.setSettings({ [slider.dataset.audio]: Number(slider.value) / 100 }); updateAudioControls(); }));
  document.addEventListener('pointerdown', event => { if (!event.target.closest('#audio-panel, #sound-btn')) { $('#audio-panel').hidden = true; $('#sound-btn').setAttribute('aria-expanded', 'false'); } });
  $('#start-btn').addEventListener('click', () => startGame());
  document.querySelectorAll('[data-victory]').forEach(button => button.addEventListener('click', () => {
    state.victoryMode = button.dataset.victory;
    document.querySelectorAll('[data-victory]').forEach(option => option.classList.toggle('active', option === button));
  }));
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('change', event => { if (event.target.matches('[data-quality]')) state.renderer?.setQuality(event.target.value); });
  $('#modal').addEventListener('click', event => {
    if (state.loading) return;
    if (event.target === $('#modal')) closeModal();
    const action = event.target.closest('[data-modal]')?.dataset.modal; if (!action) return;
    if (action === 'resume') closeModal();
    else if (action === 'online-leave') returnToMenu();
    else if (action === 'online-lobby') { returnToMenu();onlineClient.open(); }
    else if (action === 'honors') openHonors();
    else if (action === 'retry-honor' && state.game && state.game.winner!==null) showResult(state.game.winner);
    else if (action === 'save') saveProgress();
    else if (action === 'load') showLoadMenu();
    else if (action?.startsWith('load-')) loadProgress(action.slice(5));
    else if (action === 'export') exportProgress();
    else if (action === 'import') importDesktopOrWeb();
    else if (action === 'restart') {
      if (!state.game?.running) startGame();
      else showModal('重新开始', '<p>当前战局将备份到自动存档，然后重新部署。</p>', '<button class="primary-btn" data-modal="confirm-restart">保存后重新开始</button><button class="secondary-btn" data-modal="resume">取消</button>');
    } else if (action === 'confirm-restart') { if (saveProgress('auto', true)) startGame(); }
    else if (action === 'menu') requestMainMenu();
    else if (action === 'save-menu') { if (saveProgress('manual', true)) returnToMenu(); }
    else if (action === 'discard-menu') returnToMenu();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.game?.running && !state.game.online) {
      saveProgress('auto', false); state.game.paused = true; gameAudio.setPaused(true);
      $('#pause-btn').innerHTML = icon('play'); refreshIcons();
    }
    state.lastFrame = 0; state.keys.clear();
  });
  window.addEventListener('beforeunload', () => { if (state.game?.running) saveProgress('auto', false); });
  window.addEventListener('storage',event=>{if(event.key===HONOR_KEY)updateHonorOverview();});
}

function updateAudioControls() {
  const settings = gameAudio.settings;
  $('#audio-muted').checked = settings.muted;
  document.querySelectorAll('[data-audio]').forEach(slider => { slider.value = Math.round(settings[slider.dataset.audio] * 100); });
  document.querySelectorAll('[data-audio-value]').forEach(output => { output.value = `${Math.round(settings[output.dataset.audioValue] * 100)}%`; });
  $('#sound-btn').innerHTML = icon(settings.muted || !settings.master ? 'volume-x' : 'volume-2'); refreshIcons();
  updateVoiceOptions();
}

function updateVoiceOptions() {
  const select = $('#audio-voice');
  select.replaceChildren();
  for (const [value, label] of [['auto', '系统默认中文'], ['portable', '内置男声电台（合成）'], ['portable-female','内置女声电台（合成）'], ...(window.speechSynthesis?.getVoices() || []).filter(v => /^zh(?:-|_)/i.test(v.lang)).map(v => [v.voiceURI, v.name])]) {
    const option = document.createElement('option'); option.value = value; option.textContent = label; select.append(option);
  }
  select.value = gameAudio.settings.voiceURI || 'auto';
  if (select.selectedIndex < 0) select.value = 'auto';
}

const onlineClient=new OnlineClient({
  refreshIcons, prepare:()=>Renderer.prepare(),onNotice:toast,
  onAck:action=>{const voice={build:'construction',train:'queued',place:'deployed',stop:'stopOrder',move:'moveOrder',cyber:'cyberLaunch',satellite:'ability'}[action];if(state.game?.online&&voice)gameAudio.say(voice);},
  config:()=>({mapId:$('#map-select').value,victoryMode:state.victoryMode,faction:state.faction}),
  onBattle:async payload=>{
    if(state.game?.online&&state.game.battleId===payload.config.battleId){state.game.apply(payload);return;}
    await startGame(null,payload);
    if(state.game?.online&&onlineClient.latest?.config.battleId===state.game.battleId)state.game.apply(onlineClient.latest);
  },
  onSnapshot:payload=>{if(state.game?.online&&state.game.battleId===payload.config.battleId)state.game.apply(payload);},
  onStatus:message=>{if(state.game?.online)$('#battle-status').textContent=message;},
  onInterrupted:()=>{if(state.game?.online){state.game.running=false;showModal('战局已取消','<p>服务器维护或房间已过期，本局未记录胜负。</p>','<button class="primary-btn" data-modal="online-lobby">返回对战大厅</button>');}}
});
drawFactionPicker();
$('#map-select').innerHTML = Object.entries(MAPS).map(([id, map]) => `<option value="${id}">${map.name} · ${map.sector}</option>`).join('');
$('#map-select').value = state.mapId;
setupControls();
try { setSidebarCollapsed(localStorage.getItem('great-powers-sidebar') === 'collapsed'); } catch { setSidebarCollapsed(false); }
updateAudioControls();
updateHonorOverview();
updateContinueControl();
refreshIcons();
Renderer.prepare().catch(() => {});

async function importDesktopOrWeb() {
 if (!isDesktop()) { $('#save-file').click(); return; }
 if (state.loading) return;
 try { const text = await desktopInvoke('desktop_import'); if (!text) return; const save = parseSave(text); if (state.game?.running && !saveProgress('auto', true)) return; await startGame(save); } catch (e) { toast(String(e), true); }
}
desktopNotice();
