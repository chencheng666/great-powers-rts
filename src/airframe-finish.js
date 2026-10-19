import * as THREE from 'three';
import { surfaceMaps } from './model-craft.js';

const shells = new Set(['航空涂层', '装甲钢', '军用复合涂层', '分区蒙皮', '月表陶瓷装甲', '航天浅色合金']);

export function finishAirframe(model) {
  const materials = new Map();
  model.traverse(mesh => {
    if (!mesh.isMesh || Array.isArray(mesh.material) || !shells.has(mesh.material.name)) return;
    const source = mesh.material;
    if (!materials.has(source)) {
      const material = source.clone();
      Object.assign(material, surfaceMaps('aircraft'));
      material.roughness = .72; material.metalness = .32;
      material.normalScale.setScalar(.4); material.envMapIntensity = .75;
      materials.set(source, material);
    }
    mesh.material = materials.get(source);
    // 按表面主轴展开蒙皮，兼容旧 GLB 缺失或退化的 UV，而不增加每架飞机的绘制批次。
    const geometry = mesh.geometry.clone(), positions = geometry.attributes.position, normals = geometry.attributes.normal;
    const uv = new Float32Array(positions.count * 2);
    for (let i = 0; i < positions.count; i++) {
      const x = Math.abs(normals.getX(i)), y = Math.abs(normals.getY(i)), z = Math.abs(normals.getZ(i));
      uv[i * 2] = (x > y && x > z ? positions.getZ(i) : positions.getX(i)) / 4;
      uv[i * 2 + 1] = (y >= x && y >= z ? positions.getZ(i) : positions.getY(i)) / 4;
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    mesh.geometry = geometry;
  });
  model.userData.airframeFinish = '分区蒙皮、铆接、凹凸与粗糙度贴图';
  return model;
}
