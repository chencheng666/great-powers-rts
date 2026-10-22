import { unitRadius } from './unit-spacing.js';
import { recordBattleEvent } from './battle-report.js';
import { isLifeline, LIFELINE, FREIGHT_LANES, freightLanePoints } from './maritime-logistics.js';
import { isIslandWatch, watchSummary } from './island-watch.js';
import { islandHarbor } from './island-map.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const FREIGHT_TYPES = ['freightPlane', 'containerShip'];
export const SUPPLY_ROUTES = {
  air: { interval: 36, value: 720, unload: 6 },
  sea: { interval: 60, value: 900, unload: 9 }
};

// 外部后勤与战斗运输分离，避免用载兵运输机反复卸货刷资金。
export const logisticsEconomy = {
  initLogistics() {
    this.logistics = this.players.map(({side}) => ({ side, nextAir: this.time + 3, nextSea: this.time + 10, delivered: 0, lost: 0 }));
  },

  freightDestination(side, sea = false) {
    if (sea && isLifeline(this)) {
      const preferred = this.logistics[side].seaControl?.homeId;
      return this.ownedBuildings(side, 'dock').sort((a, b) => Number(b.id === preferred) - Number(a.id === preferred) || a.id - b.id)[0] || null;
    }
    return this.ownedBuildings(side, sea ? 'dock' : 'refinery').sort((a, b) => a.id - b.id)[0]
      || (!sea ? this.ownedBuildings(side, 'hq')[0] : null);
  },

  freightEntry(side, sea = false) {
    if(sea && this.map.freight)return {...this.map.freight.entry};
    if (sea && isLifeline(this)) return { x: 2160, y: unitRadius({ type: 'containerShip' }) + 12 };
    const margin = sea ? unitRadius({ type: 'containerShip' }) + 12 : 90;
    return { x: sea ? (this.map.water.x1 + this.map.water.x2) / 2 : this.world.width / 2,
      y: side === 0 ? margin : this.world.height - margin };
  },

  launchFreight(side, sea = false) {
    if (isIslandWatch(this) && (sea && !watchSummary(this).connected || !sea)) return null;
    const control = isLifeline(this) ? this.logistics[side].seaControl : null;
    if (isLifeline(this) && (side !== 0 || sea && (!control || control.dispatched >= LIFELINE.batches || control.paused) || !sea && control.airDispatched >= LIFELINE.airBatches)) return null;
    const home = this.freightDestination(side, sea);
    if (!home) return null;
    const entry = this.freightEntry(side, sea), type = sea ? 'containerShip' : 'freightPlane';
    const u = this.addUnit(side, type, entry.x, entry.y);
    u.freight = { homeId: home.id, phase: 'inbound', progress: 0, entry,
      value: home.type === 'hq' ? 180 : SUPPLY_ROUTES[sea ? 'sea' : 'air'].value };
    if (control) {
      if (sea) Object.assign(u.freight, { batch: ++control.dispatched, lane: control.lane, leg: 0 });
      else control.airDispatched++;
    }
    return u;
  },

  configureFreight(side, changes) {
    if (!isLifeline(this) || this.multiplayer || !this.running || this.paused || side !== 0 || this.isControlLocked(side)) return false;
    if (!changes || Object.keys(changes).length !== 1) return false;
    const control = this.logistics[side].seaControl;
    if (Object.hasOwn(changes, 'paused') && typeof changes.paused === 'boolean') control.paused = changes.paused;
    else if (Object.hasOwn(changes, 'lane') && Object.hasOwn(FREIGHT_LANES, changes.lane)) control.lane = changes.lane;
    else if (Object.hasOwn(changes, 'homeId') && this.ownedBuildings(side, 'dock').some(b => b.id === changes.homeId)) {
      control.homeId = changes.homeId;
      for (const ship of this.activeUnits(side, 'containerShip').filter(u => u.freight.phase !== 'outbound')) {
        Object.assign(ship.freight, { homeId: changes.homeId, progress: 0 });
        ship.path = [];
      }
    } else return false;
    return true;
  },

  updateLogistics(dt) {
    if (this.challenge && !isLifeline(this)) return;
    if (this.economyMode !== 'convoy') return;
    if (isLifeline(this)) {
      const c = this.logistics[0].seaControl;
      if (this.players[0].credits < 350 && this.hasBuilding(0, 'hq')) {
        const amount = Math.min(LIFELINE.recoveryRate * dt, LIFELINE.reserve - c.recoverySpent);
        this.players[0].credits += amount; c.recoverySpent += amount;
      }
    }
    for (const route of this.logistics) for (const [channel, sea, type] of [['Air', false, 'freightPlane'], ['Sea', true, 'containerShip']]) {
      if (isLifeline(this) && (route.side !== 0 || sea && route.seaControl.paused)) continue;
      if(isIslandWatch(this) && (!sea || !watchSummary(this).connected))continue;
      if (sea && !this.map.water || this.time < route[`next${channel}`]) continue;
      // 同侧同类线路在上一班退出后才放行；延误不追补，不改变每批物资价值。
      if (this.activeUnits(route.side, type).length) continue;
      route[`next${channel}`] = this.time + (isLifeline(this) ? sea ? LIFELINE.seaInterval : LIFELINE.airInterval : SUPPLY_ROUTES[sea ? 'sea' : 'air'].interval);
      this.launchFreight(route.side, sea);
    }
  },

  airFreightPattern(u, home, waiting = false) {
    const radius = Math.max(150, unitRadius(u) * 2.4), margin = radius + 25;
    const clamp = (v, size) => Math.max(margin, Math.min(size - margin, v));
    const center = { x: clamp(home.x, this.world.width), y: clamp(home.y, this.world.height) };
    if (waiting) {
      const gap = radius * 2 + unitRadius(u) * 2 + 60;
      const direction = center.x < this.world.width / 2 ? 1 : -1;
      center.x = clamp(center.x + direction * gap, this.world.width);
    }
    return { center, radius };
  },

  flyFreightCircuit(u, home, dt, waiting) {
    const f = u.freight, { center, radius } = this.airFreightPattern(u, home, waiting);
    if (f.holding !== waiting) { f.holding = waiting; delete f.orbitAngle; }
    if (distance(u, center) > radius + 45) {
      this.moveUnit(u, center, dt, radius); return false;
    }
    f.orbitAngle = (f.orbitAngle ?? Math.atan2(u.y - center.y, u.x - center.x)) + dt * 128 / radius;
    this.moveUnit(u, { x: center.x + Math.cos(f.orbitAngle + .35) * radius, y: center.y + Math.sin(f.orbitAngle + .35) * radius }, dt, 0);
    return true;
  },

  updateFreight(u, dt) {
    if (!this.running || this.paused || u.hp <= 0) return;
    const f = u.freight;
    if (!f) { u.hp = 0; return; }
    const sea = u.type === 'containerShip', rule = SUPPLY_ROUTES[sea ? 'sea' : 'air'];
    if (this.time < u.stunUntil) return;
    if (f.phase === 'outbound') {
      const exit = sea ? f.entry : { ...f.entry, x: Math.max(90, Math.min(this.world.width - 90, f.entry.x + (u.owner ? -220 : 220))) };
      if (distance(u, exit) < 24) { u.hp = 0; return; }
      this.moveUnit(u, exit, dt, 18); return;
    }
    let home = this.getEntity(f.homeId);
    if (!home || home.hp <= 0 || home.owner !== u.owner) {
      home = this.freightDestination(u.owner, sea);
      f.homeId = home?.id ?? null; f.progress = 0; delete f.orbitAngle;
      if (home?.type === 'hq') f.value = Math.min(f.value, 180);
    }
    if (!home) { f.phase = 'outbound'; return; }
    if (sea && f.batch && f.phase !== 'outbound') {
      const points = freightLanePoints(f.lane, home, this.map);
      if (f.leg < points.length) {
        const point = points[f.leg];
        if (distance(u, point) > 42) { f.phase = 'inbound'; f.blockedReason = 'inbound'; this.moveUnit(u, point, dt, 24); return; }
        f.leg++;
      }
    }
    if (!sea) {
      // 接收点按到达批次串行服务，等待航线与卸货航线保持两倍翼展以上的间隔。
      const first = this.activeUnits(u.owner, 'freightPlane').filter(other => other.freight?.homeId === home.id).sort((a, b) => a.id - b.id)[0];
      const waiting = first !== u, arrived = this.flyFreightCircuit(u, home, dt, waiting);
      if (waiting || !arrived) { f.phase = 'inbound'; if (!waiting) f.progress = 0; return; }
    } else {
      // 兼容旧存档中的积压货船，后船在外海等待，不与前船争抢同一泊位。
      const first = this.activeUnits(u.owner, 'containerShip').filter(other => other.freight?.homeId === home.id && (!isLifeline(this) || other.freight?.phase !== 'outbound')).sort((a, b) => a.id - b.id)[0];
      f.holding = first !== u;
      if (f.holding) {
        const goal = this.navalGoal((this.map.water.x1 + this.map.water.x2) / 2, home.y + (u.owner ? 1 : -1) * 360, unitRadius(u) + 12);
        f.blockedReason = 'queue';
        f.phase = 'inbound'; this.moveUnit(u, goal, dt, 45); return;
      }
      const harbor=islandHarbor(this.map,home);
      const goal = harbor?.approach || this.navalGoal(home.x, home.y, unitRadius(u) + 12);
      if (distance(u, goal) > 95) {
        f.phase = 'inbound'; f.blockedReason = 'inbound'; f.progress = 0; this.moveUnit(u, goal, dt, 66.5); return;
      }
      u.angle = u.owner ? -Math.PI / 2 : Math.PI / 2;
    }
    f.phase = 'unloading';
    f.blockedReason = !this.hasPower(u.owner) ? 'power' : isIslandWatch(this) && !watchSummary(this).connected ? 'network' : this.time - (u.lastDamageAt ?? -10) <= 3 || this.time - (home.lastDamageAt ?? -10) <= 3 ? 'combat' : 'unloading';
    if (f.blockedReason !== 'unloading' || sea && this.time - (u.lastMovedAt ?? -10) < .5) return;
    if (!sea && this.time >= (f.dropFXAt || 0)) {
      f.dropFXAt = this.time + 2;
      this.effects.push({ type: 'supplyDrop', x: home.x + (u.owner ? -1 : 1) * home.size * .65, y: home.y + 18, owner: u.owner, age: 0, duration: 3 });
    }
    f.progress += dt;
    if (f.progress + 1e-6 < rule.unload) return;
    if (f.batch) {
      const control = this.logistics[u.owner].seaControl;
      if (control.receipts.includes(f.batch) || control.lostBatches.includes(f.batch)) { f.value = 0; f.phase = 'outbound'; return; }
      control.receipts.push(f.batch);
    }
    this.players[u.owner].credits += f.value;
    this.logistics[u.owner].delivered += f.value;
    recordBattleEvent(this,{kind:'delivered',owner:u.owner,type:u.type,value:f.value});
    this.effects.push({ type: 'capture', x: home.x, y: home.y, owner: u.owner, age: 0, duration: 1.2 });
    if (u.owner === 0) this.events.notice?.(`${sea ? '集装箱船' : '后勤运输机'}卸货完成：+${f.value} 资金`);
    f.value = 0; f.phase = 'outbound'; f.progress = 0; f.blockedReason = 'outbound';
  },

  activateSatellite(side) {
    const p = this.players[side];
    if (!this.running || this.paused || !this.hasBuilding(side, 'radar') || !this.hasBuilding(side, 'lab') || !this.hasPower(side) || p.credits < 1000 || (p.satelliteReadyAt || 0) > this.time) return false;
    p.credits -= 1000; p.satelliteUntil = this.time + 8; p.satelliteReadyAt = this.time + 120;
    this.updateFog();
    this.events.notice?.(side === 0 ? '侦察卫星过境：全图可见 8 秒，潜航与隐身仍需专用探测' : '敌方侦察卫星正在过境');
    return true;
  }
};
