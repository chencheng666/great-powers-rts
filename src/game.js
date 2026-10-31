import { canCrush, crushAlongMove } from './vehicle-crush.js';
import { updateCarrierDefense } from './carrier-defense.js';
import { destructionEvent } from './destruction-presentation.js';
import { applySandbox, sandboxSpeed, unlimitedAmmo, refillSandboxAmmo } from './commander-sandbox.js';
import { emitBattleSound, weaponSound, impactSound, destructionSound } from './battle-sound.js';
import {sixPoint} from './six-player-map.js';
import PF from 'pathfinding';
import { createBattleId, legacyBattleId } from './battle-identity.js';
import { unitCostFor, unitHealthFor } from './unit-specs.js';
import { bridgeBlocksDirectShot } from './bridge-fire.js';
import { AI_DIFFICULTIES, BUILDINGS, CORE_BUILDINGS, FACTIONS, MAPS, ORE_VALUES, PRODUCERS, UNITS, WORLD, supportsMap, supportsNuclearMap } from './data.js';
import { formationOffsets, separateUnits, UnitSpatialIndex, unitLayer, unitRadius } from './unit-spacing.js';
import { commandQueue } from './command-queue.js';
import { combatStanceCommands, supportsCombatStance, combatStance, weaponsHeld } from './combat-stance.js';
import { modernCombat } from './modern-combat.js';
import { productionDuration, productionExit } from './battlefield-details.js';
import { equipmentProfile } from './equipment.js';
import { tacticalDamage } from './tactical-rules.js';
import { createSave, SNAPSHOT_FIELDS, validateSave } from './savegame.js';
import { FREIGHT_TYPES, logisticsEconomy } from './logistics-economy.js';
import { isLunarRobot, lunarBuildingProfile, lunarRobots, ROBOT_ENERGY, ROBOT_SPECS } from './lunar-robots.js';
import { battlefieldMap, resourceLayout } from './battlefield-expansion.js';
import { intelligenceCombat } from './intelligence.js';
import { aiCounterUnit, retreatAIUnits } from './tactical-ai.js';
import { createBattleStats, battleMetric, recordBattleDamage, recordBattleEvent } from './battle-report.js';
import { droneAutonomy, supportsDroneAutonomy } from './drone-autonomy.js';
import { strategicCombat } from './strategic-combat.js';
import { deterrenceCombat } from './deterrence.js';
import { CHALLENGES, challengeCombat } from './challenges.js';
import { createLossBreakdown } from './loss-breakdown.js';
import { aircraftStep, aircraftCanFire, aircraftAttackGoal } from './aircraft-flight.js';
import { runwayAircraft, airfieldApron, airfieldParking, allocateAirfieldSlot, airfieldDeparture, airfieldRunwayAvailable, airfieldHoldingPoint } from './airfield-rules.js';
import { islandDistance } from './island-map.js';
import { navalPath, nearestSeaPoint } from './island-navigation.js';
import { updateIslandCapture } from './island-watch.js';
import { theaterFacility, theaterCaptureTarget, updateTheaterEngineer, protectedPassenger, recordTheaterMining } from './theater-operations.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const random = (min, max) => min + Math.random() * (max - min);
const intersectsRect = (x, y, radius, rect) => Math.hypot(x - clamp(x, rect.x1, rect.x2), y - clamp(y, rect.y1, rect.y2)) <= radius;
const crossesRect = (start, end, rect) => {
  let near = 0, far = 1;
  for (const [origin, delta, min, max] of [[start.x, end.x - start.x, rect.x1, rect.x2], [start.y, end.y - start.y, rect.y1, rect.y2]]) {
    if (Math.abs(delta) < 0.0001) { if (origin < min || origin > max) return false; }
    else {
      const a = (min - origin) / delta, b = (max - origin) / delta;
      near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
      if (near > far) return false;
    }
  }
  return true;
};
let nextId = 1;

export class Game {
  constructor(playerFaction, enemyFaction, events = {}, options = {}) {
    if (!options.multiplayer && Object.hasOwn(CHALLENGES,options.challengeId)) {
      options = { ...options, mapId: CHALLENGES[options.challengeId].mapId, difficulty: 'standard', victoryMode: 'annihilation', battlefieldScale: 1, nuclearEnabled:false, players: undefined };
      playerFaction = 'china'; enemyFaction = 'asia';
    }
    this.events = events;
    this.multiplayer = !!options.multiplayer;
    this.battleId = createBattleId();
    this.victoryMode = ['annihilation', 'control'].includes(options.victoryMode) ? options.victoryMode : 'quick';
    this.difficulty = AI_DIFFICULTIES[options.difficulty] || AI_DIFFICULTIES.standard;
    this.mapId = MAPS[options.mapId] && (!MAPS[options.mapId].missionOnly || !this.multiplayer && CHALLENGES[options.challengeId]?.mapId === options.mapId) ? options.mapId : 'valley';
    this.battlefieldScale = !MAPS[this.mapId].fixedScale && options.battlefieldScale === 1.5 ? 1.5 : 1;
    if (MAPS[this.mapId].singleplayerOnly && this.multiplayer) throw new Error('该战区仅供单机演练');
    this.map = battlefieldMap(this.mapId,this.battlefieldScale);
    this.world = this.map.world || WORLD;
    this.playerCount = this.map.maxPlayers===6 ? 6 : 2;
    this.nuclearEnabled=supportsNuclearMap(this.mapId)&&options.nuclearEnabled===true;
    this.pendingNuclear=false;
    const configs=options.players;
    if(configs&&(!Array.isArray(configs)||configs.length!==this.playerCount||configs.some(p=>!Object.hasOwn(FACTIONS,p.faction)||!['human','ai'].includes(p.controlType))))throw new Error('席位配置无效');
    this.playerConfigs= configs || Array.from({length:this.playerCount},(_,i)=>({faction:i===0?playerFaction:i===1?enemyFaction:Object.keys(FACTIONS)[i%5],controlType:this.multiplayer?'human':i===0?'human':'ai'}));
    this.beginnerSupport = !this.multiplayer && this.map.training && options.difficulty === 'recruit' && !options.challengeId;
    this.homeY = this.world.height / 2;
    this.economyMode = this.map.economyMode || (this.mapId === 'meridian' ? 'mining' : 'convoy');
    this.projectiles = [];
    this.nextProjectileId = 1;
    this.time = 0;
    this.running = true;
    this.battleStats = createBattleStats(0,this.playerCount);
    this.paused = false;
    this.winner = null;
    this.units = [];
    this.buildings = [];
    this.ore = this.economyMode === 'mining' ? this.map.ore.map(([x, y, amount, kind], index) => ({ id: `ore-${index}`, x, y, amount, max: amount, kind })) : [];
    this.oil = this.map.oil.map(site => ({ ...site, owner: null }));
    this.beacons = this.map.beacons.map(site => ({ ...site, owner: null }));
    this.resourceSites = resourceLayout(this.map);
    this.effects = [];
    this.pendingHits = [];
    this.collectingHits = false;
    this.pendingMoves = [];
    this.collectingMoves = false;
    this.selected = [];
    this.orderMode = null;
    this.pendingBuilding = null;
    this.placingBuilding = false;
    this.pendingAbility = false;
    this.noticeQueue = [];
    this.players = this.playerConfigs.map((p,i)=>({...this.makePlayer(i,p.faction),controlType:p.controlType,eliminated:false}));
    this.fogs = this.players.map(() => {
      const cols = this.world.width / this.world.fog, rows = this.world.height / this.world.fog;
      return { cols, rows, visible: Array(cols * rows).fill(false), explored: Array(cols * rows).fill(false) };
    });
    this.fog = this.fogs[0];
    this.fogTimer = 0;
    this.aiTimer = 0;
    this.aiWaveTimer = this.beginnerSupport ? 180 : this.difficulty.waveStart;
    this.initLogistics();
    this.initBases();
    if (!this.multiplayer) this.initChallenge(options.challengeId);
    if (options.sandbox && !this.challenge && !this.multiplayer && this.playerCount === 2) applySandbox(this, options.sandbox);
    this.updateFog();
  }

  makePlayer(side, faction) {
    return { side, faction, credits: 1550, powerIn: 0, powerOut: 0, controlScore: 0, buildQueue: null, abilityCharge: 0, abilityCooldown: 0, shieldUntil: 0, nuclearCharge:0,nuclearSpent:false,nuclearPending:null,aiPlanIndex: 0, aiUnitCount: 0, aiAirUnitCount: 0, aiNavyUnitCount: 0, aiEngineerRetryAt: this.difficulty.engineerStart, aiScoutRetryAt: 30, aiGhostRetryAt: 65, unitCount: 0 };
  }

  get faction() { return FACTIONS[this.players[0].faction]; }

  toSave(view = {}) { return createSave(this, view); }

  static fromSave(save, events = {}) {
    validateSave(save);
    const copy = JSON.parse(JSON.stringify(save));
    // 不重新部署基地，避免覆盖队列、迷雾或触发新对局通知。
    const game = Object.create(Game.prototype);
    game.events = events;
    game.battleId = copy.config.battleId || legacyBattleId(copy);
    game.mapId = copy.config.mapId; game.battlefieldScale=copy.config.battlefieldScale||1;game.map = battlefieldMap(game.mapId,game.battlefieldScale); game.world = game.map.world || WORLD;
    game.playerCount=copy.state.players.length;game.playerConfigs=copy.state.players.map(p=>({faction:p.faction,controlType:p.controlType|| (p.side===0?"human":"ai")}));game.multiplayer=false;
    game.homeY = game.world.height / 2; game.victoryMode = copy.config.victoryMode;
    game.nuclearEnabled=copy.config.nuclearEnabled===true;game.pendingNuclear=copy.state.pendingNuclear===true;
    game.difficulty = AI_DIFFICULTIES[copy.config.difficulty];
    for (const key of SNAPSHOT_FIELDS) game[key] = copy.state[key];
    for(const p of game.players){p.nuclearCharge??=0;p.nuclearSpent??=false;p.nuclearPending??=null;}
    game.battleStats = copy.state.battleStats || createBattleStats(game.time,game.playerCount);
    game.battleStats.unitLosses ||= createLossBreakdown(game.time,game.playerCount);
    game.challenge = copy.state.challenge;
    game.sandbox = copy.config.sandbox ? { ...copy.config.sandbox } : null;
    // 旧战局不凭空追加可领奖的物资；新局和新存档才包含资源争夺点。
    game.resourceSites=copy.state.resourceSites||[];
    // 老版本战局保留原经济，避免已有矿车、货物与路线在读档时消失。
    game.economyMode = copy.config.economyMode || 'mining';
    game.logistics = copy.state.logistics;
    if (!game.logistics) game.initLogistics();
    // 兼容旧存档中原本没有有限弹药的单位。
    for (const u of game.units) {
      if (isLunarRobot(game.map, u.type)) { u.battery ??= ROBOT_ENERGY.capacity; u.ammo = null; }
      if (!isLunarRobot(game.map, u.type) && UNITS[u.type].ammo && u.ammo === null) u.ammo = UNITS[u.type].ammo;
      if (u.type === 'supply' && u.autoSupply === undefined) u.autoSupply = true;
      if (supportsDroneAutonomy(u) && u.autoDrone === undefined) { u.autoDrone = true; u.droneRole = u.order ? 'manual' : 'guard'; }
    }
    game.fog = game.fogs[0]; game.running = true; game.paused = true; game.winner = null;
    game.effects = []; game.pendingHits = []; game.pendingMoves = []; game.collectingHits = game.collectingMoves = false;
    game.orderMode = null; game.placingBuilding = false; game.noticeQueue = []; game.unitIndex = null;
    game.selected = game.selected.filter(id => game.getEntity(id)?.owner === 0 && !game.getEntity(id).embarkedIn);
    nextId = Math.max(nextId, ...[...game.units, ...game.buildings].map(entity => entity.id + 1));
    game.recalculatePower();
    return game;
  }
  get enemyFaction() { return FACTIONS[this.players[1].faction]; }
  getEntity(id) { return this.units.find(item => item.id === id) || this.buildings.find(item => item.id === id) || this.oil.find(item => item.id === id) || this.beacons.find(item => item.id === id) || this.resourceSites?.find(item=>item.id===id); }
  ownedBuildings(side, type) { return this.buildings.filter(item => item.owner === side && item.hp > 0 && (!type || item.type === type)); }
  ownedUnits(side, type) { return this.units.filter(item => item.owner === side && item.hp > 0 && (!type || item.type === type)); }
  hasBuilding(side, type) { return this.ownedBuildings(side, type).length > 0; }
  hasPower(side) { const p = this.players[side]; return p.powerIn >= p.powerOut; }
  hasRadarIntel(side) { return this.challenge?.id==='islandwatch' || this.beacons.some(site => site.owner === side) || (this.hasBuilding(side, 'radar') && this.hasPower(side)); }

  sides(){return this.players.map(p=>p.side);}
  enemySides(side){return this.sides().filter(s=>s!==side&&!this.players[s].eliminated);}
  enemyUnits(side,type){return this.units.filter(u=>u.owner!==side&&u.hp>0&&!u.embarkedIn&&(!type||u.type===type));}
  enemyBuildings(side,type){return this.buildings.filter(b=>b.owner!==side&&b.hp>0&&(!type||b.type===type));}
  isAI(side){return this.players[side]?.controlType==='ai'||this.players[side]?.controlType===undefined&&!this.multiplayer&&side===1;}
  enemyObjective(side){const target=this.nearestEnemySide(side);return this.enemyBuildings(side,'hq').find(b=>b.owner===target&&this.canSeeEntity(side,b))||this.map.spawns?.[target]||{x:side?300:this.world.width-300,y:this.homeY};}
  nearestEnemySide(side){const home=this.ownedBuildings(side,'hq')[0]||this.map.spawns?.[side]||{x:this.world.width/2,y:this.homeY};return this.enemySides(side).sort((a,b)=>distance(home,this.map.spawns?.[a]||this.ownedBuildings(a,'hq')[0]||home)-distance(home,this.map.spawns?.[b]||this.ownedBuildings(b,'hq')[0]||home))[0];}
  initBases() {
    if (this.map.missionOnly) return;
    for (const side of this.sides()) {
      const mirror = (x,y) => this.playerCount===6 ? (()=>{const p=sixPoint(side,x-205,y-720);return[p.x,p.y];})() : side === 0 ? [x, y + this.homeY - 720] : [this.world.width - x, this.world.height - y - this.homeY + 720];
      for (const [type, x, y] of [
        ['hq', 205, 720], ['power', 320, 595], ['refinery', 335, 825],
        ['barracks', 195, 875], ['factory', 460, 705],
        ...(this.map.water ? [['dock', ['ocean', 'archipelago'].includes(this.mapId) ? 950 : 850, 720]] : [])
      ]) {
        const [bx, by] = type==='dock'&&this.battlefieldScale!==1 ? [(this.map.dockZones[side].x1+this.map.dockZones[side].x2)/2,this.homeY] : mirror(x, y); this.addBuilding(side, type, bx, by);
      }
      for (const [type, x, y] of [
        ...(this.economyMode === 'mining' ? [['harvester', 405, 940], ['harvester', 440, 485]] : []),
        ['rifle', 575, 630], ['rifle', 575, 680], ['rifle', 575, 730],
        ['tank', 605, 790]
      ]) {
        const [ux, uy] = mirror(x, y); this.addUnit(side, type, ux, uy);
      }
      if (['ocean', 'archipelago'].includes(this.mapId)) {
        const [x, y] = this.battlefieldScale!==1 ? [side?this.map.water.x2-120:this.map.water.x1+120,this.homeY] : mirror(1160, 720);
        this.addUnit(side, 'patrol', x, y);
        this.players[side].credits += 800;
      }
    }
    if (this.beginnerSupport) {
      this.players[0].credits = 5000;
      for (const [type,x,dy] of [['tank',680,-80],['aa',660,30],['supply',560,160],['engineer',500,-150],['rocket',530,230]]) this.addUnit(0,type,x,this.homeY+dy);
    }
    this.recalculatePower();
    this.events.notice?.(this.economyMode === 'mining' ? '月表基地已部署，采矿车开始就地取材。' : '战场已部署，外部后勤运输航线已建立。');
  }

  addBuilding(owner, type, x, y) {
    const d = BUILDINGS[type];
    const building = { id: nextId++, kind: 'building', owner, type, x, y, hp: d.hp, maxHp: d.hp, size: d.size, angle:this.map.spawns?.[owner]?.angle??(owner?Math.PI:0),spawnAngle:this.map.spawns?.[owner]?.angle,queue: [], active: null, fireTimer: 0, repairing: false, spawnAt: this.time };
    this.buildings.push(building);
    this.recalculatePower();
    return building;
  }

  addUnit(owner, type, x, y, temporary = false) {
    const d = UNITS[type];
    const p = this.players[owner];
    const hp = unitHealthFor(p.faction, type);
    const unit = { id: nextId++, kind: 'unit', owner, type, x, y, hp, maxHp: hp, angle: owner ? Math.PI : 0, turretAngle: owner ? Math.PI : 0, order: null, targetId: null, path: [], pathTimer: 0, fireTimer: random(0, 0.4), movePulse: 0, cargo: 0, cargoValue: 0, harvestState: 'find', ammo: d.ammo ?? null, rearmProgress: 0, resumeOrder: null, stunUntil: 0, temporaryUntil: temporary ? this.time + 27 : 0, selected: false };
    unit.passengers = []; unit.embarkedIn = null; unit.stock = d.stock ?? null;
    unit.wing = d.wing ?? null; unit.heat = 0; unit.deployProgress = 0;
    if (type === 'supply') unit.autoSupply = true;
    if (type === 'counterIntel') unit.counterIntelEnabled = true;
    if (supportsCombatStance(unit)) unit.combatStance = 'free';
    if (supportsDroneAutonomy(unit)) { unit.autoDrone = true; unit.droneRole = 'guard'; }
    if (isLunarRobot(this.map, type)) { unit.battery = ROBOT_ENERGY.capacity; unit.ammo = null; }
    this.units.push(unit);
    if (this.isAI(owner) && type === 'strike') this.players[owner].aiFirstStrikeProduced = true;
    this.players[owner].unitCount++;
    return unit;
  }

  recalculatePower() {
    for (const p of this.players) {
      p.powerIn = 0; p.powerOut = 0;
      for (const b of this.buildings) {
        if (b.owner !== p.side || b.hp <= 0) continue;
        const power = BUILDINGS[b.type].power;
        if (power > 0) p.powerIn += power;
        else p.powerOut -= power;
      }
      if (this.map.future) p.powerIn += this.beacons.filter(site => site.owner === p.side).length * 40;
      p.powerIn += (this.resourceSites||[]).filter(site=>site.type==='depot'&&site.owner===p.side).length*40;
      p.robotChargeLoad = this.units.filter(u => u.owner === p.side && u.hp > 0 && !u.embarkedIn && isLunarRobot(this.map, u.type) && u.order?.type === 'rearm' && this.robotChargeSite(u)).length * ROBOT_ENERGY.chargeLoad;
      p.powerOut += p.robotChargeLoad;
    }
  }

  canBuild(side, type) {
    if (this.challenge) return false;
    const d = BUILDINGS[type];
    return !!d && (!d.nuclear||this.nuclearEnabled) && (!d.naval || !!this.map.water) && supportsMap(d.map, this.mapId) && this.hasBuilding(side, 'hq') && (!d.requires || this.hasBuilding(side, d.requires));
  }

  startBuild(side, type) {
    if(this.isControlLocked(side))return false;
    const p = this.players[side];
    if (!this.canBuild(side, type) || p.buildQueue || p.readyBuilding || (side === 0 && this.pendingBuilding)) return false;
    p.buildQueue = { type, progress: 0, paid: 0 };
    if (side === 0) this.events.notice?.(`${lunarBuildingProfile(this.map.future, type, BUILDINGS[type]).name}开始建造`);
    if (side === 0) this.events.voice?.('construction');
    return true;
  }

  cancelBuilding(side) {
    if(this.isControlLocked(side))return false;
    const p = this.players[side];
    const refund = p.buildQueue?.paid || (p.readyBuilding ? BUILDINGS[p.readyBuilding].cost : side === 0 && this.pendingBuilding ? BUILDINGS[this.pendingBuilding].cost : 0);
    if (!p.buildQueue && !p.readyBuilding && !(side === 0 && this.pendingBuilding)) return false;
    p.credits += refund;
    p.buildQueue = null;
    p.readyBuilding = null;
    if (side === 0) {
      this.pendingBuilding = null;
      this.placingBuilding = false;
      this.events.notice?.(`建造已取消，返还 ${Math.floor(refund)} 资金`);
    }
    return true;
  }

  cancelUnitProduction(side, buildingId) {
    if(this.isControlLocked(side))return false;
    const building = this.getEntity(buildingId);
    if (!building || building.kind !== 'building' || building.owner !== side || !PRODUCERS.includes(building.type)) return false;
    if (!building.active && !building.queue.length) return false;
    const refund = building.active?.paid || 0;
    if (building.active) building.active = null;
    else building.queue.shift();
    this.players[side].credits += refund;
    if (side === 0) this.events.notice?.(`生产已取消，返还 ${Math.floor(refund)} 资金`);
    return true;
  }

  canPlace(side, type, x, y) {
    if(BUILDINGS[type].nuclear&&!this.nuclearEnabled)return false;
    const size = BUILDINGS[type].size;
    if (x < size || y < size || x > this.world.width - size || y > this.world.height - size) return false;
    if (type === 'dock') {
      if (!this.map.dockZones.some(rect => x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2 && (side === 0 ? x < this.world.width / 2 : x > this.world.width / 2))) return false;
    } else if (this.map.noBuild.some(rect => intersectsRect(x, y, size * 0.6, rect))) return false;
    if (this.ore.some(o => o.amount > 0 && distance(o, { x, y }) < 95)) return false;
    if (this.oil.some(o => distance(o, { x, y }) < 95)) return false;
    if (this.beacons.some(site => distance(site, { x, y }) < 100)) return false;
    if(this.resourceSites?.some(site=>distance(site,{x,y})<80))return false;
    if (this.buildings.some(b => b.hp > 0 && distance(b, { x, y }) < (b.size + size) * 0.63 + 20)) return false;
    return type === 'dock' ? this.hasBuilding(side, 'factory') : this.ownedBuildings(side).some(b => distance(b, { x, y }) < 310)||(this.resourceSites||[]).some(site=>site.type==='depot'&&site.owner===side&&distance(site,{x,y})<260);
  }

  placeBuilding(side, type, x, y) {
    if(this.isControlLocked(side))return false;
    if (this.multiplayer && this.players[side].readyBuilding !== type) return false;
    if (!this.canPlace(side, type, x, y)) return false;
    this.addBuilding(side, type, x, y);
    this.players[side].readyBuilding = null;
    if (side === 0) {
      this.pendingBuilding = null;
      this.placingBuilding = false;
      this.events.notice?.(`${lunarBuildingProfile(this.map.future, type, BUILDINGS[type]).name}部署完成`);
      this.events.voice?.('deployed');
    }
    this.effects.push({ type: 'build', x, y, age: 0, duration: 0.8, owner: side });
    return true;
  }

  toggleRepair(side, id) {
    if(this.isControlLocked(side))return false;
    const building = this.getEntity(id);
    if (!building || building.kind !== 'building' || building.owner !== side || building.hp <= 0) return false;
    if (building.hp >= building.maxHp && !building.repairing) return false;
    building.repairing = !building.repairing && building.hp < building.maxHp;
    if (side === 0) this.events.notice?.(building.repairing ? `正在维修${lunarBuildingProfile(this.map.future, building.type, BUILDINGS[building.type]).name}` : '已停止维修');
    return true;
  }

  sellBuilding(side, id) {
    if(this.isControlLocked(side))return false;
    const building = this.getEntity(id);
    if (!building || building.kind !== 'building' || building.owner !== side || building.type === 'hq' || building.hp <= 0) return false;
    const refund = Math.floor(BUILDINGS[building.type].cost * .5);
    this.players[side].credits += refund;
    building.hp = 0;
    this.effects.push({ type: 'build', x: building.x, y: building.y, age: 0, duration: .8, owner: side });
    this.recalculatePower();
    if (side === 0) {
      this.selected = this.selected.filter(selectedId => selectedId !== id);
      this.events.selection?.();
      this.events.notice?.(`${lunarBuildingProfile(this.map.future, building.type, BUILDINGS[building.type]).name}已出售，返还 ${refund} 资金`);
    }
    return true;
  }

  sellHarvester(side, id) {
    if(this.isControlLocked(side))return false;
    const u = this.getEntity(id);
    if (!u || u.kind !== 'unit' || u.type !== 'harvester' || u.owner !== side || u.hp <= 0 || u.embarkedIn) return false;
    const refund = Math.floor(this.unitCost(side, u.type) * .5 * u.hp / u.maxHp);
    this.players[side].credits += refund; u.hp = 0;
    this.selected = this.selected.filter(value => value !== id); this.events.selection?.();
    if (side === 0) this.events.notice?.(`矿车已回收，返还 ${refund} 资金；未卸载矿石不计入退款`);
    return true;
  }

  patrolStep(u, dt) {
    const order = u.order;
    if (order?.type !== 'patrol') return false;
    if (distance(u, order) <= 16) {
      const returning = Math.hypot(order.x - order.destinationX, order.y - order.destinationY) < 1;
      order.x = returning ? order.originX : order.destinationX; order.y = returning ? order.originY : order.destinationY;
      u.path = []; u.pathTimer = 0;
    }
    this.moveUnit(u, order, dt, 8); return true;
  }

  unitCapacityUsed(side){return this.ownedUnits(side).length+this.ownedBuildings(side).reduce((n,b)=>n+b.queue.length+Number(!!b.active),0);}

  queueUnit(side, type) {
    if (this.challenge) return false;
    if(this.isControlLocked(side)||this.players[side]?.eliminated)return false;
    if(this.playerCount===6&&this.unitCapacityUsed(side)>=40)return false;
    const d = UNITS[type];
    if (!d || FREIGHT_TYPES.includes(type) || type === 'harvester' && this.economyMode !== 'mining' || (d.naval && !this.map.water) || !supportsMap(d.map, this.mapId) || (d.faction && this.players[side].faction !== d.faction) || (d.requires && !this.hasBuilding(side, d.requires))) return false;
    if (!d.producer || d.limit && this.ownedUnits(side,type).length + this.ownedBuildings(side).reduce((n,b)=>n+b.queue.filter(t=>t===type).length+Number(b.active?.type===type),0)>=d.limit) return false;
    const producer = this.ownedBuildings(side, d.producer).sort((a, b) => a.queue.length - b.queue.length)[0];
    if (!producer || producer.queue.length >= 5) return false;
    producer.queue.push(type);
    if (side === 0) this.events.notice?.(`${equipmentProfile(this.players[side].faction, type, this.map.future).name}已加入队列`);
    if (side === 0) this.events.voice?.('queued');
    return true;
  }

  unitCost(side, type) {
    return unitCostFor(this.players[side].faction, type);
  }

  selectAt(x, y, additive = false) {
    const friendUnits = this.activeUnits(0).filter(u => distance(u, { x, y }) < Math.max(UNITS[u.type].tags.includes('infantry') ? 22 : 28, unitRadius(u)));
    const friendBuildings = this.ownedBuildings(0).filter(b => distance(b, { x, y }) < b.size * 0.58);
    const picked = friendUnits.at(-1) || friendBuildings.at(-1);
    if (!additive) this.selected = [];
    if (picked) {
      if (additive && this.selected.includes(picked.id)) this.selected = this.selected.filter(id => id !== picked.id);
      else if (!this.selected.includes(picked.id)) this.selected.push(picked.id);
    }
    this.events.selection?.();
    return picked;
  }

  selectBox(x1, y1, x2, y2, additive = false) {
    if (!additive) this.selected = [];
    const left = Math.min(x1, x2), right = Math.max(x1, x2), top = Math.min(y1, y2), bottom = Math.max(y1, y2);
    for (const u of this.activeUnits(0)) {
      if (FREIGHT_TYPES.includes(u.type)) continue;
      if (u.x >= left && u.x <= right && u.y >= top && u.y <= bottom && !this.selected.includes(u.id)) this.selected.push(u.id);
    }
    this.events.selection?.();
  }

  selectSameType(picked, visibleIds, additive = false) {
    if (!picked || picked.kind !== 'unit' || picked.owner !== 0 || picked.hp <= 0 || picked.embarkedIn || FREIGHT_TYPES.includes(picked.type)) return false;
    const visible = new Set(visibleIds);
    const ids = this.activeUnits(0, picked.type).filter(unit => visible.has(unit.id)).map(unit => unit.id);
    this.selected = [...new Set([...(additive ? this.selected : []), ...ids])];
    this.events.selection?.();
    return true;
  }

  selectSelectedType() {
    const picked = this.selected.map(id => this.getEntity(id)).find(u => u?.kind === 'unit' && u.owner === 0 && u.hp > 0 && !u.embarkedIn && !FREIGHT_TYPES.includes(u.type));
    return picked ? this.selectSameType(picked, this.activeUnits(0, picked.type).map(u => u.id)) : false;
  }

  selectAllCombat() {
    this.selected = this.activeUnits(0).filter(u => UNITS[u.type].damage > 0).map(u => u.id);
    this.events.selection?.();
  }

  command(x, y, attackMove = false, side = 0, append = false) {
    if(this.isControlLocked(side))return false;
    if (append) { this.orderMode = null; return this.appendWaypoint(x, y, attackMove, side); }
    const patrol = this.orderMode === 'patrol';
    const selectedUnits = this.selected.map(id => this.getEntity(id)).filter(e => e?.kind === 'unit' && e.owner === side && !e.embarkedIn && !protectedPassenger(e) && !FREIGHT_TYPES.includes(e.type));
    if (!selectedUnits.length) {
      for (const id of this.selected) this.setRallyPoint(side, id, x, y);
      return;
    }
    const enemy = [...this.units, ...this.buildings].filter(e => e.owner !== side && e.hp > 0 && this.canSeeEntity(side, e) && distance(e, { x, y }) < (e.kind === 'building' ? e.size * 0.55 : 25)).at(-1);
    const site = theaterCaptureTarget(this,{x,y},side) || [...this.oil, ...this.beacons, ...(this.resourceSites||[]).filter(s=>s.type==='depot')].find(item => distance(item, { x, y }) < 40 && item.owner !== side && this.hasExploredFor(side, item.x, item.y));
    const cache=(this.resourceSites||[]).find(s=>s.type!=='depot'&&s.amount>0&&distance(s,{x,y})<45&&this.hasExploredFor(side,s.x,s.y));
    const bomb=this.ownedBuildings(side).find(b=>b.sabotage&&distance(b,{x,y})<b.size*.55);
    const transport = !attackMove && this.activeUnits(side).find(v => UNITS[v.type].capacity && !this.selected.includes(v.id) && distance(v, { x, y }) < (v.type === 'carrier' ? 95 : v.type === 'landing' ? 75 : 45));
    const airbase = !attackMove && !patrol && this.ownedBuildings(side, 'airfield').find(b => distance(b, { x, y }) <= b.size * .65);
    const port = !attackMove && !patrol && this.ownedBuildings(side, 'dock').find(b => distance(b, { x, y }) <= b.size * .65);
    const offsets = formationOffsets(selectedUnits, { x, y });
    selectedUnits.forEach(u => {
      u.orderQueue = [];
      const offset = offsets.get(u.id);
      if (patrol) {
        const goal = this.resolveMoveGoal(u, clamp(x + offset.x, 20, this.world.width - 20), clamp(y + offset.y, 20, this.world.height - 20));
        u.order = { type: 'patrol', ...goal, originX: u.x, originY: u.y, destinationX: goal.x, destinationY: goal.y };
      }
      else if (airbase && UNITS[u.type].tags.includes('air') && !u.homeCarrierId) { this.requestResupply(u, airbase); u.resumeOrder = null; }
      else if (port && UNITS[u.type].tags.includes('ship')) this.requestResupply(u, port);
      else if (transport && this.canBoardTransport(u, transport)) u.order = { type: 'board', targetId: transport.id };
      else if(!attackMove&&bomb&&u.type==='engineer')u.order={type:'defuse',targetId:bomb.id,x:bomb.x,y:bomb.y,progress:0};
      else if(!attackMove&&enemy?.kind==='building'&&u.type==='scout'&&!enemy.sabotage)u.order={type:'infiltrate',targetId:enemy.id,x:enemy.x,y:enemy.y};
      else if(!attackMove&&cache&&!UNITS[u.type].tags.some(t=>['air','ship'].includes(t))&&(cache.type==='cache'||['engineer','harvester','supply'].includes(u.type)))u.order={type:'collect',targetId:cache.id,x:cache.x,y:cache.y,progress:0};
      else if (site && u.type === 'engineer') u.order = { type: 'capture', targetId: site.id, x: site.x, y: site.y };
      else if (enemy && u.type==='swarmCarrier') u.order={type:'attackMove',x:enemy.x,y:enemy.y};
      else if (enemy && this.canAttack(u, enemy)) u.order = { type: 'attack', targetId: enemy.id, x: enemy.x, y: enemy.y };
      else {
        const goal = this.resolveMoveGoal(u, clamp(x + offset.x, 20, this.world.width - 20), clamp(y + offset.y, 20, this.world.height - 20));
        u.order = { type: attackMove ? 'attackMove' : 'move', ...goal, ...(selectedUnits.length > 1 ? { formation: true } : {}) };
      }
      if (supportsCombatStance(u) && ['attack', 'attackMove', 'patrol'].includes(u.order?.type)) u.combatStance = 'free';
      u.resumeOrder = null; u.path = []; u.pathTimer = 0; u.deployProgress = 0;u.avoidSide=0;u.avoidUntil=0;delete u.navigationProgress;delete u.navigationStalled;delete u.navigationAttempts;
      this.setDroneMission(u);
    });
    this.effects.push({ type: 'order', x, y, age: 0, duration: 0.6, owner: side });
    this.events.voice?.(site && selectedUnits.some(u => u.type === 'engineer') ? 'captureOrder' : enemy || attackMove ? 'attackOrder' : 'moveOrder');
    this.orderMode = null;
  }

  stopSelected(side = 0) {
    if(this.isControlLocked(side))return false;
    if (this.selected.some(id => this.getEntity(id)?.kind === 'unit')) this.events.voice?.('stopOrder');
    this.selected.map(id => this.getEntity(id)).filter(e => e?.kind === 'unit' && e.owner === side && !FREIGHT_TYPES.includes(e.type)).forEach(u => { u.order = null; u.orderQueue = []; u.resumeOrder = null; u.path = []; if (u.type === 'supply') u.autoSupply = false; if (supportsDroneAutonomy(u)) u.droneRole = 'hold'; });
    this.orderMode = null;
  }

  toggleAutoSupply(unit) {
    if (!unit || unit.type !== 'supply' || this.isControlLocked(unit.owner)) return false;
    unit.autoSupply = unit.autoSupply === false;
    unit.serviceTargetId = null;
    return true;
  }

  castAbility(x, y, side = 0) {
    if(this.isControlLocked(side))return false;
    const p = this.players[side];
    if(this.playerCount===6&&p.faction==='asia'&&this.unitCapacityUsed(side)>35)return false;
    if (!this.hasBuilding(side, 'super') || !this.hasPower(side) || p.abilityCharge < 100 || p.abilityCooldown > 0 || p.credits < 650) return false;
    if (p.faction !== 'china' && !this.isVisibleFor(side, x, y)) return false;
    p.credits -= 650; p.abilityCharge = 0; p.abilityCooldown = 45;
    if (side === 0) this.events.voice?.('ability');
    const faction = p.faction;
    this.effects.push({ type: 'ability', faction, x, y, age: 0, duration: 2.5, owner: side });
    if (faction === 'china') {
      p.shieldUntil = this.time + 12;
      if (side === 0) this.events.notice?.('协同电子防护启动：友军获得 12 秒减伤');
    } else if (faction === 'middleeast') {
      this.enemyUnits(side).filter(u => distance(u, { x, y }) < 290 && !UNITS[u.type].tags.includes('infantry')).forEach(u => { u.stunUntil = this.time + 8; });
      this.enemyBuildings(side,'turret').filter(b => distance(b, { x, y }) < 290).forEach(b => { b.stunUntil = this.time + 8; });
      if (side === 0) this.events.notice?.('区域脉冲命中，敌方电子装备已瘫痪');
    } else if (faction === 'asia') {
      for (let i = 0; i < 5 && (this.playerCount!==6 || this.ownedUnits(side).length<40); i++) {
        const u = this.addUnit(side, 'drone', clamp(x + random(-110, 110), 50, this.world.width - 50), clamp(y + random(-110, 110), 50, this.world.height - 50), true);
        u.order = { type: 'attackMove', ...(this.playerCount===6?this.enemyObjective(side):{x:side===0?this.world.width-205:205,y:this.homeY}) };
      }
      if (side === 0) this.events.notice?.('蜂群已抵达目标区域');
    } else {
      for (const target of [...this.enemyUnits(side), ...this.enemyBuildings(side)]) {
        const d = distance(target, { x, y });
        if (d > 245) continue;
        let amount = faction === 'russia' ? 190 : 165;
        if (faction === 'russia' && target.kind === 'building') amount *= 1.22;
        if (faction === 'nato' && target.kind === 'unit' && UNITS[target.type].tags.includes('armor')) amount *= 0.48;
        amount *= 1 - d / 430;
        if (target.type === 'hq') amount = Math.min(amount, target.maxHp * 0.22);
        this.damage(target, amount, side);
      }
      if (side === 0) this.events.notice?.(`${FACTIONS[faction].ability}已命中目标区域`);
    }
    if (side === 0) this.pendingAbility = false;
    else this.events.notice?.(`敌方发动了${FACTIONS[faction].ability}`);
    return true;
  }

  update(dt) {
    refillSandboxAmmo(this);
    if (!this.running || this.paused) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.time += dt;
    this.recalculatePower();
    this.updateIntelligence(dt);
    this.updateDeterrence(dt);
    this.updateLogistics(dt);
    for (const p of this.players) {
      battleMetric(this, p.side, 'oilSeconds', this.oil.filter(o => o.owner === p.side).length * dt);
      battleMetric(this, p.side, 'beaconSeconds', this.beacons.filter(o => o.owner === p.side).length * dt);
      if (!this.challenge) p.credits += this.oil.filter(o => o.owner === p.side).length * 11 * dt;
      if (this.victoryMode === 'control') p.controlScore += this.beacons.filter(site => site.owner === p.side).length * dt;
      p.abilityCooldown = Math.max(0, p.abilityCooldown - dt);
      if (this.hasBuilding(p.side, 'super') && this.hasPower(p.side) && p.abilityCharge < 100) p.abilityCharge = Math.min(100, p.abilityCharge + dt * 0.85);
      this.updateBuildQueue(p, dt);
    }
    this.pendingHits = [];
    this.pendingMoves = [];
    this.collectingHits = true;
    this.collectingMoves = true;
    this.updateElectronicWarfare(dt);
    this.updateProjectiles(dt);
    for (const b of this.buildings) if (b.hp > 0) this.updateBuilding(b, dt);
    for (const u of this.units) if (u.hp > 0 && !u.embarkedIn) this.updateUnit(u, dt);
    this.collectingHits = false;
    this.collectingMoves = false;
    this.unitIndex = new UnitSpatialIndex(this.units);
    for (const move of this.pendingMoves) if (move.unit.hp > 0) this.moveUnitNow(move.unit, move.goal, move.dt, move.stopDistance);
    separateUnits(this.units, dt, (unit, point) => this.canOccupyUnit(unit, point), this.time, (unit, other) => unit.lastMovedAt === this.time && canCrush(unit, other, this));
    this.unitIndex = null;
    for (const hit of this.pendingHits) this.applyHit(hit);
    this.units = this.units.filter(u => u.hp > 0);
    this.buildings = this.buildings.filter(b => b.hp > 0 || theaterFacility(this,b.id));
    this.effects.forEach(e => { e.age += dt; });
    this.effects = this.effects.filter(e => e.age < e.duration);
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) { this.updateFog(); this.fogTimer = 0.22; }
    if (!this.challenge && this.players.some(p=>this.isAI(p.side)&&!p.eliminated)) {
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) { for(const p of this.players)if(this.isAI(p.side)&&!p.eliminated)this.updateAI(p.side); this.aiTimer = this.difficulty.thinkInterval; }
    this.aiWaveTimer -= dt;
    if (this.aiWaveTimer <= 0) { for(const p of this.players)if(this.isAI(p.side)&&!p.eliminated)this.launchAIWave(p.side); this.aiWaveTimer = this.difficulty.waveInterval + random(-4, 5); }
    }
    if (this.selected.some(id => !this.getEntity(id) || this.getEntity(id).embarkedIn)) { this.selected = this.selected.filter(id => this.getEntity(id) && !this.getEntity(id).embarkedIn); this.events.selection?.(); }
    this.checkVictory(dt);
  }

  updateBuildQueue(p, dt) {
    const q = p.buildQueue;
    if (!this.hasBuilding(p.side, 'hq')) {
      if (q) p.credits += q.paid * .5;
      p.buildQueue = null;
      p.readyBuilding = null;
      if (p.side === 0) this.pendingBuilding = null;
      return;
    }
    if (!q) return;
    const d = BUILDINGS[q.type];
    const duration = d.time / sandboxSpeed(this, p.side);
    const need = Math.min(d.cost - q.paid, d.cost / duration * dt);
    if (p.credits + 0.01 < need) return;
    p.credits -= need; q.paid += need; q.progress += dt;
    if (q.progress >= duration || q.paid >= d.cost - 0.1) {
      p.buildQueue = null;
      if (this.multiplayer) p.readyBuilding = q.type;
      if (this.isAI(p.side)) this.placeAIBuilding(q.type,p.side);
      else if (p.side === 0) { this.pendingBuilding = q.type; this.events.notice?.(`${lunarBuildingProfile(this.map.future, q.type, d).name}建造完成，请在基地附近部署`); this.events.voice?.('buildReady'); }

    }
  }

  updateBuilding(b, dt) {
    const p = this.players[b.owner];
    if (b.repairing) {
      const pricePerHp = BUILDINGS[b.type].cost * .5 / b.maxHp;
      const amount = Math.min(42 * dt, b.maxHp - b.hp, p.credits / pricePerHp);
      if (amount > 0) { b.hp += amount; p.credits -= amount * pricePerHp; battleMetric(this, b.owner, 'repairHP', amount); }
      if (b.hp >= b.maxHp - .01) { b.hp = b.maxHp; b.repairing = false; }
    }
    if (b.type === 'turret') {
      if (!this.hasPower(b.owner) || this.time < (b.stunUntil || 0)) return;
      b.fireTimer -= dt;
      if (b.fireTimer <= 0) {
        const target = this.closestEnemy(b, 250, b.owner);
        if (target) { b.angle = Math.atan2(target.y - b.y, target.x - b.x); this.fire(b, target, 26, 'turret'); b.fireTimer = 0.9; }
      }
    }
    if (!PRODUCERS.includes(b.type)) return;
    if (!b.active && b.queue.length) b.active = { type: b.queue.shift(), progress: 0, paid: 0 };
    if (!b.active) return;
    if (this.map.future && b.type === 'barracks' && !this.hasPower(b.owner)) return;
    const d = UNITS[b.active.type];
    const duration = productionDuration(this, b, b.active.type);
    const cost = this.unitCost(b.owner, b.active.type);
    const need = Math.min(cost - b.active.paid, cost / duration * dt);
    if (p.credits + 0.01 < need) return;
    p.credits -= need; b.active.paid += need; b.active.progress += dt;
    if (b.active.progress >= duration || b.active.paid >= cost - 0.1) {
      const exit = productionExit(b, b.active.type, this.map.future);
      if(this.time<(b.spawnRetryAt||0))return;
      const spawn = d.tags.includes('ship') ? this.findNavalSpawn(b, b.active.type) : this.findSpawn(exit.x, exit.y, b.active.type);
      if(!spawn){b.spawnRetryAt=this.time+.3;return;}
      const unit = this.addUnit(b.owner, b.active.type, spawn.x, spawn.y);
      battleMetric(this, b.owner, 'unitsProduced', 1);
      const goal = d.tags.includes('ship') ? this.navalGoal(spawn.x + exit.side * exit.distance, spawn.y, unitRadius(unit)) : this.findSpawn(spawn.x + (exit.forwardX??exit.side)*exit.distance,spawn.y+(exit.forwardY||0)*exit.distance,unit.type)||spawn;
      unit.deployment = { buildingId: b.id, start: this.time, until: this.time + 2.6, fromX: spawn.x, fromY: spawn.y, ...goal };
      unit.angle = unit.turretAngle = exit.angle;
      b.exitUntil = this.time + 2.6;
      const yCenter = this.homeY;
      if (this.isAI(b.owner) && unit.type === 'engineer') {
        const site = [...this.oil, ...this.beacons].filter(item => item.owner !== b.owner && this.hasExploredFor(b.owner, item.x, item.y)).sort((a, b) => distance(a, unit) - distance(b, unit))[0];
        if (site) unit.order = { type: 'capture', targetId: site.id, x: site.x, y: site.y };
      } else if (this.isAI(b.owner) && unit.type === 'scout') {
        if (this.map.barriers.length && this.map.bridges.length) {
          const bridge = this.map.bridges[Math.floor(random(0, this.map.bridges.length))];
          unit.order = { type: 'move', x: (this.mapId === 'ocean' ? this.world.width / 2 + 160 : this.map.water ? this.map.water.x2 + 90 : 1320) + random(-30, 30), y: (bridge.y1 + bridge.y2) / 2 + random(-25, 25) };
        } else unit.order = { type: 'move', x: this.world.width / 2 + 70 + random(-100, 100), y: yCenter + random(-280, 280) };
      } else if (this.isAI(b.owner) && unit.type === 'ghost') {
        unit.order = { type: 'move', ...(this.playerCount===6?this.enemyObjective(b.owner):{x:570+random(-80,80),y:yCenter+random(-230,230)}) };
      } else if (this.isAI(b.owner) && UNITS[unit.type].tags.includes('air')) {
        unit.order = { type: 'attackMove', ...(this.playerCount===6?this.enemyObjective(b.owner):{x:470+random(-110,110),y:yCenter+random(-240,240)}) };
      } else if (this.isAI(b.owner) && UNITS[unit.type].tags.includes('ship')) {
        unit.order = { type: 'attackMove', x: this.map.water.x1 + unitRadius(unit) + 40, y: yCenter + random(-290, 290) };
      } else if (this.isAI(b.owner) && unit.type !== 'harvester') unit.order = { type: 'move', ...(this.playerCount===6?sixPoint(b.owner,400+random(-70,70),random(-120,120)):{x:this.world.width-630+random(-70,70),y:yCenter+random(-120,120)}) };
      if (b.rallyPoint && unit.type !== 'harvester') unit.order = { type: 'move', ...this.resolveMoveGoal(unit, b.rallyPoint.x, b.rallyPoint.y) };
      if (unit.order) this.setDroneMission(unit);
      if (b.owner === 0) this.events.notice?.(`${equipmentProfile(p.faction, unit.type, this.map.future).name}已就绪`);
      if (b.owner === 0) this.events.voice?.('unitReady');
      b.active = null;
    }
  }

  findSpawn(x, y, type = 'tank') {
    const unit = { type }, radius = unitRadius(unit), layer = unitLayer(unit);
    for (let n = 0; n < 128; n++) {
      const angle = n * 2.399963, reach = n ? 18 * Math.sqrt(n) : 0;
      const p = { x: clamp(x + Math.cos(angle) * reach, 50, this.world.width - 50), y: clamp(y + Math.sin(angle) * reach, 50, this.world.height - 50) };
      if (!this.canOccupyUnit(unit, p) || this.units.some(other => other.hp > 0 && unitLayer(other) === layer && distance(other, p) < unitRadius(other) + radius + 4)) continue;
      return p;
    }
    return null; // 出口完全堵塞时等待，不把新单位生成在建筑或车辆内部。
  }

  setRallyPoint(side, id, x, y) {
    if(this.isControlLocked(side))return false;
    const building = this.getEntity(id);
    if (!building || building.kind !== 'building' || building.owner !== side || building.hp <= 0 || !PRODUCERS.includes(building.type) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const point = { x: clamp(x, 30, this.world.width - 30), y: clamp(y, 30, this.world.height - 30) };
    if (building.type === 'dock') Object.assign(point, this.navalGoal(point.x, point.y, 95));
    else if (building.type !== 'airfield' && this.isGroundBlocked(point.x, point.y, 14)) return false;
    building.rallyPoint = point;
    if (side === 0) { this.effects.push({ type: 'order', ...point, age: 0, duration: .6, owner: side }); this.events.notice?.(`${lunarBuildingProfile(this.map.future, building.type, BUILDINGS[building.type]).name}集结点已设置`); }
    return true;
  }

  findNavalSpawn(dock, type = 'patrol') {
    const water = this.map.water;
    const padding = Math.max(38, unitRadius({ type }));
    const x = dock.x < this.world.width / 2 ? water.x1 + padding : water.x2 - padding;
    for (let n = 0; n < 32; n++) {
      const y = clamp(dock.y + random(-35 - n * 16, 35 + n * 16), padding, this.world.height - padding);
      if (!this.units.some(unit => unit.hp > 0 && unitLayer(unit) === unitLayer({ type }) && distance(unit, { x, y }) < unitRadius(unit) + unitRadius({ type }) + 4)) return { x, y };
    }
    return { x, y: dock.y };
  }

  updateUnit(u, dt) {
    if (protectedPassenger(u)) { u.order = null; return; }
    if (isLunarRobot(this.map, u.type) && (this.time < u.stunUntil || this.updateRobotEnergy(u, dt))) return;
    if (u.deployment) {
      if (this.time < u.stunUntil) return;
      if (distance(u, u.deployment) > 9 && this.time < u.deployment.until) { this.moveUnit(u, u.deployment, dt, 8); return; }
      u.deployment = null; u.path = []; u.pathTimer = 0;
    }
    if (u.airfieldOps && runwayAircraft(u.type, this.map.future)) {
      const ops = u.airfieldOps, home = this.getEntity(ops.homeId);
      if (!home || home.type !== 'airfield' || home.hp <= 0 || home.owner !== u.owner) u.airfieldOps = null;
      else {
        if (ops.phase === 'approach' && u.order?.type !== 'rearm') u.airfieldOps = null;
        if (ops.phase === 'taxiIn' && u.order?.type !== 'rearm') {
          if (u.order) ops.phase = 'taxiOut';
          else {
            const parking = airfieldParking(home, ops.slot);
            if (distance(u, parking) > 9) { this.moveUnit(u, parking, dt * .3, 6); return; }
            ops.phase = 'parked'; u.angle = parking.angle;
          }
        }
        if (ops.phase === 'parked' && u.order && u.order.type !== 'rearm') ops.phase = 'taxiOut';
        if (ops.phase === 'taxiOut') {
          if (!airfieldRunwayAvailable(this, u, home)) return;
          const apron = airfieldApron(home);
          if (distance(u, apron) > 9) { this.moveUnit(u, apron, dt * .3, 6); return; }
          const exit = airfieldDeparture(home, u.type);
          u.airfieldOps = null; u.angle = exit.angle;
          u.deployment = { buildingId: home.id, start: this.time, until: this.time + 3, fromX: u.x, fromY: u.y, x: u.x + exit.forwardX * exit.distance, y: u.y + exit.forwardY * exit.distance };
          return;
        }
      }
    }
    if (u.temporaryUntil && this.time >= u.temporaryUntil) { u.hp = 0; return; }
    if (FREIGHT_TYPES.includes(u.type)) { this.updateFreight(u, dt); return; }
    this.advanceQueuedOrder(u);
    if(this.time>=u.stunUntil&&this.updateSpecialOrder(u,dt))return;
    if (u.type === 'harvester') {
      if (u.order?.type === 'move' || u.order?.type === 'attackMove') {
        if (distance(u, u.order) > 12) this.moveUnit(u, u.order, dt, 8);
        else u.order = null;
      } else if (!this.patrolStep(u, dt)) this.updateHarvester(u, dt);
      return;
    }
    if (this.time < u.stunUntil) return;
    this.updateLandingUnload(u);
    this.updateDroneAutonomy(u);
    u.fireTimer -= dt * (u.jammedUntil > this.time ? .4 : 1);
    const d = UNITS[u.type];
    if (u.type === 'carrier') { this.updateCarrierAirGroup(u, dt); updateCarrierDefense(this,u,dt); }
    if (d.tags.includes('air') && u.order?.type !== 'rearm') this.serviceAircraft(u, dt);
    if (d.tags.includes('ship') && u.order?.type !== 'rearm') this.serviceShip(u, dt);
    this.serviceIdleUnit(u, dt);
    if (u.order?.type === 'board') { this.boardTransport(u, dt); return; }
    if (u.type === 'supply') { this.updateSupply(u, dt); return; }
    if (d.ammo && !isLunarRobot(this.map, u.type) && (u.ammo <= 0 || u.type === 'carrier' && u.wing <= 0) && u.order?.type !== 'rearm') {
      u.resumeOrder = u.order;
      u.order = { type: 'rearm' };
      u.path = [];
      if (u.owner === 0) this.events.notice?.(`${d.name}弹药耗尽，正在返场补给`);
    }
    if (u.order?.type === 'rearm') { this.updateRearm(u, dt); return; }
    if (this.updateSwarmCarrier(u,dt)) return;
    if (u.type === 'engineer') {
      if (u.order?.type === 'capture') {
        const site = this.getEntity(u.order.targetId);
        if (updateTheaterEngineer(this,u,site,dt)) return;
        if (updateIslandCapture(this,u,site,dt)) return;
        if (site?.owner === u.owner) u.order = null;
        else if (site && distance(u, site) < 38) {
          site.owner = u.owner; u.hp = 0;
          recordBattleEvent(this,{kind:'captured',owner:u.owner,type:site.kind==='resource'?'depot':site.id.startsWith('oil')?'oil':'beacon'});
          this.recalculatePower();
          this.fogTimer = 0;
          this.effects.push({ type: 'capture', x: site.x, y: site.y, age: 0, duration: 1.2, owner: site.owner });
          if (u.owner === 0) this.events.notice?.(site.kind==='resource'?'能源仓已接管：40 电力、有限库存与前哨扩建已接入。':site.id.startsWith('oil') ? '油井已占领：每秒增加 11 资金' : '雷达信标已占领：中央视野与小地图已接入');
          if (u.owner === 0) this.events.voice?.(site.id.startsWith('oil') ? 'oilCaptured' : 'beaconCaptured');
        } else if (site) this.moveUnit(u, site, dt, 26);
      } else if (!this.patrolStep(u, dt) && u.order?.type === 'move') this.moveUnit(u, u.order, dt, 8);
      return;
    }
    if (d.damage === 0) {
      if (this.patrolStep(u, dt)) return;
      if (u.order && ['move', 'attackMove', 'attack'].includes(u.order.type)) {
        if (distance(u, u.order) > 10) this.moveUnit(u, u.order, dt, 8);
        else { u.order = null; this.cruiseAircraft(u, dt); }
      } else this.cruiseAircraft(u, dt);
      return;
    }
    if (d.tags.includes('air') && u.order?.type === 'move') {
      if (distance(u, u.order) > 10) this.moveUnit(u, u.order, dt, 8);
      else { u.order = null; this.cruiseAircraft(u, dt); }
      return;
    }
    if (weaponsHeld(u)) {
      if (u.order?.type === 'move') {
        if (distance(u, u.order) > 10) this.moveUnit(u, u.order, dt, 8);
        else u.order = null;
      }
      this.cruiseAircraft(u, dt);
      return;
    }
    let target = u.order?.type === 'attack' ? this.getEntity(u.order.targetId) : null;
    if (target && (!this.canSeeEntity(u.owner, target) || !this.canAttack(u, target))) {
      u.order = { type: 'attackMove', x: u.order.x, y: u.order.y };
      target = null;
    }
    if (!target || target.hp <= 0) { if (u.order?.type === 'attack') u.order = null; target = null; }
    const holdingDrone = supportsDroneAutonomy(u) && u.droneRole === 'hold', guarding = combatStance(u) === 'guard';
    const acquisition = guarding ? d.range : u.order?.type !== 'move' && !holdingDrone ? d.tags.includes('artillery') ? Math.max(d.sight, d.range) : d.sight : d.range * 0.85;
    if (!target) target = this.closestEnemy(u, acquisition, u.owner, guarding);
    if (target) {
      const range = this.unitRange(u, target);
      const reach = u.type === 'bomber' ? 28 : range + (target.kind === 'building' ? target.size * 0.36 : 0);
      const dist = distance(u, target);
      const clear = this.hasLineOfFire(u, target);
      const moving = u.order?.type === 'move' || this.time - (u.lastMovedAt ?? -10) < .12;
      if (d.deployTime) u.deployProgress = moving || dist > reach ? 0 : Math.min(d.deployTime, u.deployProgress + dt);
      const flights = u.type === 'carrier' ? this.projectiles.filter(p => !p.finished && p.sourceId === u.id && p.kind === 'wing').length : 0;
      if (dist >= (d.minRange || 0) && dist <= reach && clear && aircraftCanFire(u, target, this.map.future) && u.fireTimer <= 0 && !(u.ewSuppressedUntil > this.time) && !u.overheated && (!d.deployTime || u.deployProgress >= d.deployTime) && (u.type !== 'carrier' || flights < u.wing)) {
        u.turretAngle = Math.atan2(target.y - u.y, target.x - u.x);
        this.fire(u, target, this.unitDamage(u, target), u.type);
        if (d.ammo && !isLunarRobot(this.map, u.type) && !unlimitedAmmo(this, u)) u.ammo--;
        if (u.type === 'laser') this.laserHeat(u);
        u.fireTimer = d.cooldown;
        if (u.type === 'bomber' && u.ammo <= 0) {
          this.requestResupply(u); return;
        }
      }
      const flightGoal = aircraftAttackGoal(u, target, reach, this.map.future);
      if (flightGoal) { this.moveUnit(u, flightGoal, dt, 0); return; }
      if (u.order?.type === 'move') this.moveUnit(u, u.order, dt, 8);
      else if (!guarding && d.minRange && dist < d.minRange) {
        const angle = Math.atan2(u.y - target.y, u.x - target.x);
        const goal = this.resolveMoveGoal(u, clamp(u.x + Math.cos(angle) * 100, 20, this.world.width - 20), clamp(u.y + Math.sin(angle) * 100, 20, this.world.height - 20));
        this.moveUnit(u, goal, dt, 8); u.deployProgress = 0;
      } else if (!guarding && (!clear || dist > reach * .96)) this.moveUnit(u, target, dt, clear ? reach * .85 : 8);
      if (u.order?.type !== 'move' && clear && dist <= reach * .96 && d.tags.includes('jet') && d.damage > 0) {
        const angle = Math.atan2(u.y - target.y, u.x - target.x) + .65;
        this.moveUnit(u, this.resolveMoveGoal(u, target.x + Math.cos(angle) * reach * .7, target.y + Math.sin(angle) * reach * .7), dt, 3);
      }
    } else if (this.patrolStep(u, dt)) return;
    else if (u.order && ['move', 'attackMove'].includes(u.order.type)) {
      if (distance(u, u.order) > 10) this.moveUnit(u, u.order, dt, 8);
      else { u.order = null; this.cruiseAircraft(u, dt); }
    } else this.cruiseAircraft(u, dt);
  }

  cruiseAircraft(u, dt) {
    if (!runwayAircraft(u.type, this.map.future) || u.embarkedIn || u.deckApproach || u.deployment) return;
    if (this.aircraftGrounded(u) || this.aircraftServiceSites(u).some(b => distance(u, airfieldApron(b)) < 16)) return;
    const angle = u.angle + .55;
    this.moveUnit(u, { x: u.x + Math.cos(angle) * 240, y: u.y + Math.sin(angle) * 240 }, dt, 0);
  }

  updateRearm(u, dt) {
    if (isLunarRobot(this.map, u.type)) { this.updateRobotRearm(u, dt); return; }
    if (!UNITS[u.type].tags.includes('air')) { this.updateGroundRearm(u, dt); return; }
    if (u.homeCarrierId && this.returnToCarrier(u, dt)) return;
    const homes = this.aircraftServiceSites(u);
    const home = homes.find(b => b.id === u.order?.homeId) || homes.sort((a, b) => distance(a, u) - distance(b, u))[0];
    if (!home) {
      if (u.resumeOrder?.x !== undefined && distance(u, u.resumeOrder) > 10) this.moveUnit(u, u.resumeOrder, dt, 8);
      else this.cruiseAircraft(u, dt);
      return;
    }
    let apron = runwayAircraft(u.type, this.map.future) ? airfieldApron(home) : home;
    if (apron !== home) {
      if (!u.airfieldOps || u.airfieldOps.homeId !== home.id) {
        const slot = allocateAirfieldSlot(this, u, home);
        if (slot === null) { const heading = u.angle + .55; this.moveUnit(u, { x: u.x + Math.cos(heading) * 240, y: u.y + Math.sin(heading) * 240 }, dt, 0); return; }
        u.airfieldOps = { homeId: home.id, slot, phase: 'approach' };
      }
      const ops = u.airfieldOps;
      if (ops.phase !== 'parked' && !airfieldRunwayAvailable(this, u, home)) {
        if (ops.phase === 'approach') this.moveUnit(u, airfieldHoldingPoint(this, u, home), dt, 0);
        return;
      }
      if (ops.phase === 'approach' && distance(u, apron) <= 12) ops.phase = 'taxiIn';
      if (ops.phase === 'taxiIn') {
        const parking = airfieldParking(home, ops.slot);
        if (distance(u, parking) > 9) { this.moveUnit(u, parking, dt * .3, 6); return; }
        ops.phase = 'parked'; u.angle = parking.angle; u.path = []; u.pathTimer = 0;
      }
      if (ops.phase === 'parked') { apron = airfieldParking(home, ops.slot); u.angle = apron.angle; }
    }
    if (distance(u, apron) > (apron === home ? home.size * .55 + 24 : 12)) {
      u.rearmProgress = 0;
      this.moveUnit(u, apron, dt, apron === home ? home.size * .55 + 18 : 8);
      return;
    }
    if (!this.hasPower(u.owner)) return;
    this.serviceAircraft(u, dt);
    if (!this.serviceReady(u)) return;
    this.refillStationAmmo(u, dt);
    const d = UNITS[u.type];
    if ((!d.ammo || u.ammo === d.ammo) && u.hp >= u.maxHp - .01) {
      this.restoreCombatOrder(u);
      if (u.owner === 0) this.events.notice?.(`${UNITS[u.type].name}补给完成`);
    }
  }

  canAttack(source, target) {
    if (target.embarkedIn) return false;
    if (target.kind === 'unit' && UNITS[target.type].tags.includes('submerged') && (source.kind !== 'unit' || !UNITS[source.type].tags.includes('anti-sub') && source.type !== 'submarine')) return false;
    if (source.kind === 'building') return target.kind === 'building' || this.aircraftGrounded(target) || !UNITS[target.type].tags.some(t=>['jet','rotorcraft'].includes(t));
    const type = source.type;
    if (!UNITS[type]?.damage) return false;
    if (type === 'abm') return false;
    if (bridgeBlocksDirectShot(this.map, source, target, UNITS)) return false;
    if (type === 'carrier' && this.carrierAircraft(source).length) return false;
    const tags = target.kind === 'unit' ? UNITS[target.type].tags.filter(t => !this.aircraftGrounded(target) || !['air', 'jet', 'drone','rotorcraft'].includes(t)) : [];
    if (type === 'aa') return tags.includes('air');
    if (type === 'laser') return tags.includes('drone');
    if (type === 'submarine') return tags.includes('ship');
    if (['rocket', 'ballistic', 'helicopter', 'loiterer', 'carrier', 'bomber'].includes(type) && tags.includes('air')) return false;
    if (tags.includes('rotorcraft') && !UNITS[type].tags.includes('air') && !UNITS[type].tags.includes('anti-air')) return false;
    if (type === 'aegis') return tags.includes('air');
    if (['fighter', 'navalFighter'].includes(type)) return true;
    if (type === 'railgun' && tags.includes('air')) return false;
    if (['strike', 'navalStrike'].includes(type)) return true;
    if (UNITS[type].tags.includes('ship')) {
      if (tags.includes('jet') && !UNITS[type].tags.includes('anti-air')) return false;
      const water = this.map.water;
      if (!water) return false;
      const closestWater = { x: clamp(target.x, water.x1 + 20, water.x2 - 20), y: clamp(target.y, water.y1 + 20, water.y2 - 20) };
      const reach = UNITS[type].range + (target.kind === 'building' ? target.size * .36 : 0);
      return distance(closestWater, target) <= reach;
    }
    if (!tags.includes('jet')) return true;
    return type === 'elite' && this.players[source.owner].faction === 'china';
  }

  isGroundBlocked(x, y, radius = 0) {
    if (this.map.islands && islandDistance(this.map,x,y) < radius) return true;
    return this.map.barriers.some(rect => intersectsRect(x, y, radius, rect));
  }

  isNavalBlocked(x, y, radius = 0) {
    const water = this.map.water;
    return !water || x - radius < water.x1 || x + radius > water.x2 || y - radius < water.y1 || y + radius > water.y2 || !!this.map.islands && islandDistance(this.map,x,y) > -radius;
  }

  navalGoal(x, y, radius = 20) {
    const water = this.map.water;
    if (!water) return { x, y };
    if (this.map.islands) return nearestSeaPoint(this,x,y,radius);
    return { x: clamp(x, water.x1 + radius, water.x2 - radius), y: clamp(y, water.y1 + radius, water.y2 - radius) };
  }

  resolveMoveGoal(unit, x, y) {
    if (UNITS[unit.type].tags.includes('ship')) return this.navalGoal(x, y, unitRadius(unit));
    if (UNITS[unit.type].tags.includes('air') || !this.isGroundBlocked(x, y, UNITS[unit.type].tags.includes('infantry') ? 6 : 14)) return { x, y };
    const radius = UNITS[unit.type].tags.includes('infantry') ? 6 : 14;
    let best = null, bestScore = Infinity;
    for (let cy = 0; cy < this.world.height / this.world.cell; cy++) for (let cx = 0; cx < this.world.width / this.world.cell; cx++) {
      const candidate = { x: cx * this.world.cell + this.world.cell / 2, y: cy * this.world.cell + this.world.cell / 2 };
      if (this.isGroundBlocked(candidate.x, candidate.y, radius)) continue;
      const score = distance(candidate, { x, y }) + distance(candidate, unit) * 0.15;
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    return best || { x: unit.x, y: unit.y };
  }

  hasLineOfFire(source, target) {
    if (['rocket', 'loiterer', 'ballistic'].includes(source.type)) return true;
    if (source.kind === 'unit' && UNITS[source.type].tags.includes('air')) return true;
    if (target.kind === 'unit' && UNITS[target.type].tags.includes('air')) return true;
    if (source.kind === 'unit' && UNITS[source.type].tags.includes('ship')) return true;
    if (target.kind === 'unit' && UNITS[target.type].tags.includes('ship')) return true;
    return !this.map.barriers.some(rect => crossesRect(source, target, rect));
  }

  unitRange(u, target) {
    let range = UNITS[u.type].range;
    if (u.type === 'elite' && this.players[u.owner].faction === 'middleeast') range *= 1.15;
    if (u.type === 'elite' && this.players[u.owner].faction === 'russia' && target.kind === 'building') range *= 1.28;
    return range;
  }

  unitDamage(u, target) {
    let amount = UNITS[u.type].damage;
    const targetTags = target.kind === 'unit' ? UNITS[target.type].tags.filter(t=>!this.aircraftGrounded(target)||!['air','jet','drone'].includes(t)) : [];
    if (u.type === 'drone' && targetTags.includes('armor')) amount *= 1.8;
    if (u.type === 'helicopter') amount *= targetTags.includes('armor') ? 1.5 : targetTags.includes('infantry') ? .6 : 1;
    if (u.type === 'drone' && targetTags.includes('jet')) amount *= 0.7;
    if (u.type === 'aa' && targetTags.includes('air')) amount *= 2.25;
    if (['fighter', 'aegis', 'navalFighter'].includes(u.type) && targetTags.includes('air')) amount *= targetTags.includes('jet') ? 1.15 : 1.4;
    if (['fighter', 'navalFighter'].includes(u.type) && !targetTags.includes('air')) amount *= .35;
    if (['strike', 'navalStrike'].includes(u.type)) {
      if (targetTags.includes('air')) amount *= .35;
      if (target.kind === 'building') amount *= 1.7;
      if (targetTags.includes('armor')) amount *= 1.2;
      if (targetTags.includes('ship')) amount *= 1.25;
      if (targetTags.includes('infantry')) amount *= 0.65;
    }
    if (u.type === 'patrol') {
      if (target.kind === 'building') amount *= .45;
      if (targetTags.includes('ship')) amount *= 1.18;
    }
    if (u.type === 'frigate') {
      if (target.kind === 'building') amount *= .65;
      if (targetTags.includes('jet')) amount *= 1.55;
    }
    if (u.type === 'tank' && (targetTags.includes('infantry') || targetTags.includes('anti-air'))) amount *= 1.45;
    if (u.type === 'rifle' && targetTags.includes('armor')) amount *= 0.52;
    if (u.type === 'elite') {
      const faction = this.players[u.owner].faction;
      if (faction === 'china' && targetTags.includes('air')) amount *= 2.2;
      if (faction === 'russia' && target.kind === 'building') amount *= 2.2;
      if (faction === 'nato' && targetTags.includes('infantry')) amount *= 1.6;
      if (faction === 'nato' && targetTags.includes('drone')) amount *= 1.45;
      if (faction === 'asia' && targetTags.includes('armor')) amount *= 1.7;
      if (faction === 'middleeast' && (targetTags.includes('drone') || targetTags.includes('vehicle'))) amount *= 1.2;
    }
    if (this.players[u.owner].faction === 'russia' && target.kind === 'building') amount *= 1.15;
    if (this.players[u.owner].faction === 'russia' && u.type === 'aa' && targetTags.includes('air')) amount *= 0.88;
    if (this.players[u.owner].faction === 'middleeast' && u.type === 'tank') amount *= 0.9;
    return amount * tacticalDamage(this.map, u, target);
  }

  fire(source, target, amount, style) {
    if (isLunarRobot(this.map, source.type)) {
      const cost = ROBOT_SPECS[source.type].shotCost;
      if (source.battery < cost) return;
      source.battery = Math.max(0, source.battery - cost);
      style = 'robotPulse';
    }
    source.lastFireAt = this.time;
    if (UNITS[source.type]?.tags.includes('anti-sub') && UNITS[target.type]?.tags.includes('submerged')) {
      this.launchProjectile(source, target, amount, 'antiSub'); return;
    }
    if (style === 'rocket') {
      // 一格弹药表示一轮四发齐射，总伤害预算不叠加，保持原有补给成本。
      for (let index = 0; index < 4; index++) {
        this.launchProjectile(source, target, amount / 4, style);
        const p = this.projectiles.at(-1), lateral = (index - 1.5) * 5;
        const angle = Math.atan2(target.y - source.y, target.x - source.x);
        p.x = p.startX = source.x - Math.sin(angle) * lateral;
        p.y = p.startY = source.y + Math.cos(angle) * lateral;
        p.speed *= 1 - index * .035;
      }
      return;
    }
    if (['loiterer', 'rocket', 'ballistic', 'helicopter', 'destroyer', 'carrier', 'submarine', 'bomber', 'fighter', 'strike', 'aegis', 'navalFighter', 'navalStrike'].includes(style)) { this.launchProjectile(source, target, amount, style); return; }
    this.effects.push({ type: 'shot', sourceId: source.id, x: source.x, y: source.y, toX: target.x, toY: target.y, sourceType: source.type, targetType: target.type, age: 0, duration: style === 'railgun' ? .32 : .18, owner: source.owner, style });
    this.effects.push({ type: 'hit', x: target.x, y: target.y, targetType: target.type, age: 0, duration: 0.42, owner: source.owner, style });
    const tags = target.kind === 'unit' ? UNITS[target.type].tags : [];
    const stun = source.type === 'elite' && this.players[source.owner].faction === 'middleeast' && (tags.includes('drone') || tags.includes('vehicle')) ? 1.5 : 0;
    const hit = { target, amount, side: source.owner, stun };
    if (this.collectingHits) this.pendingHits.push(hit);
    else this.applyHit(hit);
    if (source.type === 'elite' && this.players[source.owner].faction === 'nato' && tags.includes('drone')) {
      for (const nearby of this.enemyUnits(source.owner,'drone')) {
        if (nearby.id === target.id || distance(nearby, target) > 72) continue;
        const splash = { target: nearby, amount: amount * .36, side: source.owner, stun: 0 };
        if (this.collectingHits) this.pendingHits.push(splash);
        else this.applyHit(splash);
        this.effects.push({ type: 'hit', x: nearby.x, y: nearby.y, targetType: nearby.type, age: 0, duration: .3, owner: source.owner, style: 'aa' });
      }
    }
    emitBattleSound(this, weaponSound(style, target), source, 'launch', { sourceId: source.id });
    emitBattleSound(this, impactSound(target), { x: target.x, y: target.y, owner: source.owner }, 'impact');
  }

  applyHit(hit) {
    if (hit.target.hp <= 0) return;
    this.damage(hit.target, hit.amount, hit.side);
    if (hit.stun && hit.target.hp > 0) hit.target.stunUntil = Math.max(hit.target.stunUntil || 0, this.time + hit.stun);
  }

  damage(target, amount, attackerSide, soundStyle = null) {
    if (target.hp <= 0 || !Number.isFinite(amount) || amount <= 0) return;
    if (this.players[target.owner].shieldUntil > this.time) amount *= 0.48;
    if (target.kind === 'building' && this.players[target.owner].faction === 'china' && target.type === 'turret') amount *= 0.85;
    recordBattleDamage(this, target, amount, attackerSide);
    target.hp -= amount;
    if (amount > 0) target.lastDamageAt = this.time;
    if (target.owner === 0 && attackerSide === 1) {
      const building = target.kind === 'building';
      const previous = this.attackAlerts?.find(alert => alert.id === target.id);
      if (!this.attackAlerts) this.attackAlerts = [];
      if (previous) { previous.x = target.x; previous.y = target.y; previous.at = this.time; }
      else this.attackAlerts.push({ id: target.id, x: target.x, y: target.y, at: this.time, building, type: target.type });
      this.attackAlerts = this.attackAlerts.filter(alert => this.time - alert.at < 8).slice(-12);
      const key = building ? 'underAttack' : 'unitUnderAttack';
      if (this.time - (this.lastAttackVoiceAt ?? -100) >= 10 || building && !this.lastAttackVoiceBuilding && this.time - (this.lastAttackVoiceAt ?? -100) >= 3) {
        this.lastAttackVoiceAt = this.time; this.lastAttackVoiceBuilding = building;
        this.events.voice?.(key);
      }
    }
    if (target.hp <= 0) {
      target.hp = 0;
      if (UNITS[target.type]?.capacity) this.unloadTransport(target, true);
      if (target.freight?.value > 0) {
        const control = this.logistics[target.owner].seaControl;
        if (target.freight.batch && control && !control.lostBatches.includes(target.freight.batch) && !control.receipts.includes(target.freight.batch)) control.lostBatches.push(target.freight.batch);
        this.logistics[target.owner].lost += target.freight.value;
        recordBattleEvent(this,{kind:'intercepted',owner:target.owner,type:target.type,value:target.freight.value});
        if (target.owner === 0) this.events.notice?.(`后勤运输被截断，损失 ${target.freight.value} 待交付物资`);
      }
      emitBattleSound(this, soundStyle || destructionSound(target), { x: target.x, y: target.y, owner: attackerSide }, 'destroy');
      this.effects.push(destructionEvent(this, target, attackerSide));
      if (target.owner === 0) this.events.notice?.(`${target.kind === 'building' ? lunarBuildingProfile(this.map.future, target.type, BUILDINGS[target.type]).name : equipmentProfile(this.players[0].faction, target.type, this.map.future).name}已损毁`);
      if (target.owner === 0) this.events.voice?.(target.kind === 'building' ? 'buildingLost' : 'unitLost');
      this.recalculatePower();
    }
  }

  closestEnemy(source, range, owner, stationary = false) {
    let nearest = null, best = stationary ? Infinity : range;
    for (const target of [...this.units, ...this.buildings]) {
      if (target.owner === owner || target.hp <= 0 || target.embarkedIn) continue;
      // 待接管的任务设施不触发我方自动开火，仍允许玩家主动破坏并承担修复代价。
      if(owner===0&&target.kind==='building'&&theaterFacility(this,target.id))continue;
      const gap = distance(source, target), d = gap - (target.kind === 'building' ? target.size * 0.3 : 0);
      // 先排除射程外目标，再做桥梁遮挡、反潜和视野判断；不改变目标优先级。
      if (stationary) {
        const reach = this.unitRange(source, target) + (target.kind === 'building' ? target.size * .36 : 0);
        if (gap < (UNITS[source.type].minRange || 0) || gap > reach) continue;
      } else if (d >= range) continue;
      if (!this.canAttack(source, target) || !this.droneGuardAllows(source, target)) continue;
      if ((stationary || source.kind === 'building') && !this.hasLineOfFire(source, target)) continue;
      const airborne = target.kind === 'unit' && UNITS[target.type].tags.includes('air') && !this.aircraftGrounded(target);
      const primaryAir = ['fighter','navalFighter'].includes(source.type), primaryGround = ['strike','navalStrike'].includes(source.type);
      const priority = primaryAir ? airborne ? .3 : 1 : primaryGround ? airborne ? 1 : .3 : ['aa', 'frigate'].includes(source.type) && target.kind === 'unit' && UNITS[target.type].tags.includes('jet') ? .65 : 1;
      if (d * priority < best && this.canSeeEntity(owner, target)) { best = d * priority; nearest = target; }
    }
    return nearest;
  }

  updateHarvester(u, dt) {
    if (this.time < u.stunUntil) return;
    const home = this.ownedBuildings(u.owner, 'refinery').sort((a, b) => distance(a, u) - distance(b, u))[0];
    if (!home) return;
    if (u.cargo >= 210 || u.harvestState === 'return') {
      u.harvestState = 'return';
      if (distance(u, home) < home.size * 0.57 + 20) {
        this.players[u.owner].credits += u.cargoValue;
        if(u.owner===0)recordTheaterMining(this,u.cargoValue);
        if (u.owner === 0 && u.cargoValue >= 100) this.effects.push({ type: 'income', x: home.x, y: home.y - 30, amount: Math.round(u.cargoValue), age: 0, duration: 1.1 });
        u.cargo = 0; u.cargoValue = 0; u.harvestState = 'find'; u.path = [];
      } else this.moveUnit(u, home, dt, home.size * 0.52 + 12);
      return;
    }
    let ore = this.ore.find(item => item.id === u.oreTargetId && item.amount > 0);
    if (!ore || u.harvestState === 'find') {
      const score = item => distance(item, u) + this.activeUnits(u.owner, 'harvester').filter(other => other !== u && other.oreTargetId === item.id && other.harvestState !== 'return').length * 100;
      ore = this.ore.filter(item => item.amount > 0).sort((a, b) => score(a) - score(b))[0];
      u.oreTargetId = ore?.id; u.harvestState = 'approach';
    }
    if (!ore) return;
    if (distance(u, ore) < 55) {
      const amount = Math.min(ore.amount, 31 * dt, 210 - u.cargo);
      ore.amount -= amount; u.cargo += amount; u.cargoValue += amount * ORE_VALUES[ore.kind]; u.harvestState = 'mine';
      if (u.cargo >= 209) u.harvestState = 'return';
    } else this.moveUnit(u, ore, dt, 48);
  }

  moveUnit(u, goal, dt, stopDistance = 8) {
    u.motionGoal={x:goal.x,y:goal.y};
    if (this.collectingMoves) {
      this.pendingMoves.push({ unit: u, goal: { x: goal.x, y: goal.y }, dt, stopDistance });
      return;
    }
    this.moveUnitNow(u, goal, dt, stopDistance);
  }

  moveUnitNow(u, goal, dt, stopDistance = 8) {
    if (distance(u, goal) <= stopDistance) return;
    if (UNITS[u.type].tags.includes('air')) {
      const landing = u.order?.type === 'rearm' && this.aircraftServiceSites(u).some(b => distance(u, airfieldApron(b)) < 260);
      const speedStep = UNITS[u.type].speed * dt * (u.jammedUntil > this.time ? .6 : 1);
      const amount = Math.min(speedStep, Math.max(0, distance(u, goal) - stopDistance));
      const step = landing || u.airfieldOps?.phase === 'taxiOut' ? null : aircraftStep(u, goal, dt, amount, this.world, this.map.future);
      if (step) {
        u.x = step.x; u.y = step.y; u.angle = step.heading; u.movePulse += dt * 7; u.lastMovedAt = this.time; u.deployProgress = 0; return;
      }
      this.moveWithAvoidance(u, goal, dt, stopDistance);
      return;
    }
    if (UNITS[u.type].tags.includes('ship')) {
      const destination = this.navalGoal(goal.x, goal.y, unitRadius(u));
      if (this.map.islands) {
        const key = `${destination.x.toFixed(1)},${destination.y.toFixed(1)}`;
        const progress=u.navalProgress;
        if(!progress || progress.goal!==key){u.navalProgress={goal:key,distance:distance(u,destination),until:this.time+3};u.navalStalled=false;}
        else if(this.time>=progress.until){u.navalStalled=progress.distance-distance(u,destination)<10;if(u.navalStalled){u.path=[];u.navalRetryAt=0;}progress.distance=distance(u,destination);progress.until=this.time+3;}
        if (u.pathGoal !== key || !u.path.length && this.time >= (u.navalRetryAt || 0)) {
          u.path = navalPath(this,u,destination,stopDistance);u.pathGoal=key;u.navalRetryAt=this.time+2;
        }
        while(u.path.length && distance(u,u.path[0])<14)u.path.shift();
        const point=u.path[0] || destination;
        if (!this.moveWithAvoidance(u,point,dt,u.path.length?0:stopDistance)&&this.time>=u.navalRetryAt){u.path=[];u.navalRetryAt=this.time+.4;}
        return;
      }
      const radius=unitRadius(u);
      if(u.type==='landing'&&['move','attackMove'].includes(u.order?.type)&&distance(u.order,goal)<1&&distance(u,destination)<=16&&this.canOccupyUnit(u,u)){
        const nearby=(this.unitIndex||new UnitSpatialIndex(this.units)).nearby(u);
        const parked=nearby.filter(v=>v.owner===u.owner&&unitLayer(v)===unitLayer(u)&&!v.order);
        if(parked.some(v=>distance(v,destination)<unitRadius(v)+radius+4)&&nearby.every(v=>distance(v,u)>=unitRadius(v)+radius+2)){
          // 友舰已经占住泊位时在近侧安全位置停航，避免最后几米反复绕行而无法卸载。
          u.order=null;u.path=[];return;
        }
      }
      this.moveWithAvoidance(u, destination, dt, stopDistance);
      return;
    }
    const progress = u.navigationProgress;
    if (!progress || Math.hypot(progress.x - goal.x, progress.y - goal.y) > 1) {
      u.navigationProgress = { x: goal.x, y: goal.y, distance: distance(u, goal), until: this.time + 3 };
      u.navigationStalled = false;
    } else if (this.time >= progress.until) {
      u.navigationStalled = progress.distance - distance(u, goal) < 12;
      u.navigationAttempts = u.navigationStalled ? (u.navigationAttempts || 0) + 1 : 0;
      progress.distance = distance(u, goal); progress.until = this.time + 3;
      if (u.navigationStalled) u.pathTimer = 0;
    }
    if (u.order?.formation && ['move', 'attackMove'].includes(u.order.type) && distance(u.order, goal) < 1 && u.navigationAttempts >= 3 && distance(u, goal) < 360) {
      const nearby = (this.unitIndex || new UnitSpatialIndex(this.units)).nearby(u);
      if (nearby.some(v => v.owner === u.owner && !v.order && distance(v, u) < 180) && nearby.every(v => distance(v, u) >= unitRadius(v) + unitRadius(u) + 1) && this.canOccupyUnit(u, u)) {
        // 连续改派仍被驻军封住时，在已到达的安全外围停稳，而非无限争抢内部槽位。
        u.order = null; u.path = []; delete u.navigationProgress; delete u.navigationStalled; return;
      }
    }
    u.pathTimer -= dt;
    const neighbors = (this.unitIndex || new UnitSpatialIndex(this.units)).nearby(u);
    const ahead = u.path[0] || goal, direction = Math.atan2(ahead.y - u.y, ahead.x - u.x);
    const blocksAhead = (other, radius) => {
      const dx = other.x - u.x, dy = other.y - u.y;
      const forward = dx * Math.cos(direction) + dy * Math.sin(direction), across = Math.abs(dx * Math.sin(direction) - dy * Math.cos(direction));
      return forward > 0 && forward < unitRadius(u) + radius + UNITS[u.type].speed * .65 && across < unitRadius(u) + radius + 5;
    };
    const blockers = neighbors.filter(other => unitLayer(other) === unitLayer(u) && distance(other, goal) > unitRadius(other) + stopDistance && (other.owner === u.owner || this.canSeeEntity(u.owner, other)) && (blocksAhead(other, unitRadius(other)) || !other.order && distance(other, goal) < distance(u, goal) && distance(other, u) < 200));
    const buildingAhead = this.buildings.some(b => b.hp > 0 && this.canSeeEntity(u.owner, b) && distance(b, goal) > b.size * .5 + stopDistance && blocksAhead(b, b.size * .45));
    if ((blockers.length || buildingAhead) && this.time >= (u.avoidRepathAt || 0)) { u.pathTimer = 0; u.avoidRepathAt = this.time + .3; }
    const goalCell = `${Math.floor(goal.x / this.world.cell)},${Math.floor(goal.y / this.world.cell)}`;
    if (!u.path.length || u.pathTimer <= 0 || u.pathGoal !== goalCell) {
      u.path = this.findPath(u, goal, stopDistance, blockers);
      u.pathTimer = 1.4 + random(0, 0.3);
      u.pathGoal = goalCell;
    }
    let point = u.path[0] || goal;
    if (distance(u, point) < 6 && u.path.length) { u.path.shift(); point = u.path[0] || goal; }
    if (!this.moveWithAvoidance(u, point, dt, u.path.length ? 0 : stopDistance)&&this.time>=(u.blockedRepathAt||0)) { u.pathTimer = 0; u.path = [];u.blockedRepathAt=this.time+.35; }
  }

  canOccupyUnit(unit, point) {
    if (point.x < 18 || point.x > this.world.width - 18 || point.y < 18 || point.y > this.world.height - 18) return false;
    const layer = unitLayer(unit);
    if (UNITS[unit.type].tags.includes('air')) return true;
    if (layer === 'naval' || layer === 'submerged') return !this.isNavalBlocked(point.x, point.y, Math.max(18, unitRadius(unit)));
    const radius = UNITS[unit.type].tags.includes('infantry') ? 6 : 14;
    // 老存档或拥挤出口中的重叠单位只能朝远离建筑的方向脱困，外部单位仍不能穿入。
    return !this.isGroundBlocked(point.x, point.y, radius) && !this.buildings.some(b => {if(b.hp<=0)return false;const minimum=b.size*.45+radius,next=distance(b,point);if(next>=minimum)return false;const previous=Number.isFinite(unit.x)&&Number.isFinite(unit.y)?distance(b,unit):Infinity;return previous>=minimum||next<=previous+.001;});
  }

  moveWithAvoidance(unit, point, dt, stopDistance = 0) {
    const dist = distance(unit, point), amount = Math.min(UNITS[unit.type].speed * dt * (unit.jammedUntil > this.time ? .6 : 1), Math.max(0, dist - stopDistance));
    if (amount <= .001) return true;
    const angle = Math.atan2(point.y - unit.y, point.x - unit.x), radius = unitRadius(unit);
    const neighbors = (this.unitIndex || new UnitSpatialIndex(this.units)).nearby(unit);
    const layer = unitLayer(unit);
    // 可见性、碰撞半径与当前间距每帧只计算一次，避免十一条候选方向反复查询。
    const reach = Math.max(amount, Math.min(dist, amount + UNITS[unit.type].speed * .4)), nearby = [];
    for (const other of neighbors) {
      if (canCrush(unit, other, this)) continue;
      const otherRadius = unitRadius(other), minimum = radius + otherRadius + 4, separation = radius + otherRadius + 2;
      const squared = (unit.x - other.x) ** 2 + (unit.y - other.y) ** 2;
      if (squared > (minimum + reach) ** 2) continue;
      nearby.push({ x: other.x, y: other.y, minimum, minimumSquared: minimum * minimum, collisionSquared: (separation - .01) ** 2,
        previousSquared: (Math.sqrt(squared) + .001) ** 2, known: unitLayer(other) === layer && (other.owner === unit.owner || this.canSeeEntity(unit.owner, other)) });
    }
    let best = null, bestScore = Infinity;
    for (const turn of [0, .35, -.35, .7, -.7, 1.1, -1.1, 1.5, -1.5, 2.1, -2.1]) {
      const heading = angle + turn, next = { x: unit.x + Math.cos(heading) * amount, y: unit.y + Math.sin(heading) * amount };
      if (!this.canOccupyUnit(unit, next)) continue;
      if(layer==='ground'&&nearby.some(other=>{const squared=(next.x-other.x)**2+(next.y-other.y)**2;return squared<other.collisionSquared&&squared<=other.previousSquared;}))continue;
      let score = distance(next, point) + Math.abs(turn) * amount * .08 + (turn < 0 ? amount * .015 : 0);
      if(unitLayer(unit)==='ground'&&unit.avoidUntil>this.time&&turn*unit.avoidSide<-.1)score+=amount*.85;
      const look = { x: unit.x + Math.cos(heading) * Math.min(dist, amount + UNITS[unit.type].speed * .4), y: unit.y + Math.sin(heading) * Math.min(dist, amount + UNITS[unit.type].speed * .4) };
      for (const other of nearby) {
        const nextSquared = (next.x - other.x) ** 2 + (next.y - other.y) ** 2;
        if (nextSquared < other.minimumSquared) score += (other.minimum - Math.sqrt(nextSquared)) * (unit.type === 'harvester' ? 8 : 3);
        if (other.known) {
          const lookSquared = (look.x - other.x) ** 2 + (look.y - other.y) ** 2;
          if (lookSquared < other.minimumSquared) score += (other.minimum - Math.sqrt(lookSquared)) * amount * .12;
        }
      }
      if (score < bestScore) { best = { ...next, heading }; bestScore = score; }
    }
    if (!best) return false;
    const chosenTurn=Math.atan2(Math.sin(best.heading-angle),Math.cos(best.heading-angle));
    if(unitLayer(unit)==='ground'&&Math.abs(chosenTurn)>.3&&!(unit.avoidUntil>this.time)){unit.avoidSide=Math.sign(chosenTurn);unit.avoidUntil=this.time+1.25;}
    const from = { x: unit.x, y: unit.y };
    unit.x = best.x; unit.y = best.y; unit.angle = best.heading; unit.movePulse += dt * 7;
    crushAlongMove(this, unit, from, best, neighbors);
    unit.lastMovedAt = this.time; unit.deployProgress = 0;
    return true;
  }

  findPath(u, goal, stopDistance, obstacles = []) {
    // 把整片已知驻军纳入路线，避免只绕眼前一辆车后又撞上下一排。
    const parked = this.units.filter(v => !canCrush(u, v, this) && v !== u && v.hp > 0 && !v.embarkedIn && unitLayer(v) === 'ground' && (!v.order || v.order.type === 'rearm') && distance(v, u) < 900 && (v.owner === u.owner || this.canSeeEntity(u.owner, v)));
    const parkedIds = new Set(parked.map(v => v.id));
    obstacles = [...new Set([...obstacles, ...parked])];
    // 驻军之间使用更细的导航格，避免可通行的编队空位被四十单位网格抹掉。
    const cell = parked.length && u.order?.formation && distance(u, goal) < 600 ? this.world.cell / 2 : this.world.cell;
    const cols = this.world.width / cell, rows = this.world.height / cell;
    const grid = new PF.Grid(cols, rows);
    const terrainRadius = UNITS[u.type].tags.includes('infantry') ? 6 : 14;
    if (this.map.barriers.length || this.map.islands) for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      if (this.isGroundBlocked(cx * cell + cell / 2, cy * cell + cell / 2, terrainRadius)) grid.setWalkableAt(cx, cy, false);
    }
    for (const b of this.buildings) {
      if (b.hp <= 0 || !this.canSeeEntity(u.owner, b)) continue;
      const r = b.size * 0.49 + (UNITS[u.type].tags.includes('infantry') ? 4 : 11);
      for (let cy = Math.max(0, Math.floor((b.y - r) / cell)); cy <= Math.min(rows - 1, Math.floor((b.y + r) / cell)); cy++) {
        for (let cx = Math.max(0, Math.floor((b.x - r) / cell)); cx <= Math.min(cols - 1, Math.floor((b.x + r) / cell)); cx++) {
          if (distance({ x: cx * cell + cell / 2, y: cy * cell + cell / 2 }, b) < r) grid.setWalkableAt(cx, cy, false);
        }
      }
    }
    // 只绕开附近已知的同层单位，避免通过寻路提前泄露迷雾内的敌军。
    for (const other of obstacles) {
      if (other === u || other.embarkedIn || other.hp <= 0 || unitLayer(other) !== unitLayer(u) || canCrush(u, other, this)) continue;
      if (other.owner !== u.owner && !this.canSeeEntity(u.owner, other)) continue;
      // 网格中心保留半格余量；实际车距由局部避让约束，避免窄桥被粗网格误封死。
      const radius = u.type === 'supply' || parkedIds.has(other.id) ? unitRadius(u) + unitRadius(other) + cell * .35 : Math.max(unitRadius(other),unitRadius(u) + unitRadius(other) - cell * .45);
      if (!parkedIds.has(other.id) && distance(other, goal) < radius + stopDistance) continue;
      for (let y = Math.max(0, Math.floor((other.y - radius) / cell)); y <= Math.min(rows - 1, Math.floor((other.y + radius) / cell)); y++) {
        for (let x = Math.max(0, Math.floor((other.x - radius) / cell)); x <= Math.min(cols - 1, Math.floor((other.x + radius) / cell)); x++) {
          if (distance({ x: x * cell + cell / 2, y: y * cell + cell / 2 }, other) < radius) grid.setWalkableAt(x, y, false);
        }
      }
    }
    const sx = clamp(Math.floor(u.x / cell), 0, cols - 1), sy = clamp(Math.floor(u.y / cell), 0, rows - 1);
    let ex = clamp(Math.floor(goal.x / cell), 0, cols - 1), ey = clamp(Math.floor(goal.y / cell), 0, rows - 1);
    grid.setWalkableAt(sx, sy, true);
    if (!grid.isWalkableAt(ex, ey)) {
      let best = Infinity, found = null;
      for (let radius = 1; radius <= 5; radius++) {
        for (let y = Math.max(0, ey - radius); y <= Math.min(rows - 1, ey + radius); y++) {
          for (let x = Math.max(0, ex - radius); x <= Math.min(cols - 1, ex + radius); x++) {
            if (!grid.isWalkableAt(x, y)) continue;
            const score = Math.hypot(x - ex, y - ey) + Math.hypot(x - sx, y - sy) * 0.02;
            if (score < best) { best = score; found = [x, y]; }
          }
        }
        if (found) break;
      }
      if (found) [ex, ey] = found;
    }
    if (!grid.isWalkableAt(ex, ey)) return [];
    const finder = new PF.AStarFinder({ allowDiagonal: true, dontCrossCorners: true, heuristic: PF.Heuristic.octile });
    let rawPath = finder.findPath(sx, sy, ex, ey, grid);
    if ((!rawPath.length || u.navigationStalled) && u.order?.formation && parked.some(v => v.owner === u.owner && distance(v, goal) < 240) && distance(u, goal) < 500 && ['move', 'attackMove'].includes(u.order.type) && distance(u.order, goal) < 1) {
      // 已停稳的外圈可能封住编队内侧空位，只改派到实际可达的邻近集结位。
      const start = grid.getNodeAt(sx, sy), queue = [start], seen = new Set([start]);
      let closest = null, best = Infinity;
      for (let head = 0; head < queue.length && head < 8192; head++) {
        const node = queue[head], score = Math.hypot(node.x + .5 - goal.x / cell, node.y + .5 - goal.y / cell);
        const point = { x: (node.x + .5) * cell, y: (node.y + .5) * cell };
        if (score < best && this.canOccupyUnit(u, point) && obstacles.every(v => distance(v, point) >= unitRadius(u) + unitRadius(v) + 5)) { best = score; closest = node; }
        for (const next of grid.getNeighbors(node, PF.DiagonalMovement.OnlyWhenNoObstacles)) {
          if (seen.has(next)) continue;
          seen.add(next); queue.push(next);
        }
      }
      const alternate = closest && { x: (closest.x + .5) * cell, y: (closest.y + .5) * cell };
      if (alternate && distance(alternate, goal) < 360 && (u.navigationStalled || closest !== start)) {
        rawPath = finder.findPath(sx, sy, closest.x, closest.y, grid.clone());
        if (rawPath.length) { u.order = { ...u.order, ...alternate }; u.pathGoal = ''; delete u.navigationProgress; u.navigationStalled = false; }
      }
    }
    if (rawPath.length < 2) return [];
    const path = PF.Util.compressPath(rawPath);
    return path.slice(1).map(([x, y]) => ({ x: x * cell + cell / 2, y: y * cell + cell / 2 }));
  }

  updateFog() {
    for (const side of this.sides()) {
      const { cols, rows, visible, explored } = this.fogs[side];
      visible.fill(false);
      if ((this.players[side].satelliteUntil || 0) > this.time) {
        visible.fill(true); explored.fill(true);
        const shields=this.satelliteShields(side);
        if(!shields.length)continue;
        for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)if(shields.some(u=>distance(u,{x:(x+.5)*this.world.fog,y:(y+.5)*this.world.fog})<=UNITS.counterIntel.range))visible[y*cols+x]=false;
      }
      const sources = [
        ...this.activeUnits(side).filter(u => !isLunarRobot(this.map, u.type) || u.battery > 0).map(u => ({ x: u.x, y: u.y, sight: UNITS[u.type].sight, overTerrain: UNITS[u.type].tags.includes('air') || UNITS[u.type].tags.includes('ship') || u.type === 'aa' })),
        ...this.ownedBuildings(side).map(b => ({ x: b.x, y: b.y, sight: b.type === 'radar' && this.hasPower(side) ? 630 : b.type === 'hq' ? 400 : 310, overTerrain: b.type === 'radar' && this.hasPower(side) }))
      ];
      for (const beacon of this.beacons.filter(site => site.owner === side)) sources.push({ x: beacon.x, y: beacon.y, sight: 650, overTerrain: true });
      for(const site of (this.resourceSites||[]).filter(s=>s.type==='depot'&&s.owner===side))sources.push({x:site.x,y:site.y,sight:220});
      for (const s of sources) {
        const minX = clamp(Math.floor((s.x - s.sight) / this.world.fog), 0, cols - 1), maxX = clamp(Math.floor((s.x + s.sight) / this.world.fog), 0, cols - 1);
        const minY = clamp(Math.floor((s.y - s.sight) / this.world.fog), 0, rows - 1), maxY = clamp(Math.floor((s.y + s.sight) / this.world.fog), 0, rows - 1);
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const cell = { x: (x + 0.5) * this.world.fog, y: (y + 0.5) * this.world.fog };
          if (distance(s, cell) >= s.sight || !s.overTerrain && this.map.barriers.some(rect => crossesRect(s, cell, rect))) continue;
          visible[y * cols + x] = true; explored[y * cols + x] = true;
        }
      }
    }
  }

  isVisible(x, y) {
    return this.isVisibleFor(0, x, y);
  }

  isVisibleFor(side, x, y) {
    const fog = this.fogs[side];
    const cx = clamp(Math.floor(x / this.world.fog), 0, fog.cols - 1), cy = clamp(Math.floor(y / this.world.fog), 0, fog.rows - 1);
    return fog.visible[cy * fog.cols + cx];
  }

  hasExploredFor(side, x, y) {
    const fog = this.fogs[side];
    const cx = clamp(Math.floor(x / this.world.fog), 0, fog.cols - 1), cy = clamp(Math.floor(y / this.world.fog), 0, fog.rows - 1);
    return fog.explored[cy * fog.cols + cx];
  }

  detectionRange(side, entity) {
    if (entity.kind === 'unit' && isLunarRobot(this.map, entity.type) && entity.battery <= 0) return 0;
    if (entity.kind === 'building') return entity.type === 'radar' && this.hasPower(side) ? (this.players[side].faction === 'china' ? 610 : 470) : 0;
    if (entity.type === 'scout') return 260;
    if (entity.type === 'aa') return this.players[side].faction === 'china' ? 230 : 175;
    return 82;
  }

  canSeeEntity(side, target) {
    if (target.embarkedIn) return false;
    if (target.owner === side) return true;
    // 驻留间谍只保持目标设施的情报，不提供周围部队或生产队列的透视。
    if (target.kind === 'building' && target.hp > 0 && target.sabotage?.owner === side) return true;
    if (!this.isVisibleFor(side, target.x, target.y)) return false;
    if (target.kind === 'unit' && UNITS[target.type].tags.includes('submerged')) return this.submarineSurfaced(target) || target.exposedUntil > this.time || this.activeUnits(side).some(u => UNITS[u.type].sonar && distance(u, target) <= UNITS[u.type].sonar);
    if (target.kind !== 'unit' || !UNITS[target.type].tags.includes('stealth')) return true;
    if (this.activeUnits(side).some(u => distance(u, target) < this.detectionRange(side, u))) return true;
    if (this.beacons.some(site => site.owner === side && distance(site, target) < 330)) return true;
    return this.ownedBuildings(side, 'radar').some(b => distance(b, target) < this.detectionRange(side, b));
  }

  updateAI(side=1) {
    const enemySide=this.nearestEnemySide(side);
    if(this.isControlLocked(side))return;
    const p = this.players[side];
    if (!this.ownedBuildings(side).length) return;
    if (p.credits > 1800) this.activateSatellite(side);
    retreatAIUnits(this, side);
    const airfield = this.ownedBuildings(side, 'airfield')[0];
    const dock = this.ownedBuildings(side, 'dock')[0];
    for (const plane of this.activeUnits(side, 'ewPlane').filter(u => u.order?.type !== 'rearm')) {
      const escort = this.activeUnits(side).find(u => ['strike', 'bomber'].includes(u.type) && ['attack', 'attackMove'].includes(u.order?.type));
      if (escort) plane.order = { type: 'move', x: Math.min(this.world.width - 20, escort.x + 90), y: escort.y };
    }
    const prioritizingFirstStrike = airfield && this.time >= this.difficulty.waveStart && !p.aiFirstStrikeProduced;
    const plan = ['power', 'radar', 'power', 'airfield', 'turret', 'lab', 'super', 'turret', 'power', ...(this.nuclearEnabled?['power','nuclearSilo']:[]),'factory', 'refinery'];
    if (this.map.water && !dock && !p.buildQueue && p.credits > 600 && this.canBuild(side, 'dock')) this.startBuild(side, 'dock');
    else if (!this.hasBuilding(side, 'armory') && !p.buildQueue && !prioritizingFirstStrike && this.time >= 18 && p.credits > 600 && this.canBuild(side, 'armory')) this.startBuild(side, 'armory');
    else if (this.hasBuilding(side, 'hq') && !p.buildQueue && !prioritizingFirstStrike && p.aiPlanIndex < plan.length) {
      const type = plan[p.aiPlanIndex];
      if (this.canBuild(side, type) && p.credits > 300) { this.startBuild(side, type); p.aiPlanIndex++; }
    }
    const savingForTech = !p.buildQueue && ['lab', 'super'].includes(plan[p.aiPlanIndex]) && this.canBuild(side, plan[p.aiPlanIndex]);
    const fundingTech = prioritizingFirstStrike || savingForTech || ['lab', 'super'].includes(p.buildQueue?.type);
    if (fundingTech) {
      // 用正常取消规则回收已付费用，防止海陆空队列同时耗尽科研预算。
      for (const facility of this.ownedBuildings(side).filter(b => PRODUCERS.includes(b.type))) {
        if (prioritizingFirstStrike && facility.type === 'airfield') continue;
        facility.queue = facility.queue.filter(type => type === 'harvester');
        if (facility.active && facility.active.type !== 'harvester') this.cancelUnitProduction(side, facility.id);
      }
    }
    const harvesters = this.ownedUnits(side, 'harvester').length;
    const pendingHarvesters = this.ownedBuildings(side, 'factory').reduce((count, b) => count + b.queue.filter(type => type === 'harvester').length + (b.active?.type === 'harvester' ? 1 : 0), 0);
    if (this.economyMode === 'mining' && harvesters + pendingHarvesters < 2 && p.credits > 450) this.queueAIUnit('harvester',side);
    this.updateIntelligenceAI(side);
    const knownSites = [...this.oil, ...this.beacons, ...(this.resourceSites||[]).filter(s=>s.type==='depot')].filter(site => site.owner !== side && this.hasExploredFor(side, site.x, site.y));
    if (!fundingTech && knownSites.length && this.time >= p.aiEngineerRetryAt && !this.ownedUnits(side, 'engineer').length && p.credits > 380) {
      if (this.queueAIUnit('engineer',side)) p.aiEngineerRetryAt = this.time + 54;
    }
    for (const engineer of this.ownedUnits(side, 'engineer')) {
      if (['capture','defuse','collect'].includes(engineer.order?.type)) continue;
      const site = knownSites.sort((a, b) => distance(a, engineer) - distance(b, engineer))[0];
      if (site) engineer.order = { type: 'capture', targetId: site.id, x: site.x, y: site.y };
    }
    if (!fundingTech && this.time >= p.aiScoutRetryAt && !this.ownedUnits(side, 'scout').length && p.credits > 280) {
      if (this.queueAIUnit('scout',side)) p.aiScoutRetryAt = this.time + 60;
    }
    if (!fundingTech && p.faction === 'middleeast' && this.hasBuilding(side, 'radar') && this.time >= p.aiGhostRetryAt && !this.ownedUnits(side, 'ghost').length && p.credits > 550) {
      if (this.queueAIUnit('ghost',side)) p.aiGhostRetryAt = this.time + 100;
    }
    for (const b of this.ownedBuildings(side, 'hq')) if (b.hp < b.maxHp * .65 && !b.repairing && p.credits > 450) this.toggleRepair(side, b.id);
    for (const b of this.ownedBuildings(side)) if (b.type !== 'hq' && b.hp < b.maxHp * .55 && !b.repairing && p.credits > 500) this.toggleRepair(side, b.id);
    const combat = this.ownedUnits(side).filter(u => UNITS[u.type].damage > 0 && !UNITS[u.type].tags.includes('ship') && !UNITS[u.type].tags.includes('jet')).length;
    if (!fundingTech && combat < this.difficulty.combatLimit) {
      const sequence = ['rifle', 'tank', 'drone', 'apc', 'supply', 'aa', 'loiterer', 'jammer', 'laser', 'rocket', 'elite', ...(this.map.strategic?['ballistic','abm','counterIntel']:[]), ...(this.map.future ? ['railgun','relay'] : [])];
      const available = sequence.filter(type => !UNITS[type].requires || this.hasBuilding(side, UNITS[type].requires));
      const type = aiCounterUnit(this, side, available) || available[p.aiUnitCount % available.length];
      if (p.credits > (this.unitCost(side, type) * 0.4)) {
        if (this.queueAIUnit(type,side)) p.aiUnitCount++;
      }
    }
    if (airfield && (!fundingTech || prioritizingFirstStrike) && this.time >= this.difficulty.waveStart && p.credits > 350) {
      const airborne = this.ownedUnits(side).filter(u => UNITS[u.type].tags.some(t=>['jet','rotorcraft'].includes(t)) && !FREIGHT_TYPES.includes(u.type)).length;
      const pending = airfield.queue.length + (airfield.active ? 1 : 0);
      if (airborne + pending < 4) {
        const carrier = this.ownedUnits(side, 'carrier').find(c => this.carrierAircraft(c).length < 3);
        let type = aiCounterUnit(this, side, carrier ? ['navalFighter', 'fighter'] : ['fighter'], 'air') || (this.hasBuilding(side, 'lab') && p.aiAirUnitCount % 6 === 5 ? 'ewPlane' : carrier && this.hasBuilding(side, 'lab') ? p.aiAirUnitCount % 2 ? 'navalFighter' : 'navalStrike' : this.hasBuilding(side, 'lab') && p.aiAirUnitCount % 4 === 2 ? 'bomber' : this.hasBuilding(side, 'radar') && p.aiAirUnitCount % 4 === 3 && !this.ownedUnits(side, 'airlift').length ? 'airlift' : this.map.future && this.hasBuilding(side, 'lab') && p.aiAirUnitCount % 3 === 2 ? 'aegis' : p.aiAirUnitCount % 2 === 0 ? 'strike' : 'fighter');
        if(this.map.strategic&&!aiCounterUnit(this,side,['fighter'],'air')) {
          if(p.aiAirUnitCount%4===1)type='helicopter';
          if(p.aiAirUnitCount%4===3&&this.hasBuilding(side,'lab')&&!this.ownedUnits(side,'swarmCarrier').length&&!airfield.queue.includes('swarmCarrier')&&airfield.active?.type!=='swarmCarrier')type='swarmCarrier';
        }
        if (this.queueAIUnit(type,side)) p.aiAirUnitCount++;
      }
    }
    if (dock && !fundingTech && this.time >= 20 && p.credits > 280) {
      const afloat = this.ownedUnits(side).filter(u => UNITS[u.type].tags.includes('ship') && !FREIGHT_TYPES.includes(u.type)).length;
      const pending = dock.queue.length + (dock.active ? 1 : 0);
      if (afloat + pending < (['ocean', 'archipelago'].includes(this.mapId) ? 9 : 4)) {
        const fleet = (['ocean', 'archipelago'].includes(this.mapId) ? ['patrol', 'frigate', 'destroyer', 'submarine', 'carrier', 'landing'] : ['patrol', 'frigate']).filter(type => !UNITS[type].requires || this.hasBuilding(side, UNITS[type].requires));
        const pendingTypes = [...dock.queue, ...(dock.active ? [dock.active.type] : [])];
        const missing = fleet.find(type => ['destroyer', 'submarine', 'carrier'].includes(type) && !this.ownedUnits(side, type).length && !pendingTypes.includes(type));
        const type = aiCounterUnit(this, side, fleet, 'naval') || missing || fleet[p.aiNavyUnitCount % fleet.length];
        if (this.queueAIUnit(type,side)) p.aiNavyUnitCount++;
      }
    }
    for (const transport of this.activeUnits(side, 'apc')) {
      if (transport.passengers.length && transport.x < this.world.width / 2) this.unloadTransport(transport);
      if (!transport.order && transport.passengers.length < UNITS.apc.capacity) {
        for (const infantry of this.activeUnits(side, 'rifle').filter(u => distance(u, transport) < 150).slice(0, UNITS.apc.capacity - transport.passengers.length)) infantry.order = { type: 'board', targetId: transport.id };
      }
    }
    this.updateAITransports(side);
    for (const plane of this.activeUnits(side).filter(u => UNITS[u.type].tags.includes('deck') && !u.homeCarrierId)) {
      const carrier = this.ownedUnits(side, 'carrier').find(c => this.canBoardTransport(plane, c));
      if (carrier) plane.order = { type: 'board', targetId: carrier.id };
    }
    for (const support of this.activeUnits(side).filter(u => ['supply', 'jammer', 'relay'].includes(u.type))) {
      if (support.type === 'supply') continue;
      if (['restock', 'rearm'].includes(support.order?.type)) continue;
      const front = this.activeUnits(side).filter(u => ['tank', 'rocket', 'loiterer'].includes(u.type)).sort((a, b) => a.x - b.x)[0];
      if (front && distance(front, support) > 100) support.order = { type: 'move', x: front.x + 75, y: front.y + 30 };
      else support.order = null;
    }
    if (this.hasBuilding(side, 'super') && this.hasPower(side) && p.abilityCharge >= 100 && p.credits >= 650) {
      if (p.faction === 'china') {
        const threatened = this.ownedBuildings(side).some(b => this.enemyUnits(side).some(u => this.isVisibleFor(side, u.x, u.y) && distance(b, u) < 430));
        if (threatened) this.castAIAbility(0, 0,side);
      } else {
        const target = this.enemyBuildings(side).filter(b => this.isVisibleFor(side, b.x, b.y)).sort((a, b) => (a.type === 'hq' ? -1 : 0) - (b.type === 'hq' ? -1 : 0))[0];
        if (target) this.castAIAbility(target.x + random(-65, 65), target.y + random(-65, 65),side);
      }
    }
  }

  queueAIUnit(type,side=1) {
    if (type === 'engineer') return this.queueUnit(side, type);
    const facilities = this.ownedBuildings(side, UNITS[type].producer);
    if (!facilities.some(b => b.queue.length + (b.active ? 1 : 0) < 2)) return false;
    return this.queueUnit(side, type);
  }

  placeAIBuilding(type,side=1) {
    if (type === 'dock') {
      const zone = this.map.dockZones[side];
      for (const dy of [0, -80, 80]) if (this.placeBuilding(side, type, (zone.x1 + zone.x2) / 2, this.homeY + dy)) return;
      this.players[side].credits += BUILDINGS[type].cost * 0.6;
      return;
    }
    const slots = [
      [350, 965], [510, 550], [600, 880], [510, 1020], [670, 720],
      [245, 475], [660, 1000], [530, 400], [710, 570], [430, 1150], [750, 1080]
    ];
    const index = Math.max(0, this.players[side].aiPlanIndex - 1);
    const preferred = slots[index] || slots[slots.length - 1];
    const origin = this.playerCount===6 ? sixPoint(side,preferred[0]-205,preferred[1]-720) : { x: this.world.width - preferred[0], y: this.world.height - preferred[1] - this.homeY + 720 };
    if (this.placeBuilding(side, type, origin.x, origin.y)) return;
    for (let radius = 0; radius <= 7; radius++) {
      for (let a = 0; a < 16; a++) {
        const theta = a / 16 * Math.PI * 2;
        const x = origin.x + Math.cos(theta) * radius * 50, y = origin.y + Math.sin(theta) * radius * 50;
        if (this.placeBuilding(side, type, x, y)) return;
      }
    }
    this.players[side].credits += BUILDINGS[type].cost * 0.6;
  }

  launchAIWave(side=1) {
    if(this.isControlLocked(side))return;
    const combat = this.activeUnits(side).filter(u => (UNITS[u.type].damage > 0 || u.type === 'apc') && !UNITS[u.type].tags.includes('ship') && !UNITS[u.type].tags.includes('jet'));
    if (combat.length < 3) return;
    const wave = combat.filter(u => !['attackMove', 'rearm', 'board'].includes(u.order?.type)).slice(0, this.difficulty.waveSize);
    const objective = this.victoryMode === 'control' ? this.beacons.filter(site => site.owner !== side && this.hasExploredFor(side, site.x, site.y)).sort((a, b) => distance(a, wave[0] || combat[0]) - distance(b, wave[0] || combat[0]))[0] : null;
    for (const u of wave) { u.order = { type: 'attackMove', x: (objective?.x ?? (this.enemyObjective(side).x)) + random(-70, 70), y: (objective?.y ?? (this.enemyObjective(side).y)) + random(-90, 90) }; u.path = []; }
    if (wave.length && this.isVisible(wave[0].x, wave[0].y)) this.events.notice?.(objective ? '敌军正在争夺信标' : '敌军正在向基地推进');
  }

  castAIAbility(x, y,side=1) {
    return this.castAbility(x, y, side);
  }

  checkVictory(dt=0) {
    if (this.challenge) { this.updateChallenge(dt); return; }
    if(this.playerCount===6){
      for(const p of this.players)if(!p.eliminated){const lost=this.victoryMode==='annihilation'?this.ownedBuildings(p.side).length===0&&this.ownedUnits(p.side).filter(u=>!FREIGHT_TYPES.includes(u.type)).length===0:!this.ownedBuildings(p.side).some(b=>CORE_BUILDINGS.includes(b.type));if(lost){p.eliminated=true;p.buildQueue=null;p.readyBuilding=null;this.units=this.units.filter(u=>u.owner!==p.side);this.buildings=this.buildings.filter(b=>b.owner!==p.side);for(const site of [...this.oil,...this.beacons,...this.resourceSites])if(site.owner===p.side)site.owner=null;}}
      const alive=this.players.filter(p=>!p.eliminated);if(alive.length<=1)this.endGame(alive[0]?.side??'draw');
      else if(this.victoryMode==='control'){const winners=alive.filter(p=>p.controlScore>=240);if(winners.length)this.endGame(winners.length===1?winners[0].side:'draw');}return;
    }
    const defeated = [0, 1].map(side => this.victoryMode === 'annihilation'
      ? this.ownedBuildings(side).length === 0 && this.ownedUnits(side).filter(u => !FREIGHT_TYPES.includes(u.type)).length === 0
      : !this.ownedBuildings(side).some(b => CORE_BUILDINGS.includes(b.type)));
    if (defeated[0] && defeated[1]) this.endGame('draw');
    else if (defeated[0]) this.endGame(1);
    else if (defeated[1]) this.endGame(0);
    else if (this.victoryMode === 'control') {
      const winners = this.players.filter(player => player.controlScore >= 240);
      if (winners.length === 2) this.endGame('draw');
      else if (winners.length === 1) this.endGame(winners[0].side);
    }
  }

  endGame(winner) {
    if (this.winner !== null) return;
    this.winner = winner; this.running = false;
    if (this.victoryMode === 'quick' && typeof winner === 'number') this.units = this.units.filter(u => u.owner === winner);
    this.events.end?.(winner);
  }
}

Object.assign(Game.prototype, modernCombat, logisticsEconomy, lunarRobots, intelligenceCombat, droneAutonomy, strategicCombat,deterrenceCombat,commandQueue,challengeCombat,combatStanceCommands);
