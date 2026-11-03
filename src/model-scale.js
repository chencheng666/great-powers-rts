// 现代陆空装备按模型包围盒统一尺度。比例是游戏美术基准，不是实物米制换算。
export const GROUND_MODEL_LENGTHS = Object.freeze({
  tank: 36, elite: 38.6, apc: 38.6, harvester: 41.1, aa: 38.6, ghost: 30.9,
  loiterer: 43.7, jammer: 38.6, laser: 38.6, rocket: 51.4, supply: 41.1,
  ballistic: 66.9, abm: 46.3, counterIntel: 46.3, railgun: 46.3, relay: 38.6,
});
// 人物以 1.75 米、坦克车高 2.4 米为相对基准。13.27 是当前 36 长度坦克的可见车高。
export const PERSONNEL_HEIGHT = 13.27 * 1.75 / 2.4;
export const LAND_AIRCRAFT_LENGTHS = Object.freeze({
  helicopter: 43.2, fighter: 72, strike: 72, bomber: 108,
  airlift: 144, freightPlane: 144, ewPlane: 72,
});
// 舰载机保持独立的甲板基准，不把陆地比例表套到舰载机上。
export const AIRCRAFT_LENGTHS = Object.freeze({
  ...Object.fromEntries(Object.entries(LAND_AIRCRAFT_LENGTHS).map(([type, length]) => [type, length * 1.25])),
  navalFighter: 84, navalStrike: 84,
});
export const aircraftGroundFactor = type => type === 'navalFighter' || type === 'navalStrike' ? 1 / 3 : .8;

export function aircraftCruiseHeight(type, tags = [], future = false, tandem = false) {
  const rotor = tandem || tags.includes('rotorcraft'), drone = tags.includes('drone');
  if (future) return rotor ? 45 : drone ? 23 : 95;
  if (rotor) return 42;
  if (drone) return 26;
  return ({ fighter: 80, strike: 78, ewPlane: 88, bomber: 100, airlift: 112, freightPlane: 112 })[type] || 95;
}

export function airframeScale(type, modelLength, fallback) {
  return AIRCRAFT_LENGTHS[type] && modelLength > 0 ? AIRCRAFT_LENGTHS[type] / modelLength : fallback;
}
export function unitModelScale(type, size, fallback, future = false) {
  if (future) return fallback;
  if (['rifle', 'engineer', 'scout', 'evacuee'].includes(type)) return size.y > 0 ? PERSONNEL_HEIGHT / size.y : fallback;
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
