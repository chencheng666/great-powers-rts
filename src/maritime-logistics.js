import { UNITS } from './data.js';
import { unitRadius } from './unit-spacing.js';
import { islandHarbor } from './island-map.js';

export const LIFELINE = Object.freeze({ goal: 2700, batches: 5, airBatches: 2, seaInterval: 50, airInterval: 90, reserve: 600, recoveryRate: 2, berths: 2 });
export const FREIGHT_LANES = {
  direct: { name: '外海直航', points: [{ x: 2160, y: 180 }, { x: 2160, y: 900 }] },
  coastal: { name: '近岸绕航', points: [{ x: 2160, y: 180 }, { x: 1330, y: 360 }] }
};
export const FREIGHT_STATUS = { inbound: '航行中', queue: '外海等待', unloading: '卸货中', outbound: '空载返航', power: '断电暂停', network: '节点失守 · 链路中断', combat: '受袭暂停' };
export const isLifeline = game => ['lifeline','islandwatch','deepblue','seabreach'].includes(game.challenge?.id);
export const freightRules = game => ({...LIFELINE,goal:game.map?.freight?.goal || LIFELINE.goal});
const gap = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function freightLanePoints(lane, home, map = null) {
  if(map?.freight)return [...map.freight.lanes[lane],islandHarbor(map,home).approach];
  const points = FREIGHT_LANES[lane]?.points || FREIGHT_LANES.coastal.points;
  return [...points, { x: lane === 'direct' ? 1750 : 1330, y: home.y }];
}

export function freightApproach(game, ship, home) {
  const harbor=islandHarbor(game.map,home);
  if(!harbor)return game.navalGoal(home.x,home.y,unitRadius(ship)+12);
  const base=harbor.approach,along={x:-Math.sin(harbor.angle),y:Math.cos(harbor.angle)};
  const peers=game.units.filter(u=>u!==ship&&u.hp>0&&!u.embarkedIn&&UNITS[u.type].tags.includes('ship')&&!UNITS[u.type].tags.includes('submerged')&&(u.owner===ship.owner||game.canSeeEntity(ship.owner,u)));
  // 同一卸货水域内选择空闲泊点，避免把航线终点设在护航舰船体内部。
  for(const offset of [0,190,-190,380,-380]){
    const point={x:base.x+along.x*offset,y:base.y+along.y*offset};
    if(!game.isNavalBlocked(point.x,point.y,unitRadius(ship)+12)&&!peers.some(u=>gap(u,point)<unitRadius(u)+unitRadius(ship)+20))return point;
  }
  return null;
}

export function harborPlan(game, ship, home) {
  const peers = game.activeUnits(ship.owner).filter(u => UNITS[u.type].tags.includes('ship') && !UNITS[u.type].tags.includes('logistics') && u.order?.type === 'rearm' &&
    (u.order.homeId === home.id || !u.order.homeId && game.ownedBuildings(u.owner, 'dock').sort((a, b) => gap(a, u) - gap(b, u) || a.id - b.id)[0]?.id === home.id)).sort((a, b) => a.id - b.id);
  const index = peers.findIndex(u => u.id === ship.id), waiting = index >= LIFELINE.berths;
  const slot = Math.max(0, index);
  const harbor=islandHarbor(game.map,home),direction=harbor?Math.cos(harbor.angle):1;
  const point = game.navalGoal(home.x + direction*(waiting ? harbor?900:740 : harbor?500:240), home.y + (waiting ? (slot - LIFELINE.berths) * 220 : slot ? harbor?330:230 : harbor?-330:-230), unitRadius(ship) + 12);
  return { ...point, waiting, assigned: index >= 0, position: waiting ? slot - LIFELINE.berths + 1 : 0, serving: Math.min(peers.length, LIFELINE.berths), queued: Math.max(0, peers.length - LIFELINE.berths) };
}

export function lifelineSummary(game) {
  if (!isLifeline(game)) return null;
  const route = game.logistics[0], control = route.seaControl;
  const ships = game.activeUnits(0, 'containerShip');
  return { control, ships, delivered: control.receipts.length * 900, remaining: LIFELINE.batches - control.dispatched,
    next: Math.max(0, Math.ceil(route.nextSea - game.time)), ports: game.ownedBuildings(0, 'dock') };
}

export function validMaritimeSave(state, config) {
  const mission = ['lifeline','islandwatch','deepblue','seabreach'].includes(config.challengeId);
  if (!mission) return !state.logistics?.some(r => r.seaControl !== undefined) && !state.units.some(u => u.freight?.batch !== undefined);
  const c = state.logistics?.[0]?.seaControl;
  const integer = n => Number.isSafeInteger(n) && n >= 0;
  if (config.economyMode !== 'convoy' || config.nuclearEnabled !== false || !c || state.logistics[1].seaControl !== undefined ||
    Object.keys(c).length !== 8 || typeof c.paused !== 'boolean' || !Object.hasOwn(FREIGHT_LANES,c.lane) || !integer(c.homeId) || c.homeId < 1 ||
    !integer(c.dispatched) || c.dispatched > LIFELINE.batches || !integer(c.airDispatched) || c.airDispatched > LIFELINE.airBatches ||
    !Number.isFinite(c.recoverySpent) || c.recoverySpent < 0 || c.recoverySpent > LIFELINE.reserve ||
    !Array.isArray(c.receipts) || !Array.isArray(c.lostBatches)) return false;
  const closed = [...c.receipts,...c.lostBatches];
  if(config.challengeId==='islandwatch'&&state.challenge?.watch?.hold>0&&c.receipts.length<2)return false;
  if (new Set(closed).size !== closed.length || closed.some(n => !integer(n) || n < 1 || n > c.dispatched) || state.logistics[0].delivered < c.receipts.length * 900) return false;
  const batches = new Set();
  for (const u of state.units) {
    const f = u.freight;
    if (f?.batch === undefined) { if (u.type === 'containerShip') return false; continue; }
    if (u.type !== 'containerShip' || u.owner !== 0 || !integer(f.batch) || f.batch < 1 || f.batch > c.dispatched || batches.has(f.batch) ||
      !Object.hasOwn(FREIGHT_LANES,f.lane) || !integer(f.leg) || f.leg > 3 || u.hp > 0 && (c.lostBatches.includes(f.batch) || f.phase !== 'outbound' && c.receipts.includes(f.batch)) ||
      f.phase !== 'outbound' && f.value !== 900 || f.value === 0 && !c.receipts.includes(f.batch) ||
      c.receipts.includes(f.batch) && (f.value !== 0 || f.phase !== 'outbound')) return false;
    batches.add(f.batch);
  }
  return true;
}
