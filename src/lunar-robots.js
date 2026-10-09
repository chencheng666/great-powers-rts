import { battleMetric } from './battle-report.js';

export const ROBOT_SPECS = {
  rifle: { name: '月卫战斗机器人', model: 'robot_rifle', shotCost: 4, description: '原创月表无人战斗机体；电池驱动机动与脉冲武器，无需氧气、食物或常规弹药。低电量返场充电。' },
  engineer: { name: '天工工程机器人', model: 'robot_engineer', shotCost: 0, description: '原创月表工程机体；电池驱动，接管资源站与信标后驻留设施。无需氧气与食物。' },
  scout: { name: '巡星侦察机器人', model: 'robot_scout', shotCost: 0, description: '原创月表侦察机体；无武装，保留侦察、反隐与一次性潜入职责。45 秒定时破坏可被工程师拆除。电池驱动，低电量自动返场。' }
};
export const ROBOT_ENERGY = { capacity: 100, returnAt: 25, idleDrain: .08, moveDrain: .22, chargeRate: 12, chargeLoad: 4 };
export const isLunarRobot = (map, type) => Boolean(map === true || map?.future) && Object.hasOwn(ROBOT_SPECS, type);
export const lunarBuildingProfile = (future, type, data) => future && type === 'barracks'
  ? { ...data, name: '机器人装配站', desc: '装配月卫、天工与巡星机器人；提供充电和机体维修，充电依赖电网。' } : data;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const lunarRobots = {
  robotChargeSite(u) {
    const buildings = this.ownedBuildings(u.owner).filter(b => ['power', 'barracks'].includes(b.type) && distance(u, b) <= b.size * .55 + 40);
    const trucks = this.activeUnits(u.owner, 'supply').filter(t => t.stock >= 8 && this.time - (t.lastMovedAt ?? -10) >= .5 && !['move', 'attackMove', 'restock'].includes(t.order?.type) && distance(u, t) <= 125);
    return [...buildings, ...trucks].filter(s => this.time - (s.lastDamageAt ?? -10) > 3).sort((a, b) => distance(a, u) - distance(b, u) || a.id - b.id)[0];
  },

  updateRobotEnergy(u, dt) {
    if (!isLunarRobot(this.map, u.type)) return false;
    u.battery ??= ROBOT_ENERGY.capacity;
    const moving = this.time - (u.lastMovedAt ?? -10) < .15;
    // 留出低电量返航储备；远途耗尽时停机，必须由补给车接近救援。
    u.battery = Math.max(0, u.battery - dt * (moving ? ROBOT_ENERGY.moveDrain : ROBOT_ENERGY.idleDrain));
    if (u.battery <= ROBOT_ENERGY.returnAt && u.order?.type !== 'rearm') {
      this.requestResupply(u);
      if (u.owner === 0) this.events.notice?.(`${ROBOT_SPECS[u.type].name}电量不足，返回充电`);
    }
    if (u.order?.type === 'rearm') {
      this.updateRobotRearm(u, dt); return true;
    }
    return u.battery <= 0;
  },

  updateRobotRearm(u, dt) {
    let source = this.robotChargeSite(u);
    if (!source) {
      const home = this.ownedBuildings(u.owner).filter(b => ['power', 'barracks'].includes(b.type)).sort((a, b) => distance(a, u) - distance(b, u))[0];
      if (home && u.battery > 0) this.moveUnit(u, home, dt, home.size * .55 + 24);
      return;
    }
    if (!this.hasPower(u.owner) || this.time - (u.lastDamageAt ?? -10) <= 3 || this.time - (u.lastMovedAt ?? -10) < .5) return;
    const before = u.battery;
    u.battery = Math.min(ROBOT_ENERGY.capacity, u.battery + ROBOT_ENERGY.chargeRate * dt);
    if (source.kind === 'building' && u.hp < u.maxHp) {
      const p = this.players[u.owner], repair = Math.min(12 * dt, u.maxHp - u.hp, p.credits / .3);
      u.hp += repair; p.credits = Math.max(0, p.credits - repair * .3); battleMetric(this, u.owner, 'repairHP', repair);
    }
    if (u.battery > before && this.time >= (u.serviceFXAt || 0)) {
      u.serviceFXAt = this.time + .6;
      this.effects.push({ type: 'shot', style: 'repair', x: source.x, y: source.y, toX: u.x, toY: u.y, owner: u.owner, age: 0, duration: .5 });
    }
    if (u.battery >= ROBOT_ENERGY.capacity && (source.kind === 'unit' || u.hp >= u.maxHp - .01)) this.restoreCombatOrder(u);
  }
};
