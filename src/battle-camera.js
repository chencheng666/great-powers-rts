export const BATTLE_VIEWS = Object.freeze({ tactical: Math.atan2(1700, 1190), immersive: Math.PI * 38 / 180 });
export const battleElevation = mode => BATTLE_VIEWS[mode] ?? BATTLE_VIEWS.tactical;
