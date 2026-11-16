import * as THREE from 'three';
import { OCEAN_LEVEL, OCEAN_MAX_WAVE_HEIGHT } from './ocean-motion.js';

export function createBattleFogGeometry(world, elevation, { water = false, mobile = false } = {}) {
  const geometry = new THREE.PlaneGeometry(world.width, world.height,
    Math.min(mobile ? 224 : 384, Math.ceil(world.width / (mobile ? 30 : 20))),
    Math.min(mobile ? 160 : 256, Math.ceil(world.height / (mobile ? 30 : 20))));
  geometry.rotateX(-Math.PI / 2); geometry.translate(world.width / 2, 0, world.height / 2);
  const position = geometry.attributes.position;
  // 海域的逻辑地形是海床；遮罩必须高于海浪峰值，否则会被写入深度的海面遮住。
  const seaTop = water ? OCEAN_LEVEL + OCEAN_MAX_WAVE_HEIGHT : -Infinity;
  for (let i = 0; i < position.count; i++) {
    position.setY(i, Math.max(elevation(position.getX(i), position.getZ(i)), seaTop) + 2);
  }
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  return geometry;
}
