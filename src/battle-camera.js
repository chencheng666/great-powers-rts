export const BATTLE_VIEWS = Object.freeze({ tactical: Math.atan2(1700, 1190), immersive: Math.PI / 4 });
export const battleElevation = mode => BATTLE_VIEWS[mode] ?? BATTLE_VIEWS.tactical;
export const battleAzimuth = mode => mode === 'immersive' ? Math.PI / 6 : 0;

export function groundPan(dx, dy, zoom, elevation, azimuth = 0) {
  const x = dx / zoom, y = dy / zoom / Math.sin(elevation), c = Math.cos(azimuth), s = Math.sin(azimuth);
  return { x: x * c + y * s, y: y * c - x * s };
}

export function groundExtents(width, height, zoom, elevation, azimuth = 0) {
  const x = width / zoom / 2, y = height / zoom / Math.sin(elevation) / 2;
  const c = Math.abs(Math.cos(azimuth)), s = Math.abs(Math.sin(azimuth));
  return { x: x * c + y * s, y: y * c + x * s };
}
