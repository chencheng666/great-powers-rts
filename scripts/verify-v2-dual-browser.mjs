const {root,taskSpaceId}=globalThis.GAME_QA;
const fs=await import('node:fs/promises'),t=await taskSpace(taskSpaceId),p=t.page('p1'),q=t.page('p3');
const folder=`${root}/releases/theaters-20261022`;
await p.click('[data-online=create]');
await p.waitForFunction(()=>document.querySelector('#room-code').textContent.length===6);
const code=await p.evaluate(()=>document.querySelector('#room-code').textContent);
await q.fill('#join-code',code);await q.click('[data-online=join]');
await q.waitForFunction(()=>!document.querySelector('#online-room').hidden);
await q.click('[data-online=ready]');await p.click('[data-online=ready]');
await p.waitForFunction(()=>!document.querySelector('[data-online=start]').disabled,undefined,{timeout:30000});await p.click('[data-online=start]');
for(const page of [p,q])await page.waitForFunction(()=>window.__qaRenderer?.game.online,undefined,{timeout:30000});
const result={};
for(const page of [p,q]){
  await t.cdp('Target.activateTarget',{targetId:(await t.tabs()).find(x=>x.label===page.label).targetId});
  const points=await page.evaluate(()=>{
    const r=__qaRenderer,g=r.game,u=g.units.find(u=>u.owner===0&&u.type==='tank')||g.units.find(u=>u.owner===0&&u.type==='rifle');
    if(!u)throw Error('初始部队缺失');r.setViewMode('immersive');r.camera.zoom=1.5;r.centerOn(u.x,u.y);r.render(performance.now());
    const box=r.canvas.getBoundingClientRect(),point=(x,y,h=0)=>{const s=r.worldToScreen(x,y,h);return{x:s.x+box.x,y:s.y+box.y};};
    return {id:u.id,start:{x:u.x,y:u.y},unit:point(u.x,u.y,r.entities.get(u.id).model.position.y+12),goal:point(u.x+200,u.y+100)};
  });
  await page.mouse.click(points.unit.x,points.unit.y,{label:'选中本方装甲单位'});
  await page.waitForFunction(id=>__qaRenderer.game.selected.includes(id),points.id,{timeout:5000});
  await page.mouse.click(points.goal.x,points.goal.y,{button:'right',label:'下达部队移动命令'});
  await page.waitForFunction(({id,start})=>{const u=__qaRenderer.game.units.find(u=>u.id===id);return u&&Math.hypot(u.x-start.x,u.y-start.y)>30;},points,{timeout:15000});
  result[page.label]=await page.evaluate(async id=>{
    const r=__qaRenderer,g=r.game,frames=[];
    for(let i=0;i<90;i++){await new Promise(requestAnimationFrame);const u=g.units.find(u=>u.id===id),e=r.entities.get(id);frames.push({time:g.time,x:u.x,y:u.y,phase:e.animation?.phase,turret:e.animation?.turret,track:e.tracks?.[0]?.userData.trackFrame});}
    r.webgl.render(r.scene,r.viewCamera);const gl=r.webgl.getContext(),pixels=new Uint8Array(16*16*4);gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,16,16,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return{seat:g.seat,battle:g.battleId,frames,errors:__qaErrors,glError:gl.getError(),nonblank:pixels.some((v,i)=>i%4!==3&&v>0)};
  },points.id);
  const data=result[page.label];if(data.errors.length||data.glError||!data.nonblank)throw Error('联机画面检查失败');
  await page.screenshot({path:`${folder}/双客户端-${page.label}.png`});
}
if(result.p1.battle!==result.p3.battle||result.p1.seat===result.p3.seat)throw Error('两客户端未进入同一战局的不同席位');
await q.evaluate(()=>__qaRenderer.game.client.send({type:'leave'}));
for(const page of [p,q]){
  await page.waitForSelector('.battle-report');
  result[page.label].settlement=await page.evaluate(()=>({rows:document.querySelectorAll('.battle-report tbody tr').length,report:__qaRenderer.game.battleReport}));
  if(!result[page.label].settlement.rows||!result[page.label].settlement.report)throw Error('战后报告缺失');
}
const a=result.p1.settlement.report,b=result.p3.settlement.report;
if(a.sides[0].damageDealt!==b.sides[1].damageDealt)throw Error('战报席位镜像不一致');
await fs.writeFile(`${folder}/双客户端验收.json`,JSON.stringify(result,null,2));
console.log({sameBattle:true,seats:[result.p1.seat,result.p3.seat],normalMouseSelectionAndMovement:true,settlement:true,errors:[]});
