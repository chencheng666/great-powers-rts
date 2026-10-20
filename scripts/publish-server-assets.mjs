import { execFileSync } from 'node:child_process';
import { readFile,writeFile,mkdir,stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GAME_VERSION } from '../src/version.js';

const repo='chencheng666/great-powers-rts',tag=`v${GAME_VERSION}`,draftId=process.env.DRAFT_RELEASE_ID;
if(!/^1\.\d+\.\d+$/.test(GAME_VERSION)||!/^\d+$/.test(draftId||'')||!process.env.GH_TOKEN)throw Error('缺少有效版本、草稿编号或发行授权');
const api=path=>JSON.parse(execFileSync('gh',['api',`repos/${repo}/${path}`],{encoding:'utf8'}));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(await readFile('public/downloads/manifest.json','utf8'));
const offline=manifest.files.find(f=>f.name===`packages/Great-Powers-RTS-${tag}.zip`);
if(manifest.releaseTag!==tag||!offline||!/^[a-f0-9]{64}$/.test(offline.sha256))throw Error('下载清单与发行版本不一致');
const zip=`public/downloads/${offline.name}`,draft=api(`releases/${draftId}`);
const staged=draft.assets.find(a=>a.name===`Great-Powers-RTS-${tag}.zip`);
if(!draft.draft||draft.tag_name!==tag||!staged||staged.state!=='uploaded'||staged.size!==offline.size||staged.digest!==`sha256:${offline.sha256}`)throw Error('临时草稿的文件、版本或校验值不符');

if(process.argv[2]==='recover'){
  const bytes=execFileSync('gh',['api',`repos/${repo}/releases/assets/${staged.id}`,'-H','Accept: application/octet-stream'],{maxBuffer:128*1024*1024});
  if(bytes.length!==offline.size||digest(bytes)!==offline.sha256)throw Error('免安装包下载校验失败');
  await mkdir('public/downloads/packages',{recursive:true});await writeFile(zip,bytes);
  console.log('免安装包已验证',JSON.stringify({bytes:bytes.length,sha256:offline.sha256}));
}else if(process.argv[2]==='publish'){
  const release=api(`releases/tags/${tag}`);
  if(release.draft||release.id===draft.id)throw Error('公开发行尚未就绪');
  const desktop=release.assets.filter(a=>a.name.startsWith(`Great.Powers_${GAME_VERSION}_`)&&/\.(dmg|deb|AppImage|exe|app\.tar\.gz)$/.test(a.name));
  if(desktop.length!==9||desktop.some(a=>!/^sha256:[a-f0-9]{64}$/.test(a.digest)))throw Error('桌面资产未完成');
  const paths=[zip,`releases/great-powers-server-${tag}.tar.gz`,'scripts/deploy-strategic-release.py'];
  const files=[];
  for(const path of paths){const bytes=await readFile(path);files.push({path,name:path.split('/').at(-1),size:bytes.length,sha256:digest(bytes)});}
  const checksums=`releases/SHA256SUMS-${tag}.txt`;
  await writeFile(checksums,[...files.map(f=>`${f.sha256}  ${f.name}`),...desktop.map(a=>`${a.digest.slice(7)}  ${a.name}`)].join('\n')+'\n');
  files.push({path:checksums,name:checksums.split('/').at(-1),size:(await stat(checksums)).size,sha256:digest(await readFile(checksums))});
  for(const file of files){
    const existing=release.assets.find(a=>a.name===file.name);
    if(existing){if(existing.digest!==`sha256:${file.sha256}`||existing.size!==file.size)throw Error(`拒绝覆盖同名不同内容的资产：${file.name}`);continue;}
    const response=await fetch(`https://uploads.github.com/repos/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(file.name)}`,{method:'POST',headers:{Authorization:`Bearer ${process.env.GH_TOKEN}`,'Content-Type':'application/octet-stream','X-GitHub-Api-Version':'2022-11-28'},body:await readFile(file.path),signal:AbortSignal.timeout(600000)});
    if(!response.ok)throw Error(`上传失败：${file.name} ${response.status}`);
    const uploaded=await response.json();if(uploaded.size!==file.size||uploaded.digest!==`sha256:${file.sha256}`)throw Error(`上传后校验失败：${file.name}`);
    console.log('资产已验证',file.name,file.sha256);
  }
  const final=api(`releases/${release.id}`);
  if(files.some(f=>!final.assets.some(a=>a.name===f.name&&a.size===f.size&&a.digest===`sha256:${f.sha256}`)))throw Error('公开发行缺少已验证资产');
  const report={version:GAME_VERSION,sourceCommit:process.env.GITHUB_SHA,url:final.html_url,assets:final.assets.map(a=>({name:a.name,size:a.size,sha256:a.digest.slice(7)}))};
  await mkdir('releases',{recursive:true});await writeFile('releases/published-assets.json',JSON.stringify(report,null,2));
  // 只清理本轮重复草稿；公开文件验证完成前绝不删除已上传的唯一副本。
  if(draft.assets.length===1)execFileSync('gh',['api','--method','DELETE',`repos/${repo}/releases/${draft.id}`]);
  console.log(JSON.stringify({version:GAME_VERSION,assets:report.assets.length,url:report.url}));
}else throw Error('请指定 recover 或 publish');
