const {root,taskSpaceId}=globalThis.GAME_QA;
const page=(await taskSpace(taskSpaceId)).page('p1'),fs=await import('node:fs/promises'),folder=`${root}/releases/priority-recon-20261020`;
await fs.mkdir(folder,{recursive:true});
const results=[];
for(const [type,query]of [['fighter_nato','F-22'],['helicopter','阿帕奇'],['ballistic','东风-26']]){
  if(type==='ballistic')await page.selectOption('#catalog-faction','china');
  await page.fill('#catalog-search',query);
  await page.waitForFunction(type=>window.__qaPreview?.model?.name===type,type);
  results.push(await page.evaluate(type=>{
    const p=__qaPreview;p.stop();p.renderer.render(p.scene,p.camera);
    const gl=p.renderer.getContext(),pixels=new Uint8Array(32*32*4);
    gl.readPixels(gl.drawingBufferWidth/2|0,gl.drawingBufferHeight/2|0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    let calls=0,triangles=0;p.model.traverse(m=>{if(m.isMesh){calls++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;}});
    return{type,calls,triangles,nonblank:pixels.some((v,i)=>i%4!==3&&v>0),glError:gl.getError()};
  },type));
  await page.screenshot({path:`${folder}/model-${type}.png`});
}
if(results.some(r=>!r.nonblank||r.glError||r.calls>20||r.triangles>=10000))throw Error(JSON.stringify(results));
console.log(results);await fs.writeFile(`${folder}/models.json`,JSON.stringify(results,null,2));
await page.click('[data-catalog-close]');await page.click('#challenge-btn');
console.log(await page.snapshot());
