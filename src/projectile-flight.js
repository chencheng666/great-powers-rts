const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 弹道只用于游戏可读性，不代表现实武器的飞行参数或制导算法。
export function projectileFlightPose(p) {
  const span = Math.max(1, Math.hypot(p.toX - p.startX, p.toY - p.startY));
  const progress = clamp(Math.hypot(p.x - p.startX, p.y - p.startY) / span, 0, 1);
  if (p.kind === 'rocket') return { height: 22 + Math.sin(progress * Math.PI) * 135, pitch: Math.atan2(135 * Math.PI * Math.cos(progress * Math.PI), span) };
  if (p.kind === 'bomb') return { height: 95 * (1 - progress) + 4, pitch: Math.atan2(-95, span) };
  if (p.kind === 'torpedo') return { height: 2, pitch: 0 };
  if (p.kind === 'wing') return { height: 88, pitch: 0 };
  const start = p.sourceHeight ?? 30, end = p.targetHeight ?? 12;
  const loft = p.kind === 'missile' ? 55 : 18;
  return { height: start + (end - start) * progress + Math.sin(progress * Math.PI) * loft,
    pitch: Math.atan2(end - start + loft * Math.PI * Math.cos(progress * Math.PI), span) };
}

export function turnToward(current, target, maxTurn) {
  const delta = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + clamp(delta, -maxTurn, maxTurn);
}
