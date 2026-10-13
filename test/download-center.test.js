import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createBattleServer} from '../server/index.mjs';
test('匿名下载目录跳转保留相对清单地址，GET与HEAD大小及文件哈希一致',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'gp-download-center-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const root=join(directory,'web');await mkdir(join(root,'downloads','packages'),{recursive:true});
 const content=Buffer.from('这是下载服务测试数据，不是安装包');const name='packages/check.dmg';
 const manifest={files:[{name,size:content.length,sha256:createHash('sha256').update(content).digest('hex')}]};
 await writeFile(join(root,'downloads','index.html'),'<h1>下载中心</h1>');await writeFile(join(root,'downloads','manifest.json'),JSON.stringify(manifest));await writeFile(join(root,'downloads',name),content);
 const {server}=createBattleServer({directory:join(directory,'data'),root,origin:'http://127.0.0.1',dev:false});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const redirect=await fetch(origin+'/downloads',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/downloads/');
 for(const method of ['GET','HEAD']){const page=await fetch(origin+'/downloads/',{method});assert.equal(page.status,200);assert.match(page.headers.get('content-type'),/text\/html/);if(method==='GET')assert.match(await page.text(),/下载中心/);}
 const listed=await(await fetch(origin+'/downloads/manifest.json')).json();assert.deepEqual(listed,manifest);
 const file=await fetch(origin+'/downloads/'+listed.files[0].name);assert.equal(file.status,200);const bytes=Buffer.from(await file.arrayBuffer());assert.equal(bytes.length,listed.files[0].size);assert.equal(createHash('sha256').update(bytes).digest('hex'),listed.files[0].sha256);
 const head=await fetch(origin+'/downloads/'+name,{method:'HEAD'});assert.equal(Number(head.headers.get('content-length')),content.length);assert.equal((await head.arrayBuffer()).byteLength,0);
});
