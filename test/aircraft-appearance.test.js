import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createModernAircraft, createMissionAircraft } from '../src/aircraft-models.js';
import { aircraftExhaustLayout, aircraftExhaustState, aircraftBankTarget } from '../src/aircraft-appearance.js';
import { equipmentModel } from '../src/equipment.js';
import { unitModelScale, AIRCRAFT_LENGTHS } from '../src/model-scale.js';

test('任务机模型轮廓独立、合批受控且保留法线与既定空中长度',()=>{
  const sizes={};
  for(const [name,type] of [['fighter_china','fighter'],['strike_china','strike'],['ewPlane','ewPlane']]) {
    const model=name==='fighter_china'?createModernAircraft(name):createMissionAircraft(name);
    const box=new THREE.Box3().setFromObject(model),size=box.getSize(new THREE.Vector3());sizes[name]=size;
    let calls=0,triangles=0;
    model.traverse(mesh=>{if(!mesh.isMesh)return;calls++;triangles+=mesh.geometry.attributes.position.count/3;
      assert.ok([...mesh.geometry.attributes.position.array,...mesh.geometry.attributes.normal.array].every(Number.isFinite));
      assert.equal(mesh.geometry.attributes.uv.count,mesh.geometry.attributes.position.count);
    });
    assert.ok(calls<=5);assert.ok(triangles<2000);
    assert.ok(Math.abs(unitModelScale(type,size,11)*size.x-AIRCRAFT_LENGTHS[type])<.0001);
    const layout=aircraftExhaustLayout(type,box,model.userData.jetExhausts);
    assert.equal(layout.length,2);assert.ok(layout.every(p=>p.x<box.min.x+.2&&p.y>=box.min.y&&p.y<=box.max.y));
  }
  assert.ok(sizes.ewPlane.z>sizes.strike_china.z*1.15);
  assert.equal(equipmentModel('china','strike'),'strike_china');
  assert.equal(equipmentModel('nato','strike'),'strike');
  assert.equal(equipmentModel('china','strike',true),'space_strike');
  assert.equal(equipmentModel('china','navalStrike'),'strike');
});

test('尾焰跟随各模型尾部，运输机不冒加力火焰，接地和甲板停机熄灭',()=>{
  const box={min:{x:-2,y:-.2,z:-3},max:{x:4,y:1.5,z:3}};
  assert.ok(aircraftExhaustLayout('fighter',box).every(p=>p.x<-2&&Math.abs(p.z)<3));
  for(const type of ['airlift','freightPlane','tank'])assert.equal(aircraftExhaustLayout(type,box).length,0);
  const unit={type:'fighter'};
  assert.equal(aircraftExhaustState(unit,true,10).visible,false);
  assert.equal(aircraftExhaustState({...unit,embarkedIn:1},false,10).opacity,0);
  assert.equal(aircraftExhaustState({...unit,stunUntil:11},false,10).visible,false);
  const cruise=aircraftExhaustState(unit,false,10),attack=aircraftExhaustState({...unit,lastFireAt:9.5},false,10);
  assert.ok(cruise.visible&&attack.length>cruise.length&&attack.opacity>cruise.opacity);
});

test('滑跑不侧倾，重型与进场机侧倾更小，正负转向对称',()=>{
  assert.equal(aircraftBankTarget({type:'fighter'},1,true,90),0);
  assert.equal(aircraftBankTarget({type:'fighter'},1,false,8),0);
  assert.equal(aircraftBankTarget({type:'fighter',embarkedIn:2},1,false,90),0);
  const fighter=aircraftBankTarget({type:'fighter'},1,false,90);
  assert.ok(fighter>aircraftBankTarget({type:'ewPlane'},1,false,90));
  assert.ok(aircraftBankTarget({type:'fighter',deckApproach:{}},1,false,50)<=.1);
  assert.equal(aircraftBankTarget({type:'fighter'},-1,false,90),-fighter);
});
