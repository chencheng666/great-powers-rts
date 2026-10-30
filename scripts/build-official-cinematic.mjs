import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
// 官网演出独立构建；游戏入口、离线包和对战协议保持各自的构建边界。
const result = await build({ configFile:false, publicDir:false, build:{emptyOutDir:false,outDir:'dist',rollupOptions:{input:'src/official-cinematic.js',output:{entryFileNames:'assets/official-cinematic-[hash].js',chunkFileNames:'assets/official-[name]-[hash].js',assetFileNames:'assets/official-[name]-[hash][extname]'}}}});
const outputs=(Array.isArray(result)?result:[result]).flatMap(r=>r.output);
const entry=outputs.find(o=>o.type==='chunk'&&o.isEntry);
const css=outputs.filter(o=>o.type==='asset'&&o.fileName.endsWith('.css'));
const page='dist/official/index.html';
let html=await readFile(page,'utf8');
html=html.replace('<script type="module" src="/src/official-cinematic.js"></script>',css.map(o=>`<link rel="stylesheet" href="/${o.fileName}">`).join('')+`<script type="module" src="/${entry.fileName}"></script>`);
for(const [source,extension] of [['/assets/official/official-emblem.svg','.svg'],['/assets/official/official-emblem-180.png','official-emblem-180'],['/assets/official/official-emblem-32.png','official-emblem-32']]){
 const icon=outputs.find(o=>o.type==='asset'&&o.fileName.includes('official-emblem')&&(extension==='.svg'?o.fileName.endsWith(extension):o.fileName.includes(extension)));if(!icon)throw new Error('官网图标未生成');html=html.replaceAll(source,'/'+icon.fileName);
}
await writeFile(page,html);
