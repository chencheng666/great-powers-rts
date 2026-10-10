import {readdir,readFile,writeFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,basename} from 'node:path';
const directory=process.argv[2];if(!directory)throw Error('请提供发行包目录');const files=[];
for(const name of (await readdir(directory)).sort()){if(!/\.(dmg|exe|deb|AppImage|zip)$/.test(name))continue;const data=await readFile(join(directory,name));files.push({name:basename(name),label:name,size:(await stat(join(directory,name))).size,sha256:createHash('sha256').update(data).digest('hex'),status:'构建产物，实机验证范围见发行说明'});}
await writeFile(join(directory,'manifest.json'),JSON.stringify({version:'0.9.0',createdAt:new Date().toISOString(),files},null,2));
