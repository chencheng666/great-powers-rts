import * as THREE from 'three';
import { mergeParts, craftedMaterial } from './model-craft.js';
import { refineAirfieldRunway } from './airfield-presentation.js';

export function createProceduralAirfield() {
  const root=new THREE.Group();root.name='airfield';
  const body=new THREE.Group();body.name='机场地面保障设施';root.add(body);
  const concrete=craftedMaterial('机场混凝土','#81877c','coating',.94,.05);
  const roof=craftedMaterial('机库防护屋面','#637269','coating',.83,.22);
  const steel=craftedMaterial('机场检修金属','#88969a','coating',.5,.55);
  const dark=new THREE.MeshStandardMaterial({name:'机库内部',color:'#1d2a2c',roughness:.92});
  const glass=new THREE.MeshStandardMaterial({name:'塔台玻璃',color:'#304d58',roughness:.24,metalness:.35});
  const team=new THREE.MeshStandardMaterial({name:'阵营标识',color:'#64d8e4',roughness:.7});
  const add=(g,m,pos,rotation)=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(...pos);if(rotation)mesh.rotation.set(...rotation);body.add(mesh);return mesh;};
  const box=(m,pos,size)=>add(new THREE.BoxGeometry(...size),m,pos);
  for(const x of [-2.55,1.1]){
    const radius=1.48,inner=1.3,base=.3;
    const shape=new THREE.Shape();shape.moveTo(-radius,0);shape.lineTo(-radius,base);shape.absarc(0,base,radius,Math.PI,0,true);shape.lineTo(radius,0);shape.closePath();
    const hole=new THREE.Path();hole.moveTo(-inner,0);hole.lineTo(inner,0);hole.lineTo(inner,base);hole.absarc(0,base,inner,0,Math.PI,false);hole.closePath();shape.holes.push(hole);
    const arch=new THREE.ExtrudeGeometry(shape,{depth:2.8,bevelEnabled:false,curveSegments:12});
    add(arch,roof,[x,.08,-4.1]);
    box(dark,[x,.8,-3.98],[2.58,1.45,.08]);
    box(concrete,[x,.08,-2.7],[3.15,.12,3.0]);
    for(const side of [-1,1])box(steel,[x+side*1.31,.72,-1.27],[.065,1.3,.065]);
    box(steel,[x,1.4,-1.27],[2.62,.06,.065]);
    for(let i=0;i<4;i++)box(steel,[x+sideOffset(i),.19,-.9],[.025,.025,.55]);
    // 拱壳截面和门框成形，机库内部留空，避免用实心方块表示机库。
    for(const z of [-3.8,-2.7,-1.6]){
      const rib=new THREE.TorusGeometry(radius+.014,.025,3,20,Math.PI);add(rib,concrete,[x,.38,z]);
    }
  }
  box(concrete,[4.03,1.25,-2.65],[.86,2.4,.92]);
  box(steel,[4.03,2.51,-2.65],[1.65,.14,1.55]);
  box(glass,[4.03,2.93,-2.65],[1.52,.72,1.43]);
  box(roof,[4.03,3.34,-2.65],[1.72,.13,1.63]);
  for(const dx of [-.72,0,.72])for(const dz of [-.68,.68])box(steel,[4.03+dx,2.94,-2.65+dz],[.055,.76,.055]);
  box(team,[4.03,1.89,-2.16],[.66,.13,.018]);
  for(let y=.3;y<2.4;y+=.2)box(steel,[4.5,y,-2.65],[.08,.03,.45]);
  for(const x of [-4.08,-3.4]){
    add(new THREE.CylinderGeometry(.22,.22,.58,12),steel,[x,.42,.05]);
    box(dark,[x,.74,.05],[.4,.04,.38]);
  }
  mergeParts(body);refineAirfieldRunway(root);
  root.userData.proceduralFacility=true;root.userData.airfieldLayout={hangars:2,towers:1,parking:6};
  return root;
}
const sideOffset=i=>-.7+i*.46;
