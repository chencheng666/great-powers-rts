import * as THREE from 'three';
import { craftedMaterial, mergeParts, roundedPart } from './model-craft.js';

export function createNuclearSilo() {
  const root=new THREE.Group();root.name='nuclearSilo';
  const concrete=craftedMaterial('发射井混凝土','#798180','coating',.96,.02),steel=craftedMaterial('厚壁防爆钢','#455b60','coating',.53,.65),edge=craftedMaterial('镀锌结构','#a4b3b4','coating',.4,.75),dark=craftedMaterial('维护橡胶','#202c30','rubber',.96,0),team=craftedMaterial('阵营标识','#59d7ec','coating',.5,.2);
  const amber=new THREE.MeshStandardMaterial({name:'警示灯',color:'#e4bb59',emissive:'#b77718',emissiveIntensity:.5,roughness:.4});
  const part=(g,m,p=[0,0,0],r=[0,0,0],parent=root)=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(...p);mesh.rotation.set(...r);parent.add(mesh);return mesh;};
  const box=(s,m,p,r,parent)=>part(roundedPart(s,.045),m,p,r,parent);
  box([7.6,.32,6.6],concrete,[0,.16,0]);box([6.8,.5,5.8],steel,[0,.56,0]);
  part(new THREE.CylinderGeometry(2.22,2.22,.17,48),dark,[.35,.88,0]);
  part(new THREE.TorusGeometry(2.28,.13,8,64),edge,[.35,1,0],[Math.PI/2,0,0]);
  for(const side of [-1,1]) {
    const door=new THREE.Group();door.name=side<0?'silo_door_left':'silo_door_right';root.add(door);
    box([2.05,.24,3.95],steel,[.35+side*1.02,1.04,0],undefined,door);
    for(const z of [-1.4,-.7,0,.7,1.4])box([1.85,.065,.08],edge,[.35+side*1.02,1.19,z],undefined,door);
    box([.1,.04,3.7],team,[.35+side*.1,1.19,0],undefined,door);
    for(const z of [-2.2,2.2])box([5.6,.06,.12],edge,[.35,1.1,z]);
  }
  box([1.15,1.25,2.4],concrete,[-2.8,1.1,0]);box([1.2,.18,2.5],steel,[-2.8,1.8,0]);
  box([.05,.55,1.55],dark,[-2.17,1.25,0]);box([.06,.25,.82],team,[-2.12,1.32,0]);
  for(let i=0;i<7;i++)box([.16,.06,.65],edge,[-3.38,.48+i*.18,0]);
  for(const z of [-2.75,2.75])for(const x of [-2.4,-1.2,0,1.2,2.4]) {
    part(new THREE.CylinderGeometry(.035,.035,.65,8),edge,[x,.95,z]);
    box([1.25,.045,.045],edge,[x,1.25,z]);
  }
  for(const z of [-2.2,2.2])for(const x of [-2.1,2.8]) {
    box([.26,.14,.26],amber,[x,1.22,z]);box([.5,.06,.52],dark,[x,1.12,z]);
  }
  for(const z of [-2.7,2.7])box([1.6,.055,.28],team,[.3,.85,z]);
  for(const x of [1.9,2.6])for(let i=0;i<4;i++)box([.06,.02,.4],dark,[x+i*.1,.86,2.5]);
  return mergeParts(root);
}

export function animateStrategicEquipment(entry,entity,game,dt) {
  if(!['ballistic','nuclearSilo'].includes(entity.type))return;
  entry.strategicParts||={launcher:entry.model.getObjectByName('strategic_launcher'),doors:['silo_door_left','silo_door_right'].map(name=>entry.model.getObjectByName(name))};
  const {launcher,doors}=entry.strategicParts;
  if(launcher){const deployment=Math.min(1,(entity.deployProgress||0)/5);launcher.rotation.z=deployment*.8;entry.displayTopHeight=entry.topHeight+deployment*45;}
  if(doors[0]) {
    const pending=game.players[entity.owner]?.nuclearPending,open=entity.owner===0&&pending?.sourceId===entity.id?1:0;
    entry.siloOpen=(entry.siloOpen||0)+(open-(entry.siloOpen||0))*(1-Math.exp(-dt*1.8));
    doors.forEach((door,i)=>door.position.x=(i===0?-1:1)*entry.siloOpen*2.1);
  }
}
