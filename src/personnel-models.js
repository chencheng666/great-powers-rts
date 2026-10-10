import * as THREE from 'three';
import { bodyLoft, craftedMaterial, mergeParts, roundedPart } from './model-craft.js';

const compact = mergeParts;

export function createPersonnel(type, { distant = false } = {}) {
  const root = new THREE.Group(); root.name = type;
  const group = new THREE.Group(); group.name = 'upper_body'; root.add(group);
  const weaponPose = new THREE.Group(); weaponPose.name = 'weapon_pose'; group.add(weaponPose);
  const spy = type === 'scout', engineer = type === 'engineer';
  const fabric = craftedMaterial('战术织物', spy ? '#272b31' : engineer ? '#6c7762' : '#566650', 'fabric', .95, 0);
  const dark = craftedMaterial('皮革与橡胶', '#252b2d', 'rubber', .87, 0);
  const armor = craftedMaterial('携行具', '#485549', 'fabric', .9, 0);
  const steel = craftedMaterial('武器金属', '#677176', 'coating', .5, .65);
  const skin = new THREE.MeshStandardMaterial({ name: '皮肤', color: '#bb937c', roughness: .85 });
  const shirt = craftedMaterial('衬衣与工程护具', engineer ? '#b59d62' : '#d5d5ca', 'fabric', .92, 0);
  const team = new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#64d8e4', emissive: '#64d8e4', emissiveIntensity: .12, roughness: .7 });
  const mesh = (parent, geometry, material, position, rotation) => {
    const m = new THREE.Mesh(geometry, material); m.position.set(...position); if (rotation) m.rotation.set(...rotation); parent.add(m); return m;
  };
  const box = (parent, mat, pos, size, rotation) => mesh(parent, distant ? new THREE.BoxGeometry(...size) : roundedPart(size, .02), mat, pos, rotation);
  const sphere = (parent, mat, pos, radius, scale = [1, 1, 1]) => { const m = mesh(parent, new THREE.SphereGeometry(radius, distant ? 8 : 16, distant ? 6 : 12), mat, pos); m.scale.set(...scale); return m; };
  const limb = (parent, mat, from, to, radius) => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), length = a.distanceTo(b);
    const m = mesh(parent, new THREE.CapsuleGeometry(radius, Math.max(.01, length - radius * 2), distant ? 1 : 5, distant ? 6 : 12), mat, a.clone().add(b).multiplyScalar(.5).toArray());
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize()); return m;
  };
  mesh(group, bodyLoft([[.88,.12,.16],[1.03,.145,.18],[1.18,.145,.19],[1.35,.15,.22],[1.45,.12,.24],[1.51,.075,.13]], distant ? 8 : 20), fabric, [0,0,0]);
  sphere(group, fabric, [-.015,.92,0], .15, [.8,.8,1.12]);
  box(group, dark, [0,.94,0], [.265,.055,.34]);
  box(group, spy || engineer ? steel : dark, [.145,.94,0], [.03,.035,.045]);
  limb(group, skin, [0,1.51,0], [0,1.65,0], .058);
  sphere(group, skin, [.015,1.745,0], .126, [.86,1.11,.85]);
  sphere(group, skin, [.082,1.675,0], .056, [.6,.55,1]);
  sphere(group, skin, [.13,1.724,0], .026, [1,.85,.65]);
  for (const side of [-1,1]) {
    sphere(group, skin, [.003,1.725,side*.11], .026, [.65,1,.55]);
    if (!spy) {
      sphere(group, dark, [.117,1.762,side*.043], .012, [.35,.6,1]);
      box(group, dark, [.116,1.786,side*.044], [.012,.008,.034], [side*.1,0,0]);
    }
    const leg = new THREE.Group(); leg.name = side < 0 ? 'leg_left' : 'leg_right'; leg.position.set(-.01,.91,side*.105); root.add(leg);
    mesh(leg, bodyLoft([[-.44,.067,.075],[-.32,.083,.085],[-.10,.095,.089],[0,.09,.085]], distant ? 8 : 20), fabric, [0,0,0]);
    const knee = new THREE.Group(); knee.name = side < 0 ? 'knee_left' : 'knee_right'; knee.position.y = -.43; leg.add(knee);
    mesh(knee, bodyLoft([[-.36,.045,.055],[-.25,.064,.06],[-.10,.072,.068],[.035,.065,.075]], distant ? 8 : 20), fabric, [0,0,0]);
    box(knee, dark, [.033,-.375,0], [.205,.12,.138]);
    box(knee, dark, [.033,-.437,0], [.21,.02,.142]);
    for (const x of [-.025,.015,.055,.085]) box(knee, dark, [x,-.45,0], [.015,.011,.14]);
    if (!spy) {
      sphere(knee, armor, [.071,.0,0], .071, [.37,1.15,.88]);
      box(leg, fabric, [-.01,-.16,side*.075], [.10,.15,.025]);
    }
  }
  // 步枪手的前臂与手腕围绕枪托、握把和护木布置，避免武器悬空。
  for (const side of [-1,1]) {
    const arm = spy || engineer ? group : weaponPose;
    const shoulder = [-.005,1.435,side*.245];
    const elbow = spy || engineer ? [.005,1.19,side*.27] : side < 0 ? [.15,1.245,-.285] : [-.025,1.17,.25];
    const hand = spy || engineer ? [.035,.97,side*.27] : side < 0 ? [.39,1.25,-.075] : [.16,1.225,.035];
    sphere(arm, fabric, shoulder, .078, [.88,.9,1]);
    limb(arm, fabric, shoulder, elbow, .066); limb(arm, fabric, elbow, hand, .055);
    sphere(arm, spy ? skin : dark, hand, .049, [.85,.8,1]);
    if (!spy) {
      box(group, team, [.02,1.405,side*.32], [.04,.065,.006]);
      box(group, armor, [-.002,1.30,side*.287], [.07,.09,.028]);
    }
  }
  if (spy) {
    box(group, shirt, [.135,1.35,0], [.025,.25,.12]); box(group, dark, [.154,1.34,0], [.015,.23,.023]);
    for (const side of [-1,1]) box(group, fabric, [.133,1.40,side*.079], [.035,.18,.075], [side*.22,0,0]);
    const hair = mesh(group, new THREE.SphereGeometry(.13,distant ? 8 : 20,distant ? 6 : 12,0,Math.PI*2,0,Math.PI*.48), dark, [.003,1.76,0]); hair.scale.set(.86,1.09,.89);
    for (const side of [-1,1]) box(group, dark, [.12,1.764,side*.049], [.022,.041,.061]);
    box(group, steel, [.13,1.766,0], [.015,.007,.039]);
    box(group, dark, [.04,.76,.28], [.11,.29,.33]); box(group, steel, [.10,.79,.28], [.01,.022,.028]);
    for (const z of [.15,.41]) box(group, steel, [.04,.765,z], [.112,.27,.008]);
    limb(group, dark, [.035,.91,.225], [.035,.96,.225], .012); limb(group, dark, [.035,.91,.335], [.035,.96,.335], .012);
    limb(group, dark, [.035,.96,.225], [.035,.96,.335], .012);
  } else {
    const helmet = mesh(group, new THREE.SphereGeometry(.14,distant ? 8 : 20,distant ? 6 : 12,0,Math.PI*2,0,Math.PI*.59), engineer ? shirt : armor, [0,1.79,0]); helmet.scale.set(1,.82,1.02);
    const rim = mesh(group, new THREE.TorusGeometry(.137,.009,distant ? 3 : 6,distant ? 8 : 28), dark, [0,1.783,0], [Math.PI/2,0,0]); rim.scale.y=1.02;
    for (const side of [-1,1]) {
      limb(group, dark, [-.015,1.77,side*.115], [.08,1.64,side*.048], .007);
      box(group, armor, [.105,1.31,side*.135], [.05,.37,.055], [0,side*.1,0]);
      limb(group, armor, [-.16,1.43,side*.14], [.15,1.34,side*.14], .015);
    }
    box(group, armor, [.147,1.255,0], [.07,.34,.29]); box(group, armor, [-.17,1.255,0], [.065,.32,.27]);
    for (const z of [-.095,0,.095]) {
      box(group, fabric, [.205,1.17,z], [.065,.115,.085]); box(group, dark, [.24,1.22,z], [.008,.025,.074]);
    }
    for (const y of [1.27,1.30,1.33]) box(group, dark, [.188,y,0], [.01,.008,.25]);
    box(group, fabric, [-.235,1.25,0], [.105,.35,.25]);
    box(group, dark, [-.29,1.36,0], [.012,.02,.23]); box(group, dark, [-.28,1.12,0], [.012,.023,.21]);
    box(group, dark, [-.20,1.42,.14], [.09,.12,.065]); limb(group, dark, [-.2,1.48,.14], [-.23,1.68,.14], .006);
    if (engineer) {
      box(group, shirt, [.045,.76,.28], [.13,.27,.30]);
      box(group, dark, [.045,.91,.28], [.04,.045,.12]);
      for (const z of [.18,.38]) box(group, steel, [.115,.76,z], [.012,.23,.018]);
      box(group, steel, [.045,.79,.435], [.055,.03,.008]);
    } else {
      box(weaponPose, dark, [.275,1.26,-.01], [.29,.065,.061]);
      box(weaponPose, dark, [.06,1.255,-.01], [.17,.10,.055], [0,0,-.13]);
      box(weaponPose, dark, [.15,1.20,-.01], [.045,.09,.052], [0,0,-.20]);
      box(weaponPose, dark, [.245,1.16,-.01], [.055,.14,.045], [0,0,.14]);
      box(weaponPose, steel, [.447,1.257,-.01], [.15,.046,.048]);
      limb(weaponPose, steel, [.50,1.26,-.01], [.73,1.26,-.01], .014);
      limb(weaponPose, dark, [.725,1.26,-.01], [.77,1.26,-.01], .022);
      for (let x = .37; x <= .51; x += .024) box(weaponPose, dark, [x,1.285,-.01], [.008,.012,.052]);
      box(weaponPose, dark, [.30,1.319,-.01], [.06,.055,.055]);
      box(weaponPose, steel, [.333,1.322,-.01], [.004,.025,.028]);
      limb(weaponPose, dark, [-.01,1.26,.03], [.36,1.10,.03], .006);
    }
  }
  root.userData.detailVersion = 2;
  compact(root); group.position.y = 1;
  for (const child of group.children) child.position.y -= 1;
  return root;
}

export function createResourceModel(type) {
  const model=new THREE.Group();model.name=`resource_${type}`;
  const materials={steel:new THREE.MeshStandardMaterial({color:'#64747b',roughness:.6,metalness:.6}),dark:new THREE.MeshStandardMaterial({color:'#27373b',roughness:.8}),wood:new THREE.MeshStandardMaterial({color:'#94865d',roughness:.95}),panel:new THREE.MeshStandardMaterial({color:'#376c87',roughness:.35,metalness:.5}),team:new THREE.MeshStandardMaterial({color:'#dabf78',emissive:'#dabf78',emissiveIntensity:.16})};materials.team.name='阵营标识';
  const box=(mat,x,y,z,w,h,d)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),materials[mat]);m.position.set(x,y,z);model.add(m);return m;};
  box('dark',0,.1,0,6,.2,5);
  if(type==='depot'){
    box('steel',-.8,1.15,0,3.8,2.1,3.6);box('dark',1.13,1,0,.12,1.8,1.4);
    for(let z=-1.65;z<1.7;z+=.35)box('dark',-.8,1.3,z,3.8,.05,.055);
    box('team',-.8,2.23,0,3.4,.08,.30);box('steel',2,.9,1.25,.75,1.6,1.2);box('dark',2,2.5,-1.4,.12,5,.12);
    box('panel',1.65,2.9,-.5,1.8,.09,2.4).rotation.z=.18;
    for(const z of [-1.6,1.6])box('team',1.2,1.8,z,.15,.35,.15);
  }else if(type==='cache'){
    for(const [x,y,z]of [[-1,.55,-.8],[1,.55,.5],[-.7,1.4,-.75]]){box('wood',x,y,z,1.65,.85,1.2);for(const offset of [-.55,.55])box('steel',x+offset,y+.44,z,.06,.04,1.22);box('team',x+.84,y,z,.02,.20,.20);}
  }else{
    for(let i=0;i<5;i++){const x=i%3*1.7-1.7,z=Math.floor(i/3)*2-1;box('steel',x,.4,z,1.4,.6,1.5).rotation.y=i*.2;box('dark',x,.78,z,.9,.15,1);}
    box('team',0,1.1,-1,.7,.04,.8);box('steel',-2.6,.8,0,.16,1.6,.16);box('team',-2.6,1.6,0,.8,.30,.08);
  }
  return compact(model);
}
