import test from 'node:test';
import assert from 'node:assert/strict';
import { armyDetailPlan, inDetailViewport } from '../src/army-detail.js';

const units=count=>Array.from({length:count},(_,id)=>({id,type:'rifle',x:id*10,y:0})),center={x:0,y:0};
test('缩放在临界点附近波动时精模与履带不反复显隐，跨过迟滞区才切换',()=>{
  const u=units(20);let p=armyDetailPlan(u,1.8,'high',[],center);
  for(const zoom of [1.69,1.71,1.64,1.6]){p=armyDetailPlan(u,zoom,'high',[],center,p);assert.equal(p.near.size,20);}
  p=armyDetailPlan(u,1.57,'high',[],center,p);assert.equal(p.near.size,0);
  for(const zoom of [1.68,1.72]){p=armyDetailPlan(u,zoom,'high',[],center,p);assert.equal(p.near.size,0);}
  p=armyDetailPlan(u,1.75,'high',[],center,p);assert.equal(p.near.size,20);
  p=armyDetailPlan(u,1.39,'high',[],center,p);assert.equal(p.tracks,true);p=armyDetailPlan(u,1.3,'high',[],center,p);assert.equal(p.tracks,false);
});
test('大军团人数在预算边界波动时不反复调档，仍不突破密集战预算',()=>{
  let p=armyDetailPlan(units(170),1.8,'high',[],center);assert.equal(p.near.size,12);
  for(const count of [159,161,150,145]){p=armyDetailPlan(units(count),1.8,'high',[],center,p);assert.equal(p.near.size,12);}
  p=armyDetailPlan(units(140),1.8,'high',[],center,p);assert.equal(p.near.size,24);
  p=armyDetailPlan(units(90),1.8,'high',[],center,p);assert.equal(p.near.size,24);
  p=armyDetailPlan(units(80),1.8,'high',[],center,p);assert.equal(p.near.size,80);
});
test('预算边缘的相近单位保留原精模，选中新的单位仍能优先获得细节',()=>{
  const u=units(170),p=armyDetailPlan(u,1.8,'high',[],center);u[12].x=109;
  const stable=armyDetailPlan(u,1.8,'high',[],center,p);assert.deepEqual(stable.near,p.near);
  const selected=armyDetailPlan(u,1.8,'high',[169],center,stable);assert.equal(selected.near.size,12);assert.ok(selected.near.has(169));
});
test('视口边缘留出模型余量，远离画面的单位不占精细度预算',()=>{
  const viewport={width:1280,height:800};assert.equal(inDetailViewport({x:-90,y:400},viewport),true);assert.equal(inDetailViewport({x:1400,y:400},viewport),false);assert.equal(inDetailViewport({x:200,y:-110},viewport),false);assert.equal(inDetailViewport({x:NaN,y:0},viewport),false);
});
