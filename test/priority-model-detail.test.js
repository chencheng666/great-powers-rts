import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createStrategicModel } from '../src/strategic-models.js';
import { refinePriorityModel,animatePriorityAircraft } from '../src/priority-model-detail.js';
import { animateStrategicEquipment } from '../src/deterrence-models.js';
import { fixedWingHeight } from '../src/airfield-presentation.js';
import { finishAirframe } from '../src/airframe-finish.js';

test('重点机型关节独立、合批与三角面预算有界，细节不会重复添加',()=>{
  for(const type of ['fighter_nato','helicopter','ballistic']){
    const model=createStrategicModel(type);let meshes=0,triangles=0;
    model.traverse(m=>{if(!m.isMesh)return;meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;assert.ok(m.geometry.attributes.uv);assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));});
    assert.ok(meshes<=20,`${type} ${meshes}`);assert.ok(triangles<10000,`${type} ${triangles}`);
    const count=model.children.length;assert.equal(refinePriorityModel(model,type),model);assert.equal(model.children.length,count);
    if(type==='fighter_nato')assert.ok(model.getObjectByName('fighter_gear_nose')&&model.getObjectByName('fighter_bay_left'));
    if(type==='helicopter')assert.ok(model.getObjectByName('helicopter_sensor')&&model.getObjectByName('helicopter_barrel'));
    if(type==='ballistic')assert.ok(model.getObjectByName('launcher_supports')&&model.getObjectByName('launcher_hydraulics'));
  }
});

test('F22 起落架与弹舱连续收放、暂停不推进，克隆不修改模板或另一架',()=>{
  const template=createStrategicModel('fighter_nato'),model=template.clone(),other=template.clone();
  const entry={model,scale:11},entity={type:'fighter',lastFireAt:10},game={time:10,aircraftGrounded:()=>false};
  animatePriorityAircraft(entry,entity,game,.05,95);assert.equal(model.getObjectByName('fighter_gear_nose').visible,false);
  assert.ok(model.getObjectByName('fighter_bay_left').rotation.x<0);
  assert.equal(Math.abs(template.getObjectByName('fighter_bay_left').rotation.x),0);assert.equal(Math.abs(other.getObjectByName('fighter_bay_left').rotation.x),0);
  const before=entry.bayDeployment;game.time=12;animatePriorityAircraft(entry,entity,game,0,95);assert.equal(entry.bayDeployment,before);
  for(let i=0;i<60;i++)animatePriorityAircraft(entry,entity,game,.05,12);
  assert.ok(entry.gearDeployment>.99);assert.ok(entry.bayDeployment<.01);
  assert.ok(model.getObjectByName('fighter_gear_nose').visible);
  for(let i=0;i<60;i++)animatePriorityAircraft(entry,entity,game,.05,95);
  assert.equal(model.getObjectByName('fighter_gear_nose').visible,false);
});

test('新增起落架接地不下沉，返场与滑跑高度连续且不改变旧飞机偏移',()=>{
  const model=createStrategicModel('fighter_nato'),entry={model,scale:11},entity={type:'fighter',x:900,y:700};
  const game={map:{future:false},aircraftGrounded:()=>true};
  const pose=fixedWingHeight(game,entity,entry,0,95);
  animatePriorityAircraft(entry,entity,game,.05,pose.height);
  model.scale.setScalar(11);model.position.y=pose.height;
  const bounds=new THREE.Box3().setFromObject(model);assert.ok(bounds.min.y>=-.01&&bounds.min.y<1);
  assert.equal(fixedWingHeight(game,entity,{},0,95).height,4);
  const airport={x:900,y:660,size:140};game.ownedBuildings=()=>[airport];
  const deckPose=fixedWingHeight(game,entity,entry,0,95);model.position.y=deckPose.height;
  assert.ok(new THREE.Box3().setFromObject(model).min.y>=airport.size/7.2*.5,'跑道铺装不能吞掉起落架');
});

test('直升机光电与机炮瞄准分离、后坐仅移动炮管，不影响主旋翼和规则',()=>{
  const model=createStrategicModel('helicopter'),entry={model,heading:.6,animation:{turret:-.4,recoil:.8}},entity={type:'helicopter'},game={time:5,aircraftGrounded:()=>false};
  const before=JSON.stringify(entity);animatePriorityAircraft(entry,entity,game,.05,45);
  assert.equal(model.getObjectByName('helicopter_gun_yaw').rotation.y,1);
  assert.equal(model.getObjectByName('helicopter_sensor').rotation.y,.8);
  assert.ok(model.getObjectByName('helicopter_barrel').position.x<0);
  assert.equal(model.getObjectByName('rotor_0_main').rotation.y,0);assert.equal(JSON.stringify(entity),before);
});

test('发射车液压与支撑脚随展开连续运动，暂停保持且不会改写部署进度',()=>{
  const model=createStrategicModel('ballistic'),entry={model,topHeight:30},entity={type:'ballistic',deployProgress:0};
  animateStrategicEquipment(entry,entity,{},.05);const supports=model.getObjectByName('launcher_supports'),hydraulic=model.getObjectByName('launcher_hydraulics');
  assert.equal(supports.position.y,1.15);entity.deployProgress=5;animateStrategicEquipment(entry,entity,{},.05);
  assert.ok(supports.position.y>0&&supports.position.y<1.15);const before=supports.position.y;
  animateStrategicEquipment(entry,{...entity,deployProgress:0},{},0);assert.equal(supports.position.y,before);
  for(let i=0;i<70;i++)animateStrategicEquipment(entry,entity,{},.05);
  assert.ok(supports.position.y<.001);assert.ok(Number.isFinite(hydraulic.scale.y)&&hydraulic.scale.y>0);assert.equal(entity.deployProgress,5);
  assert.equal(createStrategicModel('ballistic').getObjectByName('strategic_launcher').rotation.z,0);
});

test('新增蒙皮有有效 UV 和共享材质贴图，玻璃与橡胶不被蒙皮覆盖',()=>{
  const model=finishAirframe(createStrategicModel('fighter_nato'));let shells=0,glass=0,rubber=0;
  model.traverse(m=>{if(!m.isMesh)return;
    if(m.material.name==='分区蒙皮'){shells++;assert.equal(m.material.map.userData.surfaceKind,'aircraft');assert.ok(new Set(m.geometry.attributes.uv.array).size>3);}
    if(m.material.name==='座舱玻璃'){glass++;assert.equal(m.material.map,null);}
    if(m.material.name==='起落架轮胎'){rubber++;assert.equal(m.material.map.userData.surfaceKind,'rubber');}
  });assert.ok(shells&&glass&&rubber);
});
