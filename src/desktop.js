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
 line.textContent='桌面版 · 素材随应用安装，单机无需网络。联网打开独立窗口，身份与本地单机存档分开。';
 document.querySelector('#start-screen').append(line);
 if (!document.createElement('canvas').getContext('webgl2')) {line.textContent='当前系统WebView或显卡不支持WebGL2，无法启动三维战场。请检查系统和显卡驱动。';document.querySelector('#start-btn').disabled=true;}
}
