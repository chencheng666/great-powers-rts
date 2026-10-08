import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function exported(options) {
  await mkdir(path.join(root, 'releases'), { recursive: true });
  const folder = await mkdtemp(path.join(root, 'releases/article-export-test-'));
  try {
    await mkdir(path.join(folder, 'images'));
    await mkdir(path.join(folder, 'videos'));
    await writeFile(path.join(folder, 'images/封面.png'), Buffer.from([1]));
    await writeFile(path.join(folder, 'videos/交火.mp4'), Buffer.from([1]));
    await writeFile(path.join(folder, 'article.json'), JSON.stringify({
      title: '测试文章', summary: '导出验收', date: '2026-10-08', ...options,
      blocks: [
        { type: 'image', file: '封面.png', caption: '实机截图' },
        { type: 'video', file: 'videos/交火.mp4', poster: 'images/封面.png', caption: '实机视频' },
        { type: 'link', label: '仓库', url: 'https://example.com/repo' },
      ],
    }));
    await run(process.execPath, ['scripts/export-wechat-article.mjs', path.relative(root, folder)], { cwd: root });
    return {
      html: await readFile(path.join(folder, 'article.html'), 'utf8'),
      md: await readFile(path.join(folder, '公众号文章.md'), 'utf8'),
      manifest: JSON.parse(await readFile(path.join(folder, '图片清单.json'), 'utf8')),
    };
  } finally { await rm(folder, { recursive: true, force: true }); }
}

test('本地文章导出保留相对素材地址和原有链接格式', async () => {
  const result = await exported({ localImages: true });
  assert.match(result.html, /src="images\/封面.png"/);
  assert.match(result.md, /\]\(images\/封面.png\)/);
  assert.match(result.md, /\[仓库\]\(https:\/\/example.com\/repo\)/);
  assert.equal(result.manifest[0].url, 'images/封面.png');
});

test('网络文章导出同时替换 HTML、Markdown、视频与封面并编码中文路径', async () => {
  const base = 'https://raw.githubusercontent.com/example/game/commit/docs/article/';
  const result = await exported({ mediaBase: base, plainLinks: true });
  const image = `${base}images/${encodeURIComponent('封面.png')}`;
  const video = `${base}videos/${encodeURIComponent('交火.mp4')}`;
  assert.ok(result.html.includes(`src="${image}"`));
  assert.ok(result.html.includes(`poster="${image}"`));
  assert.ok(result.html.includes(`src="${video}"`));
  assert.ok(result.md.includes(image));
  assert.ok(result.md.includes(`![实机截图](${image})`));
  assert.ok(result.md.includes(video));
  assert.ok(result.md.includes('仓库\n\nhttps://example.com/repo'));
  assert.equal(result.manifest[0].url, image);
});
