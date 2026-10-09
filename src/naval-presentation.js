import * as THREE from 'three';
import { craftedMaterial, bodyLoft, mergeParts } from './model-craft.js';
import { UNITS } from './data.js';

const HULLS = {
  patrol: [-3.75, 4.1, 2.2, -.3, .6, .74],
  frigate: [-5.5, 5.85, 2.7, -.3, .6, .74],
  destroyer: [-7.4, 7.8, 3.4, -.3, .75, .89],
  destroyer_china: [-10, 10.5, 4, -.35, .9, 1.1],
  containerShip: [-10, 10.4, 4.6, -.55, .9, 1.08],
  carrier: [-10.8, 11.8, 4.2, -.4, .9, .9]
};
const OLD_HULLS = new Set(['舰船船体', '舰船主甲板', '隐身舰艏船体', '主甲板', '驱逐舰船体', '驱逐舰主甲板', '集装箱船体', '货运甲板', '航母船体']);
export const replacedNavalPart = (model, part) => !!HULLS[model] && OLD_HULLS.has(part.replace(/\.\d+$/, ''));

export function hullOutline(stern, bow, width, inset = 0) {
  const half = width / 2 - inset, back = stern + inset, tip = bow - inset, length = tip - back;
  const s = new THREE.Shape();
  s.moveTo(back, -half * .78);
  s.quadraticCurveTo(back, -half, back + length * .09, -half);
  s.bezierCurveTo(back + length * .35, -half, tip - length * .25, -half, tip - length * .12, -half * .58);
  s.quadraticCurveTo(tip - length * .025, -half * .22, tip, 0);
  s.quadraticCurveTo(tip - length * .025, half * .22, tip - length * .12, half * .58);
  s.bezierCurveTo(tip - length * .25, half, back + length * .35, half, back + length * .09, half);
  s.quadraticCurveTo(back, half, back, half * .78); s.closePath();
  return s;
}

export function refineNavalHull(model, name) {
  if (!HULLS[name]) return model;
  const [stern, bow, width, bottom, top, deck] = HULLS[name], group = new THREE.Group(); group.name = '连续曲面舰体';
  const shell = craftedMaterial('海军船壳', '#89979f', 'coating', .65, .34);
  const plate = craftedMaterial('海军甲板', '#58656c', 'coating', .84, .18);
  const add = (inset, low, high, material) => {
    const g = new THREE.ExtrudeGeometry(hullOutline(stern, bow, width, inset), { depth: high - low, bevelEnabled: true, bevelThickness: .025, bevelSize: .055, bevelSegments: 3, steps: 1, curveSegments: 18 });
    g.rotateX(-Math.PI / 2); g.translate(0, low, 0);
    group.add(new THREE.Mesh(g, material));
  };
  add(0, bottom, top, shell);
  // 航母保留斜角飞行甲板，只有水线船壳采用连续曲面。
  if (name !== 'carrier') add(.1, top, deck, plate);
  model.add(mergeParts(group)); model.userData.navalHullVersion = 1; return model;
}

export function refineTransportBody(model) {
  if (!['airlift', 'freightPlane'].includes(model.name)) return model;
  const g = bodyLoft([[-7.2, .15, .2], [-6, .6, .75], [-4, 1.05, 1.35], [-1, 1.3, 1.6], [2.8, 1.25, 1.5], [4.9, .82, 1.05], [6.2, .42, .55], [7.2, .07, .12]], 32);
  g.rotateZ(-Math.PI / 2); g.translate(0, 1.2, 0);
  const body = new THREE.Mesh(g, craftedMaterial('运输机航空涂层', '#929fa2', 'coating', .59, .22));
  body.name = '宽体运输机身'; body.castShadow = body.receiveShadow = true; model.add(body);
  let team;
  const windows = [];
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.material.name === '阵营标识') team = mesh.material;
    if (mesh.material.name === '玻璃') windows.push(mesh);
  });
  // 加宽机身后同步抬高驾驶舱、外移识别带，避免原细节被新机体覆盖。
  for (const window of windows) {
    window.geometry = window.geometry.clone().translate(0, .35, 0);
    const glass = window.geometry.clone(); glass.computeBoundingBox();
    const center = glass.boundingBox.getCenter(new THREE.Vector3());
    glass.translate(-center.x, -center.y, -center.z); glass.scale(.96, .96, .96); glass.translate(center.x, center.y, center.z);
    const interior = new THREE.Mesh(glass, new THREE.MeshStandardMaterial({ name: '运输机驾驶舱内部', color: '#22313b', roughness: .66 }));
    model.add(interior);
  }
  team ||= new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#59d7ec', roughness: .55 });
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.6, .17, .035), team); band.position.set(.2, 1.52, side * 1.59); model.add(band);
  }
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(1.8, .03, .22), team); dorsal.position.set(.2, 2.52, 0); model.add(dorsal);
  model.userData.transportBodyVersion = 1; return model;
}

export function submarinePose(game, unit, now = 0) {
  const surfaced = game.submarineSurfaced(unit);
  const detected = surfaced || (unit.exposedUntil || 0) > game.time || game.activeUnits(1 - unit.owner).some(u => UNITS[u.type].sonar && Math.hypot(u.x - unit.x, u.y - unit.y) <= UNITS[u.type].sonar);
  return { surfaced, detected, height: surfaced || detected ? -.8 + Math.sin(now * .002 + unit.id) * .2 : -7.5, verticalScale: surfaced || detected ? 1 : .16 };
}
