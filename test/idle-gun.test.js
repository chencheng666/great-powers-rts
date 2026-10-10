import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { animateIdleGun } from '../src/idle-gun.js';
const make = name => ({ model: { name }, entity: {}, barrel: new THREE.Group() });
test('99A待机炮根不漂移，平滑微抬，暂停不推进', () => {
 const e=make('tank_china'), a={speed:0,recoil:0}; for(let i=0;i<120;i++)animateIdleGun(e,a,1/60);
 assert.ok(e.barrel.rotation.z>.05&&e.barrel.rotation.z<=Math.PI/60);
 const root=new THREE.Vector3(1.45,2.13,0).applyEuler(e.barrel.rotation).add(e.barrel.position);
 assert.ok(root.distanceTo(new THREE.Vector3(1.45,2.13,0))<1e-8);
 const angle=e.barrel.rotation.z;animateIdleGun(e,{speed:1,recoil:1},0);assert.equal(e.barrel.rotation.z,angle);
});
test('移动瞄准开火退出待机，后坐保留，停止后恢复且其他阵营不改变俯仰', () => {
 for(const state of [{speed:1,recoil:0},{speed:0,recoil:0,order:{type:'attack'}},{speed:0,recoil:0,targetId:1},{speed:0,recoil:1}]) {
 const e=make('tank_china');e.idleGunPitch=Math.PI/60;e.entity={order:state.order,targetId:state.targetId};
 for(let i=0;i<120;i++)animateIdleGun(e,state,1/60);assert.ok(Math.abs(e.barrel.rotation.z)<1e-8);
 e.entity={};for(let i=0;i<120;i++)animateIdleGun(e,{speed:0,recoil:0},1/60);assert.ok(e.barrel.rotation.z>.05);
 }
 const e=make('tank_russia');e.barrel.rotation.z=.2;animateIdleGun(e,{speed:0,recoil:1},1/60);assert.equal(e.barrel.rotation.z,.2);assert.equal(e.barrel.position.x,-.32);
});
