import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('下载清单的本地免安装包位于白名单目录，原版与网页热更新文件不遗漏或重复',async()=>{
  const m=JSON.parse(await readFile(new URL('../public/downloads/manifest.json',import.meta.url),'utf8'));
  const urls=m.files.map(f=>new URL(f.name,'https://example.test/downloads/'));
  assert.equal(new Set(urls.map(u=>u.href)).size,urls.length);
  for(const [index,u]of urls.entries()){
    assert.match(m.files[index].sha256,/^[a-f0-9]{64}$/);assert.ok(m.files[index].size>0);
    if(u.origin==='https://example.test')assert.ok(u.pathname.startsWith('/downloads/packages/'));
    else assert.equal(u.hostname,'github.com');
  }
  const hotfix=urls.filter(u=>/Great-Powers-RTS-v[12]\.[0-9]+\.[0-9]+-[0-9]{8}\.zip$/.test(u.pathname));
  for(const u of hotfix)assert.ok(u.pathname.startsWith('/downloads/packages/'));
  assert.ok(/^web-[0-9]{8}-/.test(m.webReleaseTag) || m.webReleaseTag === m.releaseTag, '发行标记应对应实际网页或完整版本');
  const current=urls.filter(u=>u.pathname.includes(m.releaseTag));
  const archives=current.filter(u=>u.origin==='https://example.test'&&u.pathname.endsWith('.zip'));
  const installers=current.filter(u=>u.origin!=='https://example.test');
  assert.ok(archives.length>=1, '当前版本必须有实际离线包');
  assert.ok(installers.length===0 || installers.length===9, '桌面九件全部就绪后再列出');
});
