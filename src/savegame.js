import { AI_DIFFICULTIES, BUILDINGS, FACTIONS, MAPS, UNITS, WORLD } from './data.js';
import { isLunarRobot, ROBOT_ENERGY } from './lunar-robots.js';
import { validBattleId } from './battle-identity.js';
import { battlefieldMap, resourceLayout, RESOURCE_TYPES } from './battlefield-expansion.js';
import { INTELLIGENCE_RULES } from './intelligence.js';
import { validateBattleStats } from './battle-report.js';

export const SAVE_VERSION = 1;
export const SAVE_LIMIT = 8 * 1024 * 1024;
export const SAVE_KEYS = { manual: 'great-powers-save-manual-v1', auto: 'great-powers-save-auto-v1' };
export const SNAPSHOT_FIELDS = ['time', 'players', 'units', 'buildings', 'ore', 'oil', 'beacons', 'fogs', 'projectiles', 'nextProjectileId', 'selected', 'pendingBuilding', 'pendingAbility', 'aiTimer', 'aiWaveTimer', 'fogTimer'];

const invalid = () => { throw new Error('存档内容不完整或已损坏，原有战局和存档未被替换'); };
const finite = value => typeof value === 'number' && Number.isFinite(value);
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const known = (table, key) => typeof key === 'string' && Object.hasOwn(table, key);

function checkTree(value, depth = 0) {
  if (depth > 24 || typeof value === 'number' && !finite(value)) invalid();
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) invalid();
    checkTree(item, depth + 1);
  }
}

export function validateSave(save) {
  if (save?.format !== 'great-powers-rts' || save.version !== SAVE_VERSION) throw new Error('无法读取此存档：文件类型或存档版本不兼容');
  checkTree(save);
  const s = save.state, config = save.config;
  if (!object(s) || !object(config) || !known(MAPS, config.mapId) || !known(AI_DIFFICULTIES, config.difficulty) || !['quick', 'annihilation', 'control'].includes(config.victoryMode) || !finite(save.savedAt) || !finite(s.time) || s.time < 0) invalid();
  if (config.economyMode !== undefined && !['mining', 'convoy'].includes(config.economyMode)) invalid();
  if (config.battleId !== undefined && !validBattleId(config.battleId)) invalid();
  if(config.battlefieldScale!==undefined&&![1,1.5].includes(config.battlefieldScale))invalid();
  if (SNAPSHOT_FIELDS.some(key => !Object.hasOwn(s, key))) invalid();
  if (!Array.isArray(s.players) || s.players.length !== 2) invalid();
  const checkProduction = (queue, definitions) => {
    if (queue !== null && (!object(queue) || !known(definitions, queue.type) || !finite(queue.progress) || queue.progress < 0 || !finite(queue.paid) || queue.paid < 0)) invalid();
  };
  for (const [side, player] of s.players.entries()) {
    if (!object(player) || player.side !== side || !known(FACTIONS, player.faction) || !['credits', 'abilityCharge', 'abilityCooldown', 'shieldUntil', 'controlScore', 'unitCount', 'aiPlanIndex', 'aiUnitCount', 'aiAirUnitCount', 'aiNavyUnitCount', 'aiEngineerRetryAt', 'aiScoutRetryAt', 'aiGhostRetryAt'].every(key => finite(player[key])) || player.credits < 0) invalid();
    checkProduction(player.buildQueue, BUILDINGS);
    for (const key of ['satelliteUntil', 'satelliteReadyAt']) if (player[key] !== undefined && (!finite(player[key]) || player[key] < 0)) invalid();
    if(player.cyberCharge!==undefined&&(!finite(player.cyberCharge)||player.cyberCharge<0||player.cyberCharge>INTELLIGENCE_RULES.cyberCharge))invalid();
    if(player.cyberLockedUntil!==undefined&&(!finite(player.cyberLockedUntil)||player.cyberLockedUntil<0||player.cyberLockedUntil>s.time+INTELLIGENCE_RULES.cyberDuration+.01))invalid();
    if(player.cyberSourceId!==undefined&&player.cyberSourceId!==null&&!Number.isSafeInteger(player.cyberSourceId))invalid();
    if(player.cyberPending!==undefined&&player.cyberPending!==null&&(!object(player.cyberPending)||!Number.isSafeInteger(player.cyberPending.sourceId)||!finite(player.cyberPending.executeAt)||player.cyberPending.executeAt<0||player.cyberPending.executeAt>s.time+INTELLIGENCE_RULES.cyberWarning+.01))invalid();
  }
  const map=battlefieldMap(config.mapId,config.battlefieldScale||1),world = map.world || WORLD, ids = new Set();
  const point = value => object(value) && finite(value.x) && finite(value.y);
  const checkOrder = order => {
    if (order === null) return;
    if (!object(order) || !['move', 'attackMove', 'attack', 'capture', 'board', 'rearm', 'restock', 'patrol','infiltrate','defuse','collect'].includes(order.type)) invalid();
    if (['move', 'attackMove', 'attack', 'capture', 'patrol','infiltrate','defuse','collect'].includes(order.type) && !point(order)) invalid();
    if (order.type === 'patrol' && (!finite(order.originX) || !finite(order.originY) || !finite(order.destinationX) || !finite(order.destinationY) || [order.x, order.originX, order.destinationX].some(x => x < 0 || x > world.width) || [order.y, order.originY, order.destinationY].some(y => y < 0 || y > world.height))) invalid();
    if (['attack', 'capture', 'board','infiltrate','defuse','collect'].includes(order.type) && typeof order.targetId !== 'string' && !Number.isSafeInteger(order.targetId)) invalid();
    if(order.progress!==undefined&&(!finite(order.progress)||order.progress<0))invalid();
    if (order.homeId !== undefined && (order.type !== 'rearm' || !Number.isSafeInteger(order.homeId) || order.homeId < 1)) invalid();
  };
  for (const [key, definitions] of [['units', UNITS], ['buildings', BUILDINGS]]) {
    if (!Array.isArray(s[key]) || s[key].length > 5000) invalid();
    for (const entity of s[key]) {
      if (!object(entity) || !Number.isSafeInteger(entity.id) || entity.id < 1 || ids.has(entity.id) || entity.kind !== (key === 'units' ? 'unit' : 'building') || !known(definitions, entity.type) || ![0, 1].includes(entity.owner) || !point(entity) || entity.x < 0 || entity.x > world.width || entity.y < 0 || entity.y > world.height || !finite(entity.hp) || !finite(entity.maxHp) || entity.maxHp <= 0 || !finite(entity.angle) || !finite(entity.fireTimer)) invalid();
      ids.add(entity.id);
      if (key === 'units') {
        if (!Array.isArray(entity.path) || entity.path.some(p => !point(p)) || !Array.isArray(entity.passengers) || entity.passengers.some(id => !Number.isSafeInteger(id)) || !['pathTimer', 'stunUntil', 'turretAngle', 'cargo', 'cargoValue', 'rearmProgress', 'temporaryUntil', 'movePulse', 'heat', 'deployProgress'].every(key => finite(entity[key]))) invalid();
        checkOrder(entity.order); checkOrder(entity.resumeOrder);
        const d = UNITS[entity.type];
        if (entity.battery !== undefined && (!isLunarRobot(MAPS[config.mapId], entity.type) || !finite(entity.battery) || entity.battery < 0 || entity.battery > ROBOT_ENERGY.capacity)) invalid();
        if (entity.ammo !== null && (!Number.isSafeInteger(entity.ammo) || entity.ammo < 0 || !d.ammo || entity.ammo > d.ammo)) invalid();
        if (d.stock && (!finite(entity.stock) || entity.stock < 0 || entity.stock > d.stock)) invalid();
        if (entity.type === 'supply' && entity.autoSupply !== undefined && typeof entity.autoSupply !== 'boolean') invalid();
        if (UNITS[entity.type].tags.includes('logistics')) {
          const f = entity.freight;
          if (!object(f) || !point(f.entry) || f.entry.x < 0 || f.entry.x > world.width || f.entry.y < 0 || f.entry.y > world.height || !['inbound', 'unloading', 'outbound'].includes(f.phase) || !finite(f.progress) || f.progress < 0 || !finite(f.value) || f.value < 0 || f.value > 900 || f.homeId !== null && !Number.isSafeInteger(f.homeId)) invalid();
          if (f.orbitAngle !== undefined && !finite(f.orbitAngle) || f.holding !== undefined && typeof f.holding !== 'boolean') invalid();
        }
        if (entity.deployment && (!point(entity.deployment) || !finite(entity.deployment.start) || !finite(entity.deployment.until) || !finite(entity.deployment.fromX) || !finite(entity.deployment.fromY))) invalid();
        if (entity.homeCarrierId !== undefined && entity.homeCarrierId !== null && (!Number.isSafeInteger(entity.homeCarrierId) || !d.tags.includes('deck'))) invalid();
        if (entity.deckApproach && (!object(entity.deckApproach) || !Number.isSafeInteger(entity.deckApproach.carrierId) || !finite(entity.deckApproach.start) || !finite(entity.deckApproach.until))) invalid();
      } else {
        if(entity.sabotage&&(!object(entity.sabotage)||entity.sabotage.owner!==1-entity.owner||!finite(entity.sabotage.plantedAt)||!finite(entity.sabotage.detonateAt)||entity.sabotage.plantedAt<0||entity.sabotage.detonateAt!==entity.sabotage.plantedAt+INTELLIGENCE_RULES.bombDelay||entity.sabotage.plantedAt>s.time+.01))invalid();
        if (!Array.isArray(entity.queue) || entity.queue.length > 1000 || entity.queue.some(type => !known(UNITS, type)) || !finite(entity.size) || entity.rallyPoint && !point(entity.rallyPoint)) invalid();
        checkProduction(entity.active, UNITS);
      }
    }
  }
  const transported = new Set(), units = new Map(s.units.map(u => [u.id, u]));
  for (const t of s.units) {
    let weight = 0;
    for (const id of t.passengers) {
      const u = units.get(id);
      if (!UNITS[t.type].capacity || !u || u === t || u.owner !== t.owner || u.embarkedIn !== t.id || transported.has(id) || UNITS[u.type].capacity) invalid();
      if (t.type === 'carrier' ? !UNITS[u.type].tags.includes('deck') || u.homeCarrierId !== t.id : UNITS[u.type].tags.some(tag => ['air', 'ship'].includes(tag)) || t.type === 'apc' && !UNITS[u.type].tags.includes('infantry')) invalid();
      transported.add(id); weight += t.type === 'carrier' || UNITS[u.type].tags.includes('infantry') ? 1 : 4;
    }
    if (weight > (UNITS[t.type].capacity || 0)) invalid();
  }
  for (const u of s.units) if (u.embarkedIn && !transported.has(u.id)) invalid();
  for (const u of s.units) if (u.homeCarrierId && units.has(u.homeCarrierId)) {
    const t = units.get(u.homeCarrierId);
    if (t.type !== 'carrier' || t.owner !== u.owner) invalid();
  }
  for (const t of s.units.filter(u => u.type === 'carrier')) {
    const planes = s.units.filter(u => u.hp > 0 && u.homeCarrierId === t.id);
    if (planes.length > UNITS.carrier.capacity || planes.some(u => u.owner !== t.owner)) invalid();
  }
  for (const key of ['ore', 'oil', 'beacons']) {
    if (!Array.isArray(s[key]) || s[key].length !== (key === 'ore' && config.economyMode === 'convoy' ? 0 : MAPS[config.mapId][key].length)) invalid();
    for (const site of s[key]) {
      if (!object(site) || !finite(site.x) || !finite(site.y)) invalid();
      if (key === 'ore' ? !finite(site.amount) || site.amount < 0 || !finite(site.max) || site.max <= 0 || !['gold', 'gem'].includes(site.kind) : ![null, 0, 1].includes(site.owner)) invalid();
    }
  }
  if(s.resourceSites!==undefined){
    if(!Array.isArray(s.resourceSites)||s.resourceSites.length!==0&&s.resourceSites.length!==6)invalid();
    const layout=resourceLayout(map),seen=new Set();
    for(const site of s.resourceSites){
      const expected=layout.find(v=>v.id===site?.id);
      if(!expected||seen.has(site.id)||site.kind!=='resource'||site.type!==expected.type||site.x!==expected.x||site.y!==expected.y||!known(RESOURCE_TYPES,site.type)||site.max!==expected.max||!finite(site.amount)||site.amount<0||site.amount>site.max||!finite(site.progress)||site.progress<0||![null,0,1].includes(site.owner)||site.type!=='depot'&&site.owner!==null)invalid();
      seen.add(site.id);
    }
  }
  if (!Array.isArray(s.fogs) || s.fogs.length !== 2) invalid();
  for (const fog of s.fogs) {
    if (fog.cols !== world.width / world.fog || fog.rows !== world.height / world.fog) invalid();
    for (const key of ['visible', 'explored']) if (!Array.isArray(fog[key]) || fog[key].length !== fog.cols * fog.rows || fog[key].some(value => typeof value !== 'boolean')) invalid();
  }
  if (!Array.isArray(s.selected) || s.selected.some(id => !Number.isSafeInteger(id)) || !Array.isArray(s.projectiles) || s.projectiles.length > 10000 || !Number.isSafeInteger(s.nextProjectileId) || ![s.aiTimer, s.aiWaveTimer, s.fogTimer].every(finite) || s.pendingBuilding !== null && !known(BUILDINGS, s.pendingBuilding) || typeof s.pendingAbility !== 'boolean') invalid();
  for (const projectile of s.projectiles) if (!object(projectile) || !['x', 'y', 'startX', 'startY', 'toX', 'toY', 'angle', 'age', 'amount', 'speed', 'hp', 'jam'].every(key => finite(projectile[key])) || projectile.speed <= 0 || ![0, 1].includes(projectile.owner) || !['wing', 'torpedo', 'rocket', 'missile', 'loitering', 'bomb'].includes(projectile.kind)) invalid();
  for (const projectile of s.projectiles) for (const key of ['sourceHeight', 'targetHeight', 'fallDuration']) if (projectile[key] !== undefined && (!finite(projectile[key]) || key === 'fallDuration' && (projectile[key] <= 0 || projectile[key] > 10))) invalid();
  if (save.view !== undefined && !object(save.view)) invalid();
  if (s.battleStats !== undefined && !validateBattleStats(s.battleStats, s.time)) invalid();
  if (s.logistics !== undefined) {
    if (!Array.isArray(s.logistics) || s.logistics.length !== 2) invalid();
    for (const [side, route] of s.logistics.entries()) if (!object(route) || route.side !== side || !['nextAir', 'nextSea', 'delivered', 'lost'].every(key => finite(route[key]) && route[key] >= 0)) invalid();
  } else if (config.economyMode === 'convoy') invalid();
  return save;
}

export function parseSave(text) {
  if (typeof text !== 'string' || text.length > SAVE_LIMIT) throw new Error('存档文件过大，无法读取');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('无法读取存档：不是有效的 JSON 文件'); }
  return validateSave(value);
}

export function createSave(game, view = {}, savedAt = Date.now()) {
  if (!game?.running || game.winner !== null) throw new Error('只能保存尚未结束的战局');
  const difficulty = Object.entries(AI_DIFFICULTIES).find(([, value]) => value === game.difficulty)?.[0];
  const save = { format: 'great-powers-rts', version: SAVE_VERSION, savedAt, config: { battlefieldScale:game.battlefieldScale||1,battleId:game.battleId, mapId: game.mapId, victoryMode: game.victoryMode, difficulty, economyMode: game.economyMode }, state: { ...Object.fromEntries(SNAPSHOT_FIELDS.map(key => [key, game[key]])), logistics: game.logistics,resourceSites:game.resourceSites||[], battleStats: game.battleStats }, view };
  validateSave(save);
  return JSON.parse(JSON.stringify(save));
}

export function writeSave(storage, slot, save) {
  if (!SAVE_KEYS[slot]) throw new Error('未知存档位置');
  validateSave(save);
  try { storage.setItem(SAVE_KEYS[slot], JSON.stringify(save)); } catch { throw new Error('本地存储不可用或空间不足，请导出存档文件；当前战局仍然保留'); }
  return save;
}

export function readSave(storage, slot) {
  const text = storage.getItem(SAVE_KEYS[slot]);
  return text ? parseSave(text) : null;
}
