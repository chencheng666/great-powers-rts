import { UNITS } from './data.js';
import { unitLayer, unitRadius } from './unit-spacing.js';
import { weatherState, hasSignalCover } from './tactical-rules.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = u => u.hp > 0 && !u.embarkedIn;

// 所有阵营和电脑共用同一套弹药、探测、拦截与补给规则。
export const modernCombat = {
  activeUnits(side, type) { return this.ownedUnits(side, type).filter(u => !u.embarkedIn); },

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
    const kind = style === 'carrier' ? 'wing' : style === 'rocket' ? 'rocket' : style === 'submarine' ? 'torpedo' : style === 'loiterer' ? 'loitering' : 'missile';
    this.projectiles.push({ id: this.nextProjectileId++, kind, owner: source.owner, sourceId: source.id, targetId: target.id, targetType: target.type, x: source.x, y: source.y, startX: source.x, startY: source.y, toX: target.x, toY: target.y, angle: Math.atan2(target.y - source.y, target.x - source.x), age: 0, jam: 0, amount, hp: kind === 'wing' ? 90 : 38, speed: kind === 'wing' ? 185 : kind === 'torpedo' ? 155 : kind === 'rocket' ? 300 : kind === 'missile' ? 360 : 185, returning: false });
    if (style === 'submarine') source.exposedUntil = this.time + 4;
    this.events.shot?.(style, source.owner);
    return true;
  },

  updateProjectiles(dt) {
    const list = [...this.projectiles];
    // 优先拦截入境弹药；与普通射击共享射击间隔及弹药，不能同时无限输出。
    for (const defender of this.units.filter(u => alive(u) && this.time >= u.stunUntil && u.fireTimer <= 0)) {
      const d = UNITS[defender.type];
      if (!['laser', 'aa', 'frigate', 'destroyer', 'fighter', 'aegis'].includes(defender.type) || defender.overheated || d.ammo && defender.ammo <= 0 || defender.order?.type === 'rearm') continue;
      const target = list.filter(p => p.hp > 0 && p.owner !== defender.owner && !['rocket', 'torpedo'].includes(p.kind) && !(defender.type === 'laser' && p.kind === 'wing') && !(['fighter', 'aegis'].includes(defender.type) && p.kind !== 'wing') && distance(defender, p) <= d.range && this.isVisibleFor(defender.owner, p.x, p.y)).sort((a, b) => distance(defender, a) - distance(defender, b))[0];
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
      } else if (p.kind !== 'rocket' && !jammed && target?.hp > 0 && this.canSeeEntity(p.owner, target)) {
        p.toX = target.x; p.toY = target.y;
      }
      const remaining = distance(p, { x: p.toX, y: p.toY }), step = p.speed * dt * (jammed ? .5 : 1);
      p.angle = Math.atan2(p.toY - p.y, p.toX - p.x);
      if (remaining > step + 8) { p.x += Math.cos(p.angle) * step; p.y += Math.sin(p.angle) * step; }
      else if (p.returning) this.finishProjectile(p, false);
      else {
        const hit = entity => {
          const record = { target: entity, amount: p.amount, side: p.owner, stun: 0 };
          if (this.collectingHits) this.pendingHits.push(record); else this.applyHit(record);
        };
        if (p.kind === 'rocket') {
          for (const entity of [...this.units, ...this.buildings]) {
            if (entity.owner === p.owner || !alive(entity) || entity.kind === 'unit' && UNITS[entity.type].tags.some(t => ['air', 'submerged'].includes(t))) continue;
            const gap = distance(entity, { x: p.toX, y: p.toY });
            if (gap <= 65) {
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
    const homes = this.ownedBuildings(u.owner).filter(b => naval ? b.type === 'dock' : ['factory', 'armory'].includes(b.type));
    const home = homes.sort((a, b) => distance(a, u) - distance(b, u))[0];
    if (!home) return;
    const berth = naval ? this.navalGoal(home.x, home.y, unitRadius(u)) : home;
    if (distance(u, berth) > (naval ? 65 : home.size * .55 + 40)) { u.rearmProgress = 0; this.moveUnit(u, berth, dt, naval ? 45 : home.size * .55 + 24); return; }
    if (!this.hasPower(u.owner)) return;
    u.rearmProgress += dt;
    const interval = d.rearmTime / d.ammo;
    if (u.rearmProgress >= interval && u.ammo < d.ammo && this.players[u.owner].credits >= 10) {
      this.players[u.owner].credits -= 10; u.ammo++; u.rearmProgress = 0;
    }
    if (u.type === 'carrier' && u.wing < d.wing && this.players[u.owner].credits >= 150) {
      u.wingRearm = (u.wingRearm || 0) + dt;
      if (u.wingRearm >= 8) { u.wing++; u.wingRearm = 0; this.players[u.owner].credits -= 150; }
    }
    if (u.ammo === d.ammo && (u.type !== 'carrier' || u.wing === d.wing)) this.restoreCombatOrder(u);
  },

  restoreCombatOrder(u) {
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
    if (['move', 'attackMove'].includes(u.order?.type) || this.time - (u.lastMovedAt ?? -10) < .5) return;
    const nearby = this.activeUnits(u.owner).filter(v => v !== u && !UNITS[v.type].tags.some(t => ['air', 'infantry'].includes(t)) && distance(u, v) < UNITS.supply.range).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id - b.id);
    const damaged = nearby.find(v => v.hp < v.maxHp && this.time - (v.lastDamageAt ?? -10) > 3);
    if (damaged) {
      const repair = Math.min(24 * dt, damaged.maxHp - damaged.hp, p.credits / .3, u.stock / .2);
      damaged.hp += repair; p.credits -= repair * .3; u.stock -= repair * .2;
      if (repair > 0 && this.time > (u.serviceFXAt || 0)) { u.serviceFXAt = this.time + .6; this.effects.push({ type: 'shot', style: 'repair', x: u.x, y: u.y, toX: damaged.x, toY: damaged.y, sourceType: 'supply', targetType: damaged.type, owner: u.owner, age: 0, duration: .6 }); }
    }
    u.serviceTimer = Math.max(0, (u.serviceTimer || 0) - dt);
    const empty = nearby.find(v => UNITS[v.type].ammo && v.ammo < UNITS[v.type].ammo);
    if (empty && u.serviceTimer <= 0 && u.stock >= 8 && p.credits >= 10) {
      u.stock -= 8; p.credits -= 10; empty.ammo++; u.serviceTimer = 1.5;
      if (empty.order?.type === 'rearm' && empty.ammo >= Math.ceil(UNITS[empty.type].ammo / 2) && empty.type !== 'carrier') this.restoreCombatOrder(empty);
    }
  },

  boardTransport(u, dt) {
    const transport = this.getEntity(u.order.targetId);
    if (!transport || transport.hp <= 0 || transport.owner !== u.owner || transport.type !== 'apc' || transport.passengers.length >= UNITS.apc.capacity) { u.order = null; return; }
    if (distance(u, transport) > 52) { this.moveUnit(u, transport, dt, 40); return; }
    transport.passengers.push(u.id); u.embarkedIn = transport.id; u.order = null; u.path = [];
    u.x = transport.x; u.y = transport.y;
    this.selected = this.selected.filter(id => id !== u.id);
    this.fogTimer = 0; this.events.selection?.();
  },

  unloadTransport(transport, emergency = false) {
    if (!transport || transport.type !== 'apc' || !transport.passengers) return 0;
    let unloaded = 0;
    for (const id of [...transport.passengers]) {
      const passenger = this.getEntity(id);
      if (!passenger || passenger.hp <= 0) { transport.passengers = transport.passengers.filter(value => value !== id); continue; }
      let spot = null;
      for (let n = 0; n < 80; n++) {
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
    if (!emergency && transport.owner === 0) this.events.notice?.(unloaded ? `${unloaded} 名乘员已下车` : '周围没有安全的下车位置');
    return unloaded;
  }
};
