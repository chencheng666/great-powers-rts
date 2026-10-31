import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { craftedMaterial, mergeParts } from './model-craft.js';
import { createMovingTracks } from './track-motion.js';
import { refineNavalHull, refineNavalWeapons } from './naval-presentation.js';

function tools(root) {
  const mesh = (parent, geometry, material, position = [0, 0, 0], rotation) => {
    const part = new THREE.Mesh(geometry, material); part.position.set(...position);
    if (rotation) part.rotation.set(...rotation); parent.add(part); return part;
  };
  const box = (parent, material, position, size, rotation) => mesh(parent, new THREE.BoxGeometry(...size), material, position, rotation);
  const beam = (parent, material, from, to, radius = .025, segments = 8) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const part = mesh(parent, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), segments), material, a.clone().add(b).multiplyScalar(.5).toArray());
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return part;
  };
  const shell = (parent, material, levels) => {
    const points = levels.flatMap(([y, outline]) => outline.map(([x,z]) => new THREE.Vector3(x,y,z)));
    const geometry = new ConvexGeometry(points), p = geometry.attributes.position, n = geometry.attributes.normal, uv = [];
    for (let i = 0; i < p.count; i++) {
      const axis = Math.abs(n.getY(i)) > .6 ? 'y' : Math.abs(n.getX(i)) > .6 ? 'x' : 'z';
      uv.push((axis === 'x' ? p.getZ(i) : p.getX(i)) * .4, (axis === 'y' ? p.getZ(i) : p.getY(i)) * .4);
    }
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); return mesh(parent, geometry, material);
  };
  const group = name => { const g = new THREE.Group(); g.name = name; root.add(g); return g; };
  return { mesh, box, beam, shell, group };
}

export function createChineseTank(weather = material => material) {
  const root = new THREE.Group(); root.name = 'tank_china'; root.userData.domesticDetail = 3;
  const { mesh, box, beam, shell, group } = tools(root);
  const armor = weather(craftedMaterial('装甲钢', '#91a285', 'armor', .76, .24));
  const rubber = craftedMaterial('橡胶', '#20292a', 'rubber', .96, 0);
  const steel = craftedMaterial('机加工金属', '#788386', 'coating', .5, .65);
  const glass = new THREE.MeshStandardMaterial({ name:'观瞄镀膜', color:'#476c79', roughness:.15, metalness:.55 });
  const team = new THREE.MeshStandardMaterial({ name:'阵营标识', color:'#64d8e4', roughness:.65 });
  const body = group('倾斜复合装甲车体'), weapon = group('weapon'), barrel = new THREE.Group(); barrel.name = 'barrel'; weapon.add(barrel);
  shell(body, armor, [[.45,[[-2.8,-1.33],[2.5,-1.33],[2.5,1.33],[-2.8,1.33]]],
    [1.18,[[-2.95,-1.58],[3.05,-1.58],[3.05,1.58],[-2.95,1.58]]],
    [1.58,[[-2.85,-1.48],[1.9,-1.48],[2.45,-.95],[2.45,.95],[1.9,1.48],[-2.85,1.48]]]]);
  for (const side of [-1,1]) {
    box(body,rubber,[0,.61,side*1.54],[5.7,.95,.55]);
    for (let i=0;i<6;i++) {
      const x=-2.25+i*.88;
      mesh(body,new THREE.CylinderGeometry(.44,.44,.18,16),armor,[x,.61,side*1.82],[Math.PI/2,0,0]);
      mesh(body,new THREE.CylinderGeometry(.19,.19,.2,12),steel,[x,.61,side*1.84],[Math.PI/2,0,0]);
    }
    for (let i=0;i<7;i++) {
      box(body,armor,[-2.45+i*.77,1.23,side*1.88],[.72,.56,.08],[0,0,-.04]);
      box(body,rubber,[-2.45+i*.77,.92,side*1.88],[.67,.1,.07]);
    }
    mesh(body,new THREE.CylinderGeometry(.28,.28,1.1,16),armor,[-3.08,1.48,side*.65],[Math.PI/2,0,0]);
    for(const offset of [-.34,.34]) mesh(body,new THREE.TorusGeometry(.285,.018,4,16),steel,[-3.08,1.48,side*.65+offset]);
    box(body,glass,[2.55,1.39,side*1.12],[.08,.13,.24]);
    box(body,team,[-.4,1.43,side*1.94],[.9,.12,.02]);
    beam(body,steel,[-2.9,.98,side*1.1],[-2.92,1.23,side*.75],.04);
    beam(weapon,steel,[-1.4,2.55,side*.72],[-1.5,3.55,side*.72],.014);
  }
  for (let i=0;i<13;i++) box(body,rubber,[-2.7+i*.09,1.596,0],[.035,.018,1.75]);
  box(body,armor,[1.1,1.61,0],[.7,.1,.75]);
  box(body,glass,[1.3,1.68,0],[.12,.04,.23]);
  shell(weapon,armor,[[1.65,[[-1.8,-1.32],[1.8,-1.2],[2.0,0],[1.8,1.2],[-1.8,1.32]]],
    [2.45,[[-1.55,-1.1],[.7,-1.16],[1.45,-.52],[1.45,.52],[.7,1.16],[-1.55,1.1]]],
    [2.63,[[-1.32,-.8],[.48,-.8],[.9,-.35],[.9,.35],[.48,.8],[-1.32,.8]]]]);
  for (const side of [-1,1]) {
    for(let i=0;i<4;i++) box(weapon,armor,[.2+i*.32,2.19,side*(1.24-i*.13)],[.30,.39,.18],[0,side*.37,-.17]);
    box(weapon,team,[-.7,2.27,side*1.25],[.7,.15,.02]);
    for(let i=0;i<5;i++) beam(weapon,rubber,[-.8+i*.16,2.31,side*1.22],[-.75+i*.16,2.53,side*1.43],.065);
    mesh(weapon,new THREE.CylinderGeometry(.29,.29,.07,16),armor,[-.6,2.68,side*.55]);
  }
  box(weapon,armor,[.15,2.78,-.49],[.39,.29,.32]); box(weapon,glass,[.35,2.8,-.49],[.012,.12,.25]);
  beam(weapon,steel,[-.7,2.73,.55],[-.7,3.05,.55],.045);
  box(weapon,rubber,[-.48,3.08,.55],[.45,.12,.1]); beam(weapon,steel,[-.25,3.08,.55],[.4,3.08,.55],.024);
  beam(barrel,armor,[1.25,2.13,0],[2.65,2.13,0],.18,16);
  beam(barrel,steel,[2.65,2.13,0],[6.2,2.13,0],.095,16);
  beam(barrel,armor,[3.7,2.13,0],[4.2,2.13,0],.145,16);
  for(const x of [2.65,4.25,5.25]) mesh(barrel,new THREE.TorusGeometry(.108,.018,6,16),steel,[x,2.13,0],[0,Math.PI/2,0]);
  mesh(barrel,new THREE.CircleGeometry(.085,16),rubber,[6.205,2.13,0],[0,Math.PI/2,0]);
  mergeParts(body); mergeParts(weapon);
  const muzzle = new THREE.Object3D(); muzzle.name='open_asset_muzzle'; muzzle.position.set(6.21,2.13,0); barrel.add(muzzle);
  root.add(createMovingTracks(2.3,steel,rubber));
  return root;
}

export function createChineseDestroyer() {
  const root = new THREE.Group(); root.name='destroyer_china'; root.userData.domesticDetail=3;
  const { mesh, box, beam, shell, group } = tools(root);
  const coat=craftedMaterial('海军上层建筑','#a1adb3','armor',.65,.28),deck=craftedMaterial('舰面防滑涂层','#57686e','deck',.88,.12);
  const dark=craftedMaterial('通风与垂发井盖','#2b3b43','rubber',.88,.05),steel=craftedMaterial('舰用钢','#b4bec1','coating',.5,.6);
  const glass=new THREE.MeshStandardMaterial({name:'舰桥玻璃',color:'#2c566b',metalness:.6,roughness:.12});
  const marks=new THREE.MeshStandardMaterial({name:'舰面标线',color:'#d6ded4',roughness:.85});
  const team=new THREE.MeshStandardMaterial({name:'阵营标识',color:'#64d8e4',roughness:.65});
  const upper=group('隐身舰桥与飞行甲板'),weapon=group('weapon'),barrel=new THREE.Group();barrel.name='barrel';weapon.add(barrel);
  refineNavalHull(root,root.name);
  shell(upper,coat,[[1.12,[[-4.8,-1.4],[3,-1.4],[3.5,-1],[3.5,1],[3,1.4],[-4.8,1.4]]],
    [2.9,[[-4.6,-1.0],[2.4,-1.0],[2.8,-.6],[2.8,.6],[2.4,1],[-4.6,1]]]]);
  shell(upper,coat,[[2.6,[[-.2,-1.05],[2.8,-1.05],[3.15,0],[2.8,1.05],[-.2,1.05]]],
    [3.8,[[0,-.72],[2.1,-.72],[2.5,0],[2.1,.72],[0,.72]]]]);
  for(const side of [-1,1]) {
    for(let i=0;i<7;i++)box(upper,glass,[.25+i*.3,3.49,side*.79],[.23,.22,.018]);
    box(upper,coat,[.65,3.10,side*1.03],[1.08,.62,.06],[side*.16,0,0]);
    box(upper,dark,[.65,3.11,side*1.07],[.87,.44,.015],[side*.16,0,0]);
    for(let i=0;i<8;i++)box(upper,coat,[.28+i*.11,3.11,side*1.08],[.025,.4,.018]);
    box(upper,team,[-3.4,2.2,side*1.2],[1.1,.13,.028]);
    for(let i=0;i<5;i++)box(upper,dark,[-3.1+i*.26,2.74,side*.95],[.15,.14,.05]);
    box(upper,coat,[-3.9,2.0,side*1.63],[1.15,.54,.28]);
    beam(upper,steel,[-1,3.8,side*.4],[-1,5.1,side*.4],.035);
  }
  shell(upper,coat,[[3.45,[[-1.45,-.55],[-.45,-.55],[-.45,.55],[-1.45,.55]]],[4.7,[[-1.2,-.25],[-.75,-.25],[-.75,.25],[-1.2,.25]]]]);
  box(upper,dark,[-1,4.73,0],[1.25,.12,.32]);
  beam(upper,steel,[-1,4.8,0],[-1,5.8,0],.025);beam(upper,steel,[-1,5.2,-.85],[-1,5.2,.85],.025);
  for(const cx of [4.3,-3.3])for(let row=0;row<4;row++)for(let col=0;col<8;col++){
    box(upper,dark,[cx+row*.36,1.14,col*.32-1.12],[.31,.025,.27]);
    box(upper,steel,[cx+row*.36,1.158,col*.32-1.12],[.26,.006,.22]);
  }
  box(upper,deck,[-7.35,1.14,0],[4.65,.035,3.32]);
  const circle=mesh(upper,new THREE.RingGeometry(.91,.94,48),marks,[-7.35,1.17,0],[-Math.PI/2,0,0]);circle.name='直升机着舰标记';
  for(const side of [-1,1])box(upper,marks,[-7.35,1.175,side*.3],[.7,.01,.045]);
  box(upper,marks,[-7.35,1.175,0],[.045,.01,.6]);
  box(upper,dark,[-4.83,1.98,0],[.025,1.55,1.4]);
  for(let y=1.3;y<2.7;y+=.18)box(upper,steel,[-4.851,y,0],[.015,.022,1.35]);
  shell(weapon,coat,[[1.16,[[6.2,-.65],[7.7,-.5],[8,0],[7.7,.5],[6.2,.65]]],
    [2.05,[[6.4,-.5],[7.3,-.4],[7.6,0],[7.3,.4],[6.4,.5]]]]);
  beam(barrel,coat,[7.2,1.78,0],[9.9,1.95,0],.085,12);
  mergeParts(upper);mergeParts(weapon);
  refineNavalWeapons(root, root.name);
  const muzzle=new THREE.Object3D();muzzle.name='open_asset_muzzle';muzzle.position.set(9.9,1.95,0);barrel.add(muzzle);
  // 舰炮以舰艏炮座为轴旋转，后坐动画仍使用炮管的局部坐标。
  const mount = group('舰艏炮座'); mount.position.x = 6.9; mount.add(weapon);
  weapon.traverse(part => { if (part.isMesh) part.geometry.translate(-6.9, 0, 0); });
  muzzle.position.x -= 6.9;
  return root;
}
