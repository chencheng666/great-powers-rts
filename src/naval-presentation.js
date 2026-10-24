import * as THREE from 'three';
import { craftedMaterial, bodyLoft, mergeParts, roundedPart } from './model-craft.js';
import { UNITS } from './data.js';
import { islandDistance } from './island-map.js';

const HULLS = {
  patrol: [-3.75, 4.1, 2.2, -.3, .6, .74],
  frigate: [-5.5, 5.85, 2.7, -.3, .6, .74],
  destroyer: [-7.4, 7.8, 3.4, -.3, .75, .89],
  destroyer_china: [-10, 10.5, 4, -.35, .9, 1.1],
  containerShip: [-10, 10.4, 4.6, -.55, .9, 1.08],
  carrier: [-10.8, 11.8, 4.2, -.4, .9, .9]
};
const OLD_HULLS = new Set(['舰船船体', '舰船主甲板', '隐身舰艏船体', '主甲板', '驱逐舰船体', '驱逐舰主甲板', '集装箱船体', '货运甲板', '航母船体']);
const LANDING_REPLACED=new Set(['平底登陆舰体','车辆甲板','舰艏跳板','跳板液压臂']);
export const replacedNavalPart = (model, part) => model==='landing'?LANDING_REPLACED.has(part.replace(/\.\d+$/, '')):!!HULLS[model] && OLD_HULLS.has(part.replace(/\.\d+$/, ''));

export function hullOutline(stern, bow, width, inset = 0) {
  const half = width / 2 - inset, back = stern + inset, tip = bow - inset, length = tip - back;
  const s = new THREE.Shape();
  s.moveTo(back, -half * .78);
  s.quadraticCurveTo(back, -half, back + length * .09, -half);
  s.bezierCurveTo(back + length * .35, -half, tip - length * .25, -half, tip - length * .12, -half * .58);
  s.quadraticCurveTo(tip - length * .025, -half * .22, tip, 0);
  s.quadraticCurveTo(tip - length * .025, half * .22, tip - length * .12, half * .58);
  s.bezierCurveTo(tip - length * .25, half, back + length * .35, half, back + length * .09, half);
  s.quadraticCurveTo(back, half, back, half * .78); s.closePath();
  return s;
}

export function refineNavalHull(model, name) {
  if(name==='landing')return refineLandingCraft(model);
  if (!HULLS[name]) return model;
  const [stern, bow, width, bottom, top, deck] = HULLS[name], group = new THREE.Group(); group.name = '连续曲面舰体';
  const shell = craftedMaterial('海军船壳', '#89979f', 'coating', .65, .34);
  const plate = craftedMaterial('海军甲板', '#58656c', 'coating', .84, .18);
  const add = (inset, low, high, material) => {
    const g = new THREE.ExtrudeGeometry(hullOutline(stern, bow, width, inset), { depth: high - low, bevelEnabled: true, bevelThickness: .025, bevelSize: .055, bevelSegments: 3, steps: 1, curveSegments: 18 });
    g.rotateX(-Math.PI / 2); g.translate(0, low, 0);
    group.add(new THREE.Mesh(g, material));
  };
  add(0, bottom, top, shell);
  // 航母保留斜角飞行甲板，只有水线船壳采用连续曲面。
  if (name !== 'carrier') add(.1, top, deck, plate);
  model.add(mergeParts(group)); model.userData.navalHullVersion = 1; return model;
}

export function refineLandingCraft(model) {
  if(model.userData.landingDetail)return model;
  const staticParts=new THREE.Group();staticParts.name='登陆舰甲板细节';
  const shell=craftedMaterial('登陆舰防腐船壳','#7f9098','armor',.72,.25),deck=craftedMaterial('登陆舰防滑甲板','#4d5d62','deck',.9,.18);
  const steel=craftedMaterial('登陆舰机械钢','#a5adb0','coating',.43,.62),dark=craftedMaterial('登陆舰防撞橡胶','#27353b','rubber',.94,.02);
  const marking=craftedMaterial('登陆舰安全标线','#d6bd70','coating',.8,.08),orange=craftedMaterial('登陆舰救生圈','#ce6337','rubber',.9,.02);
  const box=(parent,size,pos,material)=>{const mesh=new THREE.Mesh(roundedPart(size,.035),material);mesh.position.set(...pos);parent.add(mesh);return mesh;};
  const outline=new THREE.Shape();outline.moveTo(-8,-2.2);outline.quadraticCurveTo(-8.2,0,-8,2.2);outline.lineTo(5.9,2.4);outline.lineTo(7.7,1.95);outline.lineTo(7.7,-1.95);outline.lineTo(5.9,-2.4);outline.closePath();
  const hull=new THREE.ExtrudeGeometry(outline,{depth:1.03,bevelEnabled:true,bevelThickness:.04,bevelSize:.07,bevelSegments:2,curveSegments:12});hull.rotateX(-Math.PI/2);hull.translate(0,-.42,0);
  staticParts.add(new THREE.Mesh(hull,shell));box(staticParts,[15.35,.22,4.42],[-.1,.76,0],deck);
  for(const side of [-1,1]){
    box(staticParts,[13.8,.2,.16],[-.8,.03,side*2.45],dark);
    for(const x of [-7,5.2]){box(staticParts,[.65,.12,.13],[x,1.05,side*1.95],steel);for(const dx of [-.2,.2])box(staticParts,[.1,.2,.1],[x+dx,.96,side*1.95],steel);}
    for(let x=-3.4;x<6.8;x+=.65){const mesh=box(staticParts,[.35,.02,.13],[x,.887,side*1.87],marking);mesh.rotation.y=side*.65;}
    for(const x of [-6.9,-4.4]){const ring=new THREE.Mesh(new THREE.TorusGeometry(.23,.062,6,16),orange);ring.position.set(x,2.3,side*1.84);staticParts.add(ring);}
    for(let x=-2.7;x<6.7;x+=1.6)box(staticParts,[.16,.015,.16],[x,.89,side*1.45],steel);
    box(staticParts,[.85,.42,.42],[5.6,1.04,side*1.9],shell);
    box(staticParts,[.55,.28,.24],[5.6,1.1,side*1.9],steel);
  }
  // 跳板独立成组，合批静态零件时保留铰链，避免逐舰复制材质和贴图。
  const ramp=new THREE.Group();ramp.name='landing_ramp';ramp.position.set(7.65,.83,0);ramp.rotation.z=Math.PI/2;
  box(ramp,[2.15,.14,3.7],[1.075,0,0],deck);
  for(const z of [-1.78,1.78])box(ramp,[2.15,.18,.12],[1.075,.08,z],marking);
  for(let x=.15;x<2.1;x+=.22)box(ramp,[.045,.045,3.3],[x,.095,0],steel);
  for(const side of [-1,1])box(ramp,[2.1,.15,.14],[1.05,-.14,side*1.1],shell);
  model.add(mergeParts(staticParts),mergeParts(ramp));model.userData.landingDetail=1;return model;
}

export function animateLandingCraft(entry,unit,game,dt) {
  if(unit.type!=='landing')return;
  const ramp=entry.landingRamp??(entry.landingRamp=entry.model.getObjectByName('landing_ramp'));if(!ramp)return;
  const water=game.map.water,forward=Math.cos(entry.heading??unit.angle??0);
  const nearShore=game.map.islands?Math.abs(islandDistance(game.map,unit.x,unit.y))<=190:water&&(forward>.55?Math.abs(unit.x-water.x2)<=160:forward<-.55&&Math.abs(unit.x-water.x1)<=160);
  const stopped=!['move','attackMove','patrol'].includes(unit.order?.type)&&game.time-(unit.lastMovedAt??-10)>=.35;
  const target=nearShore&&stopped?1:0,previous=entry.rampDeployment??0;
  entry.rampDeployment=previous+(target-previous)*(1-Math.exp(-5*Math.max(0,dt)));
  ramp.rotation.z=Math.PI/2-entry.rampDeployment*(Math.PI/2+.12);
}

export function landingCargoLayout(passengers) {
  let vehicles=0,infantry=0;
  return passengers.slice(0,12).map(unit=>{
    const foot=UNITS[unit.type].tags.includes('infantry'),index=foot?infantry++:vehicles++;
    return {unit,scale:foot?.78:.62,x:foot?-2.8+(index%6)*1.7:-1.7+index*3.5,y:.9,z:foot?(index<6?-1.65:1.65):0};
  });
}

export function landingDetailPlan(units,zoom,quality,selected,center,previous=new Set()) {
  const limit=units.length>120?1:quality==='high'?4:2,chosen=new Set(selected);
  const candidates=units.filter(u=>u.type==='landing'&&u.owner===0&&u.passengers?.length&&(zoom>=1.35||previous.has(u.id)&&zoom>=1.2||chosen.size===1&&chosen.has(u.id)));
  const priority=u=>Math.hypot(u.x-center.x,u.y-center.y)-(previous.has(u.id)?70:0);
  candidates.sort((a,b)=>Number(chosen.has(b.id))-Number(chosen.has(a.id))||priority(a)-priority(b)||a.id-b.id);
  return new Set(candidates.slice(0,limit).map(u=>u.id));
}

export function refineTransportBody(model) {
  if (!['airlift', 'freightPlane'].includes(model.name)) return model;
  const g = bodyLoft([[-7.2, .15, .2], [-6, .6, .75], [-4, 1.05, 1.35], [-1, 1.3, 1.6], [2.8, 1.25, 1.5], [4.9, .82, 1.05], [6.2, .42, .55], [7.2, .07, .12]], 32);
  g.rotateZ(-Math.PI / 2); g.translate(0, 1.2, 0);
  const body = new THREE.Mesh(g, craftedMaterial('运输机航空涂层', '#929fa2', 'coating', .59, .22));
  body.name = '宽体运输机身'; body.castShadow = body.receiveShadow = true; model.add(body);
  let team;
  const windows = [];
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    if (mesh.material.name === '阵营标识') team = mesh.material;
    if (mesh.material.name === '玻璃') windows.push(mesh);
  });
  // 加宽机身后同步抬高驾驶舱、外移识别带，避免原细节被新机体覆盖。
  for (const window of windows) {
    window.geometry = window.geometry.clone().translate(0, .35, 0);
    const glass = window.geometry.clone(); glass.computeBoundingBox();
    const center = glass.boundingBox.getCenter(new THREE.Vector3());
    glass.translate(-center.x, -center.y, -center.z); glass.scale(.96, .96, .96); glass.translate(center.x, center.y, center.z);
    const interior = new THREE.Mesh(glass, new THREE.MeshStandardMaterial({ name: '运输机驾驶舱内部', color: '#22313b', roughness: .66 }));
    model.add(interior);
  }
  team ||= new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#59d7ec', roughness: .55 });
  for (const side of [-1, 1]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.6, .17, .035), team); band.position.set(.2, 1.52, side * 1.59); model.add(band);
  }
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(1.8, .03, .22), team); dorsal.position.set(.2, 2.52, 0); model.add(dorsal);
  model.userData.transportBodyVersion = 1; return model;
}

export function submarinePose(game, unit, now = 0) {
  const surfaced = game.submarineSurfaced(unit);
  const detected = surfaced || (unit.exposedUntil || 0) > game.time || game.enemyUnits(unit.owner).some(u => !u.embarkedIn && UNITS[u.type].sonar && Math.hypot(u.x - unit.x, u.y - unit.y) <= UNITS[u.type].sonar);
  return { surfaced, detected, height: surfaced ? -2.5 + Math.sin(now * .002 + unit.id) * .2 : -7.5, verticalScale: surfaced ? .7 : detected ? .3 : .16 };
}
