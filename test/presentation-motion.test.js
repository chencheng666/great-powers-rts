import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { unitAnimation, weaponElevation } from '../src/unit-animation.js';
import { createMovingTracks, animateTracks } from '../src/track-motion.js';
import { animateFacility } from '../src/facility-motion.js';

test('turning in place drives opposite track phases without advancing walking', () => {
 const entry={scale:10},unit={x:0,y:0,angle:0,turretAngle:0};unitAnimation(entry,unit,.016,0);unit.angle=.2;
 const a=unitAnimation(entry,unit,.016,.016);assert.equal(a.phase,0);assert.ok(a.turnTravel>0);
 const tracks=createMovingTracks(1.5,new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial());animateTracks(tracks.children,a.travel,a.turnTravel);
 assert.notEqual(tracks.children[0].userData.trackFrame,tracks.children[1].userData.trackFrame);
 const straight=createMovingTracks(1.5,new THREE.MeshStandardMaterial(),new THREE.MeshStandardMaterial());animateTracks(straight.children,a.turnTravel);assert.equal(tracks.children[0].userData.trackFrame,straight.children[0].userData.trackFrame);animateTracks(straight.children,-a.turnTravel);assert.equal(tracks.children[1].userData.trackFrame,straight.children[1].userData.trackFrame);
 unit.x=400;const turn=a.turnTravel;unit.angle=2;unitAnimation(entry,unit,.016,1);assert.equal(a.turnTravel,turn);
});
test('weapon elevation is finite and bounded at short range and ground level',()=>{
 assert.equal(weaponElevation(0,95),.65);assert.equal(weaponElevation(100,0),0);assert.equal(weaponElevation(1,-20),-.18);assert.ok(weaponElevation(100,23)>0);
});
test('radar stops without power and resumes without clock jump; parts scan once',()=>{
 const model=new THREE.Group(),radar=new THREE.Group();radar.name='facility_radar';model.add(radar);
 const unit={kind:'building',type:'radar',owner:0,hp:100},game={time:0,paused:false,hasPower:()=>true};
 let scans=0;const traverse=model.traverse.bind(model);model.traverse=fn=>{scans++;return traverse(fn)};
 animateFacility(model,unit,game);game.time=.1;animateFacility(model,unit,game);assert.ok(Math.abs(radar.rotation.y-.07)<1e-6);
 game.hasPower=()=>false;game.time=50;animateFacility(model,unit,game);assert.ok(Math.abs(radar.rotation.y-.07)<1e-6);
 game.hasPower=()=>true;game.time=50.1;animateFacility(model,unit,game);assert.ok(Math.abs(radar.rotation.y-.14)<1e-6);
 game.paused=true;game.time=51;animateFacility(model,unit,game);assert.ok(Math.abs(radar.rotation.y-.14)<1e-6);assert.equal(scans,1);
});
