import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILDINGS, FACTIONS, MAPS, UNITS } from '../src/data.js';
import { catalogEntries, catalogEntry, catalogAvailability, CatalogSession, CATALOG_CATEGORIES } from '../src/catalog-data.js';
import { Game } from '../src/game.js';
import { productionDuration } from '../src/battlefield-details.js';
import { equipmentModel, equipmentProfile } from '../src/equipment.js';
import * as THREE from 'three';
import { modelFitDistance } from '../src/catalog-preview.js';

test('图鉴覆盖全部单位与设施，五阵营七战区均有完整且不重复的资料', () => {
  const count = Object.keys(UNITS).length + Object.keys(BUILDINGS).length;
  for (const faction of Object.keys(FACTIONS)) for (const mapId of Object.keys(MAPS)) {
    const entries = catalogEntries({ faction, mapId });
    assert.equal(entries.length, count);
    assert.equal(new Set(entries.map(e => e.id)).size, count);
    for (const e of entries) {
      assert.ok(e.name && e.description && e.role && e.model);
      assert.ok(Object.hasOwn(CATALOG_CATEGORIES, e.category));
      assert.ok(e.tactics.length && e.attention.length);
      assert.ok(e.stats.every(([key, value]) => key && value && !/NaN|undefined|Infinity/.test(value)));
      for (const related of e.related) assert.ok(entries.some(other => other.id === `${related.kind}:${related.type}`));
    }
  }
});

test('图鉴造价、生命与满电生产时间使用实际游戏规则，不遗漏阵营修正', () => {
  for (const faction of Object.keys(FACTIONS)) {
    const game = new Game(faction, faction);
    for (const type of Object.keys(UNITS)) {
      const entry = catalogEntry('unit', type, faction), stats = Object.fromEntries(entry.stats);
      assert.equal(stats['生命'], String(Math.round(game.addUnit(0, type, 800, 600).maxHp)));
      assert.equal(stats['造价'], UNITS[type].tags.includes('logistics') ? '自动援助' : `¤ ${game.unitCost(0, type)}`);
      if (UNITS[type].producer) assert.equal(stats['满电生产'], `${Number(productionDuration(game, {owner:0,type:UNITS[type].producer}, type).toFixed(2))} 秒`);
    }
  }
});

test('图鉴按阵营、海域及月表条件筛选，仍能查看不可生产的资料', () => {
  assert.equal(catalogAvailability('unit', 'ghost', 'china', 'valley').available, false);
  assert.equal(catalogAvailability('unit', 'ghost', 'middleeast', 'valley').available, true);
  for (const mapId of ['ocean', 'archipelago']) for (const type of ['carrier','destroyer','submarine','landing','navalFighter','navalStrike']) {
    assert.equal(catalogAvailability('unit', type, 'china', mapId).available, true);
  }
  assert.equal(catalogAvailability('unit', 'carrier', 'china', 'strait').available, false);
  assert.equal(catalogAvailability('building', 'dock', 'china', 'valley').available, false);
  assert.equal(catalogAvailability('unit', 'railgun', 'china', 'meridian').available, true);
  assert.equal(catalogAvailability('unit', 'railgun', 'china', 'ocean').available, false);
  assert.equal(catalogAvailability('unit', 'harvester', 'china', 'valley').available, false);
  assert.equal(catalogAvailability('unit', 'harvester', 'china', 'meridian').available, true);
  for (const type of ['freightPlane', 'containerShip']) assert.equal(catalogAvailability('unit', type, 'china', 'archipelago').available, false);
  const all = catalogEntries(), available = catalogEntries({currentOnly:true});
  assert.ok(all.some(e => e.type === 'carrier'));
  assert.ok(available.length < all.length && available.every(e => e.availability.available));
});

test('可按中文职责、原始名称、现实型号和组合关键词搜索，分类互不遗漏', () => {
  assert.equal(catalogEntries({faction:'nato',query:'himars'})[0].type, 'rocket');
  assert.equal(catalogEntries({faction:'nato',query:'M142 远程'})[0].type, 'rocket');
  assert.equal(catalogEntries({query:'主战坦克'})[0].type, 'tank');
  assert.ok(catalogEntries({query:'侦察'}).length > 1);
  assert.equal(catalogEntries({query:'不存在的装备型号'}).length, 0);
  const categories = Object.keys(CATALOG_CATEGORIES).filter(k => k !== 'all');
  assert.equal(categories.flatMap(category => catalogEntries({category})).length, catalogEntries().length);
  assert.equal(catalogEntries({category:'building'}).length, Object.keys(BUILDINGS).length);
  assert.equal(catalogEntries({category:'infantry'}).length, 3);
});

test('月表人物使用机器人名称、模型和电池规则，常规战区保持士兵与弹药', () => {
  for (const type of ['rifle', 'engineer', 'scout']) {
    const moon = catalogEntry('unit', type, 'china', 'meridian'), land = catalogEntry('unit', type);
    assert.equal(moon.name, equipmentProfile('china', type, true).name);
    assert.equal(moon.model, equipmentModel('china', type, true));
    assert.equal(Object.fromEntries(moon.stats)['电池'], '100%');
    assert.equal(Object.fromEntries(moon.stats)['弹药批次'], undefined);
    assert.ok(moon.service.join('').includes('电量耗尽'));
    assert.ok(!land.stats.some(([key]) => key === '电池'));
  }
  assert.match(catalogEntry('building','barracks','china','meridian').name, /机器人/);
  assert.equal(catalogEntry('unit','bomber','china','meridian').source, null);
  assert.equal(catalogEntry('building','dock','china','meridian').model, 'dock');
  assert.equal(catalogEntry('building','dock','china','meridian').availability.available, false);
  assert.equal(Object.fromEntries(catalogEntry('unit','bomber').stats)['投弹窗口'], '28');
});

test('生产前置可互相跳转，后勤运输不是可生产装备，资料不改写规则', () => {
  const before = JSON.stringify({UNITS,BUILDINGS,FACTIONS,MAPS});
  const rocket = catalogEntry('unit','rocket');
  assert.deepEqual(rocket.related.map(e => e.type), ['armory', 'lab']);
  assert.ok(catalogEntry('building','armory').related.some(e => e.type === 'rocket'));
  assert.ok(!catalogEntry('building','dock','china','archipelago').related.some(e => e.type === 'containerShip'));
  assert.equal(catalogEntry('unit','missing'), null);
  assert.equal(catalogEntry('unit','tank','missing'), null);
  assert.equal(catalogEntry('building','hq','china','missing'), null);
  assert.equal(catalogEntry('oil','hq'), null);
  catalogEntries({mapId:'meridian',faction:'nato'});
  assert.equal(JSON.stringify({UNITS,BUILDINGS,FACTIONS,MAPS}), before);
});

test('图鉴开关仅恢复原本运行的同一战局，已暂停、隐藏、结束或换局不误恢复', () => {
  const game = {running:true,paused:false,winner:null}, session = new CatalogSession();
  session.open(game); assert.equal(game.paused, true); session.close(game); assert.equal(game.paused, false);
  game.paused = true; session.open(game); session.close(game); assert.equal(game.paused, true);
  game.paused = false; session.open(game); session.close(game, true); assert.equal(game.paused, true);
  game.paused = false; session.open(game); game.winner = 0; session.close(game); assert.equal(game.paused, true);
  game.winner = null; game.paused = false; session.open(game); const next = {running:true,paused:true,winner:null}; session.close(next); assert.equal(next.paused,true);
  session.open(null); session.close(next); assert.equal(next.paused,true);
});

test('预览默认镜头按高建筑、细长武器与视口比例取景，全部边界保留边距', () => {
  for (const size of [[3,2,3],[3,.5,1],[.6,3,.8],[1.8,2.7,3]]) for (const aspect of [.65,1,1.4,2]) {
    const bounds = new THREE.Box3(new THREE.Vector3(...size).multiplyScalar(-.5),new THREE.Vector3(...size).multiplyScalar(.5));
    const camera = new THREE.PerspectiveCamera(38,aspect,.01,200);
    camera.position.set(3.2,2.3,3.2);camera.lookAt(0,0,0);
    camera.position.setLength(modelFitDistance(bounds,camera));camera.updateMatrixWorld();
    for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]) {
      const projected = new THREE.Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(projected.x)<=.84001&&Math.abs(projected.y)<=.84001);
    }
    assert.ok(camera.position.length()<=14);
  }
});
