import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BATTLE_READABILITY, readableMaterial, identityRadius, identityVisible } from '../src/battle-readability.js';

test('辨识度材质保留迷彩回调和贴图，不修改共享原材质', () => {
  const source = new THREE.MeshStandardMaterial({ name: '装甲钢', color: '#566650', metalness: .3 });
  const original = source.color.clone(), texture = new THREE.Texture(); source.map = texture;
  source.onBeforeCompile = shader => { shader.fragmentShader = '// 原迷彩\n' + shader.fragmentShader; };
  source.customProgramCacheKey = () => '原迷彩';
  const result = readableMaterial(source), shader = { fragmentShader: '#include <opaque_fragment>' };
  result.onBeforeCompile(shader);
  assert.ok(source.color.equals(original)); assert.notEqual(result, source);
  assert.equal(result.map, texture); assert.equal(result.metalness, .3);
  const luminance = color => color.r * .2126 + color.g * .7152 + color.b * .0722;
  assert.ok(luminance(result.color) > luminance(source.color));
  assert.match(shader.fragmentShader, /原迷彩/); assert.match(shader.fragmentShader, /silhouetteLight/);
  assert.match(shader.fragmentShader, /#include <opaque_fragment>/);
  assert.notEqual(result.customProgramCacheKey(), readableMaterial(source, true).customProgramCacheKey());
});

test('透明潜航、建筑贴片和非物理材质不添加轮廓着色', () => {
  for (const material of [new THREE.MeshBasicMaterial(), new THREE.MeshStandardMaterial({ transparent: true }), new THREE.MeshStandardMaterial({ colorWrite: false })]) assert.equal(readableMaterial(material), material);
  assert.ok(BATTLE_READABILITY.infantryRimStrength > BATTLE_READABILITY.rimStrength);
});

test('敌我识别标记遵守战争迷雾、登载、潜航和存活状态', () => {
  const entity = { hp: 100 };
  assert.equal(identityVisible(entity, true), true);
  assert.equal(identityVisible(entity, false), false);
  assert.equal(identityVisible(entity, true, true), false);
  assert.equal(identityVisible({ ...entity, embarkedIn: 7 }, true), false);
  assert.equal(identityVisible({ hp: 0 }, true), false);
  assert.equal(identityRadius({ kind: 'unit' }, ['infantry']), 8);
  assert.ok(Math.abs(identityRadius({ kind: 'building', size: 100 }) - 55) < 1e-9);
});
