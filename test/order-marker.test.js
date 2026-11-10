import test from 'node:test';
import assert from 'node:assert/strict';
import { destinationArrow } from '../src/order-marker.js';

test('箭尖落在真实目的地，并沿最后一段路径转向', () => {
  for (const tip of [{x:80,y:0},{x:-80,y:0},{x:0,y:80},{x:30,y:-40}]) {
    const marker=destinationArrow([{x:0,y:0},tip,tip]);
    assert.deepEqual(marker.tip,tip);
    for (const p of marker.outline.slice(1)) assert.ok((p.x-tip.x)*tip.x+(p.y-tip.y)*tip.y<0);
    assert.ok(Math.hypot(marker.line.at(-1).x-tip.x,marker.line.at(-1).y-tip.y)>=10.9);
  }
});

test('极短或重合路径不反向延伸，异常坐标不污染画布', () => {
  const marker=destinationArrow([{x:0,y:0},{x:2,y:0}]);
  assert.equal(marker.line.at(-1).x,0);
  assert.equal(destinationArrow([{x:1,y:1},{x:1,y:1}]),null);
  assert.equal(destinationArrow([{x:1,y:1},{x:NaN,y:1}]),null);
  assert.equal(destinationArrow([]),null);
});
