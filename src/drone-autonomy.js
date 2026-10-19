import { UNITS } from './data.js';

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const supportsDroneAutonomy = unit => ['drone', 'aegis'].includes(unit?.type) && !unit.temporaryUntil;
export const DRONE_ROLES = { guard: '基地警戒', mission: '自主出击', return: '返回警戒区', manual: '执行手动指令', hold: '原地待命' };

export const droneAutonomy = {
  droneGuardHome(unit) {
    return this.ownedBuildings(unit.owner, 'hq')[0] || this.aircraftServiceSites(unit)[0];
  },

  setDroneMission(unit) {
    if (!supportsDroneAutonomy(unit) || !unit.autoDrone) return;
    unit.droneRole = ['attack', 'attackMove'].includes(unit.order?.type) ? 'mission' : 'manual';
  },

  toggleAutoDrone(unit) {
    if (!supportsDroneAutonomy(unit) || unit.hp <= 0 || unit.embarkedIn || this.isControlLocked(unit.owner)) return false;
    const previous = unit.droneRole;
    unit.autoDrone = !unit.autoDrone;
    if (!unit.autoDrone) {
      if (['guard', 'return'].includes(previous) && unit.order?.type === 'move') { unit.order = null; unit.path = []; }
      unit.droneRole = 'manual';
    } else if (['attack', 'attackMove', 'move', 'patrol'].includes(unit.order?.type)) this.setDroneMission(unit);
    else unit.droneRole = 'guard';
    return true;
  },

  droneGuardAllows(unit, target) {
    if (!supportsDroneAutonomy(unit) || !unit.autoDrone || unit.droneRole !== 'guard') return true;
    const home = this.droneGuardHome(unit);
    return !!home && distance(home, target) <= 450;
  },

  updateDroneAutonomy(unit) {
    if (!supportsDroneAutonomy(unit) || !unit.autoDrone || unit.embarkedIn) return;
    if (unit.droneRole === 'guard' && ['attack', 'attackMove'].includes(unit.order?.type)) this.setDroneMission(unit);
    const role = unit.droneRole;
    if (['manual', 'hold'].includes(role) || unit.order?.type === 'rearm') return;
    const depleted = unit.hp < unit.maxHp || unit.ammo < UNITS[unit.type].ammo;
    const idleService = role === 'guard' && depleted && this.time - (unit.lastDamageAt ?? -10) > 3 && !this.closestEnemy(unit, UNITS[unit.type].sight, unit.owner);
    const needsService = unit.hp <= unit.maxHp * .35 || unit.ammo <= UNITS[unit.type].ammo * .25 || idleService;
    if (needsService && this.aircraftServiceSites(unit).length) { this.requestResupply(unit); return; }
    if (role === 'mission') {
      if (unit.order) return;
      unit.droneRole = 'return';
    }
    const home = this.droneGuardHome(unit);
    if (!home) { if (unit.droneRole === 'return') unit.order = null; unit.droneRole = 'hold'; return; }
    const angle = unit.id % 8 * Math.PI / 4, radius = home.size * .55 + 105;
    const point = { x: Math.max(25, Math.min(this.world.width - 25, home.x + Math.cos(angle) * radius)), y: Math.max(25, Math.min(this.world.height - 25, home.y + Math.sin(angle) * radius)) };
    if (unit.droneRole === 'return' || distance(unit, home) > 450) {
      if (distance(unit, point) > 12) unit.order = { type: 'move', ...point };
      else { unit.order = null; unit.droneRole = 'guard'; }
    }
  }
};
