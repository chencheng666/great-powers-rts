import { readFile, readdir, mkdir, writeFile, copyFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = resolve(import.meta.dirname, '..'), dist = join(root, 'dist');
const release = process.argv[2];
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
    if (/\.(js|css)$/.test(name)) await copyFile(join(dist, 'assets', name), join(stage, 'assets', name));
  }
  checksums.push(`${createHash('sha256').update(await readFile(join(dist, 'index.html'))).digest('hex')}  index.html.next`);
  await writeFile(join(stage, 'frontend.sha256'), checksums.join('\n') + '\n');
  await copyFile(join(root, 'scripts', 'deploy-frontend-update.sh'), join(stage, 'deploy-frontend-update.sh'));
  const archive = join(root, 'releases', `${release}.tar.gz`);
  execFileSync('/usr/bin/tar', ['-czf', archive, '-C', stage, '.'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  console.log(JSON.stringify({ archive, sha256: createHash('sha256').update(await readFile(archive)).digest('hex'), release }, null, 2));
} finally { await rm(stage, { recursive: true, force: true }); }
