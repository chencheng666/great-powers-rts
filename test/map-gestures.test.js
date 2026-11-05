import test from 'node:test';import assert from 'node:assert/strict';
import {shouldPanMap,touchTransform} from '../src/map-gestures.js';
test('左键从空白处框选，右键、中键及显式拖图仍可平移',()=>{
 assert(!shouldPanMap({button:0}));assert(shouldPanMap({button:2}));assert(shouldPanMap({button:1}));
 assert(shouldPanMap({button:0,alt:true}));assert(!shouldPanMap({button:0,alt:true,targeting:true}));assert(!shouldPanMap({button:0,targeting:true}));
 assert(shouldPanMap({button:0,panMode:true}));assert(!shouldPanMap({button:0,panMode:true,shift:true}));assert(!shouldPanMap({button:0,panMode:true,targeting:true}));
});
test('双指同时平移和缩放，重合触点不产生无限缩放',()=>{
 assert.deepEqual(touchTransform({x:100,y:100},{x:120,y:130},100,150),{dx:-20,dy:-30,scale:1.5});
 assert.equal(touchTransform(null,{x:0,y:0},0,60).scale,1);assert.equal(touchTransform(null,{x:0,y:0},10,1000).scale,2);
});
