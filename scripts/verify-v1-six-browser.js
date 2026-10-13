const {root,taskSpaceId}=globalThis.RELEASE_CAPTURE;
const fs=await import('node:fs/promises'),{WebSocket}=await import(`${root}/node_modules/ws/wrapper.mjs`),t=await taskSpace(taskSpaceId),a=t.page('p3'),b=t.page('p4'),clients=[];
const out=`${root}/docs/wechat-v1-20261013/images`,qa=`${root}/releases/v1-qa`;
const saved=(await a.cdp('Network.getCookies',{urls:['http://127.0.0.1:4173/candidate/','http://localhost:4173/candidate/']})).cookies.filter(c=>c.name==='gp_six_guest');
await fs.writeFile(`${qa}/本地验收Cookie.json`,JSON.stringify(saved),{mode:0o600});
async function hook(p){
  await p.evaluate(async()=>{const url=performance.getEntriesByType('resource').findLast(e=>new URL(e.name).pathname==='/src/render.js').name,{Renderer}=await import(url),render=Renderer.prototype.render;Renderer.prototype.render=function(...args){window.__releaseRenderer=this;return render.apply(this,args);};window.__releaseErrors=[];addEventListener('error',e=>__releaseErrors.push(e.message));});
  if(await p.evaluate(()=>document.querySelector('#nickname-dialog').open)){await p.fill('#nickname-dialog input','六方实机验收');await p.click('#nickname-dialog button[type=submit]');}
  await p.click('#online-btn');await p.waitForFunction(()=>document.querySelector('#online-status').textContent.includes('已连接'),undefined,{timeout:30000});
}
const send=(c,m)=>c.ws.send(JSON.stringify(m));
async function wait(c,p){const end=Date.now()+15000;while(Date.now()<end){const i=c.messages.findIndex(p);if(i>=0)return c.messages.splice(i,1)[0];const error=c.messages.find(m=>m.type==='error');if(error)throw Error(error.message);await new Promise(r=>setTimeout(r,15));}throw Error('六方实机消息超时');}
try{
  for(const p of [a,b]){
    await p.evaluate(()=>{if(window.__releaseRenderer?.game?.online)__releaseRenderer.game.client.leave();});
    await p.waitForFunction(async()=>!(await(await fetch('/candidate/api/session')).json()).room?.code,undefined,{timeout:15000});
    await p.reload({waitUntil:'domcontentloaded',timeout:60000});
    await p.cdp('Emulation.setDeviceMetricsOverride',{width:1600,height:1000,deviceScaleFactor:1,mobile:false});
  }
  await hook(a);await hook(b);await a.click('[data-online=create]');await a.waitForSelector('#online-room',{state:'visible'});const code=await a.evaluate(()=>document.querySelector('#room-code').textContent);
  await b.fill('#join-code',code);await b.press('#join-code','Enter');await b.waitForSelector('#online-room',{state:'visible'});
  for(let i=0;i<4;i++){
    const r=await fetch('http://127.0.0.1:4173/candidate/api/session',{method:'POST',headers:{Origin:'http://127.0.0.1:4173','Content-Type':'application/json'},body:JSON.stringify({name:`验收席位${i+3}`})});if(!r.ok)throw Error('身份创建失败');
    const ws=new WebSocket('ws://127.0.0.1:4173/candidate/battle-socket',{headers:{Origin:'http://127.0.0.1:4173',Cookie:r.headers.get('set-cookie').split(';')[0]}}),c={ws,messages:[]};ws.on('message',v=>c.messages.push(JSON.parse(v)));clients.push(c);await wait(c,m=>m.type==='hello');send(c,{type:'join',code,faction:['nato','russia','asia','middleeast'][i]});await wait(c,m=>m.type==='room'&&m.room?.members.filter(Boolean).length===i+3);send(c,{type:'ready',ready:true});
  }
  await a.click('[data-online=ready]');await b.click('[data-online=ready]');await a.waitForFunction(()=>!document.querySelector('[data-online=start]').disabled,undefined,{timeout:60000});
  await a.screenshot({path:`${out}/v1-six-lobby.png`});await a.click('[data-online=start]');
  for(const p of [a,b])await p.waitForFunction(()=>window.__releaseRenderer?.game?.online&&__releaseRenderer.game.time>1,undefined,{timeout:60000});
  const initial=await a.evaluate(()=>{const r=__releaseRenderer,g=r.game,u=g.ownedUnits(0,'tank')[0];g.selected=[u.id];g.events.selection?.();r.setViewMode('immersive');r.centerOn(u.x+90,u.y+70);r.render();return{id:u.id,x:u.x,y:u.y,count:g.ownedUnits(0,'tank').length,battleId:g.battleId};});
  const dest=await a.evaluate(start=>{const r=__releaseRenderer,q=r.worldToScreen(start.x+180,start.y+140),rect=r.canvas.getBoundingClientRect();return{x:q.x+rect.x,y:q.y+rect.y};},initial);
  await a.mouse.click(dest.x,dest.y,{button:'right',label:'六方部队实际移动'});await a.waitForFunction(start=>Math.hypot(__releaseRenderer.game.getEntity(start.id).x-start.x,__releaseRenderer.game.getEntity(start.id).y-start.y)>60,initial,{timeout:30000});
  await a.click('[data-tab=units]');await a.click('[data-unit=tank]');await a.waitForFunction(count=>__releaseRenderer.game.ownedUnits(0,'tank').length>count,initial.count,{timeout:60000});
  await a.screenshot({path:`${out}/v1-six-battle.png`});await b.screenshot({path:`${out}/v1-six-second.png`});
  const check=await a.evaluate(start=>{const r=__releaseRenderer,gl=r.webgl.getContext(),pixels=new Uint8Array(r.canvas.width*r.canvas.height*4);gl.readPixels(0,0,r.canvas.width,r.canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);const colors=new Set();for(let i=0;i<pixels.length;i+=1024)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);return{battleId:r.game.battleId,players:r.game.players.length,moved:Math.hypot(r.game.getEntity(start.id).x-start.x,r.game.getEntity(start.id).y-start.y),produced:r.game.ownedUnits(0,'tank').length>start.count,time:r.game.time,colors:colors.size,glError:gl.getError(),errors:__releaseErrors};},initial);
  check.second=await b.evaluate(()=>({battleId:__releaseRenderer.game.battleId,players:__releaseRenderer.game.players.length,glError:__releaseRenderer.webgl.getContext().getError(),errors:__releaseErrors}));
  if(check.colors<100||check.glError||check.errors.length||check.second.battleId!==check.battleId||check.second.glError||check.second.errors.length)throw Error('双浏览器六方渲染失败');
  await fs.writeFile(`${qa}/六方双浏览器验收.json`,JSON.stringify(check,null,2));await fs.copyFile(`${out}/v1-six-battle.png`,`${root}/public/official/assets/v1-six-battle.png`);console.log({...check,battleId:'已核对一致',second:{...check.second,battleId:'已核对一致'}});
}finally{
  for(const c of clients){if(c.ws.readyState===1)send(c,{type:'leave'});c.ws.close();}
}
