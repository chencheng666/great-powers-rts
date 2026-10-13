// 原创简化模型的展示姿态，不改变射线、弹道或命中规则。
export function animateIdleGun(entry, animation, dt) {
  const barrel = entry.barrel, recoil = -.32 * (animation.recoil || 0);
  if (entry.model.name !== 'tank_china') { barrel.position.x = recoil; return; }
  const unit = entry.entity;
  const idle = animation.speed < .1 && !unit.targetId && !['attack','attackMove','patrol','move'].includes(unit.order?.type) && (animation.recoil || 0) < .01;
  const target = idle ? Math.PI / 60 : 0; // 3°为游戏化待机表现，不代表实装参数。
  entry.idleGunPitch ??= 0;
  entry.idleGunPitch += (target - entry.idleGunPitch) * (1 - Math.exp(-Math.max(0, dt) * 12));
  const a = entry.idleGunPitch, x = 1.45, y = 2.13;
  // 已合批炮管以模型原点为局部原点；绕炮根旋转，保留沿X的后坐。
  barrel.rotation.z = a;
  barrel.position.set(x * (1 - Math.cos(a)) + y * Math.sin(a) + recoil, y * (1 - Math.cos(a)) - x * Math.sin(a), 0);
}
