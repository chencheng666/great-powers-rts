import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createPersonnel} from '../src/personnel-models.js';
import {personnelLOD} from '../src/personnel-lod.js';
const triangles=root=>{let total=0;root.traverse(m=>{if(m.isMesh)total+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3});return total;};
for(const type of ['rifle','engineer','scout'])test(`${type}: distant geometry removes over 80% of triangles while retaining joints and team color`,()=>{
 const source=createPersonnel(type),nearTriangles=triangles(source),nearGeometry=[];let expectedTeam=false;
 source.traverse(m=>{if(m.isMesh){nearGeometry.push([m,m.geometry,m.geometry.attributes.position.array.slice()]);if(m.material.name==='阵营标识'){expectedTeam=true;m.material.color.set('#ff3311')}}});
 const lod=personnelLOD(source),a=new THREE.Box3().setFromObject(source),b=new THREE.Box3().setFromObject(lod);
 assert.ok(triangles(lod)<nearTriangles*.2);assert.ok(a.min.distanceTo(b.min)<.001&&a.max.distanceTo(b.max)<.001);
 for(const joint of ['upper_body','weapon_pose','leg_left','leg_right','knee_left','knee_right']){const x=source.getObjectByName(joint),y=lod.getObjectByName(joint);assert.ok(y);assert.deepEqual(y.position.toArray(),x.position.toArray());}
 const color=new THREE.Color('#ff3311');let teamFound=false;
 lod.traverse(m=>{if(m.isMesh){const colors=m.geometry.attributes.color;assert.equal(colors.count,m.geometry.attributes.position.count);for(let i=0;i<colors.count;i++)if(Math.abs(colors.getX(i)-color.r)<1e-5&&Math.abs(colors.getY(i)-color.g)<1e-5&&Math.abs(colors.getZ(i)-color.b)<1e-5)teamFound=true;for(const name of ['position','normal','uv','color'])for(const v of m.geometry.attributes[name].array)assert.ok(Number.isFinite(v));}});
 assert.equal(teamFound,expectedTeam);for(const [mesh,geometry,positions]of nearGeometry){assert.equal(mesh.geometry,geometry);assert.deepEqual(mesh.geometry.attributes.position.array,positions);}
});
