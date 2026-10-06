import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('Linux 用户菜单安装支持中文、空格与百分号路径，并复制语音教程', async () => {
  const root = await mkdtemp(join(tmpdir(), '大国崛起 安装验证-'));
  try {
    const source = join(root, '试玩包'), data = join(root, '用户资料 100%');
    await mkdir(source);
    for (const file of ['PLAY.html', 'README.txt', 'LICENSE', 'ASSETS.md', 'EQUIPMENT.md', 'THIRD-PARTY-NOTICES.txt', '中文语音使用教程.md', '中文语音设置.png']) await writeFile(join(source, file), `验证文件 ${file}`);
    const script = join(source, '安装到用户菜单-Linux.sh');
    await copyFile(new URL('../packaging/安装到用户菜单-Linux.sh', import.meta.url), script);
    const output = execFileSync('sh', [script], { env: { ...process.env, XDG_DATA_HOME: data }, encoding: 'utf8' });
    assert.match(output, /已安装到当前用户/);
    const desktop = await readFile(join(data, 'applications/io.github.chencheng666.greatpowersrts.desktop'), 'utf8');
    assert.match(desktop, /Name=大国崛起/);
    assert.ok(desktop.includes('100%%'));
    assert.ok(desktop.includes('Exec=xdg-open "'));
    assert.match(await readFile(join(data, 'great-powers-rts/中文语音使用教程.md'), 'utf8'), /验证文件/);
    assert.match(await readFile(join(data, 'great-powers-rts/PLAY.html'), 'utf8'), /验证文件/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Linux 启动脚本向系统浏览器传递绝对文件路径，不要求开发依赖', async () => {
  const root = await mkdtemp(join(tmpdir(), '大国崛起 启动验证-'));
  try {
    const bin = join(root, 'bin'), log = join(root, '启动参数.txt');
    await mkdir(bin); await writeFile(join(root, 'PLAY.html'), '<html></html>');
    await writeFile(join(bin, 'xdg-open'), '#!/bin/sh\nprintf "%s" "$1" > "$LAUNCH_LOG"\n', { mode: 0o755 });
    const script = join(root, '启动游戏-Linux.sh');
    await copyFile(new URL('../packaging/启动游戏-Linux.sh', import.meta.url), script);
    execFileSync('sh', [script], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, LAUNCH_LOG: log } });
    assert.equal(await readFile(log, 'utf8'), join(root, 'PLAY.html'));
  } finally { await rm(root, { recursive: true, force: true }); }
});
