import * as THREE from 'three';
import { navalHullShell } from './naval-presentation.js';
import { craftedMaterial,mergeParts } from './model-craft.js';

// 原创两栖舰：贯通甲板、偏置舰岛与艉部车辆舱；尺寸为游戏表现参数。
export function createAmphibiousModel(){
 const root=new THREE.Group();root.name='amphibious';const hull=craftedMaterial('两栖舰船壳','#819497','coating',.64,.35),deck=craftedMaterial('两栖飞行甲板','#3e5359','coating',.85,.15),dark=craftedMaterial('两栖舰窗带','#20383e','rubber',.8,.05),mark=new THREE.MeshStandardMaterial({name:'两栖甲板标线',color:'#d8d4aa',roughness:.85});
 const part=(w,h,d,x,y,z,m= hull)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);root.add(mesh);return mesh;};
 const shell=new THREE.Mesh(navalHullShell(-14,15,8,-1,2.8),hull);root.add(shell);part(28,.25,7.8,0,3,0,deck);
 for(const x of [-8,0,8]){const ring=new THREE.Mesh(new THREE.RingGeometry(1.5,1.56,28),mark);ring.rotation.x=-Math.PI/2;ring.position.set(x,3.14,-.8);root.add(ring);part(.1,.02,1.4,x-.4,3.15,-.8,mark);part(.1,.02,1.4,x+.4,3.15,-.8,mark);part(.8,.02,.1,x,3.15,-.8,mark);}
 part(9,2,2.2,-1,4.15,2.55);part(4.5,1.8,2,-3,6,2.5);part(4.6,.5,2.1,-3,6.25,2.5,dark);part(.18,3.5,.18,-1,8,2.55);part(2,.3,.45,-1,9.5,2.55);part(.1,.05,25,0,3.15,-3.5,mark);
 part(.12,1.8,5.4,-14,1.45,0,dark);const ramp=new THREE.Group();ramp.name='landing_ramp';ramp.position.set(-14,.65,0);const plate=new THREE.Mesh(new THREE.BoxGeometry(3,.16,4.2),hull);plate.position.x=-1.5;ramp.add(plate);root.add(ramp);
 for(const z of [-3.5,3.5]){part(1.8,.8,1.1,10,3.65,z);part(1,.08,.12,10.6,4,z,dark);}
 mergeParts(root);root.userData.amphibious=true;return root;
}
