import { build } from 'vite';
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'releases/utools'), destination = join(out, '大国崛起');
await mkdir(destination, { recursive: true });
// 单文件内联避免 file:// ES 模块与外置模型的跨源限制；不复制官网、后台或服务器文件。
const result = await build({ root, configFile: false, publicDir: false, base: './', build: { write: false, assetsInlineLimit: () => true, cssCodeSplit: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true } }, chunkSizeWarningLimit: 200000 } });
const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
const entries = outputs.filter(o => o.type === 'chunk'), css = outputs.filter(o => o.type === 'asset' && o.fileName.endsWith('.css'));
if (entries.length !== 1 || !entries[0].isEntry || entries[0].imports.length || entries[0].dynamicImports.length || css.length !== 1) throw new Error('uTools 构建必须只有一个完整游戏入口和一份样式');
let html = String(outputs.find(o => o.fileName === 'index.html')?.source || '');
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const scriptPattern = new RegExp(`<script\\b[^>]*\\bsrc=["']\\.?\\/${escape(entries[0].fileName)}["'][^>]*><\\/script>`);
const cssPattern = new RegExp(`<link\\b[^>]*\\bhref=["']\\.?\\/${escape(css[0].fileName)}["'][^>]*>`);
if (!scriptPattern.test(html) || !cssPattern.test(html)) throw new Error('页面格式变化，停止打包');
html = html.replace(scriptPattern, () => `<script type="module">${entries[0].code.replace(/<\/script/gi, '<\\/script')}</script>`)
  .replace(cssPattern, () => `<style>${String(css[0].source).replace(/<\/style/gi, '<\\/style')}</style>`)
  .replace('<head>', '<head><meta name="great-powers-runtime" content="utools">')
  .replace(/<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, '');
for (const asset of outputs.filter(o => o.type === 'asset' && !['index.html', css[0].fileName].includes(o.fileName))) {
  const mime = asset.fileName.endsWith('.png') ? 'image/png' : asset.fileName.endsWith('.svg') ? 'image/svg+xml' : null;
  if (!mime) throw new Error(`存在未内联资源：${asset.fileName}`);
  html = html.replaceAll(`./${asset.fileName}`, `data:${mime};base64,${Buffer.from(asset.source).toString('base64')}`);
}
if (/<(?:script|link)\b[^>]*(?:src|href)=["'](?:\.\/)?assets\//.test(html)) throw new Error('游戏仍引用外置构建文件');
await writeFile(join(destination, 'game.html'), html);
for (const name of ['plugin.json', 'index.html', 'launcher.js']) await copyFile(join(root, 'packaging/utools', name), join(destination, name));
await copyFile(join(root, 'public/utools/privacy/index.html'), join(destination, 'privacy.html'));
await copyFile(join(root, 'assets/official/official-emblem-180.png'), join(destination, 'logo.png'));
for (const name of ['LICENSE', 'ASSETS.md', 'THIRD-PARTY-ASSETS.txt', 'EQUIPMENT.md']) await copyFile(join(root, name), join(destination, name));
const notices = [await readFile(join(root, 'THIRD-PARTY-ASSETS.txt'), 'utf8')];
for (const [name, file, section] of [['Three.js', 'node_modules/three/LICENSE'], ['Lucide', 'node_modules/lucide/LICENSE'], ['PathFinding.js', 'node_modules/pathfinding/README.md', true], ['heap.js', 'node_modules/heap/README.md', true]]) {
  let text = await readFile(join(root, file), 'utf8');
  if (section) { const m = text.match(/(?:^|\n)License\r?\n-+\r?\n([\s\S]*)/); if (!m) throw new Error(`${name} 缺少许可证`); text = m[1].replaceAll('&copy;', '©').replaceAll('&lt;', '<').replaceAll('&gt;', '>'); }
  notices.push(`\n${name}\n${'='.repeat(50)}\n${text}`);
}
await writeFile(join(destination, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n'));
await copyFile(join(root, 'packaging/utools/使用说明.txt'), join(destination, '使用说明.txt'));
const manifest = {};
for (const file of ['plugin.json', 'index.html', 'launcher.js', 'privacy.html', 'game.html', 'logo.png', 'LICENSE', 'ASSETS.md', 'THIRD-PARTY-ASSETS.txt', 'THIRD-PARTY-NOTICES.txt', 'EQUIPMENT.md', '使用说明.txt']) manifest[file] = createHash('sha256').update(await readFile(join(destination, file))).digest('hex');
await writeFile(join(destination, '文件摘要.json'), JSON.stringify(manifest, null, 2));
const zip = join(out, '大国崛起-uTools-2.0.2-待平台打包.zip');
// ZIP 是导入目录备份；正式 UPXS 必须由 uTools 开发者工具签名打包，不能改扩展名冒充。
execFileSync('/usr/bin/tar', ['--format', 'zip', '-cf', zip, '大国崛起'], { cwd: out, env: { ...process.env, COPYFILE_DISABLE: '1' } });
execFileSync('/usr/bin/unzip', ['-t', zip], { stdio: 'ignore' });
const report = { version: '2.0.2', sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), sourceDirty: !!execFileSync('git', ['diff', '--name-only'], { cwd: root, encoding: 'utf8' }).trim(), directory: destination, plugin: join(destination, 'plugin.json'), zip, bytes: (await stat(zip)).size, sha256: createHash('sha256').update(await readFile(zip)).digest('hex'), nativeAcceptance: '待 uTools 真机导入、运行和导出 UPXS 验收', submitted: false };
await writeFile(join(out, '构建报告.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
