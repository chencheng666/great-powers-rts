import test from 'node:test';
import assert from 'node:assert/strict';
import { errorDetail, resourceDetail } from '../src/client-diagnostics.js';
import { readBattleUI } from '../src/battle-ui.js';
const environment={location:new URL('https://example.test/play/')};

test('诊断定位只保留同源代码位置和白名单故障标识，错误原文和网址参数不外传',()=>{
  const error=new TypeError('玩家张三 邮箱 123@example.com https://secret.test/?token=secret');
  error.stack='TypeError: secret\n at x (https://example.test/assets/render-abc.js?token=secret:150:28)\n at y (https://other.test/private.js:10:2)';
  const detail=errorDetail(error,{environment,stage:'frame'});
  assert.equal(detail,'TypeError stage:frame render-abc.js:150:28');
  for(const value of ['张三','example.com','secret','token','https:'])assert.ok(!detail.includes(value));
  assert.equal(errorDetail(new Error('图形设备连接中断'),{environment,stage:'context'}),'Error stage:context code:webgl-context-lost');
  assert.match(errorDetail(new Error('Failed to fetch dynamically imported module'),{environment}),/code:module-load/);
  assert.match(errorDetail(null,{environment}),/code:opaque-script/);
  assert.equal(errorDetail(new RangeError('private'),{environment,filename:'https://example.test/assets/main.js?private=1',line:12,column:8}),'RangeError main.js line:12 col:8');
});

test('视频正常取消不报资源错误，真实解码失败保留媒体错误码，第三方资源不采集',()=>{
  const target={tagName:'VIDEO',src:'https://example.test/assets/movie.mp4?token=secret',dataset:{},getAttribute:()=>'/assets/movie.mp4',error:{code:1}};
  assert.equal(resourceDetail(target,environment),null);target.error.code=3;assert.equal(resourceDetail(target,environment),'MenuVideoError movie.mp4 media:3');
  target.dataset.backgroundState='suspended';assert.equal(resourceDetail(target,environment),null);target.dataset.backgroundState='playing';target.src='https://thirdparty.test/a.mp4';assert.equal(resourceDetail(target,environment),null);
});

test('界面偏好损坏、存储不可用或异常缩放时安全回退，不让恢复按钮失联',()=>{
  assert.deepEqual(readBattleUI({getItem:()=>'{坏数据'}),{status:true,camera:true,scale:100});
  assert.deepEqual(readBattleUI({getItem:()=>'{"status":false,"camera":false,"scale":80}'}),{status:false,camera:false,scale:80});
  assert.equal(readBattleUI({getItem:()=>'{"scale":0}'}).scale,100);
  assert.deepEqual(readBattleUI({getItem(){throw Error('存储不可用')}}),{status:true,camera:true,scale:100});
});

test('真实客户端错误监听只发送脱敏定位，取消背景不产生错误上报',async()=>{
  const {PlayerTelemetry}=await import('../src/player-telemetry.js');
  const handlers=new Map(),requests=[];let now=0;
  const env={location:new URL('https://example.test/play/'),document:{hidden:false,addEventListener:(k,f)=>handlers.set(k,f),removeEventListener(){}},crypto:{randomUUID:()=> 'diagnostic-session-0001'},navigator:{sendBeacon:()=>true},setInterval:()=>1,clearInterval(){},addEventListener:(k,f)=>handlers.set(k,f),removeEventListener(){},fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true}}};
  const client=new PlayerTelemetry({version:'测试',environment:env,now:()=>now});
  const error=new TypeError('私信内容和邮箱不允许上报');error.stack='at f (https://example.test/assets/render.js?token=private:10:4)';
  handlers.get('error')({target:env,error,filename:'https://example.test/assets/render.js?token=private',lineno:10,colno:4});
  const video={tagName:'VIDEO',src:'https://example.test/assets/movie.mp4',dataset:{backgroundState:'suspended'},getAttribute:()=>null,error:{code:1}};
  handlers.get('error')({target:video});await client.flush();
  assert.equal(requests.filter(r=>r.error==='resource').length,0);
  assert.equal(requests.find(r=>r.error==='script').errorDetail,'TypeError render.js line:10 col:4');
  now=61000;handlers.get('unhandledrejection')({reason:error});await client.flush();
  assert.match(requests.filter(r=>r.error==='script').at(-1).errorDetail,/stage:rejection render.js:10:4/);
  assert.ok(!JSON.stringify(requests).includes('private'));assert.ok(!JSON.stringify(requests).includes('私信'));client.destroy();
});
