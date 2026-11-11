import * as THREE from 'three';

// 保留每个实体原有标记状态与选择对象，只将同阵营的线段合为实例绘制。
export class IdentityBatches {
  constructor(scene){this.scene=scene;this.batches=new Map();this.masked=[];this.stats={sources:0,batches:0};}
  restore(){for(const[object,mask]of this.masked)object.layers.mask=mask;this.masked.length=0;}
  update(entries,visible){
    this.restore();const groups=new Map();
    for(const entry of entries){
      const root=entry.identity,source=root?.children[0];if(!root?.visible||!source?.isLineSegments)continue;
      this.masked.push([source,source.layers.mask]);source.layers.set(1);
      if(entry.entity.kind==='unit'&&!visible.has(entry.entity.id))continue;
      const key=source.geometry.uuid+':'+source.material.uuid;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({root,source});
    }
    let sources=0;
    for(const[key,objects]of groups){
      let batch=this.batches.get(key);
      if(!batch||batch.capacity<objects.length){
        if(batch){this.scene.remove(batch.mesh);batch.mesh.geometry.dispose();batch.mesh.material.dispose();}
        const source=objects[0].source,capacity=Math.max(16,2**Math.ceil(Math.log2(objects.length))),geometry=new THREE.InstancedBufferGeometry();
        geometry.setAttribute('position',source.geometry.attributes.position);
        const position=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3),scale=new THREE.InstancedBufferAttribute(new Float32Array(capacity*2),2);position.setUsage(THREE.DynamicDrawUsage);scale.setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('markerPosition',position);geometry.setAttribute('markerScale',scale);
        const material=source.material.clone();material.onBeforeCompile=shader=>{shader.vertexShader='attribute vec3 markerPosition;attribute vec2 markerScale;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.xz*=markerScale;transformed+=markerPosition;');};material.customProgramCacheKey=()=> '阵营线段实例:1';
        const mesh=new THREE.LineSegments(geometry,material);mesh.frustumCulled=false;mesh.name='阵营标记共享绘制';this.scene.add(mesh);batch={mesh,position,scale,capacity};this.batches.set(key,batch);
      }
      objects.forEach(({root},i)=>{batch.position.setXYZ(i,root.position.x,root.position.y,root.position.z);batch.scale.setXY(i,root.scale.x,root.scale.z);});
      batch.position.needsUpdate=batch.scale.needsUpdate=true;batch.mesh.geometry.instanceCount=objects.length;batch.mesh.visible=true;sources+=objects.length;
    }
    for(const[key,batch]of this.batches)if(!groups.has(key)){batch.mesh.geometry.instanceCount=0;batch.mesh.visible=false;}
    this.stats={sources,batches:groups.size};
  }
  dispose(){this.restore();for(const{mesh}of this.batches.values()){this.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}this.batches.clear();}
}
