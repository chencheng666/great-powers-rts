import PF from 'pathfinding';
import { AI_DIFFICULTIES, BUILDINGS, CORE_BUILDINGS, FACTIONS, MAPS, ORE_VALUES, PRODUCERS, UNITS, WORLD } from './data.js';
import { formationOffsets, separateUnits, UnitSpatialIndex, unitLayer, unitRadius } from './unit-spacing.js';
import { modernCombat } from './modern-combat.js';
import { productionDuration, productionExit } from './battlefield-details.js';
import { equipmentProfile } from './equipment.js';
import { tacticalDamage } from './tactical-rules.js';

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
    this.events = events;
    this.victoryMode = ['annihilation', 'control'].includes(options.victoryMode) ? options.victoryMode : 'quick';
    this.difficulty = AI_DIFFICULTIES[options.difficulty] || AI_DIFFICULTIES.standard;
    this.mapId = MAPS[options.mapId] ? options.mapId : 'valley';
    this.map = MAPS[this.mapId];
    this.world = this.map.world || WORLD;
    this.homeY = this.world.height / 2;
    this.projectiles = [];
    this.nextProjectileId = 1;
    this.time = 0;
    this.running = true;
    this.paused = false;
    this.winner = null;
    this.units = [];
    this.buildings = [];
    this.ore = this.map.ore.map(([x, y, amount, kind], index) => ({ id: `ore-${index}`, x, y, amount, max: amount, kind }));
    this.oil = this.map.oil.map(site => ({ ...site, owner: null }));
    this.beacons = this.map.beacons.map(site => ({ ...site, owner: null }));
    this.effects = [];
    this.pendingHits = [];
    this.collectingHits = false;
    this.pendingMoves = [];
    this.collectingMoves = false;
    this.selected = [];
    this.orderMode = null;
    this.pendingBuilding = null;
    this.pendingAbility = false;
    this.noticeQueue = [];
    this.players = [this.makePlayer(0, playerFaction), this.makePlayer(1, enemyFaction)];
    this.fogs = [0, 1].map(() => {
      const cols = this.world.width / this.world.fog, rows = this.world.height / this.world.fog;
      return { cols, rows, visible: Array(cols * rows).fill(false), explored: Array(cols * rows).fill(false) };
    });
    this.fog = this.fogs[0];
    this.fogTimer = 0;
    this.aiTimer = 0;
    this.aiWaveTimer = this.difficulty.waveStart;
    this.initBases();
    this.updateFog();
  }

  makePlayer(side, faction) {
    return { side, faction, credits: 1550, powerIn: 0, powerOut: 0, controlScore: 0, buildQueue: null, abilityCharge: 0, abilityCooldown: 0, shieldUntil: 0, aiPlanIndex: 0, aiUnitCount: 0, aiAirUnitCount: 0, aiNavyUnitCount: 0, aiEngineerRetryAt: this.difficulty.engineerStart, aiScoutRetryAt: 30, aiGhostRetryAt: 65, unitCount: 0 };
  }

  get faction() { return FACTIONS[this.players[0].faction]; }
  get enemyFaction() { return FACTIONS[this.players[1].faction]; }
  getEntity(id) { return this.units.find(item => item.id === id) || this.buildings.find(item => item.id === id) || this.oil.find(item => item.id === id) || this.beacons.find(item => item.id === id); }
  ownedBuildings(side, type) { return this.buildings.filter(item => item.owner === side && item.hp > 0 && (!type || item.type === type)); }
  ownedUnits(side, type) { return this.units.filter(item => item.owner === side && item.hp > 0 && (!type || item.type === type)); }
  hasBuilding(side, type) { return this.ownedBuildings(side, type).length > 0; }
  hasPower(side) { const p = this.players[side]; return p.powerIn >= p.powerOut; }
  hasRadarIntel(side) { return this.beacons.some(site => site.owner === side) || (this.hasBuilding(side, 'radar') && this.hasPower(side)); }

  initBases() {
    for (const side of [0, 1]) {
      const mirror = (x, y) => side === 0 ? [x, y + this.homeY - 720] : [this.world.width - x, this.world.height - y - this.homeY + 720];
      for (const [type, x, y] of [
        ['hq', 205, 720], ['power', 320, 595], ['refinery', 335, 825],
        ['barracks', 195, 875], ['factory', 460, 705],
        ...(this.map.water ? [['dock', this.mapId === 'ocean' ? 950 : 850, 720]] : [])
      ]) {
        const [bx, by] = mirror(x, y); this.addBuilding(side, type, bx, by);
      }
      for (const [type, x, y] of [
        ['harvester', 405, 940], ['harvester', 440, 485],
        ['rifle', 575, 630], ['rifle', 575, 680], ['rifle', 575, 730],
        ['tank', 605, 790]
      ]) {
        const [ux, uy] = mirror(x, y); this.addUnit(side, type, ux, uy);
      }
      if (this.mapId === 'ocean') {
        const [x, y] = mirror(1160, 720);
        this.addUnit(side, 'patrol', x, y);
        this.players[side].credits += 800;
      }
    }
    this.recalculatePower();
    this.events.notice?.('战场已部署。采矿车开始工作。');
  }

  addBuilding(owner, type, x, y) {
    const d = BUILDINGS[type];
    const building = { id: nextId++, kind: 'building', owner, type, x, y, hp: d.hp, maxHp: d.hp, size: d.size, angle: owner ? Math.PI : 0, queue: [], active: null, fireTimer: 0, repairing: false, spawnAt: this.time };
    this.buildings.push(building);
    this.recalculatePower();
    return building;
  }

  addUnit(owner, type, x, y, temporary = false) {
    const d = UNITS[type];
    const p = this.players[owner];
    let hp = d.hp;
    if (type === 'tank' && p.faction === 'nato') hp *= 1.15;
    if (type === 'drone' && p.faction === 'asia') hp *= 0.85;
    if (type === 'aa' && p.faction === 'china') hp *= 1.15;
    if (type === 'elite' && p.faction === 'nato') hp = 580;
    if (type === 'elite' && p.faction === 'asia') hp = 250;
    const unit = { id: nextId++, kind: 'unit', owner, type, x, y, hp, maxHp: hp, angle: owner ? Math.PI : 0, turretAngle: owner ? Math.PI : 0, order: null, targetId: null, path: [], pathTimer: 0, fireTimer: random(0, 0.4), movePulse: 0, cargo: 0, cargoValue: 0, harvestState: 'find', ammo: d.ammo ?? null, rearmProgress: 0, resumeOrder: null, stunUntil: 0, temporaryUntil: temporary ? this.time + 27 : 0, selected: false };
    unit.passengers = []; unit.embarkedIn = null; unit.stock = d.stock ?? null;
    unit.wing = d.wing ?? null; unit.heat = 0; unit.deployProgress = 0;
    this.units.push(unit);
    if (owner === 1 && type === 'strike') this.players[owner].aiFirstStrikeProduced = true;
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
    }
  }

  canBuild(side, type) {
    const d = BUILDINGS[type];
    return !!d && (!d.naval || !!this.map.water) && (!d.map || d.map === this.mapId) && this.hasBuilding(side, 'hq') && (!d.requires || this.hasBuilding(side, d.requires));
  }

  startBuild(side, type) {
    const p = this.players[side];
    if (!this.canBuild(side, type) || p.buildQueue || (side === 0 && this.pendingBuilding)) return false;
    p.buildQueue = { type, progress: 0, paid: 0 };
    if (side === 0) this.events.notice?.(`${BUILDINGS[type].name}开始建造`);
    if (side === 0) this.events.voice?.('construction');
    return true;
  }

  cancelBuilding(side) {
    const p = this.players[side];
    const refund = p.buildQueue?.paid || (side === 0 && this.pendingBuilding ? BUILDINGS[this.pendingBuilding].cost : 0);
    if (!p.buildQueue && !(side === 0 && this.pendingBuilding)) return false;
    p.credits += refund;
    p.buildQueue = null;
    if (side === 0) {
      this.pendingBuilding = null;
      this.events.notice?.(`建造已取消，返还 ${Math.floor(refund)} 资金`);
    }
    return true;
  }

  cancelUnitProduction(side, buildingId) {
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
    const size = BUILDINGS[type].size;
    if (x < size || y < size || x > this.world.width - size || y > this.world.height - size) return false;
    if (type === 'dock') {
      if (!this.map.dockZones.some(rect => x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2 && (side === 0 ? x < this.world.width / 2 : x > this.world.width / 2))) return false;
    } else if (this.map.noBuild.some(rect => intersectsRect(x, y, size * 0.6, rect))) return false;
    if (this.ore.some(o => o.amount > 0 && distance(o, { x, y }) < 95)) return false;
    if (this.oil.some(o => distance(o, { x, y }) < 95)) return false;
    if (this.beacons.some(site => distance(site, { x, y }) < 100)) return false;
    if (this.buildings.some(b => b.hp > 0 && distance(b, { x, y }) < (b.size + size) * 0.63 + 20)) return false;
    return type === 'dock' ? this.hasBuilding(side, 'factory') : this.ownedBuildings(side).some(b => distance(b, { x, y }) < 310);
  }

  placeBuilding(side, type, x, y) {
    if (!this.canPlace(side, type, x, y)) return false;
    this.addBuilding(side, type, x, y);
    if (side === 0) {
      this.pendingBuilding = null;
      this.events.notice?.(`${BUILDINGS[type].name}部署完成`);
      this.events.voice?.('deployed');
    }
    this.effects.push({ type: 'build', x, y, age: 0, duration: 0.8, owner: side });
    return true;
  }

  toggleRepair(side, id) {
    const building = this.getEntity(id);
    if (!building || building.kind !== 'building' || building.owner !== side || building.hp <= 0) return false;
    if (building.hp >= building.maxHp && !building.repairing) return false;
    building.repairing = !building.repairing && building.hp < building.maxHp;
    if (side === 0) this.events.notice?.(building.repairing ? `正在维修${BUILDINGS[building.type].name}` : '已停止维修');
    return true;
  }

  sellBuilding(side, id) {
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
      this.events.notice?.(`${BUILDINGS[building.type].name}已出售，返还 ${refund} 资金`);
    }
    return true;
  }

  queueUnit(side, type) {
    const d = UNITS[type];
    if (!d || (d.naval && !this.map.water) || (d.map && d.map !== this.mapId) || (d.faction && this.players[side].faction !== d.faction) || (d.requires && !this.hasBuilding(side, d.requires))) return false;
    const producer = this.ownedBuildings(side, d.producer).sort((a, b) => a.queue.length - b.queue.length)[0];
    if (!producer || producer.queue.length >= 5) return false;
    producer.queue.push(type);
    if (side === 0) this.events.notice?.(`${equipmentProfile(this.players[side].faction, type).name}已加入队列`);
    if (side === 0) this.events.voice?.('queued');
    return true;
  }

  unitCost(side, type) {
    return Math.round(UNITS[type].cost * (type === 'drone' && this.players[side].faction === 'asia' ? 0.85 : 1));
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
      if (u.x >= left && u.x <= right && u.y >= top && u.y <= bottom && !this.selected.includes(u.id)) this.selected.push(u.id);
    }
    this.events.selection?.();
  }

  selectAllCombat() {
    this.selected = this.activeUnits(0).filter(u => UNITS[u.type].damage > 0).map(u => u.id);
    this.events.selection?.();
  }

  command(x, y, attackMove = false) {
    const selectedUnits = this.selected.map(id => this.getEntity(id)).filter(e => e?.kind === 'unit' && e.owner === 0 && !e.embarkedIn);
    if (!selectedUnits.length) {
      for (const id of this.selected) this.setRallyPoint(0, id, x, y);
      return;
    }
    const enemy = [...this.units, ...this.buildings].filter(e => e.owner === 1 && e.hp > 0 && this.canSeeEntity(0, e) && distance(e, { x, y }) < (e.kind === 'building' ? e.size * 0.55 : 25)).at(-1);
    const site = [...this.oil, ...this.beacons].find(item => distance(item, { x, y }) < 40 && item.owner !== 0 && this.hasExploredFor(0, item.x, item.y));
    const transport = !attackMove && this.activeUnits(0, 'apc').find(v => !this.selected.includes(v.id) && distance(v, { x, y }) < 40);
    const offsets = formationOffsets(selectedUnits, { x, y });
    selectedUnits.forEach(u => {
      const offset = offsets.get(u.id);
      if (transport && UNITS[u.type].tags.includes('infantry')) u.order = { type: 'board', targetId: transport.id };
      else if (site && u.type === 'engineer') u.order = { type: 'capture', targetId: site.id, x: site.x, y: site.y };
      else if (enemy && this.canAttack(u, enemy)) u.order = { type: 'attack', targetId: enemy.id, x: enemy.x, y: enemy.y };
      else {
        const goal = this.resolveMoveGoal(u, clamp(x + offset.x, 20, this.world.width - 20), clamp(y + offset.y, 20, this.world.height - 20));
        u.order = { type: attackMove ? 'attackMove' : 'move', ...goal };
      }
      u.path = []; u.pathTimer = 0; u.deployProgress = 0;
    });
    this.effects.push({ type: 'order', x, y, age: 0, duration: 0.6, owner: 0 });
    this.events.voice?.(site && selectedUnits.some(u => u.type === 'engineer') ? 'captureOrder' : enemy || attackMove ? 'attackOrder' : 'moveOrder');
    this.orderMode = null;
  }

  stopSelected() {
    if (this.selected.some(id => this.getEntity(id)?.kind === 'unit')) this.events.voice?.('stopOrder');
    this.selected.map(id => this.getEntity(id)).filter(e => e?.kind === 'unit').forEach(u => { u.order = null; u.path = []; });
    this.orderMode = null;
  }

  castAbility(x, y, side = 0) {
    const p = this.players[side], targetSide = 1 - side;
    if (!this.hasBuilding(side, 'super') || !this.hasPower(side) || p.abilityCharge < 100 || p.abilityCooldown > 0 || p.credits < 650) return false;
    if (p.faction !== 'china' && !this.isVisibleFor(side, x, y)) return false;
    p.credits -= 650; p.abilityCharge = 0; p.abilityCooldown = 45;
    if (side === 0) this.events.voice?.('ability');
    const faction = p.faction;
    this.effects.push({ type: 'ability', faction, x, y, age: 0, duration: 2.5, owner: side });
    if (faction === 'china') {
      p.shieldUntil = this.time + 12;
      if (side === 0) this.events.notice?.('全域屏障已展开：友军进入防护状态');
    } else if (faction === 'middleeast') {
      this.ownedUnits(targetSide).filter(u => distance(u, { x, y }) < 290 && !UNITS[u.type].tags.includes('infantry')).forEach(u => { u.stunUntil = this.time + 8; });
      this.ownedBuildings(targetSide, 'turret').filter(b => distance(b, { x, y }) < 290).forEach(b => { b.stunUntil = this.time + 8; });
      if (side === 0) this.events.notice?.('区域脉冲命中，敌方电子装备已瘫痪');
    } else if (faction === 'asia') {
      for (let i = 0; i < 5; i++) {
        const u = this.addUnit(side, 'drone', clamp(x + random(-110, 110), 50, this.world.width - 50), clamp(y + random(-110, 110), 50, this.world.height - 50), true);
        u.order = { type: 'attackMove', x: side === 0 ? this.world.width - 205 : 205, y: this.homeY };
      }
      if (side === 0) this.events.notice?.('蜂群已抵达目标区域');
    } else {
      for (const target of [...this.activeUnits(targetSide), ...this.ownedBuildings(targetSide)]) {
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
    if (!this.running || this.paused) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.time += dt;
    this.recalculatePower();
    for (const p of this.players) {
      p.credits += this.oil.filter(o => o.owner === p.side).length * 11 * dt;
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
    separateUnits(this.units, dt, (unit, point) => this.canOccupyUnit(unit, point), this.time);
    this.unitIndex = null;
    for (const hit of this.pendingHits) this.applyHit(hit);
    this.units = this.units.filter(u => u.hp > 0);
    this.buildings = this.buildings.filter(b => b.hp > 0);
    this.effects.forEach(e => { e.age += dt; });
    this.effects = this.effects.filter(e => e.age < e.duration);
    this.fogTimer -= dt;
    if (this.fogTimer <= 0) { this.updateFog(); this.fogTimer = 0.22; }
    this.aiTimer -= dt;
    if (this.aiTimer <= 0) { this.updateAI(); this.aiTimer = this.difficulty.thinkInterval; }
    this.aiWaveTimer -= dt;
    if (this.aiWaveTimer <= 0) { this.launchAIWave(); this.aiWaveTimer = this.difficulty.waveInterval + random(-4, 5); }
    if (this.selected.some(id => !this.getEntity(id) || this.getEntity(id).embarkedIn)) { this.selected = this.selected.filter(id => this.getEntity(id) && !this.getEntity(id).embarkedIn); this.events.selection?.(); }
    this.checkVictory();
  }

  updateBuildQueue(p, dt) {
    const q = p.buildQueue;
    if (!this.hasBuilding(p.side, 'hq')) {
      if (q) p.credits += q.paid * .5;
      p.buildQueue = null;
      if (p.side === 0) this.pendingBuilding = null;
      return;
    }
    if (!q) return;
    const d = BUILDINGS[q.type];
    const need = Math.min(d.cost - q.paid, d.cost / d.time * dt);
    if (p.credits + 0.01 < need) return;
    p.credits -= need; q.paid += need; q.progress += dt;
    if (q.progress >= d.time || q.paid >= d.cost - 0.1) {
      p.buildQueue = null;
      if (p.side === 0) { this.pendingBuilding = q.type; this.events.notice?.(`${d.name}建造完成，请在基地附近部署`); this.events.voice?.('buildReady'); }
      else this.placeAIBuilding(q.type);
    }
  }

  updateBuilding(b, dt) {
    const p = this.players[b.owner];
    if (b.repairing) {
      const pricePerHp = BUILDINGS[b.type].cost * .5 / b.maxHp;
      const amount = Math.min(42 * dt, b.maxHp - b.hp, p.credits / pricePerHp);
      if (amount > 0) { b.hp += amount; p.credits -= amount * pricePerHp; }
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
    const d = UNITS[b.active.type];
    const duration = productionDuration(this, b, b.active.type);
    const cost = this.unitCost(b.owner, b.active.type);
    const need = Math.min(cost - b.active.paid, cost / duration * dt);
    if (p.credits + 0.01 < need) return;
    p.credits -= need; b.active.paid += need; b.active.progress += dt;
    if (b.active.progress >= duration || b.active.paid >= cost - 0.1) {
      const exit = productionExit(b, b.active.type);
      const spawn = d.tags.includes('ship') ? this.findNavalSpawn(b, b.active.type) : this.findSpawn(exit.x, exit.y, b.active.type);
      const unit = this.addUnit(b.owner, b.active.type, spawn.x, spawn.y);
      const goal = d.tags.includes('ship') ? this.navalGoal(spawn.x + exit.side * exit.distance, spawn.y, unitRadius(unit)) : this.findSpawn(spawn.x + exit.side * exit.distance, spawn.y, unit.type);
      unit.deployment = { buildingId: b.id, start: this.time, until: this.time + 2.6, fromX: spawn.x, fromY: spawn.y, ...goal };
      unit.angle = unit.turretAngle = exit.angle;
      b.exitUntil = this.time + 2.6;
      const yCenter = this.homeY;
      if (b.owner === 1 && unit.type === 'engineer') {
        const site = [...this.oil, ...this.beacons].filter(item => item.owner !== 1 && this.hasExploredFor(1, item.x, item.y)).sort((a, b) => distance(a, unit) - distance(b, unit))[0];
        if (site) unit.order = { type: 'capture', targetId: site.id, x: site.x, y: site.y };
      } else if (b.owner === 1 && unit.type === 'scout') {
        if (this.map.barriers.length && this.map.bridges.length) {
          const bridge = this.map.bridges[Math.floor(random(0, this.map.bridges.length))];
          unit.order = { type: 'move', x: (this.mapId === 'ocean' ? this.world.width / 2 + 160 : this.map.water ? this.map.water.x2 + 90 : 1320) + random(-30, 30), y: (bridge.y1 + bridge.y2) / 2 + random(-25, 25) };
        } else unit.order = { type: 'move', x: this.world.width / 2 + 70 + random(-100, 100), y: yCenter + random(-280, 280) };
      } else if (b.owner === 1 && unit.type === 'ghost') {
        unit.order = { type: 'move', x: 570 + random(-80, 80), y: yCenter + random(-230, 230) };
      } else if (b.owner === 1 && UNITS[unit.type].tags.includes('jet')) {
        unit.order = { type: 'attackMove', x: 470 + random(-110, 110), y: yCenter + random(-240, 240) };
      } else if (b.owner === 1 && UNITS[unit.type].tags.includes('ship')) {
        unit.order = { type: 'attackMove', x: this.map.water.x1 + unitRadius(unit) + 40, y: yCenter + random(-290, 290) };
      } else if (b.owner === 1 && unit.type !== 'harvester') unit.order = { type: 'move', x: this.world.width - 630 + random(-70, 70), y: yCenter + random(-120, 120) };
      if (b.rallyPoint && unit.type !== 'harvester') unit.order = { type: 'move', ...this.resolveMoveGoal(unit, b.rallyPoint.x, b.rallyPoint.y) };
      if (b.owner === 0) this.events.notice?.(`${equipmentProfile(p.faction, unit.type).name}已就绪`);
      if (b.owner === 0) this.events.voice?.('unitReady');
      b.active = null;
    }
  }

  findSpawn(x, y, type = 'tank') {
    const unit = { type }, radius = unitRadius(unit), layer = unitLayer(unit);
    for (let n = 0; n < 80; n++) {
      const angle = n * 2.399963, reach = n ? 18 * Math.sqrt(n) : 0;
      const p = { x: clamp(x + Math.cos(angle) * reach, 50, this.world.width - 50), y: clamp(y + Math.sin(angle) * reach, 50, this.world.height - 50) };
      if (!this.canOccupyUnit(unit, p) || this.units.some(other => other.hp > 0 && unitLayer(other) === layer && distance(other, p) < unitRadius(other) + radius + 4)) continue;
      return p;
    }
    return { x: clamp(x, 35, this.world.width - 35), y: clamp(y, 35, this.world.height - 35) };
  }

  setRallyPoint(side, id, x, y) {
    const building = this.getEntity(id);
    if (!building || building.kind !== 'building' || building.owner !== side || building.hp <= 0 || !PRODUCERS.includes(building.type) || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const point = { x: clamp(x, 30, this.world.width - 30), y: clamp(y, 30, this.world.height - 30) };
    if (building.type === 'dock') Object.assign(point, this.navalGoal(point.x, point.y, 95));
    else if (building.type !== 'airfield' && this.isGroundBlocked(point.x, point.y, 14)) return false;
    building.rallyPoint = point;
    if (side === 0) { this.effects.push({ type: 'order', ...point, age: 0, duration: .6, owner: side }); this.events.notice?.(`${BUILDINGS[building.type].name}集结点已设置`); }
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
    if (u.deployment) {
      if (this.time < u.stunUntil) return;
      if (distance(u, u.deployment) > 9 && this.time < u.deployment.until) { this.moveUnit(u, u.deployment, dt, 8); return; }
      u.deployment = null; u.path = []; u.pathTimer = 0;
    }
    if (u.temporaryUntil && this.time >= u.temporaryUntil) { u.hp = 0; return; }
    if (u.type === 'harvester') { this.updateHarvester(u, dt); return; }
    if (this.time < u.stunUntil) return;
    u.fireTimer -= dt * (u.jammedUntil > this.time ? .4 : 1);
    const d = UNITS[u.type];
    if (u.order?.type === 'board') { this.boardTransport(u, dt); return; }
    if (u.type === 'supply') this.updateSupply(u, dt);
    if (d.ammo && (u.ammo <= 0 || u.type === 'carrier' && u.wing <= 0) && u.order?.type !== 'rearm') {
      u.resumeOrder = u.order;
      u.order = { type: 'rearm' };
      u.path = [];
      if (u.owner === 0) this.events.notice?.(`${d.name}弹药耗尽，正在返场补给`);
    }
    if (u.order?.type === 'rearm') { this.updateRearm(u, dt); return; }
    if (u.type === 'engineer') {
      if (u.order?.type === 'capture') {
        const site = this.getEntity(u.order.targetId);
        if (site?.owner === u.owner) u.order = null;
        else if (site && distance(u, site) < 38) {
          site.owner = u.owner; u.hp = 0;
          this.recalculatePower();
          this.fogTimer = 0;
          this.effects.push({ type: 'capture', x: site.x, y: site.y, age: 0, duration: 1.2, owner: site.owner });
          if (u.owner === 0) this.events.notice?.(site.id.startsWith('oil') ? '油井已占领：每秒增加 11 资金' : '雷达信标已占领：中央视野与小地图已接入');
          if (u.owner === 0) this.events.voice?.(site.id.startsWith('oil') ? 'oilCaptured' : 'beaconCaptured');
        } else if (site) this.moveUnit(u, site, dt, 26);
      } else if (u.order?.type === 'move') this.moveUnit(u, u.order, dt, 8);
      return;
    }
    if (d.damage === 0) {
      if (u.order && ['move', 'attackMove', 'attack'].includes(u.order.type)) {
        if (distance(u, u.order) > 10) this.moveUnit(u, u.order, dt, 8);
        else u.order = null;
      }
      return;
    }
    let target = u.order?.type === 'attack' ? this.getEntity(u.order.targetId) : null;
    if (target && (!this.canSeeEntity(u.owner, target) || !this.canAttack(u, target))) {
      u.order = { type: 'attackMove', x: u.order.x, y: u.order.y };
      target = null;
    }
    if (!target || target.hp <= 0) { if (u.order?.type === 'attack') u.order = null; target = null; }
    const acquisition = u.order?.type !== 'move' ? d.tags.includes('artillery') ? Math.max(d.sight, d.range) : d.sight : d.range * 0.85;
    if (!target) target = this.closestEnemy(u, acquisition, u.owner);
    if (target) {
      const range = this.unitRange(u, target);
      const reach = range + (target.kind === 'building' ? target.size * 0.36 : 0);
      const dist = distance(u, target);
      const clear = this.hasLineOfFire(u, target);
      const moving = u.order?.type === 'move' || this.time - (u.lastMovedAt ?? -10) < .12;
      if (d.deployTime) u.deployProgress = moving || dist > reach ? 0 : Math.min(d.deployTime, u.deployProgress + dt);
      const flights = u.type === 'carrier' ? this.projectiles.filter(p => !p.finished && p.sourceId === u.id && p.kind === 'wing').length : 0;
      if (dist >= (d.minRange || 0) && dist <= reach && clear && u.fireTimer <= 0 && !u.overheated && (!d.deployTime || u.deployProgress >= d.deployTime) && (u.type !== 'carrier' || flights < u.wing)) {
        u.turretAngle = Math.atan2(target.y - u.y, target.x - u.x);
        this.fire(u, target, this.unitDamage(u, target), u.type);
        if (d.ammo) u.ammo--;
        if (u.type === 'laser') this.laserHeat(u);
        u.fireTimer = d.cooldown;
      }
      if (u.order?.type === 'move') this.moveUnit(u, u.order, dt, 8);
      else if (d.minRange && dist < d.minRange) {
        const angle = Math.atan2(u.y - target.y, u.x - target.x);
        const goal = this.resolveMoveGoal(u, clamp(u.x + Math.cos(angle) * 100, 20, this.world.width - 20), clamp(u.y + Math.sin(angle) * 100, 20, this.world.height - 20));
        this.moveUnit(u, goal, dt, 8); u.deployProgress = 0;
      } else if (!clear || dist > reach * .96) this.moveUnit(u, target, dt, clear ? reach * .85 : 8);
    } else if (u.order && ['move', 'attackMove'].includes(u.order.type)) {
      if (distance(u, u.order) > 10) this.moveUnit(u, u.order, dt, 8);
      else u.order = null;
    }
  }

  updateRearm(u, dt) {
    if (!UNITS[u.type].tags.includes('jet')) { this.updateGroundRearm(u, dt); return; }
    const home = this.ownedBuildings(u.owner, 'airfield').sort((a, b) => distance(a, u) - distance(b, u))[0];
    if (!home) {
      if (u.resumeOrder?.x !== undefined) this.moveUnit(u, u.resumeOrder, dt, 8);
      return;
    }
    if (distance(u, home) > home.size * .55 + 24) {
      u.rearmProgress = 0;
      this.moveUnit(u, home, dt, home.size * .55 + 18);
      return;
    }
    if (!this.hasPower(u.owner)) return;
    u.rearmProgress += dt;
    if (u.rearmProgress >= UNITS[u.type].rearmTime) {
      u.ammo = UNITS[u.type].ammo;
      u.rearmProgress = 0;
      u.order = u.resumeOrder;
      u.resumeOrder = null;
      if (u.owner === 0) this.events.notice?.(`${UNITS[u.type].name}补给完成`);
    }
  }

  canAttack(source, target) {
    if (target.embarkedIn) return false;
    if (target.kind === 'unit' && UNITS[target.type].tags.includes('submerged') && (source.kind !== 'unit' || !UNITS[source.type].tags.includes('anti-sub') && source.type !== 'submarine')) return false;
    if (source.kind === 'building') return target.kind === 'building' || !UNITS[target.type].tags.includes('jet');
    const type = source.type;
    if (!UNITS[type]?.damage) return false;
    const tags = target.kind === 'unit' ? UNITS[target.type].tags : [];
    if (type === 'aa') return tags.includes('air');
    if (type === 'laser') return tags.includes('drone');
    if (type === 'submarine') return tags.includes('ship');
    if (['rocket', 'loiterer', 'carrier'].includes(type) && tags.includes('air')) return false;
    if (['fighter', 'aegis'].includes(type)) return tags.includes('air');
    if (type === 'railgun' && tags.includes('air')) return false;
    if (type === 'strike') return target.kind === 'building' || !tags.includes('air');
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
    return this.map.barriers.some(rect => intersectsRect(x, y, radius, rect));
  }

  isNavalBlocked(x, y, radius = 0) {
    const water = this.map.water;
    return !water || x - radius < water.x1 || x + radius > water.x2 || y - radius < water.y1 || y + radius > water.y2;
  }

  navalGoal(x, y, radius = 20) {
    const water = this.map.water;
    if (!water) return { x, y };
    return { x: clamp(x, water.x1 + radius, water.x2 - radius), y: clamp(y, water.y1 + radius, water.y2 - radius) };
  }

  resolveMoveGoal(unit, x, y) {
    if (UNITS[unit.type].tags.includes('ship')) return this.navalGoal(x, y, unitRadius(unit));
    if (UNITS[unit.type].tags.includes('jet') || !this.isGroundBlocked(x, y, UNITS[unit.type].tags.includes('infantry') ? 6 : 14)) return { x, y };
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
    if (['rocket', 'loiterer'].includes(source.type)) return true;
    if (source.kind === 'unit' && UNITS[source.type].tags.includes('jet')) return true;
    if (target.kind === 'unit' && UNITS[target.type].tags.includes('jet')) return true;
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
    const targetTags = target.kind === 'unit' ? UNITS[target.type].tags : [];
    if (u.type === 'drone' && targetTags.includes('armor')) amount *= 1.8;
    if (u.type === 'drone' && targetTags.includes('jet')) amount *= 0.7;
    if (u.type === 'aa' && targetTags.includes('air')) amount *= 2.25;
    if (['fighter', 'aegis'].includes(u.type) && targetTags.includes('air')) amount *= targetTags.includes('jet') ? 1.15 : 1.4;
    if (u.type === 'strike') {
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
    source.lastFireAt = this.time;
    if (['loiterer', 'rocket', 'destroyer', 'carrier', 'submarine'].includes(style)) { this.launchProjectile(source, target, amount, style); return; }
    this.effects.push({ type: 'shot', sourceId: source.id, x: source.x, y: source.y, toX: target.x, toY: target.y, sourceType: source.type, targetType: target.type, age: 0, duration: style === 'railgun' ? .32 : .18, owner: source.owner, style });
    this.effects.push({ type: 'hit', x: target.x, y: target.y, targetType: target.type, age: 0, duration: 0.42, owner: source.owner, style });
    const tags = target.kind === 'unit' ? UNITS[target.type].tags : [];
    const stun = source.type === 'elite' && this.players[source.owner].faction === 'middleeast' && (tags.includes('drone') || tags.includes('vehicle')) ? 1.5 : 0;
    const hit = { target, amount, side: source.owner, stun };
    if (this.collectingHits) this.pendingHits.push(hit);
    else this.applyHit(hit);
    if (source.type === 'elite' && this.players[source.owner].faction === 'nato' && tags.includes('drone')) {
      for (const nearby of this.ownedUnits(1 - source.owner, 'drone')) {
        if (nearby.id === target.id || distance(nearby, target) > 72) continue;
        const splash = { target: nearby, amount: amount * .36, side: source.owner, stun: 0 };
        if (this.collectingHits) this.pendingHits.push(splash);
        else this.applyHit(splash);
        this.effects.push({ type: 'hit', x: nearby.x, y: nearby.y, targetType: nearby.type, age: 0, duration: .3, owner: source.owner, style: 'aa' });
      }
    }
    this.events.shot?.(style, source.owner);
  }

  applyHit(hit) {
    if (hit.target.hp <= 0) return;
    this.damage(hit.target, hit.amount, hit.side);
    if (hit.stun && hit.target.hp > 0) hit.target.stunUntil = Math.max(hit.target.stunUntil || 0, this.time + hit.stun);
  }

  damage(target, amount, attackerSide) {
    if (target.hp <= 0) return;
    if (target.owner === 0 && target.kind === 'building' && amount > 0 && attackerSide === 1) this.events.voice?.('underAttack');
    if (this.players[target.owner].shieldUntil > this.time) amount *= 0.48;
    if (target.kind === 'building' && this.players[target.owner].faction === 'china' && target.type === 'turret') amount *= 0.85;
    target.hp -= amount;
    if (amount > 0) target.lastDamageAt = this.time;
    if (target.hp <= 0) {
      target.hp = 0;
      if (target.type === 'apc') this.unloadTransport(target, true);
      this.effects.push({ type: 'explosion', x: target.x, y: target.y, targetType: target.type, age: 0, duration: 1.2, owner: attackerSide, size: target.kind === 'building' ? target.size : 40 });
      if (target.owner === 0) this.events.notice?.(`${target.kind === 'building' ? BUILDINGS[target.type].name : equipmentProfile(this.players[0].faction, target.type).name}已损毁`);
      if (target.owner === 0) this.events.voice?.(target.kind === 'building' ? 'buildingLost' : 'unitLost');
      this.recalculatePower();
    }
  }

  closestEnemy(source, range, owner) {
    let nearest = null, best = range;
    for (const target of [...this.units, ...this.buildings]) {
      if (target.owner === owner || target.hp <= 0 || !this.canAttack(source, target)) continue;
      if (source.kind === 'building' && !this.hasLineOfFire(source, target)) continue;
      const d = distance(source, target) - (target.kind === 'building' ? target.size * 0.3 : 0);
      if (d >= range) continue;
      const priority = ['aa', 'frigate'].includes(source.type) && target.kind === 'unit' && UNITS[target.type].tags.includes('jet') ? .65 : 1;
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
    if (this.collectingMoves) {
      this.pendingMoves.push({ unit: u, goal: { x: goal.x, y: goal.y }, dt, stopDistance });
      return;
    }
    this.moveUnitNow(u, goal, dt, stopDistance);
  }

  moveUnitNow(u, goal, dt, stopDistance = 8) {
    if (distance(u, goal) <= stopDistance) return;
    if (UNITS[u.type].tags.includes('jet')) {
      this.moveWithAvoidance(u, goal, dt, stopDistance);
      return;
    }
    if (UNITS[u.type].tags.includes('ship')) {
      const destination = this.navalGoal(goal.x, goal.y, unitRadius(u));
      this.moveWithAvoidance(u, destination, dt, stopDistance);
      return;
    }
    u.pathTimer -= dt;
    const neighbors = (this.unitIndex || new UnitSpatialIndex(this.units)).nearby(u);
    const ahead = u.path[0] || goal, direction = Math.atan2(ahead.y - u.y, ahead.x - u.x);
    const blocksAhead = (other, radius) => {
      const dx = other.x - u.x, dy = other.y - u.y;
      const forward = dx * Math.cos(direction) + dy * Math.sin(direction), across = Math.abs(dx * Math.sin(direction) - dy * Math.cos(direction));
      return forward > 0 && forward < unitRadius(u) + radius + UNITS[u.type].speed * .65 && across < unitRadius(u) + radius + 5;
    };
    const blockers = u.type === 'harvester' ? neighbors.filter(other => (other.owner === u.owner || this.canSeeEntity(u.owner, other)) && blocksAhead(other, unitRadius(other))) : [];
    const buildingAhead = u.type === 'harvester' && this.buildings.some(b => b.hp > 0 && this.canSeeEntity(u.owner, b) && distance(b, goal) > b.size * .5 + stopDistance && blocksAhead(b, b.size * .45));
    if ((blockers.length || buildingAhead) && this.time >= (u.avoidRepathAt || 0)) { u.pathTimer = 0; u.avoidRepathAt = this.time + .3; }
    const goalCell = `${Math.floor(goal.x / this.world.cell)},${Math.floor(goal.y / this.world.cell)}`;
    if (!u.path.length || u.pathTimer <= 0 || u.pathGoal !== goalCell) {
      u.path = this.findPath(u, goal, stopDistance, blockers.length ? neighbors.filter(other => other.owner === u.owner || this.canSeeEntity(u.owner, other)) : []);
      u.pathTimer = 1.4 + random(0, 0.3);
      u.pathGoal = goalCell;
    }
    let point = u.path[0] || goal;
    if (distance(u, point) < 13 && u.path.length) { u.path.shift(); point = u.path[0] || goal; }
    if (!this.moveWithAvoidance(u, point, dt, u.path.length ? 0 : stopDistance)) { u.pathTimer = 0; u.path = []; }
  }

  canOccupyUnit(unit, point) {
    if (point.x < 18 || point.x > this.world.width - 18 || point.y < 18 || point.y > this.world.height - 18) return false;
    const layer = unitLayer(unit);
    if (layer === 'jet') return true;
    if (layer === 'naval' || layer === 'submerged') return !this.isNavalBlocked(point.x, point.y, Math.max(18, unitRadius(unit)));
    const radius = UNITS[unit.type].tags.includes('infantry') ? 6 : 14;
    return !this.isGroundBlocked(point.x, point.y, radius) && !this.buildings.some(b => b.hp > 0 && distance(b, point) < b.size * .45 + radius);
  }

  moveWithAvoidance(unit, point, dt, stopDistance = 0) {
    const dist = distance(unit, point), amount = Math.min(UNITS[unit.type].speed * dt * (unit.jammedUntil > this.time ? .6 : 1), Math.max(0, dist - stopDistance));
    if (amount <= .001) return true;
    const angle = Math.atan2(point.y - unit.y, point.x - unit.x), radius = unitRadius(unit);
    const neighbors = (this.unitIndex || new UnitSpatialIndex(this.units)).nearby(unit);
    let best = null, bestScore = Infinity;
    for (const turn of [0, .35, -.35, .7, -.7, 1.1, -1.1, 1.5, -1.5, 2.1, -2.1]) {
      const heading = angle + turn, next = { x: unit.x + Math.cos(heading) * amount, y: unit.y + Math.sin(heading) * amount };
      if (!this.canOccupyUnit(unit, next)) continue;
      let score = distance(next, point) + Math.abs(turn) * amount * .08 + (turn < 0 ? amount * .015 : 0);
      const look = { x: unit.x + Math.cos(heading) * Math.min(dist, amount + UNITS[unit.type].speed * .4), y: unit.y + Math.sin(heading) * Math.min(dist, amount + UNITS[unit.type].speed * .4) };
      for (const other of neighbors) {
        const minimum = radius + unitRadius(other) + 4;
        score += Math.max(0, minimum - distance(next, other)) * (unit.type === 'harvester' ? 8 : 3);
        if (unit.type === 'harvester' && (other.owner === unit.owner || this.canSeeEntity(unit.owner, other))) score += Math.max(0, minimum - distance(look, other)) * amount * .12;
      }
      if (score < bestScore) { best = { ...next, heading }; bestScore = score; }
    }
    if (!best) return false;
    unit.x = best.x; unit.y = best.y; unit.angle = best.heading; unit.movePulse += dt * 7;
    unit.lastMovedAt = this.time; unit.deployProgress = 0;
    return true;
  }

  findPath(u, goal, stopDistance, obstacles = []) {
    const cols = this.world.width / this.world.cell, rows = this.world.height / this.world.cell;
    const grid = new PF.Grid(cols, rows);
    const terrainRadius = UNITS[u.type].tags.includes('infantry') ? 6 : 14;
    if (this.map.barriers.length) for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      if (this.isGroundBlocked(cx * this.world.cell + this.world.cell / 2, cy * this.world.cell + this.world.cell / 2, terrainRadius)) grid.setWalkableAt(cx, cy, false);
    }
    for (const b of this.buildings) {
      if (b.hp <= 0 || !this.canSeeEntity(u.owner, b)) continue;
      const r = b.size * 0.49 + (UNITS[u.type].tags.includes('infantry') ? 4 : 11);
      for (let cy = Math.max(0, Math.floor((b.y - r) / this.world.cell)); cy <= Math.min(rows - 1, Math.floor((b.y + r) / this.world.cell)); cy++) {
        for (let cx = Math.max(0, Math.floor((b.x - r) / this.world.cell)); cx <= Math.min(cols - 1, Math.floor((b.x + r) / this.world.cell)); cx++) {
          if (distance({ x: cx * this.world.cell + 20, y: cy * this.world.cell + 20 }, b) < r) grid.setWalkableAt(cx, cy, false);
        }
      }
    }
    // 只绕开附近已知的同层单位，避免通过寻路提前泄露迷雾内的敌军。
    for (const other of obstacles) {
      if (other === u || other.embarkedIn || other.hp <= 0 || unitLayer(other) !== unitLayer(u)) continue;
      if (other.owner !== u.owner && !this.canSeeEntity(u.owner, other)) continue;
      const radius = unitRadius(u) + unitRadius(other) + 7;
      if (distance(other, goal) < radius + stopDistance) continue;
      for (let y = Math.max(0, Math.floor((other.y - radius) / this.world.cell)); y <= Math.min(rows - 1, Math.floor((other.y + radius) / this.world.cell)); y++) {
        for (let x = Math.max(0, Math.floor((other.x - radius) / this.world.cell)); x <= Math.min(cols - 1, Math.floor((other.x + radius) / this.world.cell)); x++) {
          if (distance({ x: x * this.world.cell + 20, y: y * this.world.cell + 20 }, other) < radius) grid.setWalkableAt(x, y, false);
        }
      }
    }
    const sx = clamp(Math.floor(u.x / this.world.cell), 0, cols - 1), sy = clamp(Math.floor(u.y / this.world.cell), 0, rows - 1);
    let ex = clamp(Math.floor(goal.x / this.world.cell), 0, cols - 1), ey = clamp(Math.floor(goal.y / this.world.cell), 0, rows - 1);
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
    const rawPath = finder.findPath(sx, sy, ex, ey, grid);
    if (rawPath.length < 2) return [];
    const path = PF.Util.compressPath(rawPath);
    return path.slice(1).map(([x, y]) => ({ x: x * this.world.cell + 20, y: y * this.world.cell + 20 }));
  }

  updateFog() {
    for (const side of [0, 1]) {
      const { cols, rows, visible, explored } = this.fogs[side];
      visible.fill(false);
      const sources = [
        ...this.activeUnits(side).map(u => ({ x: u.x, y: u.y, sight: UNITS[u.type].sight, overTerrain: UNITS[u.type].tags.includes('air') || UNITS[u.type].tags.includes('ship') || u.type === 'aa' })),
        ...this.ownedBuildings(side).map(b => ({ x: b.x, y: b.y, sight: b.type === 'radar' && this.hasPower(side) ? 630 : b.type === 'hq' ? 400 : 310, overTerrain: b.type === 'radar' && this.hasPower(side) }))
      ];
      for (const beacon of this.beacons.filter(site => site.owner === side)) sources.push({ x: beacon.x, y: beacon.y, sight: 650, overTerrain: true });
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
    if (entity.kind === 'building') return entity.type === 'radar' && this.hasPower(side) ? (this.players[side].faction === 'china' ? 610 : 470) : 0;
    if (entity.type === 'scout') return 260;
    if (entity.type === 'aa') return this.players[side].faction === 'china' ? 230 : 175;
    return 82;
  }

  canSeeEntity(side, target) {
    if (target.embarkedIn) return false;
    if (target.owner === side) return true;
    if (!this.isVisibleFor(side, target.x, target.y)) return false;
    if (target.kind === 'unit' && UNITS[target.type].tags.includes('submerged')) return target.exposedUntil > this.time || this.activeUnits(side).some(u => UNITS[u.type].sonar && distance(u, target) <= UNITS[u.type].sonar);
    if (target.kind !== 'unit' || !UNITS[target.type].tags.includes('stealth')) return true;
    if (this.activeUnits(side).some(u => distance(u, target) < this.detectionRange(side, u))) return true;
    if (this.beacons.some(site => site.owner === side && distance(site, target) < 330)) return true;
    return this.ownedBuildings(side, 'radar').some(b => distance(b, target) < this.detectionRange(side, b));
  }

  updateAI() {
    const p = this.players[1];
    if (!this.ownedBuildings(1).length) return;
    const airfield = this.ownedBuildings(1, 'airfield')[0];
    const dock = this.ownedBuildings(1, 'dock')[0];
    const prioritizingFirstStrike = airfield && this.time >= this.difficulty.waveStart && !p.aiFirstStrikeProduced;
    const plan = ['power', 'radar', 'power', 'airfield', 'turret', 'lab', 'super', 'turret', 'power', 'factory', 'refinery'];
    if (this.map.water && !dock && !p.buildQueue && p.credits > 600 && this.canBuild(1, 'dock')) this.startBuild(1, 'dock');
    else if (!this.hasBuilding(1, 'armory') && !p.buildQueue && !prioritizingFirstStrike && this.time >= 18 && p.credits > 600 && this.canBuild(1, 'armory')) this.startBuild(1, 'armory');
    else if (this.hasBuilding(1, 'hq') && !p.buildQueue && !prioritizingFirstStrike && p.aiPlanIndex < plan.length) {
      const type = plan[p.aiPlanIndex];
      if (this.canBuild(1, type) && p.credits > 300) { this.startBuild(1, type); p.aiPlanIndex++; }
    }
    const savingForTech = !p.buildQueue && ['lab', 'super'].includes(plan[p.aiPlanIndex]) && this.canBuild(1, plan[p.aiPlanIndex]);
    const fundingTech = prioritizingFirstStrike || savingForTech || ['lab', 'super'].includes(p.buildQueue?.type);
    if (fundingTech) {
      // 用正常取消规则回收已付费用，防止海陆空队列同时耗尽科研预算。
      for (const facility of this.ownedBuildings(1).filter(b => PRODUCERS.includes(b.type))) {
        if (prioritizingFirstStrike && facility.type === 'airfield') continue;
        facility.queue = facility.queue.filter(type => type === 'harvester');
        if (facility.active && facility.active.type !== 'harvester') this.cancelUnitProduction(1, facility.id);
      }
    }
    const harvesters = this.ownedUnits(1, 'harvester').length;
    const pendingHarvesters = this.ownedBuildings(1, 'factory').reduce((count, b) => count + b.queue.filter(type => type === 'harvester').length + (b.active?.type === 'harvester' ? 1 : 0), 0);
    if (harvesters + pendingHarvesters < (this.mapId === 'ocean' ? 3 : 2) && p.credits > 450) this.queueAIUnit('harvester');
    const knownSites = [...this.oil, ...this.beacons].filter(site => site.owner !== 1 && this.hasExploredFor(1, site.x, site.y));
    if (!fundingTech && knownSites.length && this.time >= p.aiEngineerRetryAt && !this.ownedUnits(1, 'engineer').length && p.credits > 380) {
      if (this.queueAIUnit('engineer')) p.aiEngineerRetryAt = this.time + 54;
    }
    for (const engineer of this.ownedUnits(1, 'engineer')) {
      if (engineer.order?.type === 'capture') continue;
      const site = knownSites.sort((a, b) => distance(a, engineer) - distance(b, engineer))[0];
      if (site) engineer.order = { type: 'capture', targetId: site.id, x: site.x, y: site.y };
    }
    if (!fundingTech && this.time >= p.aiScoutRetryAt && !this.ownedUnits(1, 'scout').length && p.credits > 280) {
      if (this.queueAIUnit('scout')) p.aiScoutRetryAt = this.time + 60;
    }
    if (!fundingTech && p.faction === 'middleeast' && this.hasBuilding(1, 'radar') && this.time >= p.aiGhostRetryAt && !this.ownedUnits(1, 'ghost').length && p.credits > 550) {
      if (this.queueAIUnit('ghost')) p.aiGhostRetryAt = this.time + 100;
    }
    for (const b of this.ownedBuildings(1, 'hq')) if (b.hp < b.maxHp * .65 && !b.repairing && p.credits > 450) this.toggleRepair(1, b.id);
    for (const b of this.ownedBuildings(1)) if (b.type !== 'hq' && b.hp < b.maxHp * .55 && !b.repairing && p.credits > 500) this.toggleRepair(1, b.id);
    const combat = this.ownedUnits(1).filter(u => UNITS[u.type].damage > 0 && !UNITS[u.type].tags.includes('ship') && !UNITS[u.type].tags.includes('jet')).length;
    if (!fundingTech && combat < this.difficulty.combatLimit) {
      const sequence = ['rifle', 'tank', 'drone', 'apc', 'supply', 'aa', 'loiterer', 'jammer', 'laser', 'rocket', 'elite', ...(this.map.future ? ['railgun','relay'] : [])];
      const available = sequence.filter(type => !UNITS[type].requires || this.hasBuilding(1, UNITS[type].requires));
      const type = available[p.aiUnitCount % available.length];
      if (p.credits > (this.unitCost(1, type) * 0.4)) {
        if (this.queueAIUnit(type)) p.aiUnitCount++;
      }
    }
    if (airfield && (!fundingTech || prioritizingFirstStrike) && this.time >= this.difficulty.waveStart && p.credits > 350) {
      const airborne = this.ownedUnits(1).filter(u => UNITS[u.type].tags.includes('jet')).length;
      const pending = airfield.queue.length + (airfield.active ? 1 : 0);
      if (airborne + pending < 4) {
        const type = this.map.future && this.hasBuilding(1, 'lab') && p.aiAirUnitCount % 3 === 2 ? 'aegis' : p.aiAirUnitCount % 2 === 0 ? 'strike' : 'fighter';
        if (this.queueAIUnit(type)) p.aiAirUnitCount++;
      }
    }
    if (dock && !fundingTech && this.time >= 20 && p.credits > 280) {
      const afloat = this.ownedUnits(1).filter(u => UNITS[u.type].tags.includes('ship')).length;
      const pending = dock.queue.length + (dock.active ? 1 : 0);
      if (afloat + pending < (this.mapId === 'ocean' ? 9 : 4)) {
        const fleet = (this.mapId === 'ocean' ? ['patrol', 'frigate', 'destroyer', 'submarine', 'carrier'] : ['patrol', 'frigate']).filter(type => !UNITS[type].requires || this.hasBuilding(1, UNITS[type].requires));
        const pendingTypes = [...dock.queue, ...(dock.active ? [dock.active.type] : [])];
        const missing = fleet.find(type => ['destroyer', 'submarine', 'carrier'].includes(type) && !this.ownedUnits(1, type).length && !pendingTypes.includes(type));
        const type = missing || fleet[p.aiNavyUnitCount % fleet.length];
        if (this.queueAIUnit(type)) p.aiNavyUnitCount++;
      }
    }
    for (const transport of this.activeUnits(1, 'apc')) {
      if (transport.passengers.length && transport.x < this.world.width / 2) this.unloadTransport(transport);
      if (!transport.order && transport.passengers.length < UNITS.apc.capacity) {
        for (const infantry of this.activeUnits(1, 'rifle').filter(u => distance(u, transport) < 150).slice(0, UNITS.apc.capacity - transport.passengers.length)) infantry.order = { type: 'board', targetId: transport.id };
      }
    }
    for (const support of this.activeUnits(1).filter(u => ['supply', 'jammer', 'relay'].includes(u.type))) {
      if (support.order?.type === 'restock') continue;
      const front = this.activeUnits(1).filter(u => ['tank', 'rocket', 'loiterer'].includes(u.type)).sort((a, b) => a.x - b.x)[0];
      if (front && distance(front, support) > 100) support.order = { type: 'move', x: front.x + 75, y: front.y + 30 };
      else support.order = null;
    }
    if (this.hasBuilding(1, 'super') && this.hasPower(1) && p.abilityCharge >= 100 && p.credits >= 650) {
      if (p.faction === 'china') {
        const threatened = this.ownedBuildings(1).some(b => this.ownedUnits(0).some(u => this.isVisibleFor(1, u.x, u.y) && distance(b, u) < 430));
        if (threatened) this.castAIAbility(0, 0);
      } else {
        const target = this.ownedBuildings(0).filter(b => this.isVisibleFor(1, b.x, b.y)).sort((a, b) => (a.type === 'hq' ? -1 : 0) - (b.type === 'hq' ? -1 : 0))[0];
        if (target) this.castAIAbility(target.x + random(-65, 65), target.y + random(-65, 65));
      }
    }
  }

  queueAIUnit(type) {
    if (type === 'engineer') return this.queueUnit(1, type);
    const facilities = this.ownedBuildings(1, UNITS[type].producer);
    if (!facilities.some(b => b.queue.length + (b.active ? 1 : 0) < 2)) return false;
    return this.queueUnit(1, type);
  }

  placeAIBuilding(type) {
    if (type === 'dock') {
      const zone = this.map.dockZones[1];
      for (const dy of [0, -80, 80]) if (this.placeBuilding(1, type, (zone.x1 + zone.x2) / 2, this.homeY + dy)) return;
      this.players[1].credits += BUILDINGS[type].cost * 0.6;
      return;
    }
    const slots = [
      [350, 965], [510, 550], [600, 880], [510, 1020], [670, 720],
      [245, 475], [660, 1000], [530, 400], [710, 570], [430, 1150], [750, 1080]
    ];
    const index = Math.max(0, this.players[1].aiPlanIndex - 1);
    const preferred = slots[index] || slots[slots.length - 1];
    const origin = { x: this.world.width - preferred[0], y: this.world.height - preferred[1] - this.homeY + 720 };
    if (this.placeBuilding(1, type, origin.x, origin.y)) return;
    for (let radius = 0; radius <= 7; radius++) {
      for (let a = 0; a < 16; a++) {
        const theta = a / 16 * Math.PI * 2;
        const x = origin.x + Math.cos(theta) * radius * 50, y = origin.y + Math.sin(theta) * radius * 50;
        if (this.placeBuilding(1, type, x, y)) return;
      }
    }
    this.players[1].credits += BUILDINGS[type].cost * 0.6;
  }

  launchAIWave() {
    const combat = this.activeUnits(1).filter(u => (UNITS[u.type].damage > 0 || u.type === 'apc') && !UNITS[u.type].tags.includes('ship') && !UNITS[u.type].tags.includes('jet'));
    if (combat.length < 3) return;
    const wave = combat.filter(u => u.order?.type !== 'attackMove').slice(0, this.difficulty.waveSize);
    const objective = this.victoryMode === 'control' ? this.beacons.filter(site => site.owner !== 1 && this.hasExploredFor(1, site.x, site.y)).sort((a, b) => distance(a, wave[0] || combat[0]) - distance(b, wave[0] || combat[0]))[0] : null;
    for (const u of wave) { u.order = { type: 'attackMove', x: (objective?.x ?? 300) + random(-70, 70), y: (objective?.y ?? this.homeY) + random(-90, 90) }; u.path = []; }
    if (wave.length && this.isVisible(wave[0].x, wave[0].y)) this.events.notice?.(objective ? '敌军正在争夺信标' : '敌军正在向基地推进');
  }

  castAIAbility(x, y) {
    return this.castAbility(x, y, 1);
  }

  checkVictory() {
    const defeated = [0, 1].map(side => this.victoryMode === 'annihilation'
      ? this.ownedBuildings(side).length === 0 && this.ownedUnits(side).length === 0
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

Object.assign(Game.prototype, modernCombat);
