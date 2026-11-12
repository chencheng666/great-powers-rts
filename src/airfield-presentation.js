import * as THREE from 'three';
import { mergeParts } from './model-craft.js';
import { runwayAircraft, AIRFIELD_LAYOUT, onAirfieldPavement } from './airfield-rules.js';
import { aircraftGroundFactor } from './model-scale.js';

const clamp = value => Math.max(0, Math.min(1, value));

export function fixedWingPresentation(type, future = false) {
  return runwayAircraft(type, future);
}

export function airfieldSurfaceHeight(game, entity, groundHeight) {
  const pavement = game.ownedBuildings?.(entity.owner, 'airfield').find(b => {
    const scale = b.size / 7.2;
    return onAirfieldPavement((entity.x - b.x) / scale, (entity.y - b.y) / scale);
  });
  return groundHeight + (pavement ? pavement.size / 7.2 * AIRFIELD_LAYOUT.pavementTop : 0);
}

export function aircraftGroundHeight(game, entity, entry, groundHeight) {
  const clearance = entry.model?.userData.groundClearance ?? entry.groundClearance;
  const offset = clearance === undefined ? 4 : Math.max(0, clearance) * entry.scale * aircraftGroundFactor(entity.type) + .2;
  return airfieldSurfaceHeight(game, entity, groundHeight) + offset;
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

export function fixedWingHeight(game, entity, entry, groundHeight, cruiseHeight, deckHeight) {
  if (!fixedWingPresentation(entity.type, game.map.future) || entity.deckApproach || entity.embarkedIn) return null;
  const grounded = game.aircraftGrounded(entity);
  // 所有机型都须站在铺装表面上，不能仅为带起落架细节的机型抬高。
  const groundOffset = aircraftGroundHeight(game, entity, entry, groundHeight) - groundHeight;
  if (entity.deployment) {
    // 起飞队列已经接管离场，清掉停机标记，避免离开队列后再次从地面起飞。
    entry.wasGrounded = false; entry.takeoffOrigin = null;
    const travel = Math.hypot(entity.x - entity.deployment.fromX, entity.y - entity.deployment.fromY);
    const fraction = clamp((travel - 45) / 110);
    const start = deckHeight ?? (groundHeight + groundOffset);
    return { height: start + (cruiseHeight - start) * fraction, pitch: fraction > 0 && fraction < 1 ? .08 : 0 };
  }
  if (entry.wasGrounded && !grounded) entry.takeoffOrigin = { x: entity.x, y: entity.y };
  entry.wasGrounded = grounded;
  if (grounded) { entry.takeoffOrigin = null; return { height: groundHeight + groundOffset, pitch: 0 }; }
  if (entry.takeoffOrigin) {
    const travel = Math.hypot(entity.x - entry.takeoffOrigin.x, entity.y - entry.takeoffOrigin.y), fraction = clamp((travel - 22) / 180);
    if (fraction >= 1) entry.takeoffOrigin = null;
    return { height: groundHeight + groundOffset + (cruiseHeight - groundHeight - groundOffset) * fraction, pitch: fraction > 0 && fraction < 1 ? .08 : 0 };
  }
  if (entity.order?.type !== 'rearm' || entity.homeCarrierId) return null;
  const homes = game.ownedBuildings(entity.owner, 'airfield');
  const home = homes.find(b => b.id === (entity.airfieldOps?.homeId ?? entity.order.homeId)) || homes.sort((a, b) => Math.hypot(a.x - entity.x, a.y - entity.y) - Math.hypot(b.x - entity.x, b.y - entity.y))[0];
  if (!home) return null;
  const profile = glideProfile(Math.hypot(home.x - entity.x, home.y - entity.y), home.size * .55 + 24);
  return { height: groundHeight + groundOffset + (cruiseHeight - groundHeight - groundOffset) * profile.fraction, pitch: profile.pitch };
}

export function refineAirfieldRunway(model) {
  if (model.userData.runwayVersion) return model;
  const runway = new THREE.Group(); runway.name = '固定翼跑道';
  const pavement = new THREE.MeshStandardMaterial({ name: '跑道沥青', color: '#303b40', roughness: .96 });
  const apron = new THREE.MeshStandardMaterial({ name: '机坪混凝土', color: '#636c67', roughness: .96 });
  const white = new THREE.MeshStandardMaterial({ name: '跑道标线', color: '#e2e7df', roughness: .85 });
  const yellow = new THREE.MeshStandardMaterial({ name: '滑行引导线', color: '#d8bb62', roughness: .85 });
  const light = new THREE.MeshStandardMaterial({ name: '跑道边灯', color: '#9cd8eb', emissive: '#9cd8eb', emissiveIntensity: .5 });
  const part = (material, size, position, angle = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size, Math.max(1, Math.ceil(size[0] * 2)), 1, Math.max(1, Math.ceil(size[2] * 2))), material); mesh.position.set(...position); mesh.rotation.y = angle;
    mesh.receiveShadow = true; runway.add(mesh);
  };
  // 延长独立跑道，六个机位和滑行连接仍使用原有调度坐标。
  part(pavement, [25.2, .05, 2.4], [0, .035, 2.1]);
  part(apron, [14.4, .05, 9.4], [0, .035, 8.9]);
  part(apron, [14.4, .05, 1.1], [0, .035, 3.7]);
  part(apron, [9.4, .05, 5.6], [0, .035, -1.7]);
  for (const x of [-5.625, 0, 5.625]) for (const z of [7.05, 12.4]) {
    part(yellow, [2.7, .008, .06], [x, .068, z], Math.PI / 4);
    part(yellow, [.06, .008, 2.7], [x, .068, z], Math.PI / 4);
  }
  for (const z of [1.04, 3.16]) part(white, [24.4, .008, .045], [0, .068, z]);
  for (let x = -10.8; x <= 10.8; x += 1.35) part(white, [.65, .008, .07], [x, .069, 2.1]);
  for (const x of [-11.6, 11.6]) for (const z of [1.35, 1.65, 2.55, 2.85]) part(white, [.8, .008, .16], [x, .069, z]);
  part(yellow, [13.4, .008, .055], [0, .068, 4.25]);
  for (let x = -12; x <= 12; x += 1.6) for (const z of [.86, 3.34]) part(light, [.07, .04, .07], [x, .07, z]);
  model.add(mergeParts(runway)); model.userData.runwayVersion = 2; return model;
}

export function groundAirfieldPavement(model, home, elevation, track = () => {}) {
  const runway = model.getObjectByName('固定翼跑道');
  if (!runway || runway.userData.grounded) return 0;
  const scale = home.size / 7.2, base = elevation(home.x, home.y);
  let vertices = 0;
  runway.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = mesh.geometry.clone(), positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = home.x + positions.getX(i) * scale, z = home.y + positions.getZ(i) * scale;
      positions.setY(i, positions.getY(i) + (elevation(x, z) - base) / scale);
    }
    positions.needsUpdate = true; geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    mesh.geometry = geometry; track(geometry); vertices += positions.count;
  });
  runway.userData.grounded = true; return vertices;
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
