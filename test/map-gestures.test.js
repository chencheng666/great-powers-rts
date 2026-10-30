import test from 'node:test';import assert from 'node:assert/strict';
import {shouldPanMap,touchTransform} from '../src/map-gestures.js';
test('空白左拖、右拖和中键拖图，同时保留单位选择、Shift框选和定位指令',()=>{
 assert(shouldPanMap({button:0}));assert(shouldPanMap({button:2,hit:true}));assert(shouldPanMap({button:1}));
 assert(!shouldPanMap({button:0,hit:true}));assert(!shouldPanMap({button:0,shift:true}));assert(!shouldPanMap({button:0,targeting:true}));
 assert(shouldPanMap({button:0,panMode:true,hit:true}));assert(!shouldPanMap({button:0,panMode:true,targeting:true}));
});
test('双指同时平移和缩放，重合触点不产生无限缩放',()=>{
 assert.deepEqual(touchTransform({x:100,y:100},{x:120,y:130},100,150),{dx:-20,dy:-30,scale:1.5});
 assert.equal(touchTransform(null,{x:0,y:0},0,60).scale,1);assert.equal(touchTransform(null,{x:0,y:0},10,1000).scale,2);
});
