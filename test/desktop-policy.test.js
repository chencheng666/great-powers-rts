import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isDesktop} from '../src/desktop.js';
test('网页不误调用桌面能力，桌面状态仅由Tauri注入判断',()=>{
 const old=globalThis.__TAURI_INTERNALS__;delete globalThis.__TAURI_INTERNALS__;assert.equal(isDesktop(),false);
 globalThis.__TAURI_INTERNALS__={};assert.equal(isDesktop(),true);if(old===undefined)delete globalThis.__TAURI_INTERNALS__;else globalThis.__TAURI_INTERNALS__=old;
});
test('发行内嵌本地资源，只有主窗口权限，Windows安装不依赖首次在线下载WebView',()=>{
 const config=JSON.parse(readFileSync('src-tauri/tauri.conf.json')),cap=JSON.parse(readFileSync('src-tauri/capabilities/main.json'));
 assert.equal(config.build.frontendDist,'../dist');assert.equal(config.bundle.windows.webviewInstallMode.type,'offlineInstaller');
 assert.deepEqual(cap.windows,['main']);assert.equal(cap.remote,undefined);assert.ok(!cap.permissions.some(x=>typeof x==='string'&&x.startsWith('fs:')));
});
