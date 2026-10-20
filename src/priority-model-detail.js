import * as THREE from 'three';
import { craftedMaterial, roundedPart } from './model-craft.js';

// 原创外观细化，仅驱动表现关节，不读取或修改武器判定参数。
export function refinePriorityModel(root, type) {
  if (!['fighter_nato','helicopter','ballistic'].includes(type) || root.userData.priorityDetail) return root;
  root.userData.priorityDetail = true;
  const metal = craftedMaterial('机加工结构','#a7b3b8','coating',.36,.78);
  const dark = craftedMaterial('消光机构','#222c30','coating',.8,.35);
  const rubber = craftedMaterial('起落架轮胎','#1b2425','rubber',.97,0);
  const paint = craftedMaterial(type==='ballistic'?'装甲钢':'分区蒙皮',type==='ballistic'?'#657567':type==='helicopter'?'#66745d':'#9aa8ae',type==='ballistic'?'armor':'aircraft',.72,.25);
  const optic = new THREE.MeshPhysicalMaterial({name:'光学镀膜',color:'#356a79',metalness:.2,roughness:.1,clearcoat:1});
  const mesh = (geometry, material, position, rotation=[0,0,0], parent=root) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(...position); m.rotation.set(...rotation); parent.add(m); return m;
  };
  const box = (size, material, position, rotation, parent) => mesh(roundedPart(size,.025),material,position,rotation,parent);
  const tube = (r,length,material,position,rotation=[0,0,Math.PI/2],parent=root) => mesh(new THREE.CylinderGeometry(r,r,length,10),material,position,rotation,parent);
  const joint = (name, position, parent=root) => { const g=new THREE.Group();g.name=name;g.position.set(...position);parent.add(g);return g; };
  if (type==='fighter_nato') {
    root.userData.groundClearance=1.07;
    box([.48,.32,.4],dark,[1.08,.43,0]);
    mesh(new THREE.SphereGeometry(.135,10,8),rubber,[1.15,.66,0]);
    box([.06,.28,.5],paint,[.6,.48,0],[0,0,-.35]);
    for (const side of [-1,1]) {
      box([.035,.32,.24],dark,[.86,-.23,side*.78],[0,side*.18,0]);
      for (let i=0;i<5;i++) box([.035,.19,.035],metal,[.81,-.23,side*(.68+i*.045)]);
      for (let i=0;i<6;i++) box([.09,.018,.035],dark,[-1.65+i*.15,.345,side*.52],[0,side*.3,0]);
      box([2.5,.018,.025],dark,[-.1,.33,side*.38],[0,0,.01]);
      const gear=joint(`fighter_gear_${side<0?'left':'right'}`,[-1.2,-.3,side*.65]);
      tube(.065,.58,metal,[0,-.28,0],[0,0,0],gear);
      box([.55,.04,.22],paint,[0,-.04,side*.1],undefined,gear);
      tube(.2,.13,rubber,[0,-.57,0],[Math.PI/2,0,0],gear);
      tube(.08,.14,metal,[0,-.57,0],[Math.PI/2,0,0],gear);
      gear.visible=false;
      const bay=joint(`fighter_bay_${side<0?'left':'right'}`,[-.6,-.43,side*.38]);
      box([1.65,.035,.36],paint,[0,0,-side*.18],undefined,bay);
      bay.userData.side=side;
    }
    const nose=joint('fighter_gear_nose',[2,-.27,0]);
    tube(.045,.58,metal,[0,-.28,0],[0,0,-.12],nose);
    tube(.15,.12,rubber,[.04,-.57,0],[Math.PI/2,0,0],nose);nose.visible=false;
    for (const z of [-.18,.18]) {
      tube(.065,1.25,metal,[-.6,-.46,z]);
      box([.22,.025,.28],dark,[-1.1,-.46,z]);
    }
  } else if (type==='helicopter') {
    const sensor=joint('helicopter_sensor',[2.72,1.2,0]);
    mesh(new THREE.SphereGeometry(.29,14,10),dark,[0,0,0],undefined,sensor);
    for (const z of [-.12,.12]) mesh(new THREE.SphereGeometry(.1,10,8),optic,[.235,.055,z],undefined,sensor);
    const yaw=joint('helicopter_gun_yaw',[2.2,.85,0]),pitch=joint('helicopter_gun_pitch',[0,0,0],yaw);
    box([.36,.25,.38],dark,[0,0,0],undefined,pitch);
    const barrel=joint('helicopter_barrel',[0,0,0],pitch);
    tube(.065,1.3,metal,[.65,-.04,0],undefined,barrel);
    tube(.09,.17,dark,[1.3,-.04,0],undefined,barrel);
    for(const side of [-1,1]) {
      for(const z of [side*1.3,side*1.75]) {
        box([.18,.25,.1],metal,[-.4,.98,z]);
        for(const offset of [-.065,.065]) tube(.04,.45,metal,[.08,.75,z+offset]);
      }
      box([.15,.1,.48],dark,[1.9,1.15,side*.69]);
      for(let i=0;i<7;i++)box([.075,.04,.22],dark,[-1.35+i*.14,2.4,side*.94]);
      tube(.025,.7,metal,[-2.4,1.63,side*.45],[0,0,-.4]);
    }
    tube(.16,.14,metal,[-.55,2.94,0],[0,0,0]);
  } else {
    const supports=joint('launcher_supports',[0,1.15,0]);
    supports.scale.y=.15;
    for(const x of [-2.4,.65])for(const z of [-1.5,1.5]) {
      tube(.08,1.15,metal,[x,.7,z],[0,0,0],supports);
      box([.52,.12,.45],dark,[x,.08,z],undefined,supports);
    }
    const hydraulic=joint('launcher_hydraulics',[-2.7,1.5,0]);
    for(const z of [-.68,.68]) {
      tube(.095,.5,dark,[0,.25,z],[0,0,0],hydraulic);
      tube(.045,.85,metal,[0,.57,z],[0,0,0],hydraulic);
    }
    for(const side of [-1,1]) {
      box([.035,.44,.88],optic,[3.64,2.02,side*.48]);
      box([.06,.5,.05],dark,[3.67,2.02,side*.95]);
      box([.08,.06,.32],metal,[2.55,1.72,side*1.22]);
      box([1.2,.04,.7],paint,[1.4,2.41,side*.58]);
      for(let i=0;i<5;i++)box([.05,.2,.03],dark,[-2.4+i*.21,1.48,side*1.2]);
    }
    box([.06,.5,.05],dark,[3.67,2.02,0]);
    box([.08,.05,1.95],dark,[3.67,2.27,0]);
  }
  return root;
}

export function animatePriorityAircraft(entry, entity, game, dt, height) {
  if (!['fighter','helicopter'].includes(entity.type)) return;
  entry.priorityParts ||= {
    gears:['fighter_gear_left','fighter_gear_right','fighter_gear_nose'].map(name=>entry.model.getObjectByName(name)),
    bays:['fighter_bay_left','fighter_bay_right'].map(name=>entry.model.getObjectByName(name)),
    sensor:entry.model.getObjectByName('helicopter_sensor'),yaw:entry.model.getObjectByName('helicopter_gun_yaw'),
    pitch:entry.model.getObjectByName('helicopter_gun_pitch'),barrel:entry.model.getObjectByName('helicopter_barrel')
  };
  const parts=entry.priorityParts,grounded=game.aircraftGrounded(entity);
  const deployment=grounded || height < 38 ? 1 : 0;
  entry.gearDeployment ??= deployment;
  entry.gearDeployment += (deployment-entry.gearDeployment)*(1-Math.exp(-Math.max(0,dt)*4));
  parts.gears.forEach((g,i)=>{if(g){g.visible=entry.gearDeployment>.015;g.rotation.x=(i===0?-1:1)*(1-entry.gearDeployment)*1.35;}});
  const firing=!grounded && game.time-(entity.lastFireAt??-100)>=0 && game.time-(entity.lastFireAt??-100)<.65;
  entry.bayDeployment ??= 0;
  entry.bayDeployment += (Number(firing)-entry.bayDeployment)*(1-Math.exp(-Math.max(0,dt)*12));
  parts.bays.forEach((b,i)=>{if(b)b.rotation.x=(i===0?-1:1)*entry.bayDeployment*1.15;});
  const a=entry.animation;
  if(parts.yaw&&a) {
    const aim=Math.atan2(Math.sin(entry.heading-a.turret),Math.cos(entry.heading-a.turret));
    parts.yaw.rotation.y=Math.max(-1.3,Math.min(1.3,aim));
    parts.sensor.rotation.y=parts.yaw.rotation.y*.8;
    parts.pitch.rotation.z=grounded?0:-.12;
    parts.barrel.position.x=-.07*(a.recoil||0);
  }
}
