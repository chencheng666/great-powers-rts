import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Game } from '../src/game.js';
import { Renderer } from '../src/render.js';
import { weatherMaterial } from '../src/visual-assets.js';
import { createHarbor, createCraterDebris, conformGroundMark, refineFacility } from '../src/community-visuals.js';
import { FACTIONS } from '../src/data.js';
import { validateSave } from '../src/savegame.js';

const advance = (g, seconds) => { for (let i = 0; i < seconds * 20; i++) g.update(.05); };
const quiet = (side, scale = 1.5) => {
  const g = new Game('china', 'china', {}, { mapId: 'ocean', battlefieldScale: scale });
  g.aiTimer = g.aiWaveTimer = 1e9; g.closestEnemy = () => null; g.units = [];
  g.logistics.forEach(route => { route.nextAir = route.nextSea = 1e9; });
  const a = g.launchFreight(side), b = g.launchFreight(side), home = g.getEntity(a.freight.homeId);
  Object.assign(a, { x: home.x + (side ? -155 : 155), y: home.y });
  Object.assign(b, { x: a.x, y: home.y + 80 });
  return { g, a, b, home };
};

test('积压的两架运输机分离等待，复电后串行交付、退出且不重复到账', () => {
  for (const side of [0, 1]) for (const scale of [1, 1.5]) {
    const { g, a, b, home } = quiet(side, scale);
    g.hasPower = () => false; advance(g, 20);
    assert.equal(g.logistics[side].delivered, 0); assert.equal(b.freight.holding, true);
    assert.equal(a.freight.phase, 'unloading'); assert.equal(b.freight.phase, 'inbound');
    const first = g.airFreightPattern(a, home), waiting = g.airFreightPattern(b, home, true);
    assert.ok(Math.hypot(first.center.x - waiting.center.x, first.center.y - waiting.center.y) > first.radius * 2 + 136);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 136);
    g.hasPower = () => true; advance(g, 100);
    assert.equal(g.logistics[side].delivered, 1440); assert.equal(g.activeUnits(side, 'freightPlane').length, 0);
    advance(g, 10); assert.equal(g.logistics[side].delivered, 1440);
  }
});

test('等待运输机保存恢复保持顺序，首机被摧毁后接班且仅损失未交付物资', () => {
  const { g, a, b } = quiet(0); g.hasPower = () => false; advance(g, 10);
  const save = g.toSave(), restored = Game.fromSave(save);
  restored.paused = false; restored.aiTimer = restored.aiWaveTimer = 1e9; restored.closestEnemy = () => null;
  assert.equal(restored.getEntity(b.id).freight.holding, true);
  restored.damage(restored.getEntity(a.id), a.maxHp * 2, 1); advance(restored, 90);
  assert.equal(restored.logistics[0].lost, 720); assert.equal(restored.logistics[0].delivered, 720);
  const invalid = structuredClone(save); invalid.state.units[0].freight.orbitAngle = '错误';
  assert.throws(() => validateSave(invalid));
});

test('舰船只保留海军灰风化，不注入陆地迷彩，阵营识别材质不受影响', () => {
  const source = new THREE.MeshStandardMaterial({ name: '装甲钢', color: '#657352' });
  const land = weatherMaterial(source), naval = weatherMaterial(source, 'naval');
  const shader = () => ({ vertexShader: '#include <begin_vertex>', fragmentShader: '#include <map_fragment>\n#include <roughnessmap_fragment>' });
  const a = shader(), b = shader(); land.onBeforeCompile(a); naval.onBeforeCompile(b);
  assert.ok(a.fragmentShader.includes('vec3(.19,.24,.15)'));
  assert.equal(b.fragmentShader.includes('vec3(.19,.24,.15)'), false);
  assert.notEqual(land.customProgramCacheKey(), naval.customProgramCacheKey());
  assert.equal(naval.color.getHexString(), '929da4');
  const team = new THREE.MeshStandardMaterial({ name: '阵营标识' }); assert.equal(weatherMaterial(team, 'naval'), team);
});

test('三维码头泊岸长度匹配货船，合批模型不使用图片平面冒充建筑', () => {
  const harbor = createHarbor(), bounds = new THREE.Box3().setFromObject(harbor), size = bounds.getSize(new THREE.Vector3());
  assert.ok(size.z * 92 / 7.2 > 8 * 20.4);
  assert.ok(size.y > 5); assert.ok(harbor.children.length <= 8);
  assert.ok(harbor.children.every(mesh => mesh.isMesh && mesh.castShadow));
  assert.ok(harbor.children.some(mesh => mesh.material.name === '阵营标识'));
});

test('弹坑为有间断的低矮碎石和焦痕，不是连续圆环或高耸圆墙', () => {
  const debris = createCraterDebris(); debris.computeBoundingBox();
  assert.ok(debris.attributes.position.count < 2000);
  assert.ok(debris.boundingBox.max.y < .05 && debris.boundingBox.min.y > -.01);
  assert.equal(debris.type, 'BufferGeometry'); assert.ok(debris.attributes.normal);
});

test('贴地焦痕包含常规与月表高度、桥面分支；四类设施细节合批不改变设施参数', () => {
  for (const mapId of ['ocean', 'meridian', 'valley']) {
    const g = new Game('china', 'china', {}, { mapId });
    const material = conformGroundMark(new THREE.MeshBasicMaterial(), g), shader = { vertexShader: '#include <project_vertex>' };
    material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('instanceMatrix * craterWorld'));
    assert.ok(shader.vertexShader.includes('craterElevation(craterWorld.xz)'));
    if (g.map.bridges.length) assert.ok(shader.vertexShader.includes('return 28.2;'));
  }
  for (const type of ['radar', 'airfield', 'lab', 'super']) {
    const model = refineFacility(new THREE.Group(), type);
    assert.ok(model.children.length >= 2 && model.children.length <= 3);
  }
});

test('网络干扰雪花屏不绘制敌军、地形或报警坐标，防护与网络技能名称不混淆', () => {
  const labels = [], ctx = { clearRect() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData() {}, fillRect() {}, fillText: text => labels.push(text), drawImage: () => assert.fail('干扰屏不应泄露雷达内容') };
  Renderer.prototype.drawMinimap.call({ mctx: ctx, minimap: { width: 120, height: 90 }, game: { time: 20, isControlLocked: () => true, players: [{ cyberLockedUntil: 23.4 }] } });
  assert.equal(labels[0], '指挥链路干扰 · 4 秒');
  assert.equal(FACTIONS.china.ability, '协同电子防护'); assert.ok(FACTIONS.china.abilityDesc.includes('游戏化抽象'));
});
