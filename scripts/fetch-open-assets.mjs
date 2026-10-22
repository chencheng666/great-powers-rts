import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache = resolve(root, 'releases/open-assets-source');
const records = [];
const readURL = url => execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '90', '--retry', '2', url], { maxBuffer: 40 * 1024 * 1024 });
const json = url => JSON.parse(readURL(url));

function download(url, file, md5) {
  const path = resolve(cache, file);
  mkdirSync(dirname(path), { recursive: true });
  if (!existsSync(path)) {
    execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--connect-timeout', '20', '--max-time', '240', '--retry', '2', '--output', `${path}.part`, url], { stdio: 'inherit' });
    renameSync(`${path}.part`, path);
  }
  const bytes = readFileSync(path);
  if (md5 && createHash('md5').update(bytes).digest('hex') !== md5) throw new Error(`素材校验失败：${file}`);
  const record = { file, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  records.push(record);
  console.log(`${file}：${bytes.length} 字节`);
}

for (const [name, source, file] of [
  ['abrams', 'https://opengameart.org/content/abrams-tank', 'abrams-tank.blend']
]) {
  download(source, `${name}/source.html`);
  download(`https://opengameart.org/sites/default/files/${file}`, `${name}/${file}`);
  if (file.endsWith('.zip')) execFileSync('unzip', ['-o', resolve(cache, name, file), '-d', resolve(cache, name)], { stdio: 'ignore' });
}
download('https://models.airframearchive360.com/f22.glb?v=models-2026-08-25', 'f22/f22.glb');

// 仅构建时访问公开素材接口，运行中的游戏始终读取本地资产。
for (const name of ['overhead_crane', 'aerial_grass_rock', 'concrete_floor_worn_001']) {
  const info = json(`https://api.polyhaven.com/info/${name}`);
  const files = json(`https://api.polyhaven.com/files/${name}`);
  mkdirSync(resolve(cache, name), { recursive: true });
  writeFileSync(resolve(cache, name, 'source.json'), JSON.stringify({ source: `https://polyhaven.com/a/${name}`, license: 'CC0-1.0', info, files }, null, 2));
  if (name === 'overhead_crane') {
    const model = files.gltf['1k'].gltf;
    download(model.url, `${name}/${name}.gltf`, model.md5);
    for (const [file, meta] of Object.entries(model.include)) download(meta.url, `${name}/${file}`, meta.md5);
  } else {
    for (const [channel, key] of [['diff', 'Diffuse'], ['nor_gl', 'nor_gl'], ['rough', 'Rough']]) {
      const meta = files[key]['1k'].jpg;
      download(meta.url, `${name}/${channel}.jpg`, meta.md5);
    }
  }
}
download('https://polyhaven.com/license', 'polyhaven-license.html');
writeFileSync(resolve(cache, 'downloads.json'), JSON.stringify(records, null, 2));
