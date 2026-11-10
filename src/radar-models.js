import * as THREE from 'three';
import { craftedMaterial, mergeParts } from './model-craft.js';

// 使用原创阵列结构表达军用预警设备，不照搬图片中的商标或现实性能。
export function createRadarArray(width = 3.6, height = 2.1, columns = 12, rows = 7) {
  const group = new THREE.Group(); group.name = '相控阵预警天线';
  const shell = craftedMaterial('雷达防护边框', '#657764', 'coating', .7, .3);
  const face = craftedMaterial('雷达阵面', '#273d38', 'coating', .8, .15);
  const cells = craftedMaterial('雷达收发单元', '#b4b88d', 'coating', .6, .35);
  const steel = craftedMaterial('雷达背部支撑', '#88958b', 'coating', .55, .5);
  const box = (size, position, material, tilt = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position); mesh.rotation.z = tilt; group.add(mesh);
  };
  box([.22, height + .16, width + .16], [0, 0, 0], shell);
  box([.035, height, width], [.13, 0, 0], face);
  for (let y = 0; y < rows; y++) for (let z = 0; z < columns; z++) {
    box([.035, height / rows * .56, width / columns * .58], [.16, (y + .5) * height / rows - height / 2, (z + .5) * width / columns - width / 2], cells);
  }
  for (const side of [-1, 1]) {
    box([.25, height * .84, .1], [-.28, 0, side * width * .31], steel);
    box([.8, .1, .12], [-.48, -height * .25, side * width * .31], steel, .65);
  }
  box([.8, .2, width * .7], [-.4, -height * .4, 0], shell);
  mergeParts(group); group.userData.radarCells = columns * rows; return group;
}

export function refineRadarStation(model) {
  const previous = model.getObjectByName('facility_radar');
  if (previous) previous.removeFromParent();
  const swivel = new THREE.Group(); swivel.name = 'facility_radar'; swivel.position.set(0, 4.1, -.5);
  const array = createRadarArray(); array.rotation.z = -.18; swivel.add(array);
  model.add(swivel); model.userData.radarDesign = '军用旋转预警阵列'; return model;
}

export function weaponMountYaw(type, heading, aiming) {
  // 固定弹道发射车保持车体朝向，普通炮塔仍独立瞄准。
  return type === 'ballistic' ? 0 : heading - aiming;
}
