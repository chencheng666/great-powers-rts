import * as THREE from 'three';
import { bodyLoft, craftedMaterial, mergeParts, roundedPart } from './model-craft.js';
import { refinePriorityModel } from './priority-model-detail.js';

export const STRATEGIC_MODELS=['fighter_nato','helicopter','ballistic','abm','counterIntel','swarmCarrier','swarmScout','swarmDecoy'];

export function createStrategicModel(type) {
  const root=new THREE.Group();root.name=type;
  const coat=craftedMaterial('军用复合涂层',type==='fighter_nato'?'#8d999e':type==='swarmCarrier'?'#c3cccf':'#657567','coating',.64,.28);
  const dark=craftedMaterial('深色金属','#283335','coating',.43,.68);
  const metal=craftedMaterial('钛合金','#a3b0b5','coating',.36,.76);
  const rubber=craftedMaterial('轮胎橡胶','#1d2525','rubber',.95,0);
  const glass=new THREE.MeshPhysicalMaterial({name:'座舱玻璃',color:type==='fighter_nato'?'#b9ab84':type==='helicopter'?'#6c8b94':'#385965',metalness:.08,roughness:.14,clearcoat:1,transparent:true,opacity:['fighter_nato','helicopter'].includes(type)?.55:.82,depthWrite:false});
  const team=craftedMaterial('阵营标识','#59d7ec','coating',.5,.25);
  const panels=craftedMaterial('分区蒙皮','#74858b','coating',.77,.2);
  const add=(g,m,p=[0,0,0],r=[0,0,0],parent=root)=>{const mesh=new THREE.Mesh(g,m);mesh.position.set(...p);mesh.rotation.set(...r);parent.add(mesh);return mesh;};
  const box=(s,m,p,r,parent)=>add(roundedPart(s,.045),m,p,r,parent);
  const tube=(radius,length,m,p,r=[0,0,Math.PI/2],parent=root)=>add(new THREE.CylinderGeometry(radius,radius,length,12),m,p,r,parent);
  const panel=(points,y,m,parent=root)=>{
    const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,z)));
    return add(new THREE.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:false}),m,[0,y,0],[Math.PI/2,0,0],parent);
  };
  const fuselage=(sections,m,p=[0,0,0],parent=root)=>add(bodyLoft(sections,20),m,p,[0,0,-Math.PI/2],parent);
  const tail=(x,y,z,lean=0,parent=root)=>box([1.5,1.4,.09],coat,[x,y,z],[lean,0,.42],parent);
  const fin=(points,z,lean)=>{
    const shape=new THREE.Shape(points.map(([x,y])=>new THREE.Vector2(x,y)));
    return add(new THREE.ExtrudeGeometry(shape,{depth:.09,bevelEnabled:false}),coat,[0,0,z],[lean,0,0]);
  };

  if(['ballistic','abm','counterIntel'].includes(type)) {
    box([7.6,.65,2.25],dark,[0,.9,0]);box([2.05,1.32,2.35],coat,[2.6,1.72,0]);
    box([1.45,.56,2.39],glass,[2.66,2.04,0]);box([.15,.28,1.8],metal,[3.69,1.14,0]);
    for(const z of [-1.25,1.25])for(const x of [-2.65,-1.05,1.1,2.65]) {
      tube(.62,.36,rubber,[x,.67,z],[Math.PI/2,0,0]);tube(.29,.38,metal,[x,.67,z],[Math.PI/2,0,0]);
      box([.75,.13,.1],team,[x,1.42,z]);
    }
    for(const z of [-.72,.72])box([.15,.22,.4],metal,[3.78,1.53,z]);
    const weapon=new THREE.Group();weapon.name='weapon';root.add(weapon);
    if(type==='ballistic') {
      box([5.2,.3,1.5],coat,[-.9,1.52,0]);
      const launcher=new THREE.Group();launcher.name='strategic_launcher';launcher.position.set(-3,1.8,0);weapon.add(launcher);
      tube(.57,5.6,coat,[2.6,0,0],[0,0,Math.PI/2],launcher);
      add(new THREE.ConeGeometry(.57,1.2,20),dark,[6,0,0],[0,0,-Math.PI/2],launcher);
      for(const x of [.2,2.4,4.8])tube(.61,.15,metal,[x,0,0],[0,0,Math.PI/2],launcher);
      for(const side of [-1,1]){box([.25,.65,.15],metal,[-2.7,1.65,side*.62]);box([.15,.85,.15],dark,[-.6,1.7,side*.6],[0,0,-.3]);}
      box([1.2,.16,.7],team,[-2.1,1.74,0]);
    } else {
      box([4.2,1.2,2.05],coat,[-1,1.8,0]);
      if(type==='abm') {
        for(const z of [-.57,.57])for(const y of [2.3,2.9])box([3.8,.48,.48],metal,[-1,y,z],[0,0,.22],weapon);
        for(const z of [-.57,.57])for(const y of [2.3,2.9])box([.08,.38,.38],dark,[.93,y+.43,z],[0,0,.22],weapon);
        box([.22,1.1,1.7],dark,[1.3,3,0],[0,0,-.12]);
      } else {
        const mast=new THREE.Group();mast.name='counter_intel_mast';mast.position.set(-1,2.4,0);root.add(mast);
        tube(.07,2.6,metal,[0,.9,0],[0,0,0],mast);
        const array=new THREE.Group();array.name='counter_intel_array';array.position.y=1.7;mast.add(array);
        box([.15,1.25,2.7],metal,[0,0,0],[0,0,.18],array);
        for(const z of [-.9,-.3,.3,.9])box([.08,.85,.44],panels,[.1,0,z],[0,0,.18],array);
        for(const z of [-.95,.95])tube(.035,1.7,dark,[-1.25,1,z],[0,0,0],mast);
      }
      box([1.4,.12,1.4],team,[-1.5,2.43,0]);
    }
    for(const side of [-1,1]) {
      box([1.8,.32,.13],dark,[-2.1,1.25,side*1.18]);
      for(let i=0;i<7;i++)box([.055,.24,.04],metal,[-2.8+i*.22,1.28,side*1.27]);
      box([.65,.12,.15],metal,[2.5,1.27,side*1.28]);
      for(let i=0;i<4;i++)box([.055,.48,.04],panels,[2+i*.24,1.65,side*1.21]);
    }
  } else if(type==='helicopter') {
    fuselage([[-4,.05,.06],[-3,.18,.18],[-1.7,.55,.55],[.6,.82,.78],[2.6,.57,.61],[3.25,.05,.07]],coat,[0,1.3,0]);
    fuselage([[.15,.4,.53],[.8,.63,.64],[1.65,.58,.57],[2.6,.29,.35]],glass,[0,1.72,0]);
    for(const x of [.8,1.6])box([.07,.8,1.12],dark,[x,1.93,0],[0,0,-.3]);
    for(const side of [-1,1]) {
      const z=side*1.05;
      tube(.29,1.9,dark,[-1.1,2.1,z]);tube(.22,.4,metal,[-2.2,2.1,z]);
      panel([[-1,side*.65],[.35,side*.68],[-.1,side*2.1],[-1.2,side*2]],1,coat);
      for(const dz of [side*1.3,side*1.75])tube(.12,1.3,dark,[-.55,.75,dz]);
      tube(.31,.24,rubber,[.5,.2,side*.95],[Math.PI/2,0,0]);
      box([.08,.7,.09],metal,[.45,.53,side*.8],[side*.3,0,0]);
      box([1.1,.08,.22],team,[-.65,1.14,side*1.8]);
    }
    tube(.22,.25,rubber,[-3,.24,0],[Math.PI/2,0,0]);tail(-3.4,1.8,0);
    tube(.1,.8,metal,[-.55,2.5,0],[0,0,0]);
    const rotor=new THREE.Group();rotor.name='rotor_0_main';rotor.position.set(-.55,2.86,0);root.add(rotor);
    for(const angle of [0,Math.PI/2])box([11,.045,.22],dark,[0,0,0],[0,angle,0],rotor);
    const tailRotor=new THREE.Group();tailRotor.name='rotor_1_tail';tailRotor.userData.rotationAxis='z';tailRotor.position.set(-3.65,1.5,.3);root.add(tailRotor);
    for(const angle of [0,Math.PI/2])box([1.4,.08,.04],metal,[0,0,0],[0,0,angle],tailRotor);
    for(const side of [-1,1]) {
      box([2.4,.045,.06],metal,[.9,1.75,side*.58],[0,0,-.07]);
      for(let i=0;i<5;i++)box([.04,.3,.35],panels,[-.7-i*.23,2.21,side*1.2]);
      tube(.07,.55,metal,[.1,2.87,side*.15],[0,0,.3]);
    }
  } else if(type==='fighter_nato') {
    fuselage([[-4,.15,.6],[-3,.36,.95],[-1,.38,.82],[1.1,.31,.6],[3.1,.22,.32],[4.7,.015,.015]],coat);
    for(const side of [-1,1]) {
      fuselage([[-4.1,.16,.27],[-3.1,.33,.41],[-1.5,.28,.38],[-.5,.07,.15]],panels,[0,.02,side*.5]);
      panel([[1.65,side*.5],[-.55,side*3.7],[-2.85,side*3.45],[-1.65,side*.65]],0,coat);
      panel([[-2.2,side*.65],[-3.3,side*2.15],[-4.25,side*1.65],[-3.9,side*.55]],.08,coat);
      fin([[-4,.18],[-3.3,1.62],[-2.32,1.72],[-2.76,.18]],side*.82,side*.36);
      panel([[-1.35,side*1.15],[-.7,side*3.25],[-2.48,side*3.1],[-1.95,side*1.35]],.045,panels);
      panel([[-3.4,side*.87],[-3.6,side*1.7],[-4.05,side*1.5],[-3.87,side*.7]],.12,panels);
      box([1.15,.45,.38],dark,[.3,-.25,side*.76],[0,side*.17,0]);
      box([.42,.4,.68],metal,[-4.05,-.04,side*.5]);box([.04,.23,.5],dark,[-4.28,-.04,side*.5]);
      for(let i=0;i<4;i++)box([.32,.025,.055],dark,[-4.06,.18,side*(.25+i*.15)]);
      box([1.2,.025,.13],team,[-1,.07,side*2.8]);
      panel([[1.05,side*.68],[-.35,side*2.9],[-.48,side*2.84],[.94,side*.64]],.025,metal);
      panel([[2.7,side*.3],[2.1,side*.48],[.2,side*.68],[.05,side*.63],[2.05,side*.4]],.29,panels);
    }
    fuselage([[.3,.08,.22],[.7,.3,.35],[1.6,.31,.33],[2.15,.04,.16]],glass,[0,.25,0]);
    box([.06,.23,.55],metal,[.63,.47,0],[0,0,-.4]);
    box([1.1,.04,.045],metal,[1.19,.57,0],[0,0,-.04]);
    box([1.4,.025,.85],dark,[-.6,-.41,0]);
  } else if(type==='swarmCarrier') {
    fuselage([[-5,.08,.1],[-3.3,.52,.6],[1.9,.62,.7],[4.1,.33,.45],[5,.02,.02]],coat);
    for(const side of [-1,1]) {
      panel([[.8,side*.55],[-.5,side*6.8],[-1.6,side*6.9],[-1.1,side*.55]],.2,coat);
      panel([[-3.3,side*.4],[-4.6,side*2.1],[-5,side*1.6],[-4.2,side*.35]],.3,coat);
      box([2.8,.32,.48],dark,[-.5,-.5,side*.57]);
      for(let i=0;i<4;i++)box([.35,.05,.35],metal,[-1.35+i*.55,-.68,side*.58]);
      box([1.8,.025,.22],team,[-.6,.27,side*4]);
    }
    tail(-4.2,1.1,0);tube(.36,1.7,dark,[-1.9,1.03,0]);
    add(new THREE.SphereGeometry(.32,12,8),glass,[3.25,-.43,0]);
  } else {
    const scout=type==='swarmScout';
    fuselage([[-1.8,.05,.05],[-.7,.22,.25],[1.1,.2,.22],[1.8,.02,.02]],scout?coat:metal);
    for(const side of [-1,1]) {
      panel([[.6,side*.2],[-.25,side*2],[-.8,side*2],[-.5,side*.2]],.03,coat);
      box([.6,.06,.18],team,[-.3,.1,side*1.6]);
    }
    tail(-1.3,.35,0);
    if(scout)add(new THREE.SphereGeometry(.21,12,8),glass,[.95,-.25,0]);
    else for(const z of [-.38,.38])tube(.09,1.4,dark,[-.2,-.1,z]);
  }
  refinePriorityModel(root,type);
  return mergeParts(root);
}
