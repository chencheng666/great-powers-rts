import { DETERRENCE } from './deterrence-rules.js';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 弹道只用于游戏可读性，不代表现实武器的飞行参数或制导算法。
export function projectileFlightPose(p) {
  const span = Math.max(1, Math.hypot(p.toX - p.startX, p.toY - p.startY));
  const progress = clamp(Math.hypot(p.x - p.startX, p.y - p.startY) / span, 0, 1);
  if (p.flightRole === 'sub-launched') {
    if (p.age < .85) return {height:-10 + Math.max(0,p.age)/.85*70,pitch:Math.PI/2};
    const t=clamp((p.age-.85)/.65,0,1),blend=t*t*(3-2*t);
    return {height:60 + (12-60)*progress + Math.sin(progress*Math.PI)*18,pitch:Math.PI/2*(1-blend)+Math.atan2(-48+18*Math.PI*Math.cos(progress*Math.PI),span)*blend};
  }
  if (p.kind === 'nuclear') {const t=clamp(p.age/DETERRENCE.flight,0,1);return {height:20+Math.sin(t*Math.PI)*650,pitch:Math.atan2(650*Math.PI*Math.cos(t*Math.PI),span)};}
  if (p.kind === 'ballistic') return { height: 20 + Math.sin(progress * Math.PI) * 420, pitch: Math.atan2(420 * Math.PI * Math.cos(progress * Math.PI), span) };
  if (p.kind === 'rocket') {
    // 齐射各弹保留同一权威落点，只在画面上错开弧高，便于看清多管弹道。
    const loft = 135 + ((p.id ?? 0) % 4) * 15;
    return { height: 22 + Math.sin(progress * Math.PI) * loft, pitch: Math.atan2(loft * Math.PI * Math.cos(progress * Math.PI), span) };
  }
  if (p.kind === 'bomb' && p.fallDuration) return { height: 4 + (p.sourceHeight ?? 95) * (1 - clamp(p.age / p.fallDuration, 0, 1) ** 2), pitch: -Math.PI / 2 };
  if (p.kind === 'bomb') return { height: 95 * (1 - progress) + 4, pitch: Math.atan2(-95, span) };
  if (p.kind === 'torpedo') return { height: 2, pitch: 0 };
  if (p.kind === 'wing') return { height: 88, pitch: 0 };
  const start = p.sourceHeight ?? 30, end = p.targetHeight ?? 12;
  const loft = p.kind === 'missile' ? p.flightRole === 'air-to-air' ? 6 : p.flightRole === 'air-to-ground' ? 18 : 55 : 18;
  return { height: start + (end - start) * progress + Math.sin(progress * Math.PI) * loft,
    pitch: Math.atan2(end - start + loft * Math.PI * Math.cos(progress * Math.PI), span) };
}

export function turnToward(current, target, maxTurn) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + clamp(delta, -maxTurn, maxTurn);
}
