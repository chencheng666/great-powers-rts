import { unitRadius } from './unit-spacing.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const FREIGHT_TYPES = ['freightPlane', 'containerShip'];
export const SUPPLY_ROUTES = {
  air: { interval: 36, value: 720, unload: 6 },
  sea: { interval: 60, value: 900, unload: 9 }
};

// 外部后勤与战斗运输分离，避免用载兵运输机反复卸货刷资金。
export const logisticsEconomy = {
  initLogistics() {
    this.logistics = [0, 1].map(side => ({ side, nextAir: this.time + 3, nextSea: this.time + 10, delivered: 0, lost: 0 }));
  },

  freightDestination(side, sea = false) {
    return this.ownedBuildings(side, sea ? 'dock' : 'refinery').sort((a, b) => a.id - b.id)[0]
      || (!sea ? this.ownedBuildings(side, 'hq')[0] : null);
  },

  freightEntry(side, sea = false) {
    const margin = sea ? unitRadius({ type: 'containerShip' }) + 12 : 90;
    return { x: sea ? (this.map.water.x1 + this.map.water.x2) / 2 : this.world.width / 2,
      y: side === 0 ? margin : this.world.height - margin };
  },

  launchFreight(side, sea = false) {
    const home = this.freightDestination(side, sea);
    if (!home) return null;
    const entry = this.freightEntry(side, sea), type = sea ? 'containerShip' : 'freightPlane';
    const u = this.addUnit(side, type, entry.x, entry.y);
    u.freight = { homeId: home.id, phase: 'inbound', progress: 0, entry,
      value: home.type === 'hq' ? 180 : SUPPLY_ROUTES[sea ? 'sea' : 'air'].value };
    return u;
  },

  updateLogistics(dt) {
    if (this.economyMode !== 'convoy') return;
    for (const route of this.logistics) for (const [channel, sea, type] of [['Air', false, 'freightPlane'], ['Sea', true, 'containerShip']]) {
      if (sea && !this.map.water || this.time < route[`next${channel}`]) continue;
      // 积压不追补，且每条线路最多两艘/架，新增设施不能无限叠加收入。
      route[`next${channel}`] = this.time + SUPPLY_ROUTES[sea ? 'sea' : 'air'].interval;
      if (this.activeUnits(route.side, type).length < 2) this.launchFreight(route.side, sea);
    }
  },

  updateFreight(u, dt) {
    const f = u.freight;
    if (!f) { u.hp = 0; return; }
    const sea = u.type === 'containerShip', rule = SUPPLY_ROUTES[sea ? 'sea' : 'air'];
    if (this.time < u.stunUntil) return;
    if (f.phase === 'outbound') {
      if (distance(u, f.entry) < 24) { u.hp = 0; return; }
      this.moveUnit(u, f.entry, dt, 18); return;
    }
    let home = this.getEntity(f.homeId);
    if (!home || home.hp <= 0 || home.owner !== u.owner) {
      home = this.freightDestination(u.owner, sea);
      f.homeId = home?.id ?? null; f.progress = 0;
      if (home?.type === 'hq') f.value = Math.min(f.value, 180);
    }
    if (!home) { f.phase = 'outbound'; return; }
    const goal = sea ? this.navalGoal(home.x, home.y, unitRadius(u) + 12) : { x: home.x, y: home.y };
    const reach = sea ? 95 : home.size * .5 + 25;
    if (distance(u, goal) > reach) {
      f.phase = 'inbound'; f.progress = 0; this.moveUnit(u, goal, dt, reach * .7); return;
    }
    f.phase = 'unloading';
    if (!sea) {
      f.orbitAngle = (f.orbitAngle ?? Math.atan2(u.y - home.y, u.x - home.x)) + dt * 2.8;
      this.moveUnit(u, { x: home.x + Math.cos(f.orbitAngle) * (home.size * .5 + 8), y: home.y + Math.sin(f.orbitAngle) * (home.size * .5 + 8) }, dt, 3);
    }
    if (!this.hasPower(u.owner) || sea && this.time - (u.lastMovedAt ?? -10) < .5 || this.time - (u.lastDamageAt ?? -10) <= 3 || this.time - (home.lastDamageAt ?? -10) <= 3) return;
    if (!sea && this.time >= (f.dropFXAt || 0)) {
      f.dropFXAt = this.time + 2;
      this.effects.push({ type: 'supplyDrop', x: home.x + (u.owner ? -1 : 1) * home.size * .65, y: home.y + 18, owner: u.owner, age: 0, duration: 3 });
    }
    f.progress += dt;
    if (f.progress + 1e-6 < rule.unload) return;
    this.players[u.owner].credits += f.value;
    this.logistics[u.owner].delivered += f.value;
    this.effects.push({ type: 'capture', x: home.x, y: home.y, owner: u.owner, age: 0, duration: 1.2 });
    if (u.owner === 0) this.events.notice?.(`${sea ? '集装箱船' : '后勤运输机'}卸货完成：+${f.value} 资金`);
    f.value = 0; f.phase = 'outbound'; f.progress = 0;
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
