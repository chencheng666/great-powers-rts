import * as THREE from 'three';
import { UNITS } from './data.js';
import { mergeParts } from './model-craft.js';

const clamp = v => Math.max(0, Math.min(1, v));
export function damagePresentation(entity) {
  const tags = UNITS[entity.type]?.tags || [], ratio = clamp(entity.hp / Math.max(1, entity.maxHp));
  const structural = entity.kind === 'building' || !tags.includes('infantry');
  const stage = structural && entity.hp > 0 ? ratio < .3 ? 2 : ratio < .65 ? 1 : 0 : 0;
  return { stage, smoke: stage > 0 && !tags.includes('submerged'), fire: stage === 2,
    interval: stage === 2 ? .28 : .7, smokeSize: entity.kind === 'building' ? stage === 2 ? 38 : 25 : tags.includes('ship') ? 30 : 20 };
}

export function damagedMaterial(source, stage) {
  if (!stage || !source.isMeshStandardMaterial || source.transparent || source.colorWrite === false || source.name === '阵营标识') return source;
  const material = source.clone(); material.color.lerp(new THREE.Color('#343735'), stage === 2 ? .44 : .19);
  material.roughness = Math.min(1, source.roughness + .12);
  // 克隆时保留磨损、轮廓补光等自定义着色，不影响公共素材库。
  material.onBeforeCompile = source.onBeforeCompile;
  material.customProgramCacheKey = () => `${source.customProgramCacheKey()}:损伤:${stage}`;
  return material;
}

export function structuralDamage(model, track = x => x) {
  const root = new THREE.Group(); root.name = '结构毁损';
  const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const char = track(new THREE.MeshStandardMaterial({ name: '破损结构', color: '#252b2b', roughness: .96, metalness: .25 }));
  const parts = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x * .075, size.y * .055, size.z * .075), char);
    mesh.position.set(center.x + size.x * ((i % 3 - 1) * .19), box.max.y + size.y * .012, center.z + size.z * (i < 3 ? -.17 : .17));
    mesh.rotation.set(.2 + i * .12, i * 1.7, .15 + i * .11); mesh.castShadow = true; parts.add(mesh);
  }
  const merged = mergeParts(parts); merged.traverse(m => { if (m.isMesh) track(m.geometry); }); root.add(merged); root.visible = false; model.add(root); return root;
}

export function confirmedShipLoss(entry, game) {
  if (!entry.model.visible || !UNITS[entry.entity.type]?.tags.includes('ship') || UNITS[entry.entity.type]?.tags.includes('submerged')) return false;
  if (!game.isVisibleFor(0, entry.entity.x, entry.entity.y)) return false;
  return entry.entity.hp <= 0 || game.effects.some(e => e.type === 'explosion' && e.targetType === entry.entity.type &&
    e.age <= .8 && Math.hypot(e.x - entry.entity.x, e.y - entry.entity.y) < 45);
}

export function sinkingPose(age, hullHeight) {
  const t = clamp(age / 7.5), ease = t * t * (3 - 2 * t);
  return { roll: .42 * ease, pitch: -.16 * ease, depth: (Math.max(18, hullHeight) + 16) * ease, complete: age >= 7.5 };
}
