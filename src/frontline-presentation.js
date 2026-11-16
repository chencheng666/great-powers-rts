import * as THREE from 'three';
import { mergeParts, craftedMaterial } from './model-craft.js';

export function createFrontlineWarehouse(){
  const root=new THREE.Group();root.name='frontlineWarehouse';
  const concrete=craftedMaterial('仓储混凝土','#9c9d8d','coating',.94,.05),steel=craftedMaterial('仓储钢板','#73887e','coating',.8,.25);
  const dark=new THREE.MeshStandardMaterial({name:'仓门阴影',color:'#354846',roughness:.92});
  const team=new THREE.MeshStandardMaterial({name:'阵营标识',color:'#64d8e4',emissive:'#64d8e4',emissiveIntensity:.18});
  const yellow=new THREE.MeshStandardMaterial({name:'仓库安全线',color:'#d4be78',roughness:.88});
  const box=(m,size,p,angle=0)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),m);mesh.position.set(...p);mesh.rotation.z=angle;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);};
  box(concrete,[7.1,.18,7.2],[0,.12,0]);box(concrete,[5.6,1.8,3.8],[-.35,1.1,-1]);
  for(const side of [-1,1])box(steel,[3.1,.12,4.1],[-.35+side*1.4,2.25,-1],-side*.16);
  for(let x=-2.8;x<2.3;x+=.35)box(steel,[.035,1.7,.035],[x,1.12,.93]);
  for(const x of [-1.9,-.15,1.6]){
    box(dark,[1.25,1.45,.08],[x,.95,.95]);
    for(let y=.42;y<1.55;y+=.17)box(steel,[1.2,.035,.06],[x,y,1.01]);
    box(yellow,[1.4,.018,.07],[x,.23,2.7]);
    box(concrete,[1.45,.3,.6],[x,.27,1.35]);
  }
  for(let i=0;i<6;i++){
    const x=-2.55+i%3*.9,z=2+Math.floor(i/3)*.8;
    box(steel,[.68,.55,.55],[x,.48,z]);box(yellow,[.06,.56,.56],[x,.48,z]);
  }
  for(const x of [2.6,3.2]){
    const tank=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.8,12),steel);tank.position.set(x,.62,2.3);root.add(tank);
  }
  box(team,[2.8,.18,.05],[-.35,1.94,.98]);root.userData.frontlineWarehouse=true;
  return mergeParts(root);
}

export function createFrontlinePiers(game,home,track){
  const root=new THREE.Group();root.name='六个编制泊位';
  const concrete=track(new THREE.MeshStandardMaterial({color:'#9b9b89',roughness:.91}));
  const rubber=track(new THREE.MeshStandardMaterial({color:'#35474a',roughness:.9}));
  const light=track(new THREE.MeshStandardMaterial({color:'#d4bf73',emissive:'#b89b42',emissiveIntensity:.15}));
  const angle=game.frontlineHarborAngle(home),forward={x:Math.cos(angle),y:Math.sin(angle)};
  const box=(m,size,p)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),m);mesh.position.set(...p);mesh.rotation.y=-angle;mesh.receiveShadow=true;root.add(mesh);};
  for(let slot=0;slot<6;slot++){
    const p=game.frontlineBerth({type:'frigate',owner:home.owner,assignment:{homeId:home.id,slot}},home);
    // 船体中心留空，突堤与防撞墩位于泊位侧面；模拟仍以同一泊位中心调度。
    const x=p.x-forward.y*76,y=p.y+forward.x*76;
    if(slot<3){
      const far=game.frontlineBerth({type:'frigate',owner:home.owner,assignment:{homeId:home.id,slot:slot+3}},home),across=(slot-1)*235+76;
      const start={x:home.x-forward.x*140-forward.y*across,y:home.y-forward.y*140+forward.x*across};
      const end={x:far.x+forward.x*95-forward.y*76,y:far.y+forward.y*95+forward.x*76};
      const length=(end.x-start.x)*forward.x+(end.y-start.y)*forward.y;
      box(concrete,[Math.max(190,length),7,22],[(start.x+end.x)/2,4,(start.y+end.y)/2]);
    }
    for(const offset of [-65,0,65]){box(rubber,[14,12,9],[x+forward.x*offset+forward.y*14,6,y+forward.y*offset-forward.x*14]);}
    for(const end of [-1,1])box(light,[5,8,5],[x+forward.x*85*end,10,y+forward.y*85*end]);
  }
  const merged=mergeParts(root);merged.traverse(mesh=>{if(mesh.isMesh)track(mesh.geometry);});return merged;
}

export function createDeliveryCanopy(track){
  const root=new THREE.Group(),cloth=track(new THREE.MeshStandardMaterial({color:'#c5c7a1',side:THREE.DoubleSide,roughness:.9}));
  const canopy=new THREE.Mesh(track(new THREE.SphereGeometry(1,12,5,0,Math.PI*2,0,Math.PI/2)),cloth);canopy.scale.y=.42;root.add(canopy);
  const points=[];for(let i=0;i<8;i++){const a=i/8*Math.PI*2;points.push(Math.cos(a),0,Math.sin(a),0,-1.35,0);}
  const cords=track(new THREE.BufferGeometry());cords.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  root.add(new THREE.LineSegments(cords,track(new THREE.LineBasicMaterial({color:'#d9d5b6'}))));return root;
}
