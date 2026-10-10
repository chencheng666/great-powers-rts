import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDesktop} from '../src/desktop.js';
test('桌面能力仅限内嵌页面，远端联网窗口即使注入Tauri也走网页联机流程',t=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'location'),old=globalThis.__TAURI_INTERNALS__;
 t.after(()=>{if(original)Object.defineProperty(globalThis,'location',original);else delete globalThis.location;if(old===undefined)delete globalThis.__TAURI_INTERNALS__;else globalThis.__TAURI_INTERNALS__=old;});
 Object.defineProperty(globalThis,'location',{value:{protocol:'tauri:',hostname:'localhost',port:''},writable:true,configurable:true});
 delete globalThis.__TAURI_INTERNALS__;assert.equal(isDesktop(),false);globalThis.__TAURI_INTERNALS__={};assert.equal(isDesktop(),true);
 for(const protocol of ['http:','https:']){globalThis.location={protocol,hostname:'tauri.localhost',port:''};assert.equal(isDesktop(),true);}
 for(const location of [{protocol:'http:',hostname:'43.135.186.21',port:'8088'},{protocol:'https:',hostname:'example.com',port:''},{protocol:'http:',hostname:'tauri.localhost',port:'9000'},{protocol:'http:',hostname:'127.0.0.1',port:'4187'}]){globalThis.location=location;assert.equal(isDesktop(),false);}
});
test('发行内嵌本地资源，只有主窗口权限，Windows安装不依赖首次在线下载WebView',()=>{
 const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json')),cap=JSON.parse(readFileSync('src-tauri/capabilities/main.json'));
 assert.equal(config.build.frontendDist,'../dist');assert.equal(config.bundle.windows.webviewInstallMode.type,'offlineInstaller');
 assert.deepEqual(cap.windows,['main']);assert.equal(cap.remote,undefined);assert.ok(!cap.permissions.some(x=>typeof x==='string'&&x.startsWith('fs:')));
});
