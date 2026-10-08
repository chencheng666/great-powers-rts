import { BUILDINGS, UNITS } from '../src/data.js';
export function executeCommand(game, side, message) {
  const type = message.unitType;
  if (!game.running || game.paused || game.isControlLocked(side)) return false;
  const own = id => { const e = game.getEntity(id); return e?.owner === side && e.hp > 0 ? e : null; };
  const point = () => Number.isFinite(message.x) && Number.isFinite(message.y) && message.x >= 0 && message.y >= 0 && message.x <= game.world.width && message.y <= game.world.height;
  const selected = Array.isArray(message.selected) && message.selected.length <= 120 ? message.selected.filter(id => Number.isSafeInteger(id) && own(id)) : [];
  const entity = own(message.id);
  switch (message.action) {
    case 'build': return Object.hasOwn(BUILDINGS, type) && game.startBuild(side, type);
    case 'cancel-build': return game.cancelBuilding(side);
    case 'place': return Object.hasOwn(BUILDINGS, type) && point() && game.placeBuilding(side, type, message.x, message.y);
    case 'train': return Object.hasOwn(UNITS, type) && game.ownedUnits(side).length + game.ownedBuildings(side).reduce((n,b) => n+b.queue.length+Number(!!b.active),0) < 120 && game.queueUnit(side, type);
    case 'cancel-train': return entity?.kind === 'building' && game.cancelUnitProduction(side, entity.id);
    case 'repair': return entity?.kind === 'building' && game.toggleRepair(side, entity.id);
    case 'sell': return entity && (entity.kind === 'building' ? game.sellBuilding(side, entity.id) : game.sellHarvester(side, entity.id));
    case 'rally': return entity?.kind === 'building' && point() && game.setRallyPoint(side, entity.id, message.x, message.y);
    case 'resupply': return entity?.kind === 'unit' && game.requestResupply(entity);
    case 'unload': return entity?.kind === 'unit' && game.unloadTransport(entity);
    case 'auto-supply': return entity?.kind === 'unit' && game.toggleAutoSupply(entity);
    case 'group-resupply':
    case 'group-unload': return selected.filter(id=>own(id)?.kind==='unit').map(id=>message.action==='group-resupply'?game.requestResupply(own(id)):game.unloadTransport(own(id))).some(Boolean);
    case 'ability': return point() && game.castAbility(message.x, message.y, side);
    case 'satellite': return game.activateSatellite(side);
    case 'cyber': return game.launchCyber(side);
    case 'move':
    case 'stop': {
      if (!selected.length || message.action === 'move' && !point()) return false;
      const saved = game.selected; game.selected = selected; game.orderMode = message.mode === 'patrol' ? 'patrol' : null;
      try { if (message.action === 'stop') game.stopSelected(side); else game.command(message.x, message.y, message.attackMove === true, side); }
      finally { game.selected = saved; game.orderMode = null; }
      return true;
    }
    default: return false;
  }
}
