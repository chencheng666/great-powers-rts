import { BUILDINGS, UNITS } from './data.js';

export const FRONTLINE_VERSION = 1;
export const FRONTLINE_BUILDINGS = ['refinery', 'airfield', 'dock', 'turret'];
export const FRONTLINE_PRODUCERS = ['refinery', 'airfield', 'dock'];
export const FRONTLINE_CAPACITY = { airfield: 6, dock: 6, carrier: 24 };
export const frontlineEnabled = game => game.frontlineVersion === FRONTLINE_VERSION;
export function reinforcementProducer(game, type) {
  const d = UNITS[type];
  if (!frontlineEnabled(game)) return d?.producer;
  return d?.tags.includes('deck') ? 'dock' : d?.tags.includes('ship') ? 'dock' : d?.tags.includes('air') ? 'airfield' : 'refinery';
}
export function frontlineBuilding(game, type) {
  const base = BUILDINGS[type];
  if (!frontlineEnabled(game)) return base;
  const overrides = {
    hq: { power:220, desc:'指挥前线增援、情报与战略支援。失去后不能扩建或申请新增援。自带220保障电力。' },
    refinery: { name:'后勤仓库', power:60, desc:'接收和储备物资，调入地面增援；提供维修、弹药和60保障电力。重装备通过运输机着陆交付，轻装备与人员伞降。' },
    airfield: { name:'空军基地', requires:'refinery', desc:'自带雷达和六个编制机位；接收后方调入飞机，负责停机、维修和补弹。出击仍占机位。' },
    dock: { name:'海军港口', requires:'refinery', desc:'六个舰艇编制泊位，接收外海增援，提供维修和补弹；舰艇出港仍占泊位。舰载机直接调往本方航母。' },
    turret: { requires:'refinery' }
  };
  return { ...base, ...overrides[type] };
}
// 游戏载重，不映射真实装备参数。旧规则和海运载重保持不变。
export function transportWeight(game, passenger, transport) {
  if (transport.type === 'carrier' || UNITS[passenger.type].tags.includes('infantry')) return 1;
  if (!frontlineEnabled(game) || transport.type !== 'airlift') return 4;
  return ['tank','rocket','ballistic','harvester'].includes(passenger.type) ? 8 : 8 / 3;
}
