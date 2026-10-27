import { UNITS } from './data.js';
import { unlimitedAmmo } from './commander-sandbox.js';
import { weaponsHeld } from './combat-stance.js';
import { emitBattleSound } from './battle-sound.js';
import { battleMetric } from './battle-report.js';

export const CARRIER_DEFENSE = Object.freeze({ capacity: 12, range: 280, interval: .65, damage: 22, reload: 1.2, cost: 8 });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export function updateCarrierDefense(game, carrier, dt) {
  const r = CARRIER_DEFENSE;
  carrier.defenseAmmo ??= r.capacity; carrier.defenseReadyAt ??= 0; carrier.defenseReload ??= 0;
  if (carrier.hp <= 0 || carrier.embarkedIn) return;
  const home = game.ownedBuildings(carrier.owner, 'dock').find(b => distance(carrier, game.navalGoal(b.x,b.y,102)) <= 115 || distance(carrier,game.shipBerth(carrier,b)) <= 95);
  if (home && game.serviceReady(carrier) && game.hasPower(carrier.owner) && carrier.defenseAmmo < r.capacity) {
    carrier.defenseReload = Math.min(r.reload * 2, carrier.defenseReload + dt);
    while (carrier.defenseReload >= r.reload && carrier.defenseAmmo < r.capacity && game.players[carrier.owner].credits >= r.cost) {
      carrier.defenseAmmo++; carrier.defenseReload -= r.reload; game.players[carrier.owner].credits -= r.cost;
      battleMetric(game,carrier.owner,'portAmmoCost',r.cost);
    }
  }
  if (weaponsHeld(carrier) || game.time < carrier.stunUntil || carrier.ewSuppressedUntil > game.time || game.time < carrier.defenseReadyAt || !carrier.defenseAmmo && !unlimitedAmmo(game,carrier)) return;
  const incoming = game.projectiles.filter(p => p.hp > 0 && !p.finished && p.owner !== carrier.owner && ['missile','torpedo','wing','loitering'].includes(p.kind) && distance(carrier,p) <= r.range && game.isVisibleFor(carrier.owner,p.x,p.y)).sort((a,b) => distance(carrier,a)-distance(carrier,b)||a.id-b.id)[0];
  const target = incoming || game.enemyUnits(carrier.owner).filter(u => UNITS[u.type].tags.includes('air') && !game.aircraftGrounded(u) && distance(carrier,u) <= r.range && game.canSeeEntity(carrier.owner,u)).sort((a,b)=>distance(carrier,a)-distance(carrier,b)||a.id-b.id)[0];
  if (!target) return;
  if (!unlimitedAmmo(game,carrier)) carrier.defenseAmmo--;
  carrier.defenseReadyAt = game.time + r.interval;
  if (incoming) {
    incoming.hp -= r.damage;
    game.effects.push({type:'shot',style:incoming.kind==='torpedo'?'antiSub':'aa',sourceId:carrier.id,sourceType:'carrier',targetType:incoming.kind==='torpedo'?'submarine':'drone',x:carrier.x,y:carrier.y,toX:incoming.x,toY:incoming.y,age:0,duration:.25,owner:carrier.owner});
    emitBattleSound(game,incoming.kind==='torpedo'?'antiSub':'aa',carrier,'launch',{sourceId:carrier.id});
  } else game.fire(carrier,target,r.damage,'aa');
}
