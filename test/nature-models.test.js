import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {natureGeometry,NATURE_LOGS,NATURE_ROCKS} from '../src/nature-models.js';
import {sceneryClearance} from '../src/site-presentation.js';

test('两类岩石和两类倒木接地、坐标有效，面数与材质属性满足实例绘制预算',()=>{
 const signatures=new Set();
 for(const name of [...NATURE_ROCKS,...NATURE_LOGS]){
  const geometry=natureGeometry(name),position=geometry.attributes.position,colors=geometry.attributes.color,normals=geometry.attributes.normal;
  assert.ok(position.count/3<=90);assert.equal(colors.count,position.count);assert.equal(normals.count,position.count);
  assert.ok([...position.array,...colors.array,...normals.array].every(Number.isFinite));assert.ok(geometry.boundingBox.min.y>=-.00001);
  assert.equal(geometry.userData.license,'CC0-1.0');assert.ok(geometry.boundingSphere.radius<1.2);
  signatures.add(createHash('sha256').update(Buffer.from(position.array.buffer)).digest('hex'));geometry.dispose();
 }
 assert.equal(signatures.size,4);
 const prop={x:200,z:200,scale:12,width:20};assert.ok(sceneryClearance(prop,[],[{type:'tank',hp:100,x:210,y:200}],true));
});

test('原始模型与CC0许可随仓保存，来源摘要可复核且无整包无关素材',async()=>{
 const root=new URL('../',import.meta.url),source=JSON.parse(await readFile(new URL('assets/third-party/kenney-nature/source.json',root),'utf8'));
 assert.equal(source.license,'CC0 1.0');assert.equal(source.files.length,9);
 let bytes=0;for(const f of source.files){const data=await readFile(new URL(f.file,root));assert.equal(createHash('sha256').update(data).digest('hex'),f.sha256);bytes+=data.length;}
 assert.ok(bytes<85000);assert.match(await readFile(new URL('assets/third-party/kenney-nature/License.txt',root),'utf8'),/Creative Commons Zero/);
});
