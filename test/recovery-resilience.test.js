import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HONOR_KEY, HONOR_BACKUP_KEY, HONOR_PREVIOUS_KEY, emptyHonors, applyHonorResult, readHonors, writeHonors, localHonorCandidates } from '../src/player-honors.js';
import { ensureBattleCanvas } from '../src/battle-canvas.js';
import { resourceDetail } from '../src/client-diagnostics.js';
const storage = () => { const values = new Map(); return { values, getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v) }; };
const victory = p => applyHonorResult(p, { battleId:'recovery-battle-00000001',winner:0,difficulty:'standard',mode:'quick',mapId:'valley',faction:'china',time:300 }).profile;

test('本机等级主记录缺失或损坏时从有效副本恢复，并保存损坏原文', () => {
  const s=storage(), p=victory(emptyHonors());writeHonors(s,p);
  s.values.delete(HONOR_KEY);assert.deepEqual(readHonors(s),p);
  s.setItem(HONOR_KEY,'{坏数据');assert.deepEqual(readHonors(s),p);assert.equal(s.getItem(HONOR_KEY+'-damaged'),'{坏数据');
  assert.equal(JSON.parse(s.getItem(HONOR_KEY)).points,p.points);
});

test('旧记录首次读取建立副本，显式替换不偷偷升回旧档；旧档仍可供玩家选择', () => {
  const s=storage(), p=victory(emptyHonors());s.setItem(HONOR_KEY,JSON.stringify(p));readHonors(s);
  assert.equal(s.getItem(HONOR_BACKUP_KEY),JSON.stringify(p));writeHonors(s,emptyHonors());assert.equal(readHonors(s).points,0);
  assert.equal(JSON.parse(s.getItem(HONOR_PREVIOUS_KEY)).points,p.points);
  assert.equal(localHonorCandidates(s)[0].points,p.points);
});

test('辅助副本配额不足不误报主成绩失败，损坏主记录及副本均不凭空重建', () => {
  const s=storage(), set=s.setItem;s.setItem=(k,v)=>{if(k!==HONOR_KEY)throw Error('配额');return set(k,v);};
  const p=victory(emptyHonors());assert.doesNotThrow(()=>writeHonors(s,p));assert.deepEqual(readHonors(s),p);
  s.setItem(HONOR_KEY,'{损坏');assert.throws(()=>readHonors(s));assert.equal(s.getItem(HONOR_KEY),'{损坏');
});

test('临时脱离页面的原画布复位，重复调用不重复插入，容器缺失给出可读错误', () => {
  let attached=false, inserts=0;const canvas={};const field={contains:c=>c===canvas&&attached,prepend:c=>{assert.equal(c,canvas);attached=true;inserts++;}};
  const doc={querySelector:()=>field};assert.equal(ensureBattleCanvas(canvas,doc),canvas);ensureBattleCanvas(canvas,doc);assert.equal(inserts,1);
  assert.throws(()=>ensureBattleCanvas(canvas,{querySelector:()=>null}),/战场容器暂不可用/);
});

test('注入样式不当成游戏资源故障，游戏自身哈希脚本的真实错误仍保留', () => {
  const env={location:new URL('https://example.test/play/')};
  assert.equal(resourceDetail({tagName:'LINK',href:'https://example.test/extension/layer.css'},env),null);
  assert.equal(resourceDetail({tagName:'SCRIPT',src:'https://example.test/play/assets/render-hash.js'},env),'AssetError render-hash.js');
});

test('旧域名分叉档案只作为找回候选，错误来源和随机码不能写入本机', async () => {
  const {restoreRelatedHonors}=await import('../src/honor-recovery.js');const local=storage();writeHonors(local,emptyHonors());
  const remote=victory(emptyHonors()), listeners=new Map(), sent=[];let removed=0;
  const frame={contentWindow:{postMessage:(data,origin)=>sent.push({data,origin})},addEventListener:(k,f)=>listeners.set('frame:'+k,f),remove:()=>removed++};
  const env={location:new URL('https://www.daguojueqi.site/play/'),localStorage:local,crypto:{randomUUID:()=> '12345678-1234-1234-1234-123456789abc'},document:{createElement:()=>frame,body:{append(){}}},addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:(k)=>listeners.delete(k),setTimeout:()=>1,clearTimeout(){}};
  const pending=restoreRelatedHonors({environment:env,automatic:false});listeners.get('frame:load')();
  const receive=listeners.get('message'),data={type:'gp-local-honors',nonce:sent[0].data.nonce,profile:JSON.stringify(remote)};
  receive({source:{},origin:'https://daguojueqi.site',data});assert.equal(local.getItem(HONOR_KEY),JSON.stringify(emptyHonors()));
  receive({source:frame.contentWindow,origin:'https://evil.example',data});assert.equal(removed,0);
  receive({source:frame.contentWindow,origin:'https://daguojueqi.site',data});const result=await pending;
  assert.equal(result.status,'candidate');assert.deepEqual(result.profile,remote);assert.equal(readHonors(local).points,0);assert.equal(removed,1);
});
