import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('下载清单的本地免安装包位于白名单目录，当前版本十个文件不遗漏或重复',async()=>{
  const m=JSON.parse(await readFile(new URL('../public/downloads/manifest.json',import.meta.url),'utf8'));
  const urls=m.files.map(f=>new URL(f.name,'https://example.test/downloads/'));
  assert.equal(new Set(urls.map(u=>u.href)).size,urls.length);
  for(const [index,u]of urls.entries()){
    assert.match(m.files[index].sha256,/^[a-f0-9]{64}$/);assert.ok(m.files[index].size>0);
    if(u.origin==='https://example.test')assert.ok(u.pathname.startsWith('/downloads/packages/'));
    else assert.equal(u.hostname,'github.com');
  }
  const current=urls.filter(u=>u.pathname.includes(m.releaseTag));assert.equal(current.length,10);
  assert.ok(current.some(u=>u.pathname===`/downloads/packages/Great-Powers-RTS-${m.releaseTag}.zip`));
});
