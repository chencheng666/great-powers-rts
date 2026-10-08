import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lunarReliefGLSL } from './lunar-terrain.js';

export const COMMUNITY_3D_BUILDINGS = ['dock', 'radar', 'airfield', 'lab', 'super'];

export function conformGroundMark(material, game) {
  const water = game.map.water, barriers = game.map.future ? [] : game.map.barriers;
  const checks = [
    ...game.map.bridges.map(b => `if (p.x >= ${Number(water?.x1 ?? 1010).toFixed(1)} && p.x <= ${Number(water?.x2 ?? 1230).toFixed(1)} && p.y >= ${b.y1.toFixed(1)} && p.y <= ${b.y2.toFixed(1)}) return 28.2;`),
    ...(water ? [`if (p.x > ${water.x1.toFixed(1)} && p.x < ${water.x2.toFixed(1)}) return -13.8;`] : []),
    ...barriers.map(b => `if (p.x > ${b.x1.toFixed(1)} && p.x < ${b.x2.toFixed(1)} && p.y > ${b.y1.toFixed(1)} && p.y < ${b.y2.toFixed(1)}) return -26.8;`)
  ].join('\n');
  material.onBeforeCompile = shader => {
    shader.vertexShader = `${lunarReliefGLSL(game)}
    float craterElevation(vec2 p) {
      ${checks}
      float edge = min(p.x, ${game.world.width.toFixed(1)} - p.x);
      float road = clamp((abs(p.y - ${game.homeY.toFixed(1)}) - 70.0) / 150.0, 0.0, 1.0);
      float base = clamp((edge - 650.0) / 240.0, 0.0, 1.0);
      float rolling = sin(edge * .009) * cos(p.y * .008) * 2.4 + sin(p.y * .017 + edge * .006) * 1.1;
      float plateau = ${game.map.future ? '0.0' : '(1.0 + sin(edge * .004)) * (1.0 + cos(p.y * .006)) * 6.0'};
      return (rolling * ${game.map.future ? '1.4' : '1.0'} + plateau + ${game.map.future ? 'moonRelief(p)' : '0.0'}) * road * base + 1.2;
    }\n${shader.vertexShader}`.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 craterWorld = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        craterWorld = instanceMatrix * craterWorld;
      #endif
      craterWorld = modelMatrix * craterWorld;
      craterWorld.y = craterElevation(craterWorld.xz);
      gl_Position = projectionMatrix * viewMatrix * craterWorld;`);
  };
  material.customProgramCacheKey = () => `贴地焦痕:${game.mapId}:${game.world.width}:${game.homeY}`;
  return material;
}

export function refineFacility(model, type, weather = material => material) {
  const batches = new Map(), materials = {
    steel: new THREE.MeshStandardMaterial({ name: '浅色金属', color: '#84908a', roughness: .65, metalness: .55 }),
    dark: new THREE.MeshStandardMaterial({ name: '设备深灰', color: '#303b3b', roughness: .85 }),
    mark: new THREE.MeshStandardMaterial({ name: '安全标线', color: '#cab66b', roughness: .8 })
  };
  const part = (size, position, kind = 'steel', rotation = 0) => {
    const geometry = new THREE.BoxGeometry(...size); geometry.rotateZ(rotation); geometry.translate(...position);
    if (!batches.has(kind)) batches.set(kind, []); batches.get(kind).push(geometry);
  };
  if (type === 'airfield') {
    for (let x = -3.5; x <= 1.5; x += .5) part([.035, .06, 3.4], [x, 2.53, -1.3]);
    for (const x of [-2.8, -.6, 1.5]) {
      part([.75, .15, .55], [x, 2.65, -1.3], 'dark');
      for (let z = -1.5; z < -1.1; z += .1) part([.72, .035, .025], [x, 2.74, z]);
    }
    for (let x = -4; x <= 4; x += .8) part([.24, .02, .065], [x, .37, 1.9], 'mark');
    part([.08, .02, 2.5], [4.1, .37, 2], 'mark');
  } else if (type === 'radar') {
    for (const direction of [-1, 1]) for (let y = 1.8; y < 3.5; y += .55) part([.04, .95, .04], [direction * .3, y, -.5], 'steel', direction * .7);
    for (const x of [-1.6, 1.6]) {
      part([.8, .16, 1], [x, 1.56, -.4], 'dark');
      for (let z = -.8; z < .1; z += .15) part([.75, .03, .035], [x, 1.65, z]);
    }
  } else if (type === 'lab') {
    for (const z of [-1.4, 1.7]) for (const x of [-2, -.9, .2]) {
      part([.7, .12, .4], [x, 3.08, z], 'dark');
      part([.65, .035, .025], [x, 3.17, z], 'steel');
    }
    for (let x = -2.8; x < 2; x += .6) part([.06, .025, .2], [x, .4, 2.6], 'mark');
  } else if (type === 'super') {
    for (const x of [-2.7, 2.7]) for (let z = -2.8; z < 2; z += .6) part([.15, .025, .15], [x, .38, z], 'mark');
    for (const x of [-2.7, 2.7]) {
      part([.85, .12, .8], [x, 1.85, -2.4], 'dark');
      for (let z = -2.7; z < -2.1; z += .13) part([.8, .04, .03], [x, 1.94, z]);
    }
  }
  for (const [kind, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), weather(materials[kind]));
    mesh.castShadow = mesh.receiveShadow = true; model.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  return model;
}

export function createHarbor(weather = material => material) {
  const group = new THREE.Group(); group.name = 'dock';
  const materials = {
    concrete: new THREE.MeshStandardMaterial({ name: '混凝土', color: '#626960', roughness: .92 }),
    roof: new THREE.MeshStandardMaterial({ name: '屋顶', color: '#596354', roughness: .8, metalness: .25 }),
    panel: new THREE.MeshStandardMaterial({ name: '建筑面板', color: '#737d6c', roughness: .75, metalness: .3 }),
    steel: new THREE.MeshStandardMaterial({ name: '港机钢', color: '#869499', roughness: .55, metalness: .65 }),
    dark: new THREE.MeshStandardMaterial({ name: '港口橡胶', color: '#202930', roughness: .9 }),
    amber: new THREE.MeshStandardMaterial({ name: '安全黄', color: '#c5aa57', roughness: .65 }),
    team: new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#59d7ec', emissive: '#59d7ec', emissiveIntensity: .25 }),
    glass: new THREE.MeshStandardMaterial({ name: '港口玻璃', color: '#213e4a', roughness: .3, metalness: .55 })
  };
  const batches = new Map();
  const add = (geometry, position, kind, rotation = 0) => {
    geometry.rotateY(rotation); geometry.translate(...position);
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind).push(geometry);
  };
  const box = (size, position, kind) => add(new THREE.BoxGeometry(...size), position, kind);
  box([7.2, .35, 8], [0, .2, 0], 'concrete');
  box([3.6, 2.5, 6], [-1.65, 1.6, 0], 'panel');
  box([3.85, .2, 6.3], [-1.65, 2.96, 0], 'roof');
  for (let z = -2.5; z <= 2.5; z += 1) {
    box([.08, 2.35, .09], [.2, 1.6, z], 'steel');
    box([.1, .58, .62], [.2, 2.15, z], 'glass');
  }
  box([.12, 1.75, 2.1], [.25, 1.25, 0], 'dark');
  box([.12, .12, 2.6], [.27, 2.2, 0], 'team');
  // 长沿岸码头匹配货船长度；设施的战斗碰撞、建造占地和维修范围保持原规则。
  box([9.5, .35, 2.8], [5.7, .55, 0], 'concrete');
  box([3.1, .35, 20], [10.2, .55, 0], 'concrete');
  for (const z of [-8, -4, 0, 4, 8]) {
    box([.45, 2, .45], [10.2, -.6, z], 'concrete');
    box([.22, .45, 1.1], [11.9, .55, z], 'dark');
    add(new THREE.CylinderGeometry(.08, .1, .35, 10), [11.45, .94, z + .75], 'steel');
    box([.12, .02, 2], [11.55, .745, z], 'amber');
  }
  for (const z of [-5.6, 5.6]) {
    for (const x of [8.9, 11.1]) box([.2, 4.7, .2], [x, 3.1, z], 'steel');
    box([5.1, .3, .4], [10.2, 5.5, z], 'amber');
    box([.04, 2.2, .04], [12.25, 4.3, z], 'dark');
    box([1.6, .14, 1.1], [12.25, 3.2, z], 'steel');
    box([.55, .8, .75], [9.15, 5.1, z], 'glass');
  }
  for (const z of [-8.7, 8.7]) for (const x of [2.4, 4.1]) {
    box([1.45, 1, 2.3], [x, .88, z], 'panel');
    for (let i = 0; i < 6; i++) box([.035, 1.03, .035], [x + .74, .88, z - 1 + i * .4], 'steel');
  }
  for (const [kind, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), weather(materials[kind]));
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(geometry => geometry.dispose());
  }
  return group;
}

export function createCraterDebris() {
  const pieces = [], random = i => { const n = Math.sin(i * 127.13) * 43758.5; return n - Math.floor(n); };
  for (let i = 0; i < 32; i++) {
    if (i % 7 === 0) continue;
    const angle = i * Math.PI * 2 / 32 + random(i + 40) * .07;
    const radius = .32 + random(i + 90) * .13, width = .012 + random(i + 60) * .018;
    const rock = new THREE.ConeGeometry(width, .012 + random(i + 80) * .035, 5);
    rock.rotateY(angle); rock.scale(1.8, 1, .75);
    rock.translate(Math.cos(angle) * radius, .015, Math.sin(angle) * radius);
    pieces.push(rock.toNonIndexed()); rock.dispose();
  }
  const geometry = mergeGeometries(pieces, false); pieces.forEach(piece => piece.dispose());
  return geometry;
}
