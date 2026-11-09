import * as THREE from 'three';
import { craftedMaterial, mergeParts, roundedPart } from './model-craft.js';

export const AIR_DEFENSE_FACTIONS = ['china', 'russia', 'nato', 'asia', 'middleeast'];
// 参考车载防空的结构语言，原创简化轮廓，不以现实系统参数替代游戏平衡。
export function createAirDefense(faction, type = 'aa') {
  if (!AIR_DEFENSE_FACTIONS.includes(faction) || !['aa', 'abm'].includes(type)) throw new Error('未知防空模型');
  const root = new THREE.Group(); root.name = `${type}_${faction}`;
  const colors = { china: '#728061', russia: '#65734f', nato: '#b3a284', asia: '#6c7e72', middleeast: '#a18e6b' };
  const armor = craftedMaterial('防空装甲涂层', colors[faction], 'armor', .78, .18);
  const dark = craftedMaterial('发射口与轮胎', '#202a29', 'rubber', .95, 0);
  const steel = craftedMaterial('发射架金属', '#76817a', 'coating', .56, .45);
  const glass = new THREE.MeshStandardMaterial({ name: '驾驶舱玻璃', color: '#2d4c56', roughness: .23, metalness: .25 });
  const team = new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#64d8e4', roughness: .6 });
  const box = (p, m, xyz, size, tilt = 0) => { const mesh = new THREE.Mesh(roundedPart(size, .045), m); mesh.position.set(...xyz); mesh.rotation.z = tilt; p.add(mesh); return mesh; };
  const tube = (p, m, a, b, radius) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), axis = to.clone().sub(from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, axis.length(), 10), m);
    mesh.position.copy(from.add(to).multiplyScalar(.5)); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()); p.add(mesh);
  };
  const body = new THREE.Group(); body.name = '多轴底盘'; root.add(body);
  const weapon = new THREE.Group(); weapon.name = 'weapon'; root.add(weapon);
  const barrel = new THREE.Group(); barrel.name = 'barrel'; weapon.add(barrel);
  const long = type === 'abm' || faction === 'russia';
  const length = long ? 7.6 : 6.8, cabin = length / 2 - 1;
  box(body, dark, [0, .92, 0], [length, .45, 2.2]);
  box(body, armor, [0, 1.25, 0], [length, .4, 2.4]);
  box(body, armor, [cabin, 1.98, 0], [1.95, 1.25, 2.35], -.06);
  box(body, glass, [cabin + .99, 2.2, 0], [.04, .5, 1.93], -.06);
  box(body, dark, [cabin + 1.02, 1.65, 0], [.04, .4, 1.3]);
  for (const side of [-1, 1]) {
    for (const x of [-length * .36, -length * .12, length * .12, length * .36]) {
      tube(body, dark, [x, .63, side * 1.05], [x, .63, side * 1.46], .59);
      tube(body, steel, [x, .63, side * 1.47], [x, .63, side * 1.49], .25);
      box(body, armor, [x, 1.3, side * 1.36], [1.13, .18, .35]);
    }
    box(body, glass, [cabin, 2.2, side * 1.19], [1.15, .49, .025]);
    box(body, team, [cabin, 1.73, side * 1.2], [.85, .18, .03]);
    box(body, steel, [cabin - .1, 1.25, side * 1.51], [1.2, .12, .22]);
    box(body, armor, [-.8, 1.69, side * .99], [1.3, .45, .35]);
    for (let i = 0; i < 5; i++) box(body, dark, [cabin + .15 - i * .19, 1.7, side * 1.22], [.07, .24, .025]);
  }
  box(weapon, steel, [-1.1, 1.65, 0], [3.5, .3, 1.8]);
  const vertical = faction === 'china' || faction === 'russia' || faction === 'asia';
  const tubes = type === 'abm' || faction === 'russia' ? 6 : 4;
  const launcher = new THREE.Group(); launcher.name = '发射筒组'; barrel.add(launcher);
  if (vertical) {
    for (let i = 0; i < tubes; i++) {
      const x = -2.45 + Math.floor(i / 2) * .72, z = i % 2 ? .48 : -.48;
      tube(launcher, armor, [x, 1.85, z], [x + .38, 4.55, z], .34);
      tube(launcher, dark, [x + .385, 4.56, z], [x + .4, 4.65, z], .30);
      for (const h of [.2, 1.35, 2.45]) tube(launcher, steel, [x + h * .14, 1.85 + h, z], [x + h * .14 + .014, 1.94 + h, z], .36);
    }
  } else {
    for (let i = 0; i < tubes; i++) {
      const z = (i % 2 ? .5 : -.5), x = -2.4 + Math.floor(i / 2) * .72;
      box(launcher, armor, [x + .6, 3.02, z], [3.3, .54, .58], .85);
      box(launcher, dark, [x + 1.7, 4.27, z], [.07, .43, .47], .85);
    }
  }
  const radar = new THREE.Group(); radar.name = 'air_defense_radar'; radar.position.set(.1, 3.05, 0); weapon.add(radar);
  tube(weapon, steel, [.1, 1.6, 0], [.1, 3.05, 0], .095);
  const arrayWidth = faction === 'nato' ? 2.05 : faction === 'middleeast' ? 1.9 : 1.65;
  box(radar, armor, [0, .25, 0], [.23, 1.05, arrayWidth], -.15);
  box(radar, dark, [.14, .25, 0], [.035, .87, arrayWidth - .18], -.15);
  for (const z of [-.48, 0, .48]) box(radar, steel, [.17, .25, z], [.025, .78, .035], -.15);
  mergeParts(root);
  const tip = new THREE.Object3D(); tip.name = 'open_asset_muzzle'; tip.position.set(vertical ? -1.35 : -.7, 4.65, 0); barrel.add(tip);
  root.userData.airDefenseDesign = { faction, type, tubes, vertical, axles: 4 };
  return root;
}
