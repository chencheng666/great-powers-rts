import * as THREE from 'three';
import { craftedMaterial, mergeParts, roundedPart } from './model-craft.js';
import { createMovingTracks } from './track-motion.js';

export const hasRefinedTracks = name => name === 'tank' || name === 'elite_nato' || name.startsWith('tank_');

function stadium(path, center, radius) {
  path.moveTo(-center, .62 + radius); path.lineTo(center, .62 + radius);
  path.absarc(center, .62, radius, Math.PI / 2, -Math.PI / 2, true);
  path.lineTo(-center, .62 - radius); path.absarc(-center, .62, radius, -Math.PI / 2, -Math.PI * 1.5, true);
  path.closePath(); return path;
}

export function refineEquipment(model, name) {
  if (model.userData.detailVersion === 2) return model;
  const tank = hasRefinedTracks(name), aircraft = ['fighter', 'strike'].includes(name);
  const vehicle = ['aa','apc','supply','jammer','laser','loiterer','rocket','harvester'].includes(name) || name.startsWith('rocket_');
  if (!tank && !aircraft && !vehicle) return model;
  const hull = new THREE.Group(); hull.name = '车体工艺细节'; model.add(hull);
  const rubber = craftedMaterial('履带橡胶与消光结构', '#252b2d', 'rubber', .94, 0);
  const steel = craftedMaterial('机加工金属', '#697477', 'coating', .64, .62);
  const glass = new THREE.MeshStandardMaterial({ name: '观瞄镀膜', color: '#4c7c87', metalness: .52, roughness: .2 });
  const mesh = (parent, geometry, material, position, rotation) => {
    const part = new THREE.Mesh(geometry, material); part.position.set(...position); if (rotation) part.rotation.set(...rotation); parent.add(part); return part;
  };
  const box = (parent, material, position, size, rotation) => mesh(parent, roundedPart(size, .025), material, position, rotation);
  const beam = (parent, material, from, to, radius) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const part = mesh(parent, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), material, a.clone().add(b).multiplyScalar(.5).toArray());
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), b.sub(a).normalize()); return part;
  };
  if (tank) {
    const heavy = ['tank_nato','tank_middleeast','elite_nato'].includes(name), length = heavy ? 6.3 : 5.6, center = length / 2 - .49;
    // 用中空曲面履带取代整块橡胶盒；原负重轮、车体和可动炮塔保持原位。
    const outline = stadium(new THREE.Shape(), center, .56), hole = stadium(new THREE.Path(), center, .43); outline.holes.push(hole);
    model.add(createMovingTracks(center, steel, rubber));
    for (const side of [-1,1]) {
      mesh(hull, new THREE.ExtrudeGeometry(outline, { depth: .55, bevelEnabled: false, curveSegments: 16 }), rubber, [0,0,side < 0 ? -1.755 : 1.205]);
      for (const x of [-2.25,-1.36,-.45,.45,1.36,2.25]) {
        mesh(hull, new THREE.TorusGeometry(.325,.025,4,16), rubber, [x,.64,side*1.875]);
        for (let i=0;i<6;i++) {
          const angle=i*Math.PI/3;
          mesh(hull,new THREE.CylinderGeometry(.024,.024,.028,6),steel,[x+Math.cos(angle)*.095,.64+Math.sin(angle)*.095,side*1.88],[Math.PI/2,0,0]);
        }
      }
      for (const x of [-2.1,-1.6,-1.1]) box(hull, rubber, [x,1.58,side*.7], [.22,.022,.032]);
      const hook = mesh(hull,new THREE.TorusGeometry(.095,.024,6,16),steel,[length/2+.16,1.1,side*.63],[0,Math.PI/2,0]); hook.scale.y=.8;
    }
    const mount = new THREE.Group(); mount.name = '炮塔工艺细节'; (model.getObjectByName('weapon') || model).add(mount);
    box(mount,rubber,[-.63,2.80,-.02],[.25,.10,.30]);
    beam(mount,steel,[-.63,2.79,-.02],[-.63,3.00,-.02],.045);
    box(mount,rubber,[-.49,3.01,-.02],[.40,.10,.095]);
    beam(mount,steel,[-.28,3.01,-.02],[.17,3.01,-.02],.023);
    box(mount,rubber,[-.71,2.98,.10],[.18,.14,.16]);
    box(mount,glass,[.949,2.54,.45],[.029,.09,.21]);
    const muzzle = heavy ? 6.8 : 6.2;
    const barrel = model.getObjectByName('barrel') || mount;
    const barrelDetail = new THREE.Group(); barrel.add(barrelDetail);
    mesh(barrelDetail,new THREE.TorusGeometry(.091,.014,6,16),steel,[muzzle+.014,2.13,0],[0,Math.PI/2,0]);
    mesh(barrelDetail,new THREE.CircleGeometry(.078,16),rubber,[muzzle+.01,2.13,0],[0,Math.PI/2,0]);
    for (const x of [2.0,2.7,3.5]) mesh(barrelDetail,new THREE.TorusGeometry(.162,.012,6,16),steel,[x,2.13,0],[0,Math.PI/2,0]);
    mergeParts(barrelDetail);
    mergeParts(mount);
  } else if (aircraft) {
    const wide = name === 'strike', rear = wide ? -4.5 : -4, span = wide ? 4.2 : 3.35;
    for (const side of [-1,1]) {
      mesh(hull,new THREE.TorusGeometry(.225,.036,8,24),steel,[rear-.29,.43,side*.36],[0,Math.PI/2,0]);
      mesh(hull,new THREE.CircleGeometry(.19,20),rubber,[rear-.3,.43,side*.36],[0,-Math.PI/2,0]);
      for (let i=0;i<12;i++) {
        const a=i*Math.PI/6;
        beam(hull,steel,[rear-.31,.43+Math.sin(a)*.18,side*.36+Math.cos(a)*.18],[rear-.22,.43+Math.sin(a)*.25,side*.36+Math.cos(a)*.25],.009);
      }
      beam(hull,steel,[.52,.96,side*.24],[1.45,1.08,side*.27],.011);
      beam(hull,steel,[1.45,1.08,side*.27],[2.25,.97,side*.18],.011);
      box(hull,rubber,[.966,.37,side*.73],[.013,.25,.30]);
      for (const x of [-.75,-1.12,-1.49]) box(hull,steel,[x,.476,side*2.1],[.08,.012,.038]);
      beam(hull,steel,[-1.25,.48,side*(span-.2)],[-2.40,.48,side*(span-.2)],.01);
      for (const x of [.6,2.3]) box(hull,rubber,[x,.87-(x>2?.09:0),side*.19],[.06,.012,.03]);
    }
  } else {
    for (const side of [-1,1]) {
      box(hull,rubber,[1.82,1.49,side*1.37],[.40,.021,.052]);
      beam(hull,steel,[2.10,1.58,side*1.22],[2.02,1.9,side*1.55],.018);
      box(hull,rubber,[2.02,1.90,side*1.55],[.13,.18,.04]);
      box(hull,glass,[2.02,1.90,side*1.575],[.095,.14,.008]);
      for (const x of [-2.2,-1.6]) box(hull,rubber,[x,1.565,side*.8],[.32,.015,.035]);
    }
  }
  mergeParts(hull); model.userData.detailVersion = 2; return model;
}
