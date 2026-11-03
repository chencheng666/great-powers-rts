import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../src/game.js';
import {unitInventory,productionOverview} from '../src/production-overview.js';
import {compareVersions,validateDesktopUpdate} from '../src/desktop-updates.js';

test('兵车分项数包含运输中的活人，排除阵亡和自动物流，损失后立即归零',()=>{
 const units=[{type:'rifle',hp:1,embarkedIn:9},{type:'tank',hp:1},{type:'supply',hp:1},{type:'fighter',hp:1},{type:'frigate',hp:1},{type:'freightPlane',hp:1},{type:'rifle',hp:0}];
 const c=unitInventory(units);assert.equal(c.infantry,1);assert.equal(c.vehicles,2);assert.equal(c.air,1);assert.equal(c.naval,1);assert.equal(c.types.rifle,1);
 units[0].hp=0;assert.equal(unitInventory(units).infantry,0);
});
test('生产概览按真实生产线、阵营速度及暂停状态计算，取消完成不留下假倒计时',()=>{
 const g=new Game('nato','russia',{}, {mapId:'valleyTraining'}),a=g.ownedBuildings(0,'barracks')[0],b=g.addBuilding(0,'barracks',500,500);
 a.active={type:'rifle',progress:2,paid:0};a.queue=['engineer'];b.active={type:'rifle',progress:5,paid:0};b.queue=['rifle'];
 let p=productionOverview(g);assert.equal(p.types.rifle.active,2);assert.equal(p.types.rifle.queued,1);assert.equal(p.types.rifle.remaining,4);assert.equal(p.types.engineer.queued,1);
 g.paused=true;assert.equal(productionOverview(g).types.rifle.stopped,'已暂停');
 a.active=null;b.active=null;a.queue=[];b.queue=[];assert.deepEqual(productionOverview(g).types,{});
});
test('桌面更新按数字比较版本，不把旧版当新版，拒绝畸形版本和远端长内容',()=>{
 assert.equal(compareVersions('2.0.10','2.0.3'),1);assert.equal(compareVersions('2.0.3','2.0.3'),0);assert.equal(compareVersions('1.9.9','2.0.3'),-1);
 assert.equal(compareVersions('2.0.3-test','2.0.3'),null);assert.throws(()=>validateDesktopUpdate({version:'2.0.4',notes:['a'.repeat(181)]}));
 assert.deepEqual(validateDesktopUpdate({version:'2.0.4',notes:['改进体验'],url:'javascript:alert(1)'}),{version:'2.0.4',notes:['改进体验']});
});

test('公开更新元数据允许桌面跨域读取，其他接口继续受原有鉴权保护',async()=>{
 const {createBattleServer}=await import('../server/index.mjs');const {mkdtemp,mkdir,writeFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const dir=await mkdtemp(join(tmpdir(),'gp-update-')),root=join(dir,'public');await mkdir(join(root,'downloads'),{recursive:true});await writeFile(join(root,'downloads/desktop-update.json'),JSON.stringify({version:'2.0.3',notes:[]}));
 const app=createBattleServer({directory:join(dir,'data'),root,dev:false});
 try{await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${app.server.address().port}`;
 const r=await fetch(base+'/downloads/desktop-update.json',{headers:{origin:'tauri://localhost'}});assert.equal(r.status,200);assert.equal(r.headers.get('access-control-allow-origin'),'*');assert.equal((await r.json()).version,'2.0.3');
 const admin=await fetch(base+'/api/admin/status');assert.equal(admin.status,401);assert.equal(admin.headers.get('access-control-allow-origin'),null);
 }finally{await new Promise(r=>app.server.close(r));await rm(dir,{recursive:true,force:true});}
});
