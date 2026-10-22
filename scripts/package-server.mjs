import { execFileSync } from 'node:child_process';
import { readFile,stat,mkdir,writeFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve,dirname } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {version}=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('发行版本无效');
for(const path of ['dist/index.html','dist/official/index.html',`dist/downloads/packages/Great-Powers-RTS-v${version}.zip`])await stat(resolve(root,path));
const archive=resolve(root,`releases/great-powers-server-v${version}.tar.gz`);
await mkdir(dirname(archive),{recursive:true});
// 明确白名单，绝不把本地账号库、环境变量、QA 会话和私信打进服务端包。
const oldPackages=(await readdir(resolve(root,'dist/downloads/packages'))).filter(name=>name!==`Great-Powers-RTS-v${version}.zip`).map(name=>`--exclude=dist/downloads/packages/${name}`);
execFileSync('/usr/bin/tar',['-czf',archive,...oldPackages,'dist','src','server','package.json','package-lock.json','scripts/deploy-strategic-release.py','scripts/deploy-domestic.py','scripts/mirror-release-assets.py'],{cwd:root,env:{...process.env,COPYFILE_DISABLE:'1'},stdio:'inherit'});
const report={archive,version,bytes:(await stat(archive)).size,sha256:createHash('sha256').update(await readFile(archive)).digest('hex')};
await writeFile(resolve(root,`releases/server-v${version}.json`),JSON.stringify(report,null,2));console.log(report);
