import { execFileSync } from 'node:child_process';
import { readFile,writeFile } from 'node:fs/promises';
import { GAME_VERSION } from '../src/version.js';

const repo='chencheng666/great-powers-rts',tag=`v${GAME_VERSION}`;
const endpoint=process.argv[2]?`repos/${repo}/releases/${process.argv[2]}`:`repos/${repo}/releases/tags/${tag}`;
const release=JSON.parse(execFileSync('gh',['api',endpoint],{encoding:'utf8'}));
if(release.tag_name!==tag)throw Error('发行标签与源码版本不符');
const assets=release.assets.filter(a=>a.name.startsWith(`Great.Powers_${GAME_VERSION}_`)&&/\.(?:dmg|deb|AppImage|exe|app\.tar\.gz)$/.test(a.name));
if(assets.length!==9||assets.some(a=>!/^sha256:[a-f0-9]{64}$/.test(a.digest)||a.size<=0))throw Error('九个桌面资产未全部就绪，保留原清单');
const path='public/downloads/manifest.json',manifest=JSON.parse(await readFile(path,'utf8'));
const offline=manifest.files.find(f=>f.name===`packages/Great-Powers-RTS-${tag}.zip`);if(!offline)throw Error('缺少本版离线 ZIP');
const files=assets.map(a=>({name:`https://github.com/${repo}/releases/download/${tag}/${a.name}`,label:`${GAME_VERSION} · ${a.name.endsWith('.exe')?'Windows x64':/\.(dmg|app\.tar\.gz)$/.test(a.name)?a.name.includes('aarch64')?'macOS Apple Silicon':'macOS Intel':a.name.includes('aarch64')||a.name.includes('arm64')?'Linux ARM64':'Linux x64'} · ${a.name}`,size:a.size,sha256:a.digest.slice(7),status:'CI构建通过，大小与SHA256来自GitHub发行API；未在全部对应硬件实测，Mac未公证、Windows未签名。'}));
for(const file of files){
 const local=`packages/${tag}/${file.name.split('/').at(-1)}`;
 const mirror=manifest.files.find(f=>(f.name===local||f.name===file.name)&&f.size===file.size&&f.sha256===file.sha256);
 if(mirror){file.name=mirror.name;file.status=mirror.status;}
}
manifest.files=[offline,...files,...manifest.files.filter(f=>f!==offline&&!f.name.includes(`/download/${tag}/`)&&!f.name.startsWith(`packages/${tag}/`))];
await writeFile(path,JSON.stringify(manifest,null,2)+'\n');console.log({version:GAME_VERSION,desktopFiles:files.length,offlineSHA256:offline.sha256});
