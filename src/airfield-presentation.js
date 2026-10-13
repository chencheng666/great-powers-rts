import * as THREE from 'three';
import { UNITS } from './data.js';
import { mergeParts } from './model-craft.js';

const clamp = value => Math.max(0, Math.min(1, value));

export function fixedWingPresentation(type, future = false) {
  const tags = UNITS[type]?.tags || [];
  return !future && tags.includes('jet') && !tags.includes('logistics') && type !== 'airlift';
}

export function glideProfile(distance, groundRadius) {
  const fraction = clamp((distance - groundRadius) / 260);
  // 最后约 78 世界单位逐渐拉平，接地时回到水平；仅改变表现姿态。
  const smooth = value => value * value * (3 - 2 * value);
  let pitch = 0;
  if (fraction > 0 && fraction < .3) {
    const flare = smooth(clamp(fraction / .1));
    const descent = smooth(clamp((fraction - .1) / .2));
    pitch = .06 * flare * (1 - descent) - .07 * descent;
  } else if (fraction >= .3) pitch = -.07 * (1 - smooth(clamp((fraction - .85) / .15)));
  return { fraction, pitch: pitch || 0 };
}

export function fixedWingHeight(game, entity, entry, groundHeight, cruiseHeight) {
  if (!fixedWingPresentation(entity.type, game.map.future) || entity.deployment || entity.deckApproach || entity.embarkedIn) return null;
  const grounded = game.aircraftGrounded(entity);
  if (entry.wasGrounded && !grounded) entry.takeoffOrigin = { x: entity.x, y: entity.y };
  entry.wasGrounded = grounded;
  if (grounded) { entry.takeoffOrigin = null; return { height: groundHeight + 4, pitch: 0 }; }
  if (entry.takeoffOrigin) {
    const travel = Math.hypot(entity.x - entry.takeoffOrigin.x, entity.y - entry.takeoffOrigin.y), fraction = clamp((travel - 22) / 180);
    if (fraction >= 1) entry.takeoffOrigin = null;
    return { height: groundHeight + 4 + (cruiseHeight - groundHeight - 4) * fraction, pitch: fraction > 0 && fraction < 1 ? .08 : 0 };
  }
  if (entity.order?.type !== 'rearm' || entity.homeCarrierId) return null;
  const home = game.ownedBuildings(entity.owner, 'airfield').sort((a, b) => Math.hypot(a.x - entity.x, a.y - entity.y) - Math.hypot(b.x - entity.x, b.y - entity.y))[0];
  if (!home) return null;
  const profile = glideProfile(Math.hypot(home.x - entity.x, home.y - entity.y), home.size * .55 + 24);
  return { height: groundHeight + 4 + (cruiseHeight - groundHeight - 4) * profile.fraction, pitch: profile.pitch };
}

export function refineAirfieldRunway(model) {
  if (model.userData.runwayVersion) return model;
  const runway = new THREE.Group(); runway.name = '固定翼跑道';
  const pavement = new THREE.MeshStandardMaterial({ name: '跑道沥青', color: '#303b40', roughness: .96 });
  const white = new THREE.MeshStandardMaterial({ name: '跑道标线', color: '#e2e7df', roughness: .85 });
  const light = new THREE.MeshStandardMaterial({ name: '跑道边灯', color: '#9cd8eb', emissive: '#9cd8eb', emissiveIntensity: .5 });
  const part = (material, size, position) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...position);
    mesh.receiveShadow = true; runway.add(mesh);
  };
  // 沿原停机坪展开，不增加建造占地或改变飞机补给判定范围。
  part(pavement, [13.8, .07, 2.2], [0, .43, 2.1]);
  for (const z of [1.13, 3.07]) part(white, [13.2, .012, .04], [0, .475, z]);
  for (let x = -5.2; x <= 5.2; x += 1.3) part(white, [.62, .012, .06], [x, .479, 2.1]);
  for (const x of [-6.2, 6.2]) for (const z of [1.4, 1.68, 2.52, 2.8]) part(white, [.56, .012, .13], [x, .479, z]);
  for (let x = -6.4; x <= 6.4; x += 1.6) for (const z of [1.04, 3.16]) part(light, [.07, .04, .07], [x, .47, z]);
  model.add(mergeParts(runway)); model.userData.runwayVersion = 1; return model;
}

export function refineAircraftCanopy(model) {
  const windows = [];
  model.traverse(mesh => { if (mesh.isMesh && mesh.material.name === '玻璃') windows.push(mesh); });
  for (const mesh of windows) {
    mesh.material = new THREE.MeshPhysicalMaterial({ name: '航空座舱玻璃', color: '#bed9dc', roughness: .13, metalness: .08, transparent: true, opacity: .55, depthWrite: false, clearcoat: 1, clearcoatRoughness: .08 });
    mesh.castShadow = false;
  }
  if (!['fighter', 'strike'].includes(model.name) || !windows.length || model.userData.cockpitVersion) return model;
  const cockpit = new THREE.Group(); cockpit.name = '座舱内部';
  const dark = new THREE.MeshStandardMaterial({ name: '座舱仪表与座椅', color: '#192428', roughness: .8 });
  const helmet = new THREE.MeshStandardMaterial({ name: '飞行头盔', color: '#a5ada8', roughness: .65 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.18, .2, .2), dark); seat.position.set(1.05, .78, 0); cockpit.add(seat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.065, 12, 8), helmet); head.position.set(1.18, .88, 0); cockpit.add(head);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(.10, .10, .31), dark); panel.position.set(1.58, .78, 0); cockpit.add(panel);
  model.add(mergeParts(cockpit)); model.userData.cockpitVersion = 1; return model;
}
