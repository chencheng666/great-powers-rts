import { build } from 'vite';
import variantPlugin from '../variants/taptap/build-plugin.mjs';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'releases/taptap-scifi-20261106');
const report = JSON.parse(await readFile(join(source, '构建报告.json'), 'utf8'));
const name = 'packages/Great-Powers-Starport-v3.0.0-TapTap-r3.zip';
const manifest = JSON.parse(await readFile(join(root, 'dist/downloads/manifest.json'), 'utf8'));
const entry = manifest.files.find(f => f.name === name);
const zip = await readFile(report.zip);
const sha = createHash('sha256').update(zip).digest('hex');
if (!entry || entry.sha256 !== sha || report.sha256 !== sha || entry.size !== zip.length) throw new Error('科幻版发行文件与下载清单不一致');
// 网页与商店使用相同变体源码；网页把模型和音乐拆为缓存资源，避免下载完整单文件才能看到主菜单。
await build({ root, configFile: false, publicDir: false, base: './', plugins: [variantPlugin, {
  name: 'starport-web-csp',
  transformIndexHtml: { order: 'post', handler(html) {
    return html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; script-src \'self\' blob:; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src \'self\' blob:; connect-src \'self\' data: blob:; font-src \'self\' data:; object-src \'none\'">');
  }}
}], build: { outDir: join(root, 'dist/starport'), emptyOutDir: true, assetsInlineLimit: 0, sourcemap: false, chunkSizeWarningLimit: 4000 } });
for (const file of ['LICENSE', 'THIRD-PARTY-NOTICES.txt', '版本与隐私说明.txt']) {
  await copyFile(join(source, 'Starport', file), join(root, 'dist/starport', file));
}
await mkdir(join(root, 'dist/downloads/packages'), { recursive: true });
await copyFile(report.zip, join(root, 'dist/downloads', name));
console.log(JSON.stringify({ title: report.title, build: report.build, bytes: zip.length, sha256: sha }));
