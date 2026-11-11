import test from 'node:test';import assert from 'node:assert/strict';
import {shouldPanMap,panConsumesClick,touchTransform,touchDragMode} from '../src/map-gestures.js';
test('左键从空白处框选，右键、中键及显式拖图仍可平移',()=>{
 assert(!shouldPanMap({button:0}));assert(shouldPanMap({button:2}));assert(shouldPanMap({button:1}));
 assert(shouldPanMap({button:0,alt:true}));assert(!shouldPanMap({button:0,alt:true,targeting:true}));assert(!shouldPanMap({button:0,targeting:true}));
 assert(shouldPanMap({button:0,panMode:true}));assert(!shouldPanMap({button:0,panMode:true,shift:true}));assert(!shouldPanMap({button:0,panMode:true,targeting:true}));
});
test('双指同时平移和缩放，重合触点不产生无限缩放',()=>{
 assert.deepEqual(touchTransform({x:100,y:100},{x:120,y:130},100,150),{dx:-20,dy:-30,scale:1.5});
 assert.equal(touchTransform(null,{x:0,y:0},0,60).scale,1);assert.equal(touchTransform(null,{x:0,y:0},10,1000).scale,2);
});
test('拖图模式左键轻点保留选取，右键轻点保留命令，拖动不误下令',()=>{
 assert.equal(panConsumesClick({button:0,moved:false}),false);
 assert.equal(panConsumesClick({button:2,moved:false}),false);
 assert.equal(panConsumesClick({button:0,moved:true}),true);
 assert.equal(panConsumesClick({button:2,moved:true}),true);
 assert.equal(panConsumesClick({button:1,moved:false}),true);
 assert.equal(panConsumesClick({button:0,moved:false,alt:true}),true);
});
test('触屏定位拖动预览落点，普通手势保留轻点容差与持续平移',()=>{
 assert.equal(touchDragMode({targeting:true,distance:80}),'target');
 assert.equal(touchDragMode({targeting:true,panning:true,distance:80}),'target');
 assert.equal(touchDragMode({distance:8}),'tap');
 assert.equal(touchDragMode({distance:9}),'pan');
 assert.equal(touchDragMode({panning:true,distance:2}),'pan');
});
