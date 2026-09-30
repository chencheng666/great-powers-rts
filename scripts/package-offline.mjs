import { build } from 'vite';
import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const timestamp = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date()).replace(/[- :]/g, '');
const releaseRoot = join(root, 'releases'), stage = join(releaseRoot, timestamp), folder = 'Great-Powers-RTS';
const destination = join(stage, folder), archive = join(releaseRoot, `大国崛起-离线试玩版-${timestamp}.zip`);

// 让 Vite 内联所有资源，再把它生成的唯一入口和样式装入同一个 HTML。
const result = await build({ root, configFile: false, base: './', build: { write: false, assetsInlineLimit: () => true, cssCodeSplit: false, sourcemap: false, chunkSizeWarningLimit: 40000 } });
const outputs = Array.isArray(result) ? result.flatMap(value => value.output) : result.output;
const entries = outputs.filter(output => output.type === 'chunk');
if (entries.length !== 1 || !entries[0].isEntry || entries[0].imports.length || entries[0].dynamicImports.length) throw new Error('离线包需要一个无外部依赖的入口');
const css = outputs.filter(output => output.type === 'asset' && output.fileName.endsWith('.css'));
const sourceHTML = outputs.find(output => output.type === 'asset' && output.fileName === 'index.html');
if (!sourceHTML || css.length !== 1) throw new Error('缺少打包后的页面或样式');
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let html = String(sourceHTML.source);
const scriptPattern = new RegExp(`<script\\b[^>]*\\bsrc=["']\\.?\\/${escapePattern(entries[0].fileName)}["'][^>]*><\\/script>`);
const cssPattern = new RegExp(`<link\\b[^>]*\\bhref=["']\\.?\\/${escapePattern(css[0].fileName)}["'][^>]*>`);
if (!scriptPattern.test(html) || !cssPattern.test(html)) throw new Error('Vite 页面入口格式变化，停止生成以避免缺少资源');
html = html.replace(scriptPattern, () => `<script type="module">${entries[0].code.replace(/<\/script/gi, '<\\/script')}</script>`);
html = html.replace(cssPattern, () => `<style>${String(css[0].source).replace(/<\/style/gi, '<\\/style')}</style>`);
html = html.replace(/<link\b[^>]*https:\/\/fonts\.(?:googleapis|gstatic)\.com[^>]*>/g, '');
if (outputs.some(output => output.type === 'asset' && !['index.html', css[0].fileName].includes(output.fileName))) throw new Error('仍有外置资源，离线包不能独立运行');
if (/<(?:script|link)\b[^>]*(?:src|href)=["'](?:\.\/)?assets\//.test(html)) throw new Error('页面仍引用外部构建文件');

await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'PLAY.html'), html);
await copyFile(join(root, 'packaging/README.txt'), join(destination, 'README.txt'));
await copyFile(join(root, 'LICENSE'), join(destination, 'LICENSE'));
await copyFile(join(root, 'ASSETS.md'), join(destination, 'ASSETS.md'));
const licenses = [];
for (const [name, path, readmeSection] of [
  ['Three.js', 'node_modules/three/LICENSE', false],
  ['Lucide', 'node_modules/lucide/LICENSE', false],
  ['PathFinding.js', 'node_modules/pathfinding/README.md', true],
  ['heap.js：Python heapq 的 JavaScript 移植', 'node_modules/heap/README.md', true]
]) {
  let content = await readFile(join(root, path), 'utf8');
  if (readmeSection) { const match = content.match(/(?:^|\n)License\r?\n-+\r?\n([\s\S]*)/); if (!match) throw new Error(`${name} 缺少授权文本`); content = match[1].replaceAll('&copy;', '©').replaceAll('&lt;', '<').replaceAll('&gt;', '>'); }
  licenses.push(`${name}\n${'='.repeat(60)}\n${content.trim()}\n`);
}
await writeFile(join(destination, 'THIRD-PARTY-NOTICES.txt'), licenses.join('\n'));
execFileSync('/usr/bin/zip', ['-9', '-r', archive, folder], { cwd: stage, stdio: 'inherit' });
execFileSync('/usr/bin/unzip', ['-t', archive], { stdio: 'inherit' });
const bytes = (await stat(archive)).size;
console.log(JSON.stringify({ archive, html: join(destination, 'PLAY.html'), bytes, sizeMB: Number((bytes / 1024 / 1024).toFixed(2)) }, null, 2));
