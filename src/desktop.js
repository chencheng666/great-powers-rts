import { invoke } from '@tauri-apps/api/core';
export const isDesktop = () => {
 if (!globalThis.__TAURI_INTERNALS__ || !globalThis.location) return false;
 const {protocol,hostname,port}=globalThis.location;
 return protocol==='tauri:' && hostname==='localhost' && !port
  || ['http:','https:'].includes(protocol) && hostname==='tauri.localhost' && !port
  || import.meta.env?.DEV===true && protocol==='http:' && hostname==='127.0.0.1' && port==='4187';
};
export const desktopInvoke = (command, args) => invoke(command, args);
export function desktopNotice() {
 if (!isDesktop()) return;
 document.querySelector('#desktop-download-link')?.setAttribute('hidden','');
 const line=document.createElement('p');line.className='desktop-notice';
 line.textContent='桌面版 · 素材随应用安装，单机无需网络。联网使用独立 HTTPS 窗口，需要网络。';
 const onlineButton=document.querySelector('#online-btn');if(onlineButton){onlineButton.title='打开安全联网窗口';onlineButton.setAttribute('aria-label','联网对战 · 打开安全窗口');onlineButton.lastChild.textContent=' 联网对战';}
 document.querySelector('#start-screen').append(line);
 if (!document.createElement('canvas').getContext('webgl2')) {line.textContent='当前系统WebView或显卡不支持WebGL2，无法启动三维战场。请检查系统和显卡驱动。';document.querySelector('#start-btn').disabled=true;}
}
