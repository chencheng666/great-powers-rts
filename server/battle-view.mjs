import { packFog } from '../src/network-protocol.js';
const copy = value => JSON.parse(JSON.stringify(value));
export function battleView(game, side, memory = new Map()) {
  const owner = value => value === null || value === undefined ? value : value === side ? 0 : 1;
  const visible = entity => game.canSeeEntity(side, entity);
  const entities = game.units.filter(e => e.owner === side || !e.embarkedIn && visible(e));
  const ids = new Set(entities.map(e => e.id));
  function entityView(entity) {
    const e = copy(entity); e.owner = owner(e.owner);
    if (e.sabotage) e.sabotage.owner = owner(e.sabotage.owner);
    if (e.owner === 1) {
      e.order = null; e.path = []; e.resumeOrder = null; e.targetId = null;
      e.passengers = []; e.embarkedIn = null; e.homeCarrierId = null;
      e.queue = []; e.active = null; e.rallyPoint = null; delete e.freight;
      delete e.serviceTargetId; delete e.stock; delete e.ammo;
    } else if (e.order?.targetId && !ids.has(e.order.targetId) && !game.buildings.some(b => b.id === e.order.targetId && visible(b))) {
      // 指令目标是公开资源点时保留；敌军消失后不发送其最新位置。
      if (typeof e.order.targetId === 'number') { e.order = null; e.targetId = null; }
    }
    return e;
  }
  for (const b of game.buildings) if (b.owner !== side && visible(b)) memory.set(b.id, entityView(b));
  for (const [id, b] of memory) if (typeof id === 'number' && game.isVisibleFor(side, b.x, b.y) && !game.buildings.some(e => e.id === id)) memory.delete(id);
  function sites(key) {
    return game[key].map(site => {
      if (game.isVisibleFor(side, site.x, site.y) || site.owner === side || !memory.has(site.id)) {
        const value = copy(site);
        if (!game.isVisibleFor(side, site.x, site.y) && site.owner !== side) { if ('owner' in value) value.owner = null; if ('amount' in value) value.amount = value.max; }
        if ('owner' in value) value.owner = owner(value.owner);
        memory.set(site.id, value);
      }
      return copy(memory.get(site.id));
    });
  }
  const players = [side, 1-side].map((s, index) => index === 0 ? { ...copy(game.players[s]), side: 0, controlLocked: game.isControlLocked(s) } : {
    side: 1, faction: game.players[s].faction, credits: 0, powerIn: 0, powerOut: 0,
    controlScore: game.players[s].controlScore, buildQueue: null, abilityCharge: 0, abilityCooldown: 0,
    cyberPending: game.players[s].cyberPending ? { executeAt: game.players[s].cyberPending.executeAt } : null
  });
  return {
    time: game.time, running: game.running, paused: game.paused,
    winner: typeof game.winner === 'number' ? owner(game.winner) : game.winner,
    players, units: entities.map(entityView), buildings: [...game.ownedBuildings(side).map(entityView), ...[...memory].filter(([id]) => typeof id === 'number').map(([, b]) => copy(b))],
    ore: sites('ore'), oil: sites('oil'), beacons: sites('beacons'), resourceSites: sites('resourceSites'), fog: packFog(game.fogs[side]),
    projectiles: game.projectiles.filter(p => game.isVisibleFor(side, p.x, p.y) && game.isVisibleFor(side, p.toX, p.toY)).map(p => ({ ...copy(p), startX:game.isVisibleFor(side,p.startX,p.startY)?p.startX:p.x,startY:game.isVisibleFor(side,p.startX,p.startY)?p.startY:p.y,owner: owner(p.owner), targetId: null, sourceId: null })),
    effects: game.effects.filter(e => game.isVisibleFor(side, e.x, e.y) && (!Number.isFinite(e.toX) || game.isVisibleFor(side, e.toX, e.toY))).map(e => ({ ...copy(e), owner: owner(e.owner) }))
  };
}
