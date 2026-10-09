import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function personnelLOD(source, track = value => value) {
  const material = track(new THREE.MeshStandardMaterial({ name: '远景人物合批', vertexColors: true, roughness: .83, metalness: .05 }));
  // 保留腰、持枪和腿膝关节，仅把远景难以辨认的材质分组合并。
  const copy = node => {
    const group = new THREE.Group(); group.name = node.name;
    group.position.copy(node.position); group.quaternion.copy(node.quaternion); group.scale.copy(node.scale);
    const pieces = [];
    for (const child of node.children) {
      if (!child.isMesh) { group.add(copy(child)); continue; }
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone(); child.updateMatrix(); geometry.applyMatrix4(child.matrix);
      const color = child.material.color, values = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(values, 3)); pieces.push(geometry);
    }
    if (pieces.length) { const mesh = new THREE.Mesh(track(mergeGeometries(pieces, false)), material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); pieces.forEach(g => g.dispose()); }
    return group;
  };
  const result = copy(source); result.scale.setScalar(1); result.name = 'personnel_lod'; return result;
}

export function syncPersonnelLOD(entry, distant) {
  if (!entry.personnelLOD) return;
  for (const child of entry.model.children) child.visible = child === entry.personnelLOD ? distant : !distant;
  if (!distant) return;
  for (const [source, target] of entry.lodJoints) { target.position.copy(source.position); target.quaternion.copy(source.quaternion); }
}
