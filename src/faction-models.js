import * as THREE from 'three';
import { craftedMaterial, mergeParts, roundedPart } from './model-craft.js';
import { FACTION_DOCTRINES } from './faction-doctrine.js';

// 五套原创低模，保留 weapon、barrel、open_asset_muzzle 供转向、后坐和火口跟踪。
export function createFactionElite(faction) {
  if (!FACTION_DOCTRINES[faction]) throw new Error('未知阵营特色模型');
  const root = new THREE.Group(); root.name = `elite_${faction}`;
  root.userData.factionDesign = faction; root.userData.silhouette = FACTION_DOCTRINES[faction].silhouette;
  const colors = { china: '#73856c', russia: '#72785a', nato: '#afa58c', asia: '#6c7e89', middleeast: '#a49270' };
  const armor = craftedMaterial('装甲钢', colors[faction], 'armor', .77, .2);
  const dark = craftedMaterial('轮胎与发射口', '#202e31', 'rubber', .94, 0);
  const steel = craftedMaterial('武器框架', '#738083', 'coating', .56, .55);
  const team = new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#64d8e4', roughness: .6, emissive: '#64d8e4', emissiveIntensity: .1 });
  const body = new THREE.Group(); body.name = '底盘'; root.add(body);
  const weapon = new THREE.Group(); weapon.name = 'weapon'; root.add(weapon);
  const barrel = new THREE.Group(); barrel.name = 'barrel'; weapon.add(barrel);
  const box = (p, mat, pos, size, angle = 0) => { const m = new THREE.Mesh((mat === armor ? roundedPart(size, .07) : new THREE.BoxGeometry(...size)), mat); m.position.set(...pos); m.rotation.z = angle; p.add(m); return m; };
  const tube = (p, mat, from, to, r, sides = 8) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), sides), mat);
    m.position.copy(a.clone().add(b).multiplyScalar(.5)); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); p.add(m); return m;
  };
  const tracked = ['china', 'nato'].includes(faction), wide = faction === 'nato' ? 1.65 : 1.3;
  box(body, armor, [0, 1, 0], [5.6, .9, wide * 2]);
  box(body, armor, [1.5, 1.6, 0], [2.1, .55, wide * 1.65], -.14);
  // 发动机散热格栅、侧裙分块与储物件在远景合批，增加形状信息而不添加贴图请求。
  for (let i = 0; i < 6; i++) box(body, dark, [-1.8 + i * .24, 1.47, 0], [.11, .025, 1.35]);
  for (const side of [-1, 1]) {
    for (const x of [-1.7, -.65, .4, 1.45]) box(body, armor, [x, 1.28, side * (wide + .36)], [.9, .48, .08]);
    box(body, steel, [-2.3, 1.55, side * .7], [.58, .3, .45]);
    box(body, dark, [2.82, 1.35, side * .8], [.08, .26, .37]);
  }
  for (const side of [-1, 1]) {
    if (tracked) box(body, dark, [0, .55, side * wide], [5.6, 1.05, .5]);
    for (const x of (faction === 'russia' ? [-2, -.65, .65, 2] : [-1.85, 0, 1.85])) {
      tube(body, dark, [x, .58, side * (wide - .18)], [x, .58, side * (wide + .3)], .55, 10);
      tube(body, steel, [x, .58, side * (wide + .31)], [x, .58, side * (wide + .33)], .22, 8);
    }
    box(body, armor, [-.2, 1.15, side * (wide + .28)], [4.8, .45, .14]);
    box(body, team, [.5, 1.42, side * (wide + .37)], [1.7, .22, .025]);
    box(body, team, [2.8, 1.3, side * .8], [.03, .15, .25]);
  }
  let muzzle = [3.2, 2.1, 0];
  if (faction === 'china') {
    box(weapon, armor, [-.5, 1.85, 0], [2.5, .75, 2.1]);
    for (const side of [-1, 1]) for (const y of [2.12, 2.58]) {
      box(barrel, armor, [-.3, y, side * 1.05], [3.5, .4, .65], .14);
      box(barrel, dark, [1.44, y + .24, side * 1.05], [.04, .28, .5], .14);
    }
    tube(weapon, steel, [-1.1, 2.3, 0], [-1.1, 3.6, 0], .08);
    box(weapon, armor, [-1.1, 3.6, 0], [.2, .85, 1.85]);
    box(weapon, team, [-.98, 3.6, 0], [.025, .6, 1.5]);
    muzzle = [1.5, 2.6, 0];
  } else if (faction === 'russia') {
    box(body, armor, [1.7, 1.9, 0], [1.7, 1.1, 2.2]);
    for (const side of [-1, 1]) box(body, dark, [2.56, 2.08, side * .55], [.03, .38, .8]);
    box(weapon, steel, [-.8, 1.7, 0], [2.4, .35, 2.3]);
    for (const z of [-.84, -.28, .28, .84]) for (const y of [2.15, 2.73]) {
      tube(barrel, armor, [-2.4, y, z], [.9, y + .48, z], .27);
      tube(barrel, dark, [.91, y + .482, z], [.95, y + .49, z], .19);
    }
    muzzle = [.98, 2.65, 0];
  } else if (faction === 'nato') {
    box(weapon, armor, [-.2, 2, 0], [3.8, 1.1, 2.8]);
    for (const side of [-1, 1]) box(weapon, armor, [1.15, 2.15, side * .86], [1.5, .8, .85], -.16);
    box(weapon, steel, [-2.15, 2, 0], [.65, .75, 2.7]);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) tube(weapon, dark, [.2 - i * .22, 2.35, side * 1.5], [.35 - i * .22, 2.58, side * 1.72], .065);
      box(weapon, steel, [-1.5, 2.62, side * .65], [.65, .12, .5]);
    }
    tube(barrel, steel, [1.1, 2.2, 0], [5, 2.2, 0], .13, 12);
    tube(barrel, armor, [2.4, 2.2, 0], [3, 2.2, 0], .23, 12);
    box(weapon, team, [-.5, 2.57, 0], [1.1, .025, .45]);
    tube(weapon, steel, [-.6, 2.6, .7], [-.6, 3.1, .7], .05);
    box(weapon, dark, [-.3, 3.05, .7], [.8, .12, .15]); muzzle = [5.02, 2.2, 0];
  } else if (faction === 'asia') {
    box(weapon, armor, [-.45, 1.9, 0], [3.2, .75, 2.2]);
    for (const x of [-1.4, -.2, 1]) for (const side of [-1, 1]) {
      box(weapon, dark, [x, 2.45, side * .82], [.9, .25, .72]);
      box(weapon, armor, [x, 2.63, side * .82], [.7, .12, .52]);
      box(weapon, team, [x, 2.71, side * .82], [.45, .03, .09]);
    }
    tube(weapon, steel, [-2, 1.7, 0], [-2, 3.1, 0], .055);
    box(weapon, team, [-2, 3.1, 0], [.65, .15, .15]); muzzle = [1.55, 2.5, 0];
  } else {
    box(weapon, armor, [-.5, 1.95, 0], [3, 1.1, 1.8]);
    for (const x of [-1.3, .4]) {
      tube(weapon, steel, [x, 2.3, 0], [x, 3.4, 0], .09);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.7, .09, 6, 16), steel); ring.position.set(x, 3.25, 0); ring.rotation.y = Math.PI / 2; weapon.add(ring);
      tube(weapon, team, [x, 2.75, 0], [x, 3.75, 0], .065);
    }
    muzzle = [.6, 3.25, 0];
  }
  mergeParts(root);
  const tip = new THREE.Object3D(); tip.name = 'open_asset_muzzle'; tip.position.set(...muzzle); barrel.add(tip);
  return root;
}
