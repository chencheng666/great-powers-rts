import { readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relativeFolder = process.argv[2] || 'docs/wechat-national-day-20261002';
const folder = path.resolve(root, relativeFolder);
if (!folder.startsWith(root + path.sep)) throw new Error('文章目录必须在项目中');
const article = JSON.parse(await readFile(path.join(folder, 'article.json'), 'utf8'));
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const images = article.blocks.filter(block => block.type === 'image');
for (const block of images) {
  const info = await stat(path.join(folder, 'images', block.file));
  if (!info.size || info.size > 10 * 1024 * 1024) throw new Error(`图片大小异常：${block.file}`);
}
const html = article.blocks.map(block => {
  switch (block.type) {
    case 'p': return `<p style="margin:0 0 20px;font-size:17px;line-height:1.9;color:#30363b;">${escape(block.text)}</p>`;
    case 'h2': return `<h2 style="margin:42px 0 22px;padding-left:12px;border-left:4px solid #b53132;font-size:23px;line-height:1.5;color:#182328;">${escape(block.text)}</h2>`;
    case 'h3': return `<h3 style="margin:28px 0 15px;font-size:19px;line-height:1.6;color:#182328;">${escape(block.text)}</h3>`;
    case 'image': return `<figure style="margin:26px 0 30px;"><img src="images/${block.file}" alt="${escape(block.caption)}" style="display:block;width:100%;height:auto;"><figcaption style="margin-top:10px;font-size:13px;line-height:1.7;color:#647078;">${escape(block.caption)}</figcaption></figure>`;
    case 'link': return `<p style="margin:12px 0;font-size:15px;line-height:1.7;word-break:break-word;"><a style="color:#196d87;" href="${block.url}">${escape(block.label)}</a><br><span style="font-size:12px;color:#647078;">${escape(block.url)}</span></p>`;
    case 'architecture': return `<pre style="margin:24px 0 12px;padding:18px 12px;background:#f2f5f6;border-left:3px solid #196d87;overflow:auto;line-height:1.8;font-size:13px;color:#26383f;">${escape(block.lines.join('\n'))}</pre><p style="font-size:13px;line-height:1.7;color:#647078;">${escape(block.caption)}</p>`;
    case 'code': return `<pre style="padding:18px;background:#f2f5f6;overflow:auto;font-size:13px;line-height:1.7;"><code>${escape(block.text)}</code></pre>`;
    default: throw new Error(`未知段落类型：${block.type}`);
  }
}).join('\n');
const document = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(article.title)}</title><meta name="description" content="${escape(article.summary)}"></head><body style="margin:0;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;letter-spacing:0;"><article style="max-width:740px;margin:0 auto;padding:38px 24px 60px;"><header><p style="color:#a53032;font-size:13px;margin:0 0 14px;">大国崛起 · 国庆开发手记</p><h1 style="font-size:30px;line-height:1.5;margin:0 0 14px;color:#182328;">${escape(article.title)}</h1><p style="font-size:13px;color:#647078;margin:0 0 30px;">陈成 · ${article.date}</p></header>${html}</article></body></html>`;
await writeFile(path.join(folder, 'article.html'), document);
const imageBase = `https://raw.githubusercontent.com/chencheng666/great-powers-rts/main/${path.relative(root, folder).split(path.sep).map(encodeURIComponent).join('/')}/images/`;
const markdown = [`# ${article.title}`, `${article.date} · 陈成`, ...article.blocks.map(block => {
  if (block.type === 'image') return `![${block.caption.split('｜')[0]}](${imageBase}${block.file})\n\n*${block.caption}*`;
  if (block.type === 'h2') return `## ${block.text}`;
  if (block.type === 'h3') return `### ${block.text}`;
  if (block.type === 'link') return `[${block.label}](${block.url})`;
  if (block.type === 'architecture') return `\`\`\`text\n${block.lines.join('\n')}\n\`\`\`\n\n*${block.caption}*`;
  if (block.type === 'code') return `\`\`\`${block.language || 'javascript'}\n${block.text}\n\`\`\``;
  return block.text;
})].join('\n\n') + '\n';
await writeFile(path.join(folder, '公众号文章.md'), markdown);
await writeFile(path.join(folder, '正文.txt'), `${article.title}\n\n${article.blocks.map(block => {
  if (block.type === 'image') return `【配图 images/${block.file}】\n${block.caption}`;
  if (block.type === 'link') return `${block.label}：${block.url}`;
  if (block.type === 'architecture') return block.lines.join('\n') + '\n' + block.caption;
  return block.text;
}).join('\n\n')}\n`);
await writeFile(path.join(folder, '图片清单.json'), JSON.stringify(images, null, 2));
console.log(JSON.stringify({ title: article.title, images: images.length, html: path.join(folder, 'article.html') }));
