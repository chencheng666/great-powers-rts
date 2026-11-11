import * as THREE from 'three';
import { bodyLoft, craftedMaterial, mergeParts } from './model-craft.js';

// 原创外形表达：运输机采用高翼、四发与T形尾翼；中国制空机采用鸭翼和双垂尾。
export function createModernAircraft(type) {
  const transport = type !== 'fighter_china', root = new THREE.Group(); root.name = type;
  const shell = craftedMaterial('航空涂层', transport ? '#a5adb0' : '#77858b', 'coating', .57, .27);
  const dark = craftedMaterial('发动机与轮舱', '#263137', 'rubber', .86, .1);
  const metal = craftedMaterial('喷口金属', '#6f797c', 'coating', .43, .7);
  const glass = new THREE.MeshPhysicalMaterial({name:'座舱玻璃',color:'#487789',roughness:.13,metalness:.1,clearcoat:1});
  const team = new THREE.MeshStandardMaterial({name:'阵营标识',color:'#59d7ec',emissive:'#59d7ec',emissiveIntensity:.1});
  const add = (geometry, material, position, rotation) => {const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);if(rotation)mesh.rotation.set(...rotation);root.add(mesh);return mesh;};
  const plane = (points, y, material=shell, thickness=.075) => {
    const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
    const g=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});g.rotateX(Math.PI/2);g.translate(0,y,0);return add(g,material,[0,0,0]);
  };
  const sections=transport?[[-7,.08,.08],[-5.6,.43,.6],[-3.6,1,1.1],[2.5,1.08,1.12],[4.6,.78,.95],[5.8,.45,.64],[6.6,.07,.12]]:[[-4.5,.12,.43],[-3.7,.36,.62],[-1,.48,.7],[1.3,.38,.46],[3.3,.2,.28],[4.8,.025,.035]];
  const body=bodyLoft(sections,28);body.rotateZ(-Math.PI/2);body.translate(0,transport?1.15:.55,0);add(body,shell,[0,0,0]);
  for(const s of [-1,1]) {
    if(transport){
      plane([[1.7,s*.7],[-.8,s*7.7],[-2.45,s*7.7],[-1.6,s*.7]],2.02);
      plane([[-4.9,s*.15],[-6.6,s*3.05],[-7.3,s*3.05],[-6.7,s*.15]],3.9);
      for(const z of [3.1,5.5]){
        add(new THREE.BoxGeometry(.8,.65,.12),shell,[-.8,1.55,s*z]);
        add(new THREE.CylinderGeometry(.34,.39,1.7,20),shell,[.05,1.14,s*z],[0,0,-Math.PI/2]);
        add(new THREE.TorusGeometry(.27,.07,8,20),metal,[.93,1.14,s*z],[0,Math.PI/2,0]);
        add(new THREE.CircleGeometry(.25,20),dark,[.94,1.14,s*z],[0,Math.PI/2,0]);
      }
      add(new THREE.BoxGeometry(1.25,.27,.055),glass,[5.12,1.79,s*.54],[0,s*-.35,0]);
      add(new THREE.BoxGeometry(2.4,.12,.035),team,[-1.7,1.28,s*1.12]);
    }else{
      plane([[.8,s*.55],[-2.65,s*3.65],[-4.05,s*2.6],[-3.2,s*.55]],.62);
      plane([[2.65,s*.35],[1.6,s*1.85],[.65,s*1.75],[1.28,s*.35]],.65);
      const fin=new THREE.Shape();fin.moveTo(-3.9,.65);fin.lineTo(-3.5,2.15);fin.lineTo(-2.65,2.4);fin.lineTo(-2.4,.65);fin.closePath();
      add(new THREE.ExtrudeGeometry(fin,{depth:.07,bevelEnabled:false}),shell,[0,0,s*.72],[s*.24,0,0]);
      add(new THREE.CylinderGeometry(.235,.255,.48,20),metal,[-4.3,.53,s*.35],[0,0,Math.PI/2]);
      add(new THREE.CircleGeometry(.19,20),dark,[-4.55,.53,s*.35],[0,-Math.PI/2,0]);
      add(new THREE.BoxGeometry(.65,.03,.2),team,[-2.3,.67,s*2.6]);
      add(new THREE.BoxGeometry(1,.25,.15),dark,[.35,.46,s*.66]);
    }
  }
  if(transport){
    const fin=new THREE.Shape();fin.moveTo(-6.6,1.3);fin.lineTo(-6.7,3.95);fin.lineTo(-5.7,3.95);fin.lineTo(-4.6,1.3);fin.closePath();
    add(new THREE.ExtrudeGeometry(fin,{depth:.12,bevelEnabled:false}),shell,[0,0,-.06]);
    add(new THREE.BoxGeometry(1.8,.08,1.2),dark,[-4.3,.49,0],[0,0,-.12]);
  }else{
    const canopy=add(new THREE.SphereGeometry(.44,24,14),glass,[1.85,.88,0]);canopy.scale.set(1.65,.75,.68);
    add(new THREE.BoxGeometry(1.2,.06,.46),dark,[1.85,.72,0]);
  }
  if (!transport) {
    // 加宽翼身连接与进气口唇边，保持远景轮廓；不照搬真实工程结构。
    for (const s of [-1, 1]) {
      plane([[2.5,s*.35],[.3,s*1.02],[-3.75,s*.86],[-4.1,s*.36]],.57);
      plane([[.85,s*.66],[.45,s*.95],[-.6,s*.88],[-.45,s*.64]],.43,metal,.035);
      add(new THREE.BoxGeometry(.9,.025,.028),dark,[-1.5,.98,s*.36]);
      add(new THREE.BoxGeometry(.7,.02,.025),dark,[-2.75,.69,s*2.1],[0,s*-.7,0]);
    }
    root.userData.jetExhausts = [[-4.56,.53,-.35,.3],[-4.56,.53,.35,.3]];
  }
  root.userData.aircraftVersion=transport?1:2;root.userData.role=transport?'高翼运输机':'鸭翼双垂尾制空机';return mergeParts(root);
}

// 对地机与电子战机使用不同的翼形、座舱和任务舱；均为游戏原创简化外形。
export function createMissionAircraft(type) {
  if (!['strike_china', 'ewPlane'].includes(type)) throw new Error('未知任务机型');
  const electronic = type === 'ewPlane', root = new THREE.Group(); root.name = type;
  const shell = craftedMaterial('航空涂层', electronic ? '#929e9e' : '#7c8b87', 'coating', .65, .28);
  const dark = craftedMaterial('进气口与任务舱', '#24323a', 'rubber', .86, .12);
  const metal = craftedMaterial('喷口金属', '#718086', 'coating', .5, .65);
  const glass = new THREE.MeshPhysicalMaterial({name:'座舱玻璃',color:'#487789',roughness:.13,metalness:.1,clearcoat:1});
  const team = new THREE.MeshStandardMaterial({name:'阵营标识',color:'#59d7ec',emissive:'#59d7ec',emissiveIntensity:.1});
  const add = (geometry, material, position, rotation) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation); root.add(mesh); return mesh;
  };
  const wing = (points, y, material = shell) => {
    const shape = new THREE.Shape(); points.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape,{depth:.075,bevelEnabled:false});
    geometry.rotateX(Math.PI/2);geometry.translate(0,y,0);add(geometry,material,[0,0,0]);
  };
  const body = bodyLoft([[-4.75,.15,.5],[-3.6,.38,.72],[-1.6,.52,.72],[1.5,.44,.56],[3.4,.26,.28],[4.65,.025,.025]],24);
  body.rotateZ(-Math.PI/2);body.translate(0,.65,0);add(body,shell,[0,0,0]);
  for (const s of [-1,1]) {
    wing(electronic ? [[1.2,s*.55],[-.95,s*4.6],[-2.15,s*4.6],[-2.6,s*.55]] : [[1.15,s*.55],[-1.5,s*3.85],[-3.05,s*3.6],[-3.2,s*.55]],.62);
    wing([[-2.8,s*.45],[-4.2,s*2.2],[-4.65,s*2.1],[-4.25,s*.45]],.69);
    add(new THREE.BoxGeometry(1.2,.34,.24),dark,[.8,.46,s*.61]);
    add(new THREE.BoxGeometry(.08,.42,.34),metal,[1.4,.47,s*.61],[0,0,-.16]);
    const fin=new THREE.Shape();fin.moveTo(-4.3,.62);fin.lineTo(-3.7,2);fin.lineTo(-2.65,1.9);fin.lineTo(-2.9,.62);fin.closePath();
    add(new THREE.ExtrudeGeometry(fin,{depth:.07,bevelEnabled:false}),shell,[0,0,s*.72],[s*.2,0,0]);
    add(new THREE.CylinderGeometry(.25,.29,.65,16),metal,[-4.3,.53,s*.38],[0,0,Math.PI/2]);
    add(new THREE.CircleGeometry(.2,16),dark,[-4.64,.53,s*.38],[0,-Math.PI/2,0]);
    if (electronic) {
      // 翼尖长舱和机背整流罩让电子战机在正常镜头下也能辨认。
      const pod=add(new THREE.CapsuleGeometry(.2,1.6,4,10),dark,[-1.2,.63,s*4.5],[0,0,Math.PI/2]);pod.name=`电子任务舱_${s}`;
      add(new THREE.BoxGeometry(.65,.07,.24),team,[-1.2,.85,s*4.5]);
    } else {
      for (const z of [1.65,2.6]) {
        add(new THREE.BoxGeometry(.6,.23,.12),metal,[-1.1,.42,s*z]);
        add(new THREE.CapsuleGeometry(.115,.9,3,8),dark,[-.9,.24,s*z],[0,0,Math.PI/2]);
      }
      add(new THREE.BoxGeometry(.65,.03,.18),team,[-1.7,.67,s*2.8]);
    }
  }
  const canopy=add(new THREE.SphereGeometry(.4,20,12),glass,[1.6,1,0]);canopy.scale.set(electronic?2.15:1.85,.72,.77);
  add(new THREE.BoxGeometry(1.65,.06,.48),dark,[1.5,.79,0]);
  if (electronic) {
    const fairing=add(new THREE.SphereGeometry(.35,16,10),shell,[-1.25,1.17,0]);fairing.scale.set(3.1,.64,1);
    add(new THREE.BoxGeometry(.15,.52,.08),metal,[-2.4,1.45,0],[0,0,-.24]);
  }
  root.userData.jetExhausts=[[-4.65,.53,-.38,.32],[-4.65,.53,.38,.32]];
  root.userData.aircraftVersion=2;root.userData.role=electronic?'宽翼双座电子战机':'双发对地攻击机';
  return mergeParts(root);
}

// 串列双旋翼运输机为原创简化模型，保留前后两个可独立旋转的旋翼。
export function createTandemTransport() {
  const root = new THREE.Group(); root.name = 'nato_tandem'; root.userData.tandemRotors = true;
  const shell = new THREE.MeshStandardMaterial({ name: '航空涂层', color: '#6f7965', roughness: .8, metalness: .15 });
  const dark = new THREE.MeshStandardMaterial({ name: '旋翼与轮胎', color: '#27322e', roughness: .8 });
  const glass = new THREE.MeshStandardMaterial({ name: '座舱玻璃', color: '#355b6b', roughness: .3, metalness: .15 });
  const team = new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#59d7ec', emissive: '#59d7ec', emissiveIntensity: .1 });
  const box = (size, position, material = shell, parent = root) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...position); mesh.castShadow = true; parent.add(mesh); return mesh; };
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.15, 6.1, 6, 14), shell); body.rotation.z = Math.PI / 2; body.position.y = 1.45; body.scale.z = .8; body.castShadow = true; root.add(body);
  box([1.45,.5,1.45],[3.55,1.95,0],glass); box([.95,2.5,1.45],[-3,2.35,0]); box([1.05,2.2,1.4],[2.65,2.2,0]);
  for (const z of [-1,1]) { box([4,.12,.035],[0,1.2,z*.95],team); for (const x of [-2.7,2.7]) { const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.28,.28,.16,12),dark);wheel.rotation.x=Math.PI/2;wheel.position.set(x,.35,z*.9);root.add(wheel); } }
  for (const [i,x] of [-3,2.65].entries()) { const rotor=new THREE.Group();rotor.name=`rotor_${i}_tandem`;rotor.position.set(x,3.75,0);root.add(rotor);box([6.8,.075,.22],[0,0,0],dark,rotor);box([.22,.075,6.8],[0,.035,0],dark,rotor); }
  return root;
}
