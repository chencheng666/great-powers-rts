import { UNITS } from './data.js';
import { unitLayer, unitRadius } from './unit-spacing.js';
import { weatherState, hasSignalCover } from './tactical-rules.js';
import { turnToward } from './projectile-flight.js';
import { isLunarRobot } from './lunar-robots.js';
import { battleMetric } from './battle-report.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = u => u.hp > 0 && !u.embarkedIn;

// 所有阵营和电脑共用同一套弹药、探测、拦截与补给规则。
export const modernCombat = {
  activeUnits(side, type) { return this.ownedUnits(side, type).filter(u => !u.embarkedIn); },

  serviceReady(u) {
    return this.hasPower(u.owner) && this.time - (u.lastDamageAt ?? -10) > 3 && this.time - (u.lastMovedAt ?? -10) >= .5;
  },

  aircraftGrounded(u) {
    return !!UNITS[u.type]?.tags.includes('air') && !u.embarkedIn && !u.deployment && !u.deckApproach &&
      !['move', 'attackMove', 'attack', 'patrol', 'board'].includes(u.order?.type) && this.time - (u.lastMovedAt ?? -10) >= .5 &&
      this.ownedBuildings(u.owner, 'airfield').some(b => distance(b, u) <= b.size * .55 + 24);
  },

  serviceGroundUnit(u, dt, home = null) {
    if (!this.serviceReady(u) || isLunarRobot(this.map, u.type) || UNITS[u.type].tags.some(t => ['air', 'ship', 'logistics'].includes(t))) return false;
    const infantry = UNITS[u.type].tags.includes('infantry');
    home ||= this.ownedBuildings(u.owner).find(b => (infantry ? b.type === 'barracks' : ['factory', 'armory'].includes(b.type)) && distance(b, u) <= b.size * .55 + 40);
    if (!home || home.hp <= 0 || home.owner !== u.owner || distance(home, u) > home.size * .55 + 40) return false;
    const p = this.players[u.owner], repaired = Math.min((infantry ? 12 : 22) * dt, u.maxHp - u.hp, p.credits / .3);
    u.hp += repaired; p.credits = Math.max(0, p.credits - repaired * .3); battleMetric(this, u.owner, 'repairHP', repaired);
    if (repaired > 0 && this.time >= (u.serviceFXAt || 0)) {
      u.serviceFXAt = this.time + .7;
      this.effects.push({ type: 'shot', style: 'repair', x: home.x, y: home.y, toX: u.x, toY: u.y, targetType: u.type, owner: u.owner, age: 0, duration: .6 });
    }
    return true;
  },

  refillStationAmmo(u, dt) {
    const d = UNITS[u.type];
    if (!d.ammo || isLunarRobot(this.map, u.type) || u.ammo >= d.ammo || !this.serviceReady(u)) return;
    u.rearmProgress += dt;
    const cost = d.ammoCost ?? 10;
    if (u.rearmProgress >= d.rearmTime / d.ammo && this.players[u.owner].credits >= cost) {
      this.players[u.owner].credits -= cost; u.ammo++; u.rearmProgress = 0;
    }
  },

  serviceIdleUnit(u, dt) {
    if (u.order || !this.serviceReady(u)) return;
    const tags = UNITS[u.type].tags;
    const atStation = tags.includes('air') ? this.aircraftGrounded(u) : tags.includes('ship') ?
      this.ownedBuildings(u.owner, 'dock').some(b => distance(u, this.navalGoal(b.x, b.y, unitRadius(u) + 10)) <= 115) : this.serviceGroundUnit(u, dt);
    if (atStation) this.refillStationAmmo(u, dt);
  },

  serviceAircraft(u, dt) {
    if (u.hp >= u.maxHp || this.time - (u.lastDamageAt ?? -10) <= 3 || this.time - (u.lastMovedAt ?? -10) < .5 || !this.hasPower(u.owner)) return;
    const home = this.ownedBuildings(u.owner, 'airfield').find(b => distance(b, u) <= b.size * .55 + 30);
    if (!home) return;
    const p = this.players[u.owner], repaired = Math.min(22 * dt, u.maxHp - u.hp, p.credits / .3);
    u.hp += repaired; p.credits = Math.max(0, p.credits - repaired * .3); battleMetric(this, u.owner, 'repairHP', repaired);
    if (repaired > 0 && this.time >= (u.serviceFXAt || 0)) {
      u.serviceFXAt = this.time + .7;
      this.effects.push({ type: 'shot', style: 'repair', x: home.x, y: home.y, toX: u.x, toY: u.y, targetType: u.type, owner: u.owner, age: 0, duration: .6 });
    }
  },

  requestResupply(u, home = null) {
    if (!u || u.hp <= 0 || u.embarkedIn || ['harvester', 'supply'].includes(u.type) || UNITS[u.type].tags.includes('logistics')) return false;
    if (u.order?.type !== 'rearm') { u.resumeOrder = u.order; u.order = { type: 'rearm' }; u.path = []; u.pathTimer = 0; }
    if (home?.type === 'dock' && home.hp > 0 && home.owner === u.owner && UNITS[u.type].tags.includes('ship')) u.order.homeId = home.id;
    return true;
  },

  submarineSurfaced(u) {
    if (u.type !== 'submarine' || u.embarkedIn || u.hp <= 0) return false;
    if (u.order && u.order.type !== 'rearm') return false;
    return this.ownedBuildings(u.owner, 'dock').some(home =>
      (!u.order?.homeId || u.order.homeId === home.id) && distance(u, u.order?.type === 'rearm' ? this.shipBerth(u, home) : this.navalGoal(home.x, home.y, unitRadius(u) + 10)) <= 95);
  },

  shipBerth(u, home) {
    const peers = this.activeUnits(u.owner).filter(v => UNITS[v.type].tags.includes('ship') && v.order?.type === 'rearm' && (!v.order.homeId || v.order.homeId === home.id))
      .sort((a, b) => a.id - b.id);
    const slot = Math.max(0, peers.findIndex(v => v.id === u.id));
    const offset = slot === 0 ? 0 : Math.ceil(slot / 2) * 215 * (slot % 2 ? 1 : -1);
    return this.navalGoal(home.x + (home.owner ? -1 : 1) * (slot >= 7 ? 210 : 0), home.y + offset, unitRadius(u) + 10);
  },

  serviceShip(u, dt, home = null) {
    if (u.hp >= u.maxHp || this.time - (u.lastDamageAt ?? -10) <= 3 || this.time - (u.lastMovedAt ?? -10) < .5 || !this.hasPower(u.owner)) return;
    home ||= this.ownedBuildings(u.owner, 'dock').find(b => distance(u, this.navalGoal(b.x, b.y, unitRadius(u) + 10)) <= 115);
    if (!home || home.owner !== u.owner || home.type !== 'dock' || home.hp <= 0) return;
    // 港口泊位沿岸展开，维修不能在远海或持续交火中发生。
    if (distance(u, this.shipBerth(u, home)) > 95 && distance(u, this.navalGoal(home.x, home.y, unitRadius(u) + 10)) > 115) return;
    const p = this.players[u.owner], repair = Math.min(30 * dt, u.maxHp - u.hp, p.credits / .35);
    u.hp += repair; p.credits = Math.max(0, p.credits - repair * .35); battleMetric(this, u.owner, 'repairHP', repair);
    if (repair > 0 && this.time >= (u.serviceFXAt || 0)) {
      u.serviceFXAt = this.time + .7;
      this.effects.push({ type: 'shot', style: 'repair', x: home.x, y: home.y, toX: u.x, toY: u.y, targetType: u.type, owner: u.owner, age: 0, duration: .6 });
    }
  },

  updateElectronicWarfare(dt) {
    const storm = weatherState(this.map, this.time).phase === 'storm';
    for (const u of this.units) {
      if (storm && alive(u) && UNITS[u.type].tags.includes('air') && !hasSignalCover(this, u.owner, u)) u.jammedUntil = this.time + .3;
      u.heat = Math.max(0, (u.heat || 0) - dt * 18);
      if (u.overheated && u.heat < 28) u.overheated = false;
      if (u.embarkedIn) {
        const transport = this.getEntity(u.embarkedIn);
        if (transport?.hp > 0) { u.x = transport.x; u.y = transport.y; }
      }
      if (alive(u) && UNITS[u.type].sonar && this.time >= (u.sonarFXAt || 0)) {
        u.sonarFXAt = this.time + 4;
        this.effects.push({ type: 'sonar', sourceId: u.id, x: u.x, y: u.y, size: UNITS[u.type].sonar, owner: u.owner, age: 0, duration: 1.5 });
      }
    }
    for (const plane of this.units.filter(u => alive(u) && u.type === 'ewPlane' && this.time >= u.stunUntil && u.order?.type !== 'rearm' && !this.aircraftGrounded(u))) {
      const active = this.time % 10 < 2.5;
      if (!active) continue;
      for (const target of this.activeUnits(1 - plane.owner)) {
        if (['aa', 'frigate', 'destroyer'].includes(target.type) && distance(plane, target) <= UNITS.ewPlane.range && this.canSeeEntity(plane.owner, target)) target.ewSuppressedUntil = this.time + .15;
      }
      if (this.time >= (plane.pulseAt || 0)) { plane.pulseAt = this.time + 1; this.effects.push({ type: 'jam', x: plane.x, y: plane.y, size: UNITS.ewPlane.range, owner: plane.owner, age: 0, duration: .8 }); }
    }
    for (const jammer of this.units.filter(u => alive(u) && u.type === 'jammer' && this.time >= u.stunUntil)) {
      const range = UNITS.jammer.range * (this.players[jammer.owner].faction === 'middleeast' ? 1.15 : 1);
      for (const u of this.activeUnits(1 - jammer.owner)) {
        if (UNITS[u.type].tags.includes('drone') && distance(jammer, u) <= range) u.jammedUntil = this.time + .3;
      }
      if (this.time >= (jammer.pulseAt || 0)) {
        jammer.pulseAt = this.time + 2;
        this.effects.push({ type: 'jam', x: jammer.x, y: jammer.y, size: range, owner: jammer.owner, age: 0, duration: 1.2 });
      }
    }
  },

  laserHeat(u) {
    u.heat = Math.min(100, (u.heat || 0) + 34);
    if (u.heat >= 95) u.overheated = true;
  },

  launchProjectile(source, target, amount, style) {
    if (style === 'carrier') {
      const flights = this.projectiles.filter(p => !p.finished && p.sourceId === source.id && p.kind === 'wing').length;
      if (flights >= source.wing || source.wing <= 0) return false;
    }
    const kind = style === 'bomber' ? 'bomb' : style === 'carrier' ? 'wing' : style === 'rocket' ? 'rocket' : style === 'submarine' ? 'torpedo' : style === 'loiterer' ? 'loitering' : 'missile';
    this.projectiles.push({ id: this.nextProjectileId++, kind, owner: source.owner, sourceId: source.id, targetId: target.id, targetType: target.type, x: source.x, y: source.y, startX: source.x, startY: source.y, toX: target.x, toY: target.y, angle: Math.atan2(target.y - source.y, target.x - source.x), age: 0, jam: 0, amount, hp: kind === 'wing' ? 90 : 38, speed: kind === 'wing' ? 185 : kind === 'torpedo' ? 155 : kind === 'rocket' ? 300 : kind === 'missile' ? 360 : 185, returning: false });
    const p = this.projectiles.at(-1);
    if (kind === 'torpedo') {
      // 艇首沿当前艇身方向发射，然后按原有目标进行有限角速度转弯。
      const offset = 6.2 * 8;
      p.x = p.startX = Math.max(0, Math.min(this.world.width, source.x + Math.cos(source.angle) * offset));
      p.y = p.startY = Math.max(0, Math.min(this.world.height, source.y + Math.sin(source.angle) * offset));
      p.angle = source.angle;
    }
    p.sourceHeight = UNITS[source.type]?.tags.includes('jet') && !this.aircraftGrounded(source) ? 95 : source.type === 'destroyer' ? 35 : 20;
    p.targetHeight = UNITS[target.type]?.tags.includes('jet') && !this.aircraftGrounded(target) ? 95 : UNITS[target.type]?.tags.includes('drone') ? 25 : 12;
    if (kind === 'bomb') { p.toX = p.x; p.toY = p.y; p.fallDuration = 1.1; }
    if (style === 'submarine') source.exposedUntil = this.time + 4;
    this.events.shot?.(style, source.owner);
    return true;
  },

  updateProjectiles(dt) {
    const list = [...this.projectiles];
    // 优先拦截入境弹药；与普通射击共享射击间隔及弹药，不能同时无限输出。
    for (const defender of this.units.filter(u => alive(u) && this.time >= u.stunUntil && u.fireTimer <= 0)) {
      const d = UNITS[defender.type];
      if (!['laser', 'aa', 'frigate', 'destroyer', 'fighter', 'aegis', 'navalFighter'].includes(defender.type) || defender.ewSuppressedUntil > this.time || defender.overheated || d.ammo && defender.ammo <= 0 || defender.order?.type === 'rearm') continue;
      const target = list.filter(p => p.hp > 0 && p.owner !== defender.owner && !['rocket', 'torpedo', 'bomb'].includes(p.kind) && !(defender.type === 'laser' && p.kind === 'wing') && !(['fighter', 'aegis', 'navalFighter'].includes(defender.type) && p.kind !== 'wing') && distance(defender, p) <= d.range && this.isVisibleFor(defender.owner, p.x, p.y)).sort((a, b) => distance(defender, a) - distance(defender, b))[0];
      if (!target) continue;
      target.hp -= d.damage * (defender.type === 'laser' ? 1 : 1.8);
      defender.fireTimer = d.cooldown;
      defender.turretAngle = Math.atan2(target.y - defender.y, target.x - defender.x);
      if (d.ammo) defender.ammo--;
      if (defender.type === 'laser') this.laserHeat(defender);
      this.effects.push({ type: 'shot', x: defender.x, y: defender.y, toX: target.x, toY: target.y, sourceType: defender.type, targetType: target.kind === 'wing' ? 'fighter' : 'drone', style: defender.type === 'laser' ? 'laser' : 'aa', owner: defender.owner, age: 0, duration: .2 });
      this.events.shot?.(defender.type, defender.owner);
    }
    for (const p of list) {
      p.age += dt;
      if (p.hp <= 0) { this.finishProjectile(p, true); continue; }
      const source = this.getEntity(p.sourceId), target = this.getEntity(p.targetId);
      const jammed = ['loitering', 'missile', 'wing'].includes(p.kind) && (weatherState(this.map, this.time).phase === 'storm' && !hasSignalCover(this, p.owner, p) || this.activeUnits(1 - p.owner, 'jammer').some(u => this.time >= u.stunUntil && distance(u, p) <= UNITS.jammer.range * (this.players[u.owner].faction === 'middleeast' ? 1.15 : 1)));
      if (jammed) p.jam += dt;
      else p.jam = Math.max(0, p.jam - dt * .25);
      if (p.jam >= 1.1 && p.kind !== 'wing') { this.finishProjectile(p, true); continue; }
      if (p.returning) {
        if (!source || source.hp <= 0) { this.finishProjectile(p, true); continue; }
        p.toX = source.x; p.toY = source.y;
      } else if (!['rocket', 'bomb'].includes(p.kind) && !jammed && target?.hp > 0 && this.canSeeEntity(p.owner, target)) {
        p.toX = target.x; p.toY = target.y;
      }
      const remaining = distance(p, { x: p.toX, y: p.toY }), step = p.speed * dt * (jammed ? .5 : 1);
      const heading = Math.atan2(p.toY - p.y, p.toX - p.x);
      p.angle = ['wing', 'missile', 'loitering', 'torpedo'].includes(p.kind) ? turnToward(p.angle, heading, (p.kind === 'torpedo' ? 2 : p.kind === 'wing' ? 2.2 : 5) * dt) : heading;
      if (p.kind === 'bomb' && p.fallDuration && p.age < p.fallDuration) continue;
      if (remaining > step + 8) { p.x += Math.cos(p.angle) * step; p.y += Math.sin(p.angle) * step; }
      else if (p.returning) this.finishProjectile(p, false);
      else {
        const hit = entity => {
          const record = { target: entity, amount: p.amount, side: p.owner, stun: 0 };
          if (this.collectingHits) this.pendingHits.push(record); else this.applyHit(record);
        };
        if (['rocket', 'bomb'].includes(p.kind)) {
          for (const entity of [...this.units, ...this.buildings]) {
            if (entity.owner === p.owner || !alive(entity) || entity.kind === 'unit' && (UNITS[entity.type].tags.includes('submerged') || UNITS[entity.type].tags.includes('air') && !this.aircraftGrounded(entity))) continue;
            const gap = distance(entity, { x: p.toX, y: p.toY });
            if (gap <= (p.kind === 'bomb' ? UNITS.bomber.splash : 65)) {
              const record = { target: entity, amount: p.amount * (1 - gap / 100), side: p.owner, stun: 0 };
              if (this.collectingHits) this.pendingHits.push(record); else this.applyHit(record);
            }
          }
        } else if (target?.hp > 0 && !target.embarkedIn && distance(target, { x: p.toX, y: p.toY }) < 45 && (!UNITS[target.type]?.tags.includes('submerged') || this.canSeeEntity(p.owner, target))) hit(target);
        this.effects.push({ type: 'explosion', x: p.toX, y: p.toY, targetType: p.targetType, size: p.kind === 'rocket' ? 42 : 24, owner: p.owner, age: 0, duration: .7 });
        if (p.kind === 'wing' && source?.hp > 0) p.returning = true;
        else this.finishProjectile(p, false);
      }
      if (p.age > 22) this.finishProjectile(p, p.kind === 'wing');
    }
    this.projectiles = this.projectiles.filter(p => !p.finished);
  },

  finishProjectile(p, intercepted) {
    if (p.finished) return;
    p.finished = true;
    if (intercepted) {
      this.effects.push({ type: 'hit', x: p.x, y: p.y, targetType: p.kind === 'wing' ? 'fighter' : 'drone', owner: p.owner, age: 0, duration: .4 });
      if (p.kind === 'wing') {
        const source = this.getEntity(p.sourceId);
        if (source) source.wing = Math.max(0, source.wing - 1);
      }
    }
  },

  updateGroundRearm(u, dt) {
    const d = UNITS[u.type], naval = d.tags.includes('ship');
    if (!naval) {
      const truck = this.activeUnits(u.owner, 'supply').find(s => s.stock >= 8 && distance(s, u) < UNITS.supply.range && !['move', 'attackMove'].includes(s.order?.type));
      if (truck) { this.moveUnit(u, truck, dt, 75); return; }
    }
    const homes = this.ownedBuildings(u.owner).filter(b => naval ? b.type === 'dock' : d.tags.includes('infantry') ? b.type === 'barracks' : ['factory', 'armory'].includes(b.type));
    const home = homes.find(b => b.id === u.order?.homeId) || homes.sort((a, b) => distance(a, u) - distance(b, u))[0];
    if (naval && u.order?.type === 'rearm' && home) u.order.homeId = home.id;
    if (!home) return;
    const berth = naval ? this.shipBerth(u, home) : home;
    if (distance(u, berth) > (naval ? 75 : home.size * .55 + 40)) { u.rearmProgress = 0; this.moveUnit(u, berth, dt, naval ? 48 : home.size * .55 + 24); return; }
    if (!this.hasPower(u.owner)) return;
    if (naval) this.serviceShip(u, dt, home);
    else this.serviceGroundUnit(u, dt, home);
    if (!this.serviceReady(u)) return;
    this.refillStationAmmo(u, dt);
    if (u.type === 'carrier' && !this.carrierAircraft(u).length && u.wing < d.wing && this.players[u.owner].credits >= 150) {
      u.wingRearm = (u.wingRearm || 0) + dt;
      if (u.wingRearm >= 8) { u.wing++; u.wingRearm = 0; this.players[u.owner].credits -= 150; }
    }
    if ((!d.ammo || u.ammo === d.ammo) && u.hp >= u.maxHp - .01 && (u.type !== 'carrier' || this.carrierAircraft(u).length || u.wing === d.wing)) {
      this.restoreCombatOrder(u);
      if (naval && !u.order) {
        // 空闲舰艇离开整备泊位，给后续伤舰留下进港空间。
        const goal = this.navalGoal(berth.x + (u.owner ? -1 : 1) * 300, home.y + (u.id % 5 - 2) * 210, unitRadius(u));
        u.order = { type: 'move', ...this.findSpawn(goal.x, goal.y, u.type) };
        u.path = []; u.pathTimer = 0;
      }
    }
  },

  restoreCombatOrder(u) {
    battleMetric(this, u.owner, 'resupplies', 1);
    u.order = u.resumeOrder; u.resumeOrder = null; u.rearmProgress = 0;
  },

  updateSupply(u, dt) {
    const p = this.players[u.owner], home = this.ownedBuildings(u.owner, 'factory').sort((a, b) => distance(a, u) - distance(b, u))[0];
    if (u.stock < 8) {
      if (!home) return;
      if (u.order?.type !== 'restock') { u.resumeOrder = u.order; u.order = { type: 'restock' }; }
    }
    if (u.order?.type === 'restock') {
      if (!home) return;
      if (distance(u, home) > home.size * .55 + 40) { u.rearmProgress = 0; this.moveUnit(u, home, dt, home.size * .55 + 24); return; }
      if (!this.hasPower(u.owner) || p.credits < 100) return;
      u.rearmProgress += dt;
      if (u.rearmProgress >= 8) { p.credits -= 100; u.stock = UNITS.supply.stock; this.restoreCombatOrder(u); }
      return;
    }
    if (['move', 'attackMove'].includes(u.order?.type)) {
      if (distance(u, u.order) > 10) { this.moveUnit(u, u.order, dt, 8); return; }
      u.order = null;
    }
    const eligible = v => v !== u && !UNITS[v.type].tags.some(t => ['air', 'ship', 'harvester'].includes(t));
    const needs = v => eligible(v) && (p.credits > 0 && (v.hp < v.maxHp - .01 || !isLunarRobot(this.map, v.type) && UNITS[v.type].ammo && v.ammo < UNITS[v.type].ammo) || isLunarRobot(this.map, v.type) && v.order?.type === 'rearm' && v.battery < 100 && this.hasPower(u.owner));
    if (u.autoSupply !== false && (p.credits > 0 || this.hasPower(u.owner))) {
      let target = this.getEntity(u.serviceTargetId);
      if (!target || target.owner !== u.owner || !alive(target) || !needs(target)) target = null;
      if (!target && this.time >= (u.serviceSearchAt || 0)) {
        u.serviceSearchAt = this.time + 1.5;
        const candidates = this.activeUnits(u.owner).filter(v => needs(v) && this.time - (v.lastDamageAt ?? -10) > 3 && this.time - (v.lastFireAt ?? -10) > 3).sort((a, b) => distance(u, a) - distance(u, b) || a.id - b.id);
        // 不派补给车追逐隔海、障碍后方或其他补给车已经服务的目标。
        target = candidates.find(v => {
          if (this.activeUnits(u.owner, 'supply').some(s => s !== u && s.serviceTargetId === v.id && s.autoSupply !== false)) return false;
          if (distance(u, v) < UNITS.supply.range) return true;
          const path = this.findPath(u, v, UNITS.supply.range * .75);
          return path.length && distance(path.at(-1), v) <= UNITS.supply.range;
        }) || null;
      }
      u.serviceTargetId = target?.id ?? null;
      if (target && distance(u, target) >= UNITS.supply.range * .85 && this.time - (target.lastDamageAt ?? -10) > 3 && this.time - (target.lastFireAt ?? -10) > 3) {
        this.moveUnit(u, target, dt, UNITS.supply.range * .75); return;
      }
    }
    if (this.time - (u.lastMovedAt ?? -10) < .5) return;
    const nearby = this.activeUnits(u.owner).filter(v => eligible(v) && distance(u, v) < UNITS.supply.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id);
    const damaged = nearby.find(v => v.hp < v.maxHp && this.time - (v.lastDamageAt ?? -10) > 3);
    if (damaged) {
      const repair = Math.min(24 * dt, damaged.maxHp - damaged.hp, p.credits / .3, u.stock / .2);
      damaged.hp += repair; p.credits -= repair * .3; u.stock -= repair * .2; battleMetric(this, damaged.owner, 'repairHP', repair);
      if (repair > 0 && this.time > (u.serviceFXAt || 0)) { u.serviceFXAt = this.time + .6; this.effects.push({ type: 'shot', style: 'repair', x: u.x, y: u.y, toX: damaged.x, toY: damaged.y, sourceType: 'supply', targetType: damaged.type, owner: u.owner, age: 0, duration: .6 }); }
    }
    u.serviceTimer = Math.max(0, (u.serviceTimer || 0) - dt);
    const empty = nearby.find(v => !isLunarRobot(this.map, v.type) && UNITS[v.type].ammo && v.ammo < UNITS[v.type].ammo);
    const cost = empty ? UNITS[empty.type].ammoCost ?? 10 : 10;
    const stockCost = empty && UNITS[empty.type].tags.includes('infantry') ? 1 : empty && ['tank', 'aa', 'elite'].includes(empty.type) ? 4 : 8;
    if (empty && u.serviceTimer <= 0 && u.stock >= stockCost && p.credits >= cost) {
      u.stock -= stockCost; p.credits -= cost; empty.ammo++; u.serviceTimer = 1.5;
      if (empty.order?.type === 'rearm' && empty.hp >= empty.maxHp - .01 && empty.ammo >= Math.ceil(UNITS[empty.type].ammo / 2) && empty.type !== 'carrier') this.restoreCombatOrder(empty);
    }
  },

  transportLoad(transport) {
    return (transport.passengers || []).reduce((total, id) => {
      const u = this.getEntity(id); return total + (u && u.hp > 0 ? transport.type === 'carrier' || UNITS[u.type].tags.includes('infantry') ? 1 : 4 : 0);
    }, 0);
  },

  canBoardTransport(u, transport) {
    if (!u || !transport || u === transport || u.kind !== 'unit' || transport.hp <= 0 || u.hp <= 0 || u.owner !== transport.owner || u.embarkedIn || transport.embarkedIn || !UNITS[transport.type].capacity || UNITS[u.type].capacity) return false;
    const tags = UNITS[u.type].tags, weight = tags.includes('infantry') ? 1 : 4;
    if (transport.type === 'carrier') return tags.includes('deck') && (u.homeCarrierId === transport.id || this.carrierAircraft(transport).length < UNITS.carrier.capacity) && transport.passengers.length < UNITS.carrier.capacity;
    if (tags.some(t => ['air', 'ship'].includes(t)) || transport.type === 'apc' && !tags.includes('infantry')) return false;
    return this.transportLoad(transport) + weight <= UNITS[transport.type].capacity;
  },

  transportGrounded(transport) {
    if (transport.type === 'carrier') return this.time - (transport.lastMovedAt ?? -10) >= 1;
    if (transport.type !== 'airlift') return true;
    return !this.isGroundBlocked(transport.x, transport.y, 35) && this.time - (transport.lastMovedAt ?? -10) >= .5 && !this.buildings.some(b => b.hp > 0 && distance(b, transport) < b.size * .5 + 35);
  },

  boardTransport(u, dt) {
    const transport = this.getEntity(u.order.targetId);
    if (!this.canBoardTransport(u, transport)) { u.order = null; return; }
    if (transport.type === 'landing') {
      const shore = this.resolveMoveGoal(u, transport.x, transport.y);
      if (distance(shore, transport) > 145 || !this.canOccupyUnit(u, shore)) return;
      if (distance(u, transport) > 150) { this.moveUnit(u, shore, dt, 12); return; }
    } else {
      if (!this.transportGrounded(transport)) { if (transport.type === 'carrier') u.deckApproach = null; return; }
      if (distance(u, transport) > 65) { this.moveUnit(u, transport, dt, 45); return; }
    }
    if (transport.type === 'carrier') {
      const landing = this.getEntity(transport.landingId);
      if (landing?.hp > 0 && landing !== u && landing.deckApproach?.until > this.time) return;
      if (!u.deckApproach || u.deckApproach.carrierId !== transport.id) {
        u.deckApproach = { carrierId: transport.id, start: this.time, until: this.time + 2.4 };
        transport.landingId = u.id;
      }
      this.moveUnit(u, transport, dt, 16);
      if (this.time < u.deckApproach.until) return;
      u.homeCarrierId = transport.id; u.deckApproach = null; transport.landingId = null;
    }
    transport.passengers.push(u.id); u.embarkedIn = transport.id; u.order = null; u.path = [];
    u.x = transport.x; u.y = transport.y;
    this.selected = this.selected.filter(id => id !== u.id);
    this.fogTimer = 0; this.events.selection?.();
  },

  unloadTransport(transport, emergency = false) {
    if (!transport || !UNITS[transport.type]?.capacity || !transport.passengers) return 0;
    if (transport.type === 'carrier') return this.launchDeckAircraft(transport, emergency);
    if (!emergency && (!this.transportGrounded(transport) || ['move', 'attackMove'].includes(transport.order?.type))) {
      if (transport.owner === 0) this.events.notice?.('运输单位需要在安全位置停驻后卸载');
      return 0;
    }
    let unloaded = 0;
    for (const id of [...transport.passengers]) {
      const passenger = this.getEntity(id);
      if (!passenger || passenger.hp <= 0) { transport.passengers = transport.passengers.filter(value => value !== id); continue; }
      let spot = null;
      for (let n = 0; n < 180; n++) {
        const angle = n * 2.399963, reach = 50 + Math.floor(n / 12) * 12;
        const candidate = { x: transport.x + Math.cos(angle) * reach, y: transport.y + Math.sin(angle) * reach };
        if (this.canOccupyUnit(passenger, candidate) && !this.units.some(v => alive(v) && unitLayer(v) === 'ground' && distance(v, candidate) < unitRadius(v) + unitRadius(passenger) + 4)) { spot = candidate; break; }
      }
      if (!spot && !emergency) continue;
      passenger.embarkedIn = null;
      if (spot) { passenger.x = spot.x; passenger.y = spot.y; if (emergency) { passenger.hp *= .5; passenger.lastDamageAt = this.time; } unloaded++; }
      else this.damage(passenger, passenger.maxHp * 3, 1 - transport.owner);
      transport.passengers = transport.passengers.filter(value => value !== id);
    }
    if (unloaded) { this.fogTimer = 0; this.events.selection?.(); }
    if (!emergency && transport.owner === 0) this.events.notice?.(unloaded ? `${unloaded} 个作战单位已卸载` : '周围没有安全的陆地卸载位置，请靠岸或移至空地');
    return unloaded;
  },

  carrierAircraft(carrier) { return this.ownedUnits(carrier.owner).filter(u => UNITS[u.type].tags.includes('deck') && u.homeCarrierId === carrier.id); },

  returnToCarrier(u, dt) {
    const carrier = this.getEntity(u.homeCarrierId);
    if (!carrier || carrier.hp <= 0 || carrier.owner !== u.owner || carrier.type !== 'carrier') { u.homeCarrierId = null; return false; }
    if (!this.transportGrounded(carrier)) u.deckApproach = null;
    if (distance(u, carrier) > 65) { this.moveUnit(u, carrier, dt, 45); return true; }
    const order = u.order; u.order = { type: 'board', targetId: carrier.id };
    this.boardTransport(u, dt);
    if (!u.embarkedIn) u.order = order;
    return true;
  },

  launchDeckAircraft(carrier, emergency = false, onlyId = null) {
    if (!emergency && (!this.transportGrounded(carrier) || !this.hasPower(carrier.owner))) return 0;
    if (!emergency && this.projectiles.some(p => !p.finished && p.kind === 'wing' && p.sourceId === carrier.id)) return 0;
    let count = 0;
    for (const id of [...carrier.passengers]) {
      if (onlyId !== null && id !== onlyId) continue;
      const plane = this.getEntity(id);
      if (!plane || plane.hp <= 0) { carrier.passengers = carrier.passengers.filter(v => v !== id); continue; }
      if (!emergency && (plane.ammo < UNITS[plane.type].ammo || plane.hp < plane.maxHp - .01)) continue;
      const angle = carrier.angle + count * .32;
      const goal = this.resolveMoveGoal(plane, carrier.x + Math.cos(angle) * 230, carrier.y + Math.sin(angle) * 230);
      plane.embarkedIn = null; plane.x = carrier.x; plane.y = carrier.y;
      plane.angle = plane.turretAngle = angle;
      plane.deployment = { buildingId: carrier.id, start: this.time, until: this.time + 2.6, fromX: plane.x, fromY: plane.y, ...goal };
      if (emergency) { plane.hp *= .5; plane.homeCarrierId = null; plane.lastDamageAt = this.time; }
      this.restoreCombatOrder(plane);
      carrier.passengers = carrier.passengers.filter(v => v !== id); count++;
    }
    if (count) { this.fogTimer = 0; this.events.selection?.(); }
    return count;
  },

  updateCarrierAirGroup(carrier, dt) {
    if (!this.hasPower(carrier.owner) || !this.transportGrounded(carrier) || this.time - (carrier.lastDamageAt ?? -10) <= 3) return;
    for (const id of [...carrier.passengers]) {
      const plane = this.getEntity(id); if (!plane || plane.hp <= 0) continue;
      const p = this.players[carrier.owner], d = UNITS[plane.type];
      const repair = Math.min(18 * dt, plane.maxHp - plane.hp, p.credits / .35);
      plane.hp += repair; p.credits = Math.max(0, p.credits - repair * .35); battleMetric(this, plane.owner, 'repairHP', repair);
      plane.rearmProgress += dt;
      if (plane.ammo < d.ammo && plane.rearmProgress >= d.rearmTime / d.ammo && p.credits >= 10) {
        p.credits -= 10; plane.ammo++; plane.rearmProgress = 0;
      }
      if (carrier.order?.type === 'rearm' || plane.hp < plane.maxHp - .01 || plane.ammo < d.ammo) continue;
      if (!plane.resumeOrder) {
        const target = this.closestEnemy(plane, UNITS.carrier.range, carrier.owner);
        if (target) plane.resumeOrder = { type: 'attack', targetId: target.id, x: target.x, y: target.y };
      }
      if (plane.resumeOrder) this.launchDeckAircraft(carrier, false, plane.id);
    }
  },

  updateAITransports() {
    for (const t of this.activeUnits(1).filter(u => ['landing', 'airlift'].includes(u.type))) {
      if (t.order?.type === 'rearm' || t.deployment) continue;
      const water = this.map.water;
      const home = { x: t.type === 'landing' ? water.x2 - unitRadius(t) : water ? water.x2 + 190 : this.world.width - 550, y: this.homeY + 190 };
      const shore = { x: t.type === 'landing' ? water.x1 + unitRadius(t) : water ? water.x1 - 190 : 550, y: this.homeY + 190 };
      t.transportStage ||= 'load';
      const goal = ['load', 'return'].includes(t.transportStage) ? home : shore;
      if (distance(t, goal) > 20) { t.order = { type: 'move', ...goal }; continue; }
      t.order = null;
      if (t.transportStage === 'return') { t.transportStage = 'load'; t.loadStartedAt = this.time; }
      if (t.transportStage === 'load') {
        t.loadStartedAt ??= this.time;
        if (this.transportLoad(t) >= 4 && this.time - t.loadStartedAt > 12) { t.transportStage = 'depart'; continue; }
        for (const unit of this.activeUnits(1).filter(u => ['rifle', 'tank'].includes(u.type) && !['board', 'rearm'].includes(u.order?.type) && distance(u, t) < 900)) {
          if (this.canBoardTransport(unit, t)) unit.order = { type: 'board', targetId: t.id };
        }
      } else {
        const carried = [...t.passengers];
        this.unloadTransport(t);
        for (const id of carried) {
          const u = this.getEntity(id);
          if (u?.hp > 0 && !u.embarkedIn) u.order = { type: 'attackMove', x: 300, y: this.homeY };
        }
        if (!t.passengers.length) { t.transportStage = 'return'; t.loadStartedAt = null; }
      }
    }
  }
};
