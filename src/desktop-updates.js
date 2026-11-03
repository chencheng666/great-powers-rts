export const DESKTOP_UPDATE_URL='https://www.daguojueqi.site/downloads/desktop-update.json';
export function compareVersions(a,b){
  const parse=v=>typeof v==='string'&&/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(v)?v.split('.').map(Number):null;
  const x=parse(a),y=parse(b);if(!x||!y)return null;
  for(let i=0;i<3;i++)if(x[i]!==y[i])return Math.sign(x[i]-y[i]);return 0;
}
export function validateDesktopUpdate(data){
  if(!data||compareVersions(data.version,'0.0.0')!==1||!Array.isArray(data.notes)||data.notes.length>8||data.notes.some(n=>typeof n!=='string'||n.length>180))throw Error('更新信息暂不可用');
  return {version:data.version,notes:data.notes};
}
export function setupDesktopUpdates({enabled,version,openDownloads,environment=window}){
  if(!enabled)return;
  const button=document.createElement('button');button.type='button';button.className='secondary-btn';button.id='desktop-update-check';button.textContent='检查更新';
  const status=document.createElement('p');status.className='desktop-update-status';status.setAttribute('role','status');
  const box=document.createElement('section');box.className='desktop-update-box';box.append(button,status);
  document.querySelector('.menu-secondary-actions').append(box);
  let pending=false,available=null;
  const download=document.createElement('button');download.type='button';download.className='secondary-btn';download.textContent='查看新版安装包';download.hidden=true;box.append(download);
  download.addEventListener('click',async()=>{download.disabled=true;try{await openDownloads();}catch{status.textContent='无法打开下载页，请访问官网的游戏下载入口。';}finally{download.disabled=false;}});
  async function check(manual=false){
    if(pending)return;pending=true;button.disabled=true;if(manual)status.textContent='正在检查…';
    try{
      const response=await environment.fetch(DESKTOP_UPDATE_URL,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Error();const raw=await response.text();if(raw.length>12000)throw Error();
      available=validateDesktopUpdate(JSON.parse(raw));
      if(compareVersions(available.version,version)>0){status.textContent=`发现新版 ${available.version}（当前 ${version}）：${available.notes.join('；')}`;download.hidden=false;}
      else {status.textContent=manual?`当前已是最新桌面版 ${version}`:`桌面版 ${version} · 更新提示已开启`;download.hidden=true;}
    }catch{if(manual)status.textContent='暂时无法检查更新，联网后可重试；离线单机不受影响。';}
    finally{pending=false;button.disabled=false;}
  }
  button.addEventListener('click',()=>check(true));
  check();
  // 只做提示，避免对局期间替换文件或强制重启。
  return {check};
}
