import { readFile, readdir, mkdir, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist');
const release = process.argv[2];
const sitePages = process.argv.includes('--site-pages');
const offline = process.argv.includes('--offline');
const utools = process.argv.includes('--utools');
if (!/^[0-9A-Za-z-]+$/.test(release || '')) throw new Error('请提供合法的前端发布编号');
const stage = await mkdtemp(join(tmpdir(), 'great-powers-frontend-'));
try {
  await mkdir(join(stage, 'assets')); await mkdir(join(root, 'releases'), { recursive: true });
  await copyFile(join(dist, 'index.html'), join(stage, 'index.html'));
  const names = await readdir(join(dist, 'assets')), checksums = [];
  for (const name of names.sort()) {
    if (!/^[0-9A-Za-z_.-]+$/.test(name)) throw new Error('构建资源名不符合发布约束');
    const content = await readFile(join(dist, 'assets', name));
    checksums.push(`${createHash('sha256').update(content).digest('hex')}  assets/${name}`);
    // 本轮仅改前端代码，媒体文件由哈希校验确认服务器已有，避免重复上传。
    if (/\.(js|css)$/.test(name)||/^official-.*\.(svg|png|webp)$/.test(name)||/^battle-library-[0-9A-Za-z_-]+\.glb$/.test(name)) await copyFile(join(dist, 'assets', name), join(stage, 'assets', name));
  }
  const pages = ['index.html', ...(sitePages ? ['official/index.html', 'downloads/index.html'] : []), ...(offline || utools ? ['downloads/manifest.json'] : []), ...(utools ? ['utools/privacy/index.html'] : [])];
  if (offline || utools) {
    const manifest = JSON.parse(await readFile(join(dist, 'downloads/manifest.json'), 'utf8'));
    const wanted = [offline && { name: manifest.offlineFile, extension: 'zip' }, utools && { name: manifest.utoolsFile, extension: 'upxs' }].filter(Boolean);
    for (const target of wanted) {
      const file = manifest.files.find(f => f.name === target.name);
      if (!file || !new RegExp(`^packages/[0-9A-Za-z_.-]+\\.${target.extension}$`).test(file.name)) throw new Error('安装包清单不合法');
      const content = await readFile(join(root, 'public/downloads', file.name));
      const digest = createHash('sha256').update(content).digest('hex');
      if (digest !== file.sha256 || content.length !== file.size) throw new Error('离线包与清单不一致');
      await mkdir(join(stage, 'downloads/packages'), { recursive: true });
      await copyFile(join(root, 'public/downloads', file.name), join(stage, 'downloads', file.name));
      checksums.push(`${digest}  downloads/${file.name}`);
    }
  }
  for (const page of pages) {
    const content = await readFile(join(dist, page));
    if (page !== 'index.html') {
      await mkdir(dirname(join(stage, page)), { recursive: true });
      await copyFile(join(dist, page), join(stage, page));
    }
    checksums.push(`${createHash('sha256').update(content).digest('hex')}  ${page}.next`);
  }
  await writeFile(join(stage, 'frontend.sha256'), checksums.join('\n') + '\n');
  await copyFile(join(root, 'scripts', 'deploy-frontend-update.sh'), join(stage, 'deploy-frontend-update.sh'));
  const archive = join(root, 'releases', `${release}.tar.gz`);
  execFileSync('/usr/bin/tar', ['-czf', archive, '-C', stage, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  console.log(JSON.stringify({ archive, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), release }, null, 2));
} finally { await rm(stage, { recursive: true, force: true }); }
