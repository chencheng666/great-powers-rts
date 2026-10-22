import { UNITS } from './data.js';
import { recordBattleEvent } from './battle-report.js';

export const WATCH = Object.freeze({ capture: 6, raid: 12, hold: 20, radius: 160 });
export const WATCH_NODES = [
  { id: 'island-signal', name: '通信中继', icon: 'radio-tower', detail: '接管主岛通信' },
  { id: 'island-power', name: '能源节点', icon: 'zap', detail: '恢复前线供电' },
  { id: 'island-port', name: '港务站', icon: 'anchor', detail: '接通海运补给' }
];
export const isIslandWatch = game => game.challenge?.id === 'islandwatch';
const near = (u, p, radius = WATCH.radius) => Math.hypot(u.x - p.x, u.y - p.y) < radius;
const groundGuard = u => !u.embarkedIn && UNITS[u.type].damage > 0 && !UNITS[u.type].tags.some(t => ['air','ship'].includes(t));
export const nodeContested = (game, site) => game.activeUnits(1).some(u => groundGuard(u) && near(u,site));

export function watchSummary(game) {
  if (!isIslandWatch(game)) return null;
  const nodes = WATCH_NODES.map(n => ({ ...n, site: game.getEntity(n.id) }));
  const captured = nodes.filter(n => n.site?.owner === 0).length;
  const power = game.hasPower(0), connected = captured === nodes.length && power;
  const guarded = game.activeUnits(0).some(u => groundGuard(u) && near(u,{ x: 2380, y: 1640 },430));
  const contested = nodes.some(n => nodeContested(game,n.site));
  const delivered = game.logistics[0].seaControl.receipts.length * 900;
  return { nodes, captured, power, connected, guarded, contested, delivered,
    status: captured < 3 ? `接管节点 ${captured} / 3` : !power ? '供电不足 · 海运暂停' : delivered < 1800 ? '链路接通 · 护航抵港' : contested ? '敌军争夺 · 驻守中断' : !guarded ? '缺少陆战守军' : '补给到位 · 驻守计时' };
}

export function watchDepot(game, owner) {
  if(owner!==0 || !isIslandWatch(game) || !watchSummary(game).connected || !game.logistics[0].seaControl.receipts.length)return null;
  return {...game.getEntity('island-power'),size:90,hp:1};
}

export function updateIslandCapture(game, unit, site, dt) {
  if (!isIslandWatch(game) || !WATCH_NODES.some(n => n.id === site?.id)) return false;
  if (site.owner === unit.owner) { unit.order = null; return true; }
  if (!near(unit,site,38)) { unit.order.progress = 0; game.moveUnit(unit,site,dt,26); return true; }
  if (nodeContested(game,site) || game.time - (unit.lastDamageAt ?? -10) < 2) { unit.order.progress = 0; return true; }
  unit.order.progress = Math.min(WATCH.capture,(unit.order.progress || 0) + dt);
  if (unit.order.progress < WATCH.capture - 1e-9) return true;
  site.owner = unit.owner; unit.order = null; game.recalculatePower(); game.fogTimer = 0;
  game.effects.push({ type:'capture', x:site.x, y:site.y, age:0, duration:1.2, owner:unit.owner });
  const node = WATCH_NODES.find(n => n.id === site.id);
  game.events.notice?.(`${node.name}已接管，工程师可继续接管或夺回其他节点`);
  game.events.voice?.('beaconCaptured');
  recordBattleEvent(game,{ kind:'captured', owner:unit.owner, type:site.kind === 'resource' ? 'depot' : 'beacon' });
  return true;
}

export function updateWatchOperation(game, dt) {
  const state = game.challenge.watch;
  for (let i = 0; i < WATCH_NODES.length; i++) {
    const site = game.getEntity(WATCH_NODES[i].id);
    const defenders = game.activeUnits(0).some(u => groundGuard(u) && near(u,site));
    state.raids[i] = site.owner === 0 && nodeContested(game,site) && !defenders ? state.raids[i] + dt : 0;
    if (state.raids[i] >= WATCH.raid) {
      site.owner = null; state.raids[i] = 0; game.recalculatePower(); game.fogTimer = 0;
      game.events.notice?.(`${WATCH_NODES[i].name}失守，海运暂停，请派工程师重新接管`);
    }
  }
  const s = watchSummary(game);
  state.hold = s.connected && s.delivered >= 1800 && s.guarded && !s.contested ? Math.min(WATCH.hold,state.hold + dt) : 0;
  return s;
}

export function validWatchState(challenge, config, time, entities, sites) {
  if (challenge?.id !== 'islandwatch') return challenge?.watch === undefined;
  const s = challenge.watch;
  if (!s || Object.keys(s).length !== 2 || !Number.isFinite(s.hold) || s.hold < 0 || s.hold >= WATCH.hold || s.hold > time ||
    !Array.isArray(s.raids) || s.raids.length !== 3 || s.raids.some(n => !Number.isFinite(n) || n < 0 || n >= WATCH.raid || n > time) || config.nuclearEnabled !== false) return false;
  const expected = [{ id:'island-signal',x:2320,y:1470 },{ id:'island-port',x:2260,y:1790 },{ id:'island-power',x:2600,y:1560 }];
  if (!expected.every(n => sites.some(p => p.id === n.id && p.x === n.x && p.y === n.y))) return false;
  if (s.hold && !expected.every(n => sites.find(p => p.id === n.id)?.owner === 0)) return false;
  return entities.every(e => !e.unloadQueue || e.type === 'landing') && entities.every(e => e.order?.type !== 'capture' || e.order.progress === undefined || e.order.progress <= WATCH.capture);
}

export function watchPanelHTML(game, icon) {
  const s = watchSummary(game);
  return `<section class="challenge-objectives watch-objectives"><h3>列岛守望</h3><p>${s.status}</p><ul class="recon-objectives">${s.nodes.map((n,i) => {
    const engineer = game.activeUnits(0,'engineer').find(u => u.order?.targetId === n.id);
    const progress = engineer?.order?.progress || 0;
    return `<li><button type="button" data-watch-focus="${n.id}" title="定位${n.name}">${icon(n.icon)}<span>${n.name}</span><small>${n.site.owner === 0 ? game.challenge.watch.raids[i] ? `失守倒计时 ${Math.ceil(WATCH.raid-game.challenge.watch.raids[i])} 秒` : '已接管' : nodeContested(game,n.site) ? '敌军争夺中' : progress ? `接管 ${Math.floor(progress)} / ${WATCH.capture} 秒` : n.detail}</small></button></li>`;
  }).join('')}</ul><dl><div><dt>前线供电</dt><dd>${s.power && s.nodes[1].site.owner===0 ? '已接通' : '未接通'}</dd></div><div><dt>能源仓整备</dt><dd>${watchDepot(game,0)?'可维修补弹':'等待首批海运'}</dd></div><div><dt>最终驻守</dt><dd>${Math.floor(game.challenge.watch.hold)} / ${WATCH.hold} 秒</dd></div></dl><p>工程师可重复接管；敌军独占节点 12 秒会切断链路。登陆舰靠近标记沙滩停驻后按 U 分批卸载，再按 U 可取消。首批抵港后，能源仓可付费整备陆军和补给车。</p></section>`;
}
