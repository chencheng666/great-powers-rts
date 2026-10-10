import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const palettes = new Map();
function palette(center) {
  if (palettes.has(center)) return palettes.get(center);
  const radius = .572, straight = center * 2, arc = Math.PI * radius, circumference = straight * 2 + arc * 2;
  const count = Math.round(circumference / .24), frames = 64, samples = [], dummy = new THREE.Object3D();
  const at = length => {
    if (length < straight) return { x: -center + length, y: .62 + radius, angle: 0 };
    length -= straight;
    if (length < arc) { const angle = Math.PI / 2 - length / radius; return { x: center + Math.cos(angle) * radius, y: .62 + Math.sin(angle) * radius, angle: angle - Math.PI / 2 }; }
    length -= arc;
    if (length < straight) return { x: center - length, y: .62 - radius, angle: Math.PI };
    length -= straight;
    const angle = -Math.PI / 2 - length / radius;
    return { x: -center + Math.cos(angle) * radius, y: .62 + Math.sin(angle) * radius, angle: angle - Math.PI / 2 };
  };
  for (let frame = 0; frame < frames; frame++) {
    const matrices = new Float32Array(count * 16);
    for (let i = 0; i < count; i++) {
      const p = at(((i + frame / frames) / count * circumference) % circumference);
      dummy.position.set(p.x, p.y, 0); dummy.rotation.set(0, 0, p.angle); dummy.updateMatrix(); dummy.matrix.toArray(matrices, i * 16);
    }
    samples.push(matrices);
  }
  const result = { count, frames, samples, pitch: circumference / count }; palettes.set(center, result); return result;
}

export function createMovingTracks(center, steel, rubber) {
  const a = new THREE.BoxGeometry(.15, .035, .565), b = new THREE.BoxGeometry(.12, .052, .4), geometry = mergeGeometries([a, b], true); a.dispose(); b.dispose();
  const p = palette(center), group = new THREE.Group(); group.name = '循环履带';
  for (const side of [-1, 1]) {
    const mesh = new THREE.InstancedMesh(geometry, [steel, rubber], p.count); mesh.name = `track_belt_${side}`;
    mesh.position.z = side * 1.48; mesh.userData.trackCenter = center;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.instanceMatrix.array.set(p.samples[0]);
    mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingSphere(); group.add(mesh);
  }
  return group;
}

export function animateTracks(meshes, travel, turnTravel = 0) {
  for (const mesh of meshes) {
    const sideTravel = travel - (mesh.position.z < 0 ? -1 : 1) * turnTravel;
    const p = palette(mesh.userData.trackCenter), phase = Math.floor(((sideTravel / p.pitch % 1) + 1) % 1 * p.frames);
    if (mesh.userData.trackFrame === phase) continue;
    mesh.instanceMatrix.array.set(p.samples[phase]); mesh.instanceMatrix.needsUpdate = true; mesh.userData.trackFrame = phase;
  }
}
