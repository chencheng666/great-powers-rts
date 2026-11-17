import { validDoctrine } from './command-doctrines.js';
import { validCampaign } from './snow-campaign.js';
import { isLandingShip } from './joint-operations.js';
import { validFuelState } from './fuel-rules.js';
import { packFog, unpackFog } from './network-protocol.js';
import { transportWeight, FRONTLINE_CAPACITY } from './frontline-rules.js';
import { runwayAircraft } from './airfield-rules.js';
import { validSandbox } from './commander-sandbox.js';
import { AI_DIFFICULTIES, BUILDINGS, FACTIONS, MAPS, UNITS, WORLD, supportsNuclearMap } from './data.js';
import { isLunarRobot, ROBOT_ENERGY } from './lunar-robots.js';
import { validBattleId } from './battle-identity.js';
import { battlefieldMap, resourceLayout, RESOURCE_TYPES } from './battlefield-expansion.js';
import { INTELLIGENCE_RULES } from './intelligence.js';
import { validateBattleStats } from './battle-report.js';
import { DRONE_ROLES, supportsDroneAutonomy } from './drone-autonomy.js';
import { DETERRENCE as R } from './deterrence-rules.js';
import { ORDER_QUEUE_LIMIT } from './command-queue.js';
import { validChallengeState } from './challenges.js';
import { COMBAT_STANCES, supportsCombatStance } from './combat-stance.js';
import { validMaritimeSave } from './maritime-logistics.js';

export const SAVE_VERSION = 1;
export const SAVE_LIMIT = 8 * 1024 * 1024;
export const SAVE_KEYS = { manual: 'great-powers-save-manual-v1', auto: 'great-powers-save-auto-v1' };
export const SNAPSHOT_FIELDS = ['time', 'players', 'units', 'buildings', 'ore', 'oil', 'beacons', 'fogs', 'projectiles', 'nextProjectileId', 'selected', 'pendingBuilding', 'pendingAbility', 'aiTimer', 'aiWaveTimer', 'fogTimer'];

const dummyDomain = type => UNITS[type].tags.includes('deck')?'carrier':UNITS[type].tags.includes('ship')?'dock':UNITS[type].tags.includes('air')&&!UNITS[type].tags.includes('logistics')?'airfield':null;
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
  if (save?.format !== 'great-powers-rts' || ![1,2].includes(save.version)) throw new Error('无法读取此存档：文件类型或存档版本不兼容');
  checkTree(save);
  if (save.config?.sandbox !== undefined && (!validSandbox(save.config.sandbox) || save.config.challengeId || save.state?.challenge || save.version === 2 || MAPS[save.config.mapId]?.missionOnly)) invalid();
  const s = save.state, config = save.config;
  const count=save.version===2?6:2,owners=Array.from({length:count},(_,i)=>i);
  if(save.version===2&&(config?.playerCount!==6||MAPS[config?.mapId]?.maxPlayers!==6))invalid();
  if (!object(s) || !object(config) || !known(MAPS, config.mapId) || !known(AI_DIFFICULTIES, config.difficulty) || !['quick', 'annihilation', 'control'].includes(config.victoryMode) || !finite(save.savedAt) || !finite(s.time) || s.time < 0) invalid();
  if (config.economyMode !== undefined && !['mining', 'convoy'].includes(config.economyMode)) invalid();
  if(config.nuclearEnabled!==undefined&&(typeof config.nuclearEnabled!=='boolean'||config.nuclearEnabled&&!supportsNuclearMap(config.mapId)))invalid();
  if(s.pendingNuclear!==undefined&&(typeof s.pendingNuclear!=='boolean'||s.pendingNuclear&&(!config.nuclearEnabled||!s.pendingAbility)))invalid();
  if(config.commandVersion!==undefined&&(config.commandVersion!==1||config.fuelVersion!==1||config.mapId!=='snowtosea'))invalid();
  if(s.commandStats!==undefined&&(!Array.isArray(s.commandStats)||s.commandStats.length!==count||s.commandStats.some(v=>!object(v)||['returns','emergencies','fuelLosses','transferred'].some(k=>!finite(v[k])||v[k]<0))))invalid();
  if(!validCampaign(s.campaign,config.commandVersion===1,s.time)||s.campaign&&!['active','intermission'].includes(s.campaign.status))invalid();
  if(config.fuelVersion!==undefined&&(config.fuelVersion!==1||config.mapId!=='snowtosea'||config.frontlineVersion!==1))invalid();
  if(config.frontlineVersion!==undefined&&(config.frontlineVersion!==1||config.mapId!=='snowtosea'))invalid();
  if (config.battleId !== undefined && !validBattleId(config.battleId)) invalid();
  if(config.battlefieldScale!==undefined&&![1,1.5].includes(config.battlefieldScale))invalid();
  if (SNAPSHOT_FIELDS.some(key => !Object.hasOwn(s, key))) invalid();
  if (!Array.isArray(s.players) || s.players.length !== count) invalid();
  const checkProduction = (queue, definitions) => {
    if(queue?.type==='amphibious'&&config.commandVersion!==1)invalid();
    if (queue !== null && (!object(queue) || !known(definitions, queue.type) || !finite(queue.progress) || queue.progress < 0 || !finite(queue.paid) || queue.paid < 0)) invalid();
  };
  for (const [side, player] of s.players.entries()) {
    if (!object(player) || player.side !== side || !known(FACTIONS, player.faction) || !['credits', 'abilityCharge', 'abilityCooldown', 'shieldUntil', 'controlScore', 'unitCount', 'aiPlanIndex', 'aiUnitCount', 'aiAirUnitCount', 'aiNavyUnitCount', 'aiEngineerRetryAt', 'aiScoutRetryAt', 'aiGhostRetryAt'].every(key => finite(player[key])) || player.credits < 0) invalid();
    if(count===6&&(!["human","ai"].includes(player.controlType)||typeof player.eliminated!=="boolean"))invalid();
    if(!validDoctrine(player,config.commandVersion===1,s.time))invalid();
    if(player.frontlineContacts!==undefined){const w=MAPS[config.mapId].world||WORLD;if(config.commandVersion!==1||!Array.isArray(player.frontlineContacts)||player.frontlineContacts.length>12||player.frontlineContacts.some(c=>!object(c)||!Number.isSafeInteger(c.id)||c.id<1||!finite(c.x)||!finite(c.y)||c.x<0||c.y<0||c.x>w.width||c.y>w.height||!finite(c.seenAt)||c.seenAt<0||c.seenAt>s.time))invalid();}
    if(player.jointTask!==undefined){const t=player.jointTask,w=MAPS[config.mapId].world||WORLD;if(config.commandVersion!==1||!object(t)||!['assemble','advance','recover','defend'].includes(t.phase)||!finite(t.x)||!finite(t.y)||t.x<0||t.y<0||t.x>w.width||t.y>w.height||!finite(t.since)||t.since<0||t.since>s.time)invalid();}
    checkProduction(player.buildQueue, BUILDINGS);
    if(player.nuclearCharge!==undefined&&(!finite(player.nuclearCharge)||player.nuclearCharge<0||player.nuclearCharge>R.charge))invalid();
    if(player.nuclearSpent!==undefined&&typeof player.nuclearSpent!=='boolean')invalid();
    if(player.nuclearPending!==undefined&&player.nuclearPending!==null){const n=player.nuclearPending,w=MAPS[config.mapId].world||WORLD;if(!config.nuclearEnabled||player.nuclearSpent||!object(n)||!Number.isSafeInteger(n.sourceId)||!finite(n.launchAt)||n.launchAt<s.time||n.launchAt>s.time+R.prepare+.01||!finite(n.x)||!finite(n.y)||n.x<0||n.y<0||n.x>w.width||n.y>w.height)invalid();}
    for (const key of ['satelliteUntil', 'satelliteReadyAt']) if (player[key] !== undefined && (!finite(player[key]) || player[key] < 0)) invalid();
    if(player.cyberCharge!==undefined&&(!finite(player.cyberCharge)||player.cyberCharge<0||player.cyberCharge>INTELLIGENCE_RULES.cyberCharge))invalid();
    if(player.cyberLockedUntil!==undefined&&(!finite(player.cyberLockedUntil)||player.cyberLockedUntil<0||player.cyberLockedUntil>s.time+INTELLIGENCE_RULES.cyberDuration+.01))invalid();
    if(player.cyberSourceId!==undefined&&player.cyberSourceId!==null&&!Number.isSafeInteger(player.cyberSourceId))invalid();
    if(player.cyberPending!==undefined&&player.cyberPending!==null&&(!object(player.cyberPending)||!Number.isSafeInteger(player.cyberPending.sourceId)||(player.cyberPending.targetSide!==undefined&&(!Number.isInteger(player.cyberPending.targetSide)||player.cyberPending.targetSide<0||player.cyberPending.targetSide>=count||player.cyberPending.targetSide===side))||!finite(player.cyberPending.executeAt)||player.cyberPending.executeAt<0||player.cyberPending.executeAt>s.time+INTELLIGENCE_RULES.cyberWarning+.01))invalid();
  }
  const map=battlefieldMap(config.mapId,config.battlefieldScale||1),world = map.world || WORLD, ids = new Set();
  if(map.missionOnly&&!s.challenge)invalid();
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
      if (!object(entity) || !Number.isSafeInteger(entity.id) || entity.id < 1 || ids.has(entity.id) || entity.kind !== (key === 'units' ? 'unit' : 'building') || !known(definitions, entity.type) || !owners.includes(entity.owner) || !point(entity) || entity.x < 0 || entity.x > world.width || entity.y < 0 || entity.y > world.height || !finite(entity.hp) || !finite(entity.maxHp) || entity.maxHp <= 0 || !finite(entity.angle) || !finite(entity.fireTimer)) invalid();
      ids.add(entity.id);
      if (key === 'units') {
        if(!validFuelState(entity,config,s))invalid();
        if(entity.type==='amphibious'&&config.commandVersion!==1)invalid();
        if(entity.landTransportId!==undefined){const t=s.units.find(u=>u.id===entity.landTransportId);if(config.commandVersion!==1||entity.type!=='engineer'||!Number.isSafeInteger(entity.landTransportId)||entity.landTransportId<1||t&&(t.owner!==entity.owner||!['landing','amphibious','airlift'].includes(t.type)))invalid();}
        if(entity.jointMission!==undefined){const m=entity.jointMission;if(config.commandVersion!==1||!object(m)||!point(m)||m.x<0||m.y<0||m.x>world.width||m.y>world.height||m.side!==entity.owner||!['assemble','advance'].includes(m.stage)||!finite(m.since)||m.since<0||m.since>s.time||!point(m.rally)||m.rally.x<0||m.rally.y<0||m.rally.x>world.width||m.rally.y>world.height||!Array.isArray(m.group)||m.group.length>240||m.group.some(id=>!Number.isSafeInteger(id)||id<1))invalid();}
        if (!Array.isArray(entity.path) || entity.path.some(p => !point(p)) || !Array.isArray(entity.passengers) || entity.passengers.some(id => !Number.isSafeInteger(id)) || !['pathTimer', 'stunUntil', 'turretAngle', 'cargo', 'cargoValue', 'rearmProgress', 'temporaryUntil', 'movePulse', 'heat', 'deployProgress'].every(key => finite(entity[key]))) invalid();
        if(entity.assignment!==undefined){
          const a=entity.assignment,domain=dummyDomain(entity.type);
          if(config.frontlineVersion!==1||!object(a)||a.domain!==domain||!Number.isSafeInteger(a.homeId)||a.homeId<1||!Number.isInteger(a.slot)||a.slot<0||a.slot>=FRONTLINE_CAPACITY[a.domain])invalid();
        }
        if(entity.reinforcement!==undefined){
          const r=entity.reinforcement;
          if(config.frontlineVersion!==1||!object(r)||!known(UNITS,r.type)||!UNITS[r.type].producer||!Number.isSafeInteger(r.homeId)||r.homeId<1||!['inbound','outbound','withdraw'].includes(r.phase)||!finite(r.startedAt)||r.startedAt<0||r.startedAt>s.time||r.progress!==undefined&&(!finite(r.progress)||r.progress<0)||r.rally!==null&&!point(r.rally)||r.delivery!==undefined&&!point(r.delivery)||entity.type!==r.type&&entity.type!=='freightPlane')invalid();
        }
        if(entity.deliveryUntil!==undefined&&(!finite(entity.deliveryUntil)||entity.deliveryUntil<0||entity.deliveryUntil>s.time+3.01||!['parachute','landed'].includes(entity.deliveryKind)))invalid();
        if (entity.defenseAmmo !== undefined && (entity.type !== 'carrier' || !Number.isInteger(entity.defenseAmmo) || entity.defenseAmmo < 0 || entity.defenseAmmo > 12)) invalid();
        for (const key of ['defenseReadyAt','defenseReload']) if (entity[key] !== undefined && (!finite(entity[key]) || entity[key] < 0 || key === 'defenseReload' && entity[key] > 2.4)) invalid();
        checkOrder(entity.order); checkOrder(entity.resumeOrder);
        if (entity.orderQueue !== undefined) {
          if (!Array.isArray(entity.orderQueue) || entity.orderQueue.length > ORDER_QUEUE_LIMIT) invalid();
          for (const order of entity.orderQueue) {
            if (!object(order) || !['move', 'attackMove'].includes(order.type) || !point(order) || order.x < 0 || order.x > world.width || order.y < 0 || order.y > world.height || order.formation !== undefined && typeof order.formation !== 'boolean') invalid();
          }
        }
        const d = UNITS[entity.type];
        if(entity.unloadQueue!==undefined&&(!isLandingShip(entity.type)||typeof entity.unloadQueue!=='boolean'))invalid();
        if(entity.nextUnloadAt!==undefined&&(!isLandingShip(entity.type)||!finite(entity.nextUnloadAt)||entity.nextUnloadAt<0||entity.nextUnloadAt>s.time+.76))invalid();
        if (entity.combatStance !== undefined && (!supportsCombatStance(entity) || typeof entity.combatStance !== 'string' || !Object.hasOwn(COMBAT_STANCES, entity.combatStance))) invalid();
        if(entity.swarmParentId!==undefined&&(!Number.isSafeInteger(entity.swarmParentId)||entity.swarmParentId<1||entity.temporaryUntil<=s.time||!['swarmScout','swarmDecoy','drone'].includes(entity.type)))invalid();
        if (entity.battery !== undefined && (!isLunarRobot(MAPS[config.mapId], entity.type) || !finite(entity.battery) || entity.battery < 0 || entity.battery > ROBOT_ENERGY.capacity)) invalid();
        if (entity.ammo !== null && (!Number.isSafeInteger(entity.ammo) || entity.ammo < 0 || !d.ammo || entity.ammo > d.ammo)) invalid();
        if (d.stock && (!finite(entity.stock) || entity.stock < 0 || entity.stock > d.stock)) invalid();
        if (entity.cruiseAmmo !== undefined && (entity.type !== 'submarine' || !Number.isSafeInteger(entity.cruiseAmmo) || entity.cruiseAmmo < 0 || entity.cruiseAmmo > 2) || entity.cruiseReadyAt !== undefined && (entity.type !== 'submarine' || !finite(entity.cruiseReadyAt) || entity.cruiseReadyAt < 0)) invalid();
        if (entity.type === 'supply' && entity.autoSupply !== undefined && typeof entity.autoSupply !== 'boolean') invalid();
        if (entity.counterIntelEnabled !== undefined && (entity.type !== 'counterIntel' || typeof entity.counterIntelEnabled !== 'boolean')) invalid();
        if (entity.autoDrone !== undefined && (!supportsDroneAutonomy(entity) || typeof entity.autoDrone !== 'boolean' || !Object.hasOwn(DRONE_ROLES, entity.droneRole))) invalid();
        if (UNITS[entity.type].tags.includes('logistics')&&!entity.reinforcement) {
          const f = entity.freight;
          if (!object(f) || !point(f.entry) || f.entry.x < 0 || f.entry.x > world.width || f.entry.y < 0 || f.entry.y > world.height || !['inbound', 'unloading', 'outbound'].includes(f.phase) || !finite(f.progress) || f.progress < 0 || !finite(f.value) || f.value < 0 || f.value > 900 || f.homeId !== null && !Number.isSafeInteger(f.homeId)) invalid();
          if (f.orbitAngle !== undefined && !finite(f.orbitAngle) || f.holding !== undefined && typeof f.holding !== 'boolean') invalid();
        }
        if (entity.airfieldOps && (!(config.frontlineVersion===1&&d.tags.includes('air')||runwayAircraft(entity.type, MAPS[config.mapId]?.future)) || !Number.isSafeInteger(entity.airfieldOps.homeId) || !Number.isInteger(entity.airfieldOps.slot) || entity.airfieldOps.slot < 0 || entity.airfieldOps.slot >= 6 || !['approach','taxiIn','parked','taxiOut'].includes(entity.airfieldOps.phase))) invalid();
        if (entity.deployment && (!point(entity.deployment) || !finite(entity.deployment.start) || !finite(entity.deployment.until) || !finite(entity.deployment.fromX) || !finite(entity.deployment.fromY))) invalid();
        if (entity.homeCarrierId !== undefined && entity.homeCarrierId !== null && (!Number.isSafeInteger(entity.homeCarrierId) || !d.tags.includes('deck'))) invalid();
        if(entity.carrierSlot!==undefined&&(!entity.homeCarrierId||!d.tags.includes('deck')||!Number.isInteger(entity.carrierSlot)||entity.carrierSlot<0||entity.carrierSlot>=UNITS.carrier.capacity))invalid();
        if(entity.airGroupHold!==undefined&&(entity.type!=='carrier'||typeof entity.airGroupHold!=='boolean'))invalid();
        if(entity.deckTaxi?.reversing!==undefined&&typeof entity.deckTaxi.reversing!=='boolean')invalid();
        if (entity.deckApproach && (!object(entity.deckApproach) || !Number.isSafeInteger(entity.deckApproach.carrierId) || !finite(entity.deckApproach.start) || !finite(entity.deckApproach.until))) invalid();
        if (entity.deckTaxi && (!object(entity.deckTaxi) || !d.tags.includes('deck') || !entity.embarkedIn || !['in','queued','out'].includes(entity.deckTaxi.phase) || !finite(entity.deckTaxi.progress) || entity.deckTaxi.progress < 0 || entity.deckTaxi.progress > 1 || typeof entity.deckTaxi.launch !== 'boolean')) invalid();
      } else {
        if(entity.sabotage&&(!object(entity.sabotage)||(!owners.includes(entity.sabotage.owner)||entity.sabotage.owner===entity.owner)||!finite(entity.sabotage.plantedAt)||!finite(entity.sabotage.detonateAt)||entity.sabotage.plantedAt<0||entity.sabotage.detonateAt!==entity.sabotage.plantedAt+INTELLIGENCE_RULES.bombDelay||entity.sabotage.plantedAt>s.time+.01))invalid();
        if (!Array.isArray(entity.queue) || entity.queue.length > 1000 || entity.queue.some(type => (!known(UNITS, type)||type==='amphibious'&&config.commandVersion!==1)) || !finite(entity.size) || entity.rallyPoint && !point(entity.rallyPoint)) invalid();
        checkProduction(entity.active, UNITS);
      }
    }
  }
  const occupied=new Set();
  for(const u of s.units.filter(u=>u.hp>0&&u.assignment)){
    const a=u.assignment,key=`${a.domain}:${a.homeId}:${a.slot}`;
    if(occupied.has(key))invalid();occupied.add(key);
    const home=[...s.buildings,...s.units].find(e=>e.id===a.homeId);
    if(home&&(home.owner!==u.owner||home.type!==(a.domain==='carrier'?'carrier':a.domain)))invalid();
  }
  const transported = new Set(), units = new Map(s.units.map(u => [u.id, u]));
  for (const t of s.units) {
    let weight = 0;
    for (const id of t.passengers) {
      const u = units.get(id);
      if (!UNITS[t.type].capacity || !u || u === t || u.owner !== t.owner || u.embarkedIn !== t.id || transported.has(id) || UNITS[u.type].capacity) invalid();
      if (t.type === 'carrier' ? !UNITS[u.type].tags.includes('deck') || u.homeCarrierId !== t.id : UNITS[u.type].tags.some(tag => ['air', 'ship'].includes(tag)) || t.type === 'apc' && !UNITS[u.type].tags.includes('infantry')) invalid();
      transported.add(id); weight += transportWeight({frontlineVersion:config.frontlineVersion},u,t);
    }
    if (weight > (UNITS[t.type].capacity || 0)+1e-9) invalid();
  }
  for (const u of s.units) if (u.embarkedIn && !transported.has(u.id)) invalid();
  for (const u of s.units) if (u.homeCarrierId && units.has(u.homeCarrierId)) {
    const t = units.get(u.homeCarrierId);
    if (t.type !== 'carrier' || t.owner !== u.owner) invalid();
  }
  for (const t of s.units.filter(u => u.type === 'carrier')) {
    const planes = s.units.filter(u => u.hp > 0 && u.homeCarrierId === t.id);
    if (planes.length > UNITS.carrier.capacity || planes.some(u => u.owner !== t.owner)) invalid();
    const slots=planes.filter(p=>p.carrierSlot!==undefined).map(p=>p.carrierSlot);
    if(new Set(slots).size!==slots.length)invalid();
  }
  for (const key of ['ore', 'oil', 'beacons']) {
    if (!Array.isArray(s[key]) || s[key].length !== (key === 'ore' && config.economyMode === 'convoy' ? 0 : MAPS[config.mapId][key].length)) invalid();
    for (const site of s[key]) {
      if (!object(site) || !finite(site.x) || !finite(site.y)) invalid();
      if (key === 'ore' ? !finite(site.amount) || site.amount < 0 || !finite(site.max) || site.max <= 0 || !['gold', 'gem'].includes(site.kind) : ![null,...owners].includes(site.owner)) invalid();
    }
  }
  if(s.resourceSites!==undefined){
    if(!Array.isArray(s.resourceSites)||s.resourceSites.length!==0&&s.resourceSites.length!==resourceLayout(map).length)invalid();
    const layout=resourceLayout(map),seen=new Set();
    for(const site of s.resourceSites){
      const expected=layout.find(v=>v.id===site?.id);
      if(!expected||seen.has(site.id)||site.kind!=='resource'||site.type!==expected.type||site.x!==expected.x||site.y!==expected.y||!known(RESOURCE_TYPES,site.type)||site.max!==expected.max||!finite(site.amount)||site.amount<0||site.amount>site.max||!finite(site.progress)||site.progress<0||![null,...owners].includes(site.owner)||site.type!=='depot'&&site.owner!==null)invalid();
      seen.add(site.id);
    }
  }
  if (!Array.isArray(s.fogs) || s.fogs.length !== count) invalid();
  for (const fog of s.fogs) {
    if (fog.cols !== world.width / world.fog || fog.rows !== world.height / world.fog) invalid();
    for (const key of ['visible', 'explored']) if (!Array.isArray(fog[key]) || fog[key].length !== fog.cols * fog.rows || fog[key].some(value => typeof value !== 'boolean')) invalid();
  }
  if (!Array.isArray(s.selected) || s.selected.some(id => !Number.isSafeInteger(id)) || !Array.isArray(s.projectiles) || s.projectiles.length > 10000 || !Number.isSafeInteger(s.nextProjectileId) || ![s.aiTimer, s.aiWaveTimer, s.fogTimer].every(finite) || s.pendingBuilding !== null && !known(BUILDINGS, s.pendingBuilding) || typeof s.pendingAbility !== 'boolean') invalid();
  for (const projectile of s.projectiles) if (!object(projectile) || !['x', 'y', 'startX', 'startY', 'toX', 'toY', 'angle', 'age', 'amount', 'speed', 'hp', 'jam'].every(key => finite(projectile[key])) || projectile.speed <= 0 || !owners.includes(projectile.owner) || !['nuclear','ballistic', 'wing', 'torpedo', 'rocket', 'missile', 'loitering', 'bomb'].includes(projectile.kind)) invalid();
  if(s.projectiles.some(p=>p.kind==='nuclear'&&(!config.nuclearEnabled||p.age<0||p.age>R.flight+.1||p.toX<0||p.toY<0||p.toX>world.width||p.toY>world.height||p.hp>R.projectileHP)))invalid();
  for (const projectile of s.projectiles) for (const key of ['sourceHeight', 'targetHeight', 'fallDuration']) if (projectile[key] !== undefined && (!finite(projectile[key]) || key === 'fallDuration' && (projectile[key] <= 0 || projectile[key] > 10))) invalid();
  for (const projectile of s.projectiles) if(projectile.flightRole!==undefined&&!['air-to-air','air-to-ground','surface','sub-launched'].includes(projectile.flightRole))invalid();
  for (const p of s.projectiles) if (p.queued !== undefined && (typeof p.queued !== 'boolean' || p.kind !== 'rocket') || p.launchDelay !== undefined && (!finite(p.launchDelay) || p.launchDelay < 0 || p.launchDelay > .5) || p.queued && !finite(p.launchDelay) || p.tubeOffset !== undefined && (!finite(p.tubeOffset) || Math.abs(p.tubeOffset) > 10)) invalid();
  if (save.view !== undefined && !object(save.view)) invalid();
  if (s.battleStats !== undefined && !validateBattleStats(s.battleStats, s.time,count)) invalid();
  if (!validChallengeState(s.challenge, config, s.time, [...s.units,...s.buildings],[...s.beacons,...(s.resourceSites||[])]) || s.challenge && count !== 2) invalid();
  if (s.logistics !== undefined) {
    if (!Array.isArray(s.logistics) || s.logistics.length !== count) invalid();
    for (const [side, route] of s.logistics.entries()) if (!object(route) || route.side !== side || !['nextAir', 'nextSea', 'delivered', 'lost'].every(key => finite(route[key]) && route[key] >= 0)||route.seaDelivered!==undefined&&(!finite(route.seaDelivered)||route.seaDelivered<0||route.seaDelivered>route.delivered)) invalid();
  } else if (config.economyMode === 'convoy') invalid();
  if (!validMaritimeSave(s,config)) invalid();
  return save;
}

export function parseSave(text) {
  if (typeof text !== 'string' || text.length > SAVE_LIMIT) throw new Error('存档文件过大，无法读取');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('无法读取存档：不是有效的 JSON 文件'); }
  if(value?.storageEncoding!==undefined){
    if(value.storageEncoding!=='fog-bits-v1'||!object(value.config)||!known(MAPS,value.config.mapId)||value.config.battlefieldScale!==undefined&&![1,1.5].includes(value.config.battlefieldScale))invalid();
    const map=battlefieldMap(value.config.mapId,value.config.battlefieldScale||1),world=map.world||WORLD,cols=world.width/world.fog,rows=world.height/world.fog;
    if(!object(value.state)||!Array.isArray(value.state.fogs)||value.state.fogs.length!==(map.maxPlayers===6?6:2))invalid();
    value.state.fogs=value.state.fogs.map(f=>{
      if(!object(f)||f.cols!==cols||f.rows!==rows||typeof f.bits!=='string'||f.bits.length!==4*Math.ceil(Math.ceil(cols*rows/4)/3)||!/^[A-Za-z0-9+/]*={0,2}$/.test(f.bits))invalid();
      try{if(atob(f.bits).length!==Math.ceil(cols*rows/4))invalid();return unpackFog(f);}catch{invalid();}
    });
    delete value.storageEncoding;
  }
  return validateSave(value);
}

export function createSave(game, view = {}, savedAt = Date.now()) {
  if (!game?.running || game.winner !== null) throw new Error('只能保存尚未结束的战局');
  const difficulty = Object.entries(AI_DIFFICULTIES).find(([, value]) => value === game.difficulty)?.[0];
  const save = { format: 'great-powers-rts', version: game.playerCount===6?2:SAVE_VERSION, savedAt, config: { ...(game.commandVersion?{commandVersion:1}:{}),...(game.fuelVersion?{fuelVersion:game.fuelVersion}:{}),...(game.frontlineVersion?{frontlineVersion:game.frontlineVersion}:{}),...(game.sandbox?{sandbox:{...game.sandbox}}:{}),...(game.challenge?{challengeId:game.challenge.id}:{}),...(game.playerCount===6?{playerCount:6}:{}),nuclearEnabled:!!game.nuclearEnabled,battlefieldScale:game.battlefieldScale||1,battleId:game.battleId, mapId: game.mapId, victoryMode: game.victoryMode, difficulty, economyMode: game.economyMode }, state: { ...(game.campaign?{campaign:game.campaign}:{}),...(game.commandStats?{commandStats:game.commandStats}:{}),...Object.fromEntries(SNAPSHOT_FIELDS.map(key => [key, game[key]])),...(game.challenge?{challenge:game.challenge}:{}),pendingNuclear:!!game.pendingNuclear, logistics: game.logistics,resourceSites:game.resourceSites||[], battleStats: game.battleStats }, view };
  validateSave(save);
  return JSON.parse(JSON.stringify(save));
}

export function encodeStoredSave(save) {
  validateSave(save);
  // 普通存档与战役检查点共用迷雾压缩，导出和运行态仍保留完整数组。
  return JSON.stringify({...save,storageEncoding:'fog-bits-v1',state:{...save.state,fogs:save.state.fogs.map(packFog)}});
}

export function writeSave(storage, slot, save) {
  if (!SAVE_KEYS[slot]) throw new Error('未知存档位置');
  const text=encodeStoredSave(save);
  try { storage.setItem(SAVE_KEYS[slot], text); } catch { throw new Error('本地存储不可用或空间不足，请导出存档文件；当前战局仍然保留'); }
  return save;
}

export function readSave(storage, slot) {
  const text = storage.getItem(SAVE_KEYS[slot]);
  return text ? parseSave(text) : null;
}
