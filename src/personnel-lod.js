import * as THREE from 'three';
import { createPersonnel } from './personnel-models.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function personnelLOD(source, track = value => value) {
  const material = track(new THREE.MeshStandardMaterial({ name: '远景人物合批', vertexColors: true, roughness: .83, metalness: .05 }));
  // 同一套人物配件与关节使用低分段几何，远景不用近景的细密曲面。
  const palette = new Map();
  source.traverse(mesh => {
    if (!mesh.isMesh) return;
    const color=mesh.material.color.clone(),map=mesh.material.map;
    if(map?.userData.surfaceKind==='uniform') {
      const data=map.image.data,total=data.length/4,channels=[0,0,0];
      for(let i=0;i<data.length;i+=4)for(let c=0;c<3;c++)channels[c]+=data[i+c];
      color.multiply(new THREE.Color(...channels.map(v=>v/total/255)).convertSRGBToLinear());
    }
    palette.set(mesh.material.name,color);
  });
  const distant = createPersonnel(source.name, { distant: true });
  const copy = node => {
    const group = new THREE.Group(); group.name = node.name;
    group.position.copy(node.position); group.quaternion.copy(node.quaternion); group.scale.copy(node.scale);
    const pieces = [];
    for (const child of node.children) {
      if (!child.isMesh) { group.add(copy(child)); continue; }
      const geometry = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone(); child.updateMatrix(); geometry.applyMatrix4(child.matrix);
      const color = palette.get(child.material.name) || child.material.color, values = new Float32Array(geometry.attributes.position.count * 3);
      for (let i = 0; i < values.length; i += 3) { values[i] = color.r; values[i + 1] = color.g; values[i + 2] = color.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(values, 3)); pieces.push(geometry);
    }
    if (pieces.length) { const mesh = new THREE.Mesh(track(mergeGeometries(pieces, false)), material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); pieces.forEach(g => g.dispose()); }
    return group;
  };
  const result = copy(distant);
  const materials = new Set(); distant.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); materials.add(mesh.material); } });
  materials.forEach(material => material.dispose());
  result.scale.setScalar(1); result.name = 'personnel_lod'; return result;
}

export function syncPersonnelLOD(entry, distant) {
  if (!entry.personnelLOD) return;
  for (const child of entry.model.children) child.visible = child === entry.personnelLOD ? distant : !distant;
  if (!distant) return;
  for (const [source, target] of entry.lodJoints) { target.position.copy(source.position); target.quaternion.copy(source.quaternion); }
}
