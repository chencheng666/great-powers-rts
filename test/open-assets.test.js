import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { installOpenModels, openAssetDetail, syncOpenAssetLOD, validateOpenModel, modelShotOrigin } from '../src/open-assets.js';
import { tracerEndpoints } from '../src/visual-detail.js';
import { createHarbor } from '../src/community-visuals.js';
import { animateIdleGun } from '../src/idle-gun.js';

const gltf = name => {
  const bytes = readFileSync(new URL(`../assets/third-party/${name}.glb`, import.meta.url));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  return JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
};

test('社区模型包含近远景、UV和实体贴图，面数与包体处于预算内', () => {
  const report = JSON.parse(readFileSync(new URL('../assets/third-party/geometry-report.json', import.meta.url)));
  const tank = gltf('abrams'), aircraft = gltf('f22'), crane = gltf('harbor-crane');
  for (const name of ['body_near','body_far','weapon_near','weapon_far','barrel_near','barrel_far']) assert.ok(tank.nodes.some(n => n.name === name), name);
  assert.ok(report.abrams.parts.body_near + report.abrams.parts.weapon_near + report.abrams.parts.barrel_near < 13000);
  assert.ok(report.abrams.parts.body_far + report.abrams.parts.weapon_far + report.abrams.parts.barrel_far < 4500);
  assert.ok(report.f22.parts.airframe_near < 12000 && report.f22.parts.airframe_far < 4000);
  assert.ok(report['harbor-crane'].parts.harbor_crane < 12000);
  for (const asset of [tank, aircraft, crane]) {
    assert.ok(asset.meshes.every(m => m.primitives.every(p => p.attributes.TEXCOORD_0 !== undefined)));
    assert.ok(!asset.buffers.some(b => b.uri), '模型不依赖外部二进制地址');
  }
  assert.ok(aircraft.images.length >= 4 && crane.images.length >= 4);
  assert.ok(Object.values(report).reduce((sum, r) => sum + r.bytes, 0) < 8 * 1024 * 1024);
});

function fixtureTank() {
  const source = new THREE.Group(), material = new THREE.MeshStandardMaterial({ name: '开放资产装甲涂层' });
  for (const name of ['body','weapon','barrel']) for (const level of ['near','far']) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    mesh.name = `${name}_${level}`; source.add(mesh);
  }
  return source;
}

test('可解析但缺少动作节点的错误模型会在独立载入阶段被拒绝', () => {
  assert.throws(() => validateOpenModel('tank', new THREE.Group()), /缺少部件/);
  assert.throws(() => validateOpenModel('aircraft', fixtureTank()), /缺少部件/);
  const tank = fixtureTank(); assert.equal(validateOpenModel('tank', tank), tank);
});

test('社区坦克保留独立炮塔和炮管后坐，远景切换不重复显示近景', () => {
  const models = new Map(); installOpenModels(models, { tank: fixtureTank() });
  const model = models.get('tank_nato'), entry = { model, barrel: model.getObjectByName('barrel') };
  assert.equal(entry.barrel.parent.name, 'weapon');
  animateIdleGun(entry, { recoil: .5 }, .016); assert.equal(entry.barrel.position.x, -.16);
  syncOpenAssetLOD(entry, 'far');
  assert.equal(model.getObjectByName('body_near').visible, false);
  assert.equal(model.getObjectByName('barrel_far').visible, true);
  syncOpenAssetLOD(entry, 'near');
  assert.equal(model.getObjectByName('body_far').visible, false);
  assert.equal(model.getObjectByName('weapon_near').visible, true);
  const clone = model.clone();
  assert.equal(clone.getObjectByName('body_near').geometry, model.getObjectByName('body_near').geometry);
  assert.equal(clone.getObjectByName('body_near').material, model.getObjectByName('body_near').material);
  assert.notEqual(clone.getObjectByName('weapon'), model.getObjectByName('weapon'));
  model.position.set(100, 20, 50); model.scale.setScalar(10); model.getObjectByName('weapon').rotation.y = Math.PI / 2;
  const effect = { x: 100, y: 50, toX: 300, toY: 80, sourceType: 'tank', age: 0, duration: .18 };
  const origin = modelShotOrigin(effect, entry);
  assert.ok(Number.isFinite(origin.x) && Number.isFinite(origin.y) && origin.sourceHeight >= 20);
  assert.equal(tracerEndpoints({ ...effect, ...origin }).muzzle, 0);
  assert.equal(effect.x, 100); assert.equal(effect.muzzleDistance, undefined);
});

test('缩放及军团临界点有迟滞，选中单位仍可查看精模，缺失资源保留原模型', () => {
  assert.equal(openAssetDetail(2.4, 'high', 120, false), 'far');
  assert.equal(openAssetDetail(2.4, 'high', 240, true), 'near');
  assert.equal(openAssetDetail(1.7, 'high', 100, false, 'near'), 'near');
  assert.equal(openAssetDetail(1.7, 'high', 100, false, 'far'), 'far');
  assert.equal(openAssetDetail(1.5, 'high', 80, false, 'near'), 'far');
  const old = new THREE.Group(), models = new Map([['tank_nato', old]]);
  installOpenModels(models, {}); assert.equal(models.get('tank_nato'), old);
});

test('开放港机复用两组几何与PBR材质，贴图按世界尺度投影而不是逐块拉伸', () => {
  const crane = new THREE.Group(), piece = new THREE.Mesh(new THREE.BoxGeometry(5, 1, 1), new THREE.MeshStandardMaterial()); crane.add(piece);
  const concrete = { map: new THREE.Texture(), normalMap: new THREE.Texture(), roughnessMap: new THREE.Texture() };
  const harbor = createHarbor(m => m, { crane, concrete });
  const hoists = harbor.children.filter(c => c.name === '开放资产装卸吊机');
  assert.equal(hoists.length, 2); assert.equal(hoists[0].children[0].geometry, hoists[1].children[0].geometry);
  const ground = harbor.children.find(c => c.material?.name === '混凝土');
  assert.equal(ground.material.map, concrete.map);
  const uv = ground.geometry.attributes.uv;
  assert.ok([...uv.array].some(v => Math.abs(v) > 1));
});
