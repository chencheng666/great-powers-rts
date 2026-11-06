import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'releases/taptap-scifi-20261106');
const report = JSON.parse(await readFile(join(source, '构建报告.json'), 'utf8'));
const name = 'packages/Great-Powers-Starport-v3.0.0-TapTap-r2.zip';
const manifest = JSON.parse(await readFile(join(root, 'dist/downloads/manifest.json'), 'utf8'));
const entry = manifest.files.find(f => f.name === name);
const zip = await readFile(report.zip);
const sha = createHash('sha256').update(zip).digest('hex');
if (!entry || entry.sha256 !== sha || report.sha256 !== sha || entry.size !== zip.length) throw new Error('科幻版发行文件与下载清单不一致');
// 官网试玩与商店 ZIP 来自同一已验收产物，不通过运行时开关切换内容。
await mkdir(join(root, 'dist/starport'), { recursive: true });
for (const file of ['index.html', 'LICENSE', 'THIRD-PARTY-NOTICES.txt', '版本与隐私说明.txt']) {
  await copyFile(join(source, 'Starport', file), join(root, 'dist/starport', file));
}
await mkdir(join(root, 'dist/downloads/packages'), { recursive: true });
await copyFile(report.zip, join(root, 'dist/downloads', name));
console.log(JSON.stringify({ title: report.title, build: report.build, bytes: zip.length, sha256: sha }));
