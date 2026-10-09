import * as THREE from 'three';
import { mergeParts } from './model-craft.js';

export function refinePowerFans(model) {
  const metal = new THREE.MeshStandardMaterial({ name: '散热风扇金属', color: '#8c999c', roughness: .62, metalness: .48 });
  const dark = new THREE.MeshStandardMaterial({ name: '散热风道', color: '#243035', roughness: .87 });
  for (const x of [-1.65, 1.65]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.96, .12, 8, 32), metal); rim.rotation.x = Math.PI / 2; rim.position.set(x, 2.63, .5); model.add(rim);
    const well = new THREE.Mesh(new THREE.CylinderGeometry(.89, .89, .12, 24), dark); well.position.set(x, 2.56, .5); model.add(well);
    const fan = new THREE.Group(); fan.name = `facility_fan_${x}`; fan.position.set(x, 2.67, .5);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, .13, 16), metal); fan.add(hub);
    for (let i = 0; i < 5; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(.64, .055, .18), metal), angle = i * Math.PI * 2 / 5;
      blade.position.set(Math.cos(angle) * .49, 0, Math.sin(angle) * .49); blade.rotation.y = -angle + .2; fan.add(blade);
    }
    model.add(mergeParts(fan));
  }
  return model;
}

export function animateFacility(model, unit, game) {
  if (unit.kind !== 'building' || unit.hp <= 0) return;
  const powered = unit.type === 'power' || game.hasPower(unit.owner);
  model.traverse(node => {
    if (node.name === 'facility_radar') node.rotation.y = powered ? game.time * .7 : node.rotation.y;
    if (node.name.startsWith('facility_fan_')) node.rotation.y = game.time * 8;
  });
}

export function drawRepairBadge(ctx, point, time, waiting = false) {
  ctx.save(); ctx.globalAlpha = .75 + Math.sin(time * 4) * .2;
  ctx.translate(point.x, point.y - 22);
  ctx.fillStyle = '#0e242be6'; ctx.strokeStyle = waiting ? '#efc573' : '#9af0cd'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = waiting ? '#efc573' : '#9af0cd'; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // 开口钳口与斜柄组成完整扳手，不再使用难以识别的圆弧。
  ctx.beginPath(); ctx.moveTo(1, -8); ctx.lineTo(1, -3); ctx.lineTo(5, -1); ctx.lineTo(9, -3);
  ctx.lineTo(8, 2); ctx.lineTo(4, 4); ctx.lineTo(1, 3); ctx.lineTo(-5, 9); ctx.lineTo(-9, 5);
  ctx.lineTo(-3, -1); ctx.lineTo(-4, -4); ctx.lineTo(-2, -8); ctx.closePath(); ctx.stroke(); ctx.restore();
}
