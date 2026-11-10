import * as THREE from 'three';
import { mergeParts } from './model-craft.js';

// 满甲板使用共享的折翼停机模型；空中仍使用原有完整机型与起飞比例。
export function createCarrierParkedAircraft(type, color) {
  const group=new THREE.Group();group.name='折翼停放舰载机';
  const body=new THREE.MeshStandardMaterial({name:'舰载机浅灰涂装',color:type==='navalFighter'?'#b5c6cd':'#899fab',roughness:.7,metalness:.25});
  const canopy=new THREE.MeshStandardMaterial({name:'舰载机深色座舱',color:'#183c50',roughness:.25,metalness:.55});
  const accent=new THREE.MeshStandardMaterial({name:'舰载机队色',color,roughness:.7});
  const box=(size,pos,material,angle=0)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);m.rotation.x=angle;m.castShadow=true;group.add(m);};
  const fuselage=new THREE.Mesh(new THREE.ConeGeometry(.12,1.85,6),body);fuselage.rotation.z=-Math.PI/2;fuselage.position.y=.18;fuselage.castShadow=true;group.add(fuselage);
  box([1.05,.16,.25],[-.12,.17,0],body);
  box([.38,.12,.16],[.34,.3,0],canopy);
  for(const sign of [-1,1]){
    box([.68,.055,.23],[-.15,.2,sign*.2],body);
    box([.55,.055,.32],[-.2,.34,sign*.27],body,sign*1.1);
    box([.3,.05,.19],[-.65,.22,sign*.18],body);
    box([.32,.2,.045],[-.67,.35,sign*.105],accent);
    // 双发喷口与折翼分开保留轮廓，满甲板时仍使用共用的三种材质。
    const exhaust=new THREE.Mesh(new THREE.CylinderGeometry(.065,.075,.16,8),canopy);exhaust.rotation.z=Math.PI/2;exhaust.position.set(-.79,.16,sign*.105);exhaust.castShadow=true;group.add(exhaust);
    box([.19,.035,.17],[.43,.18,sign*.15],body);
    box([.13,.08,.045],[-.37,.055,sign*.135],canopy);
  }
  box([.08,.08,.05],[.53,.055,0],canopy);
  box([.22,.05,.27],[-.35,.27,0],accent);
  return mergeParts(group);
}
