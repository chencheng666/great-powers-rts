import * as THREE from 'three';
import { createModernAircraft } from './aircraft-models.js';
import { craftedMaterial, mergeParts } from './model-craft.js';

export function createFuelSupportModel(type) {
  const air=type==='tanker',root=air?createModernAircraft('airlift'):new THREE.Group();root.name=type;
  const steel=craftedMaterial('保障舰体','#9da8aa','coating',.64,.35);
  const deck=craftedMaterial('保障甲板','#485b5d','coating',.85,.12);
  const dark=craftedMaterial('供油管路','#26393e','rubber',.92,.05);
  const mark=new THREE.MeshStandardMaterial({name:'动力补给识别',color:'#e3b954',roughness:.7});
  const add=(geometry,material,x,y,z,rotation)=>{const m=new THREE.Mesh(geometry,material);m.position.set(x,y,z);if(rotation)m.rotation.set(...rotation);root.add(m);return m;};
  if(air){
    const intake=new THREE.MeshStandardMaterial({name:'加油荚舱入口',color:'#263937',roughness:.66,metalness:.3});
    for(const side of [-1,1]){
      add(new THREE.SphereGeometry(.36,12,8),steel,.1,.62,side*6).scale.x=2.05;
      add(new THREE.CylinderGeometry(.19,.19,.12,10),intake,-2.02,.64,side*6,[0,0,Math.PI/2]);
      add(new THREE.CylinderGeometry(.24,.24,2.5,12),steel,-1,.65,side*6,[0,0,Math.PI/2]);
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(-2,.65,side*6),new THREE.Vector3(-3.5,.12,side*6.1),new THREE.Vector3(-5.1,.08,side*6.2)]);
      add(new THREE.TubeGeometry(curve,10,.055,5,false),dark,0,0,0);
      add(new THREE.TorusGeometry(.24,.055,5,10),mark,-5.1,.08,side*6.2,[0,Math.PI/2,0]);
      add(new THREE.BoxGeometry(1.7,.06,.75),mark,-2,2.09,side*4.2);
    }
  }else{
    const shape=new THREE.Shape();[[-12,-3.2],[8,-3.2],[12.5,-1.4],[14,0],[12.5,1.4],[8,3.2],[-12,3.2]].forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
    const hull=new THREE.ExtrudeGeometry(shape,{depth:2.5,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.3,bevelThickness:.3});hull.rotateX(-Math.PI/2);add(hull,steel,0,.25,0);
    add(new THREE.BoxGeometry(20,.25,5.9),deck,-1,3.05,0);
    add(new THREE.BoxGeometry(4.2,3.2,4.8),steel,-7,4.7,0);add(new THREE.BoxGeometry(.06,.7,4.3),dark,-4.87,5.45,0);
    add(new THREE.BoxGeometry(5.8,.18,5.4),steel,-7,6.4,0);
    for(const x of [-.5,5.5])for(const side of [-1,1]){
      add(new THREE.CylinderGeometry(.78,.78,4.4,14),steel,x,4,side*1.55,[0,0,Math.PI/2]);
      add(new THREE.BoxGeometry(.2,2.7,.2),dark,x,4.5,side*2.65);
      add(new THREE.BoxGeometry(1.5,.15,3.8),mark,x,5.85,side*2.5);
    }
    for(const side of [-1,1])add(new THREE.TorusGeometry(.65,.12,6,14),dark,3.5,4.2,side*3.2,[0,0,Math.PI/2]);
    add(new THREE.BoxGeometry(3.5,.04,1.4),mark,9,3.2,0);
  }
  mergeParts(root);root.userData.fuelSupport=true;return root;
}
