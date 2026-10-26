import { UNITS } from './data.js';

export const SANDBOX_KEY = 'great-powers-commander-sandbox-v1';
export const LOYALTY_MS = 2 * 60 * 60 * 1000;
export const SANDBOX_FUNDS = [50000, 100000, 1000000];
export function validSandbox(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).every(key => ['credits', 'speed', 'unlimitedAmmo'].includes(key)) &&
    SANDBOX_FUNDS.includes(value.credits) && [2, 3].includes(value.speed) && typeof value.unlimitedAmmo === 'boolean';
}
export function canUseSandbox(game) { return !!game && !game.multiplayer && !game.online && !game.challenge && !game.map?.missionOnly && game.playerCount !== 6; }
export function sandboxSpeed(game, owner) { return owner === 0 && canUseSandbox(game) && validSandbox(game.sandbox) ? game.sandbox.speed : 1; }
export function unlimitedAmmo(game, unit) { return unit.owner === 0 && canUseSandbox(game) && validSandbox(game.sandbox) && game.sandbox.unlimitedAmmo; }
export function refillSandboxAmmo(game) {
  if (!canUseSandbox(game) || !game.sandbox?.unlimitedAmmo) return;
  for (const unit of game.units) if (unlimitedAmmo(game, unit) && UNITS[unit.type]?.ammo && unit.ammo !== null) unit.ammo = UNITS[unit.type].ammo;
}
export function applySandbox(game, settings) {
  if (!canUseSandbox(game) || !validSandbox(settings)) throw new Error('指挥官沙盘仅支持普通双阵营单机，参数须使用界面提供的有限选项');
  // 一旦开启，本局始终保留沙盘标记，读档后也不能混入正常荣誉。
  const oldSpeed = sandboxSpeed(game, 0);
  const ratio = oldSpeed / settings.speed;
  if (game.players[0].buildQueue) game.players[0].buildQueue.progress *= ratio;
  for (const building of game.buildings) if (building.owner === 0 && building.active) building.active.progress *= ratio;
  game.sandbox = { ...settings };
  game.players[0].credits = Math.max(game.players[0].credits, settings.credits);
  refillSandboxAmmo(game);
}

export class CommanderLoyalty {
  constructor(storage, now = () => performance.now()) {
    this.storage = storage; this.now = now; this.activeMs = 0; this.last = now(); this.playing = false;
    this.unlocked = false; this.settings = null; this.storageError = false;
    try { const data = JSON.parse(storage.getItem(SANDBOX_KEY) || 'null'); this.unlocked = data?.unlocked === true; if (this.unlocked && validSandbox(data.settings)) this.settings = data.settings; } catch { /* 存储受限时，本次页面仍可正常解锁。 */ }
  }
  save() { try { this.storage.setItem(SANDBOX_KEY, JSON.stringify({ unlocked: this.unlocked, settings: this.settings })); this.storageError = false; } catch { this.storageError = true; } }
  configure(settings) {
    if (!this.unlocked || settings !== null && !validSandbox(settings)) throw new Error('请先解锁指挥官沙盘，再选择有效配置');
    this.settings = settings ? { ...settings } : null; this.save();
  }
  tick(game, visible = true) {
    const current = this.now(), elapsed = Math.max(0, Math.min(1000, current - this.last)); this.last = current;
    if (this.playing && visible) this.activeMs += elapsed;
    this.playing = visible && !!game?.running && !game.paused && !game.spectator;
    if (!this.unlocked && this.activeMs >= LOYALTY_MS) { this.unlocked = true; this.save(); return true; }
    return false;
  }
}
