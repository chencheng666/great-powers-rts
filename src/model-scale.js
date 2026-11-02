// 现代陆空装备按模型包围盒统一尺度。比例是游戏美术基准，不是实物米制换算。
export const GROUND_MODEL_LENGTHS = Object.freeze({
  tank: 28, elite: 30, apc: 30, harvester: 32, aa: 30, ghost: 24,
  loiterer: 34, jammer: 30, laser: 30, rocket: 40, supply: 32,
  ballistic: 52, abm: 36, counterIntel: 36, railgun: 36, relay: 30,
});
export const LAND_AIRCRAFT_LENGTHS = Object.freeze({
  helicopter: 33.6, fighter: 56, strike: 56, bomber: 84,
  airlift: 224, freightPlane: 224, ewPlane: 56,
});
// 舰载机保持独立的甲板基准，不把陆地比例表套到舰载机上。
export const AIRCRAFT_LENGTHS = Object.freeze({
  ...Object.fromEntries(Object.entries(LAND_AIRCRAFT_LENGTHS).map(([type, length]) => [type, length * 1.5])),
  navalFighter: 84, navalStrike: 84,
});
export const aircraftGroundFactor = type => type === 'navalFighter' || type === 'navalStrike' ? 1 / 3 : 2 / 3;

export function airframeScale(type, modelLength, fallback) {
  return AIRCRAFT_LENGTHS[type] && modelLength > 0 ? AIRCRAFT_LENGTHS[type] / modelLength : fallback;
}
export function unitModelScale(type, size, fallback, future = false) {
  if (future) return fallback;
  if (['rifle', 'engineer', 'scout', 'evacuee'].includes(type)) return size.y > 0 ? 6.5 / size.y : fallback;
  if (GROUND_MODEL_LENGTHS[type]) return size.x > 0 ? GROUND_MODEL_LENGTHS[type] / size.x : fallback;
  return airframeScale(type, size.x, fallback);
}
export function flightScaleFactor(relativeHeight, type = 'fighter', cruiseHeight = 95) {
  const ground = aircraftGroundFactor(type), t = Math.max(0, Math.min(1, (relativeHeight - 12) / Math.max(1, cruiseHeight - 12)));
  return ground + (1 - ground) * t * t * (3 - 2 * t);
}

export function presentationRadius(type, fallback) {
  const length = GROUND_MODEL_LENGTHS[type];
  return length ? Math.max(12, length * .55) : ['rifle', 'engineer', 'scout', 'evacuee'].includes(type) ? 6 : fallback;
}
