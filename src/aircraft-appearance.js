import { UNITS } from './data.js';

// 锚点均在模型局部坐标内，缩放与侧倾后仍跟随喷口；旧模型按机体包围盒回退。
export function aircraftExhaustLayout(type, bounds, anchors) {
  if (!UNITS[type]?.tags.includes('jet') || ['airlift','freightPlane'].includes(type)) return [];
  if (anchors?.length) return anchors.map(([x,y,z,radius])=>({x,y,z,radius}));
  const length = bounds.max.x - bounds.min.x, width = bounds.max.z - bounds.min.z;
  const height = bounds.max.y - bounds.min.y;
  return [-1,1].map(side=>({x:bounds.min.x-length*.012,y:bounds.min.y+height*.3,z:(bounds.min.z+bounds.max.z)/2+side*width*.075,radius:Math.max(.06,width*.038)}));
}

export function aircraftExhaustState(unit, grounded, time) {
  const visible = !grounded && !unit.embarkedIn && !(unit.stunUntil > time);
  const attacking = time - (unit.lastFireAt ?? -100) >= 0 && time - (unit.lastFireAt ?? -100) < 1.2;
  const throttle = unit.deployment ? 1 : attacking ? .85 : .5;
  return { visible, opacity: visible ? .3 + throttle*.35 : 0, length: .8 + throttle*.9 };
}

export function aircraftBankTarget(unit, turn, grounded, heightAboveSurface) {
  // 接地和低高度滑跑保持水平，避免机翼扎进停机坪；巡航仍可侧倾。
  if (grounded || unit.embarkedIn || heightAboveSurface < 12) return 0;
  const limit = unit.deckApproach ? .1 : ['bomber','airlift','freightPlane','ewPlane'].includes(unit.type) ? .22 : .4;
  return Math.max(-limit,Math.min(limit,turn*.9));
}
