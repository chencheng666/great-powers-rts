export function shipWakePose(x, y, heading, stern, beam = 22) {
  const length = Math.max(36, Math.min(100, stern * .7));
  const width = Math.max(14, Math.min(42, beam * .85));
  const offset = stern + length * .45;
  return { x: x - Math.cos(heading) * offset, y: y - Math.sin(heading) * offset, rotation: -heading, length, width };
}

export function paintShipWake(ctx) {
  ctx.clearRect(0, 0, 256, 128);
  // 船艉窄、远端宽的双侧泡沫，不再用烟雾圆斑代表水花。
  const fade = ctx.createLinearGradient(0, 0, 256, 0);
  fade.addColorStop(0, 'rgba(220,239,235,0)');
  fade.addColorStop(.35, 'rgba(220,239,235,.25)');
  fade.addColorStop(.85, 'rgba(238,249,244,.85)');
  fade.addColorStop(1, 'rgba(238,249,244,0)');
  ctx.strokeStyle = fade; ctx.lineCap = 'round';
  for (const side of [-1, 1]) for (let lane = 0; lane < 3; lane++) {
    ctx.lineWidth = 4 - lane;
    ctx.beginPath(); ctx.moveTo(250, 64 + side * (5 + lane * 3));
    ctx.quadraticCurveTo(130, 64 + side * (18 + lane * 4), 0, 64 + side * (46 + lane * 5)); ctx.stroke();
  }
}
