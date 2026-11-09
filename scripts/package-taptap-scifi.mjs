import { build } from 'vite';
import { readFile, writeFile, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Scene } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import * as base from '../src/data.js';
import { scifiDataSource, fictionText, SCIFI_TITLE, SCIFI_BUILD, SCIFI_VERSION, SCIFI_RELEASE_DIR, SCIFI_ARCHIVE } from '../variants/taptap/config.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url))), variant = join(root, 'variants/taptap');
const output = join(root, 'releases', SCIFI_RELEASE_DIR), game = join(output, 'Starport');
await mkdir(join(variant, 'assets'), { recursive: true }); await mkdir(game, { recursive: true });
globalThis.FileReader = class { readAsArrayBuffer(blob) { blob.arrayBuffer().then(data => { this.result = data; this.onloadend?.(); }); } };
const bytes = await readFile(join(root, 'assets/models/battle-library.glb'));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const scene = new Scene(), keep = ['robot_rifle', 'robot_engineer', 'robot_scout', 'ore_gold', 'ore_gem', 'rock', 'future_oil', 'future_beacon', ...Object.keys(base.BUILDINGS).filter(type => !['dock', 'nuclearSilo'].includes(type)).map(type => `future_${type}`)];
for (const name of keep) { const model = gltf.scene.getObjectByName(name); if (!model) throw new Error(`原创素材缺失：${name}`); scene.add(model.clone(true)); }
await writeFile(join(variant, 'assets/starport-library.glb'), Buffer.from(await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: false })));

const { default: plugin } = await import('../variants/taptap/build-plugin.mjs');

const result = await build({ root, configFile: false, publicDir: false, base: './', plugins: [plugin], build: { write: false, assetsInlineLimit: () => true, cssCodeSplit: false, sourcemap: false, rollupOptions: { output: { inlineDynamicImports: true, format: 'iife' } }, chunkSizeWarningLimit: 200000 } });
const outputs = (Array.isArray(result) ? result : [result]).flatMap(r => r.output), chunks = outputs.filter(x => x.type === 'chunk'), css = outputs.find(x => x.fileName.endsWith('.css'));
if (chunks.length !== 1 || chunks[0].imports.length || chunks[0].dynamicImports.length) throw new Error('包体不得依赖外部模块');
let html = String(outputs.find(x => x.fileName === 'index.html').source);
html = html.replace(/<script\b[^>]*src="[^"]+"[^>]*><\/script>/, () => `<script>addEventListener("DOMContentLoaded",()=>{${chunks[0].code.replace(/<\/script/gi, '<\\/script')}});</script>`).replace(/<link\b[^>]*href="[^"]+\.css"[^>]*>/, () => `<style>${css.source}</style>`).replace(/<link\b[^>]*href="https:[^"]+"[^>]*>/g, '');
for (const asset of outputs.filter(x => x.type === 'asset' && x !== css && x.fileName !== 'index.html')) {
  const mime = asset.fileName.endsWith('.png') ? 'image/png' : 'image/svg+xml'; html = html.replaceAll(`./${asset.fileName}`, `data:${mime};base64,${Buffer.from(asset.source).toString('base64')}`);
}
// 资源都随包分发；联网 API 和外部媒体请求由 CSP 禁止，不提供隐藏切换入口。
html = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'self\' data: blob:; script-src \'self\' \'unsafe-inline\' blob:; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src data: blob:; connect-src data: blob:; font-src data:; object-src \'none\'">');
await writeFile(join(game, 'index.html'), html);
await copyFile(join(root, 'LICENSE'), join(game, 'LICENSE'));
const notices = [];
for (const [name, file, section] of [['Three.js', 'three/LICENSE'], ['Lucide', 'lucide/LICENSE'], ['PathFinding.js', 'pathfinding/README.md', true], ['heap.js', 'heap/README.md', true]]) {
  let text = await readFile(join(root, 'node_modules', file), 'utf8');
  if (section) { const match = text.match(/(?:^|\n)License\r?\n-+\r?\n([\s\S]*)/); if (!match) throw new Error(`缺少第三方许可：${name}`); text = match[1]; }
  notices.push(`${name}\n${text}`);
}
await writeFile(join(game, 'THIRD-PARTY-NOTICES.txt'), notices.join('\n\n'));
await writeFile(join(game, '版本与隐私说明.txt'), `${SCIFI_TITLE}\n${SCIFI_BUILD}\n独立科幻单机版本；仅包含虚构工程组、无人机体和月表演习。无核武器、现实国家映射、付费和广告。\n战局存档、成绩和声音偏好保存在当前设备，不上传姓名、设备、时长或错误；更新、清理数据或换设备前请导出备份。\n美术：项目原创月表设施、机器人、穿梭机与程序化悬浮机甲；月表地表纹理由AI辅助生成并固定随包分发。游戏不提供在线AI生成服务。配乐：原创器乐《星港启航》《群星航迹》。\n`);
const zip = join(output, SCIFI_ARCHIVE); await rm(zip, { force: true });
execFileSync('/usr/bin/tar', ['--format', 'zip', '-cf', zip, 'Starport'], { cwd: output, env: { ...process.env, COPYFILE_DISABLE: '1' } });
execFileSync('/usr/bin/unzip', ['-t', zip], { stdio: 'ignore' });
const data = await readFile(zip), report = { title: SCIFI_TITLE, version: SCIFI_VERSION, build: SCIFI_BUILD, zip, bytes: (await stat(zip)).size, sha256: createHash('sha256').update(data).digest('hex'), networkRequired: false, originalModels: keep, maps: ['meridian', 'moonsea'], nuclearEnabled: false, realCountryMapping: false };
await writeFile(join(output, '构建报告.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
