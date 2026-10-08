import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { get } from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = path.resolve(root, process.argv[2] || 'docs/wechat-community-20261008');
if (!folder.startsWith(root + path.sep)) throw new Error('文章目录必须在项目中');
const article = JSON.parse(await readFile(path.join(folder, 'article.json'), 'utf8'));
if (!article.mediaBase?.startsWith('https://')) throw new Error('文章尚未配置网络素材地址');
const files = new Set(article.blocks.filter(b => b.type === 'image').map(b => `images/${b.file}`));
for (const b of article.blocks.filter(b => b.type === 'video')) { files.add(b.file); files.add(b.poster); }
const digest = data => createHash('sha256').update(data).digest('hex');

// 显式使用 IPv4，避免当前网络中的 IPv6 连接超时；同时核对完整素材内容。
function download(url, remaining = 3) {
  return new Promise((resolve, reject) => {
    const request = get(url, { family: 4, signal: AbortSignal.timeout(30000) }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location && remaining) {
        response.resume();
        resolve(download(new URL(response.headers.location, url), remaining - 1));
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode}`)); return; }
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    });
    request.on('error', reject);
  });
}

const failures = [];
for (const file of files) {
  try {
    const url = new URL(file.split('/').map(encodeURIComponent).join('/'), article.mediaBase);
    const remote = await download(url);
    const local = await readFile(path.join(folder, file));
    if (digest(remote) !== digest(local)) throw new Error('远端素材与本地 SHA256 不一致');
    console.log(JSON.stringify({ file, status: 200, bytes: remote.length, sha256: digest(remote) }));
  } catch (error) { failures.push({ file, error: error.message }); }
}
if (failures.length) throw new Error(JSON.stringify(failures));
console.log(`网络素材验收通过：${files.size} 个文件，内容哈希全部一致`);
