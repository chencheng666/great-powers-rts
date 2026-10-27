import * as THREE from 'three';

// 有界的游戏化体积云与冲击尘环，不改变视野，也不模拟现实爆炸参数。
export function createDeterrenceBlast(group) {
  const sphere=new THREE.SphereGeometry(1,24,16),smoke=new THREE.MeshStandardMaterial({color:'#85877f',roughness:1,transparent:true,opacity:0,depthWrite:false});
  // 顶点起伏打散球体剪影，片元软边和密度纹理避免烟团像实体石块。
  const density=`float cloudDensity(vec3 p){return .5+.22*sin(p.x*7.+sin(p.y*4.))+.16*sin(p.y*11.+p.z*6.)+.12*sin(p.z*17.+p.x*9.);}`;
  smoke.onBeforeCompile=shader=>{
    shader.vertexShader=`varying vec3 vCloudPosition;${density}\n${shader.vertexShader}`.replace('#include <begin_vertex>','#include <begin_vertex>\nvCloudPosition=position;transformed*=.9+.18*cloudDensity(position);');
    shader.fragmentShader=`varying vec3 vCloudPosition;${density}\n${shader.fragmentShader}`.replace('#include <opaque_fragment>',`float density=cloudDensity(vCloudPosition*1.9);float rim=pow(clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.),.65);diffuseColor.a*=rim*(.4+.6*density);outgoingLight*=.7+.45*density;\n#include <opaque_fragment>`);
  };
  smoke.customProgramCacheKey=()=> 'strategic-cloud-v1';
  const core=new THREE.Mesh(sphere.clone(),new THREE.MeshBasicMaterial({color:'#ffe4a6',transparent:true,opacity:0,depthWrite:false}));group.add(core);
  const puffs=[];
  for(let i=0;i<18;i++) {
    const puff=new THREE.Mesh(sphere.clone(),smoke);puff.userData.phase=i;puffs.push(puff);group.add(puff);
  }
  sphere.dispose();
  const geometry=new THREE.RingGeometry(.76,1,72);geometry.rotateX(-Math.PI/2);
  const ring=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#c9bd9c',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide}));group.add(ring);
  group.userData.deterrence={core,puffs,ring,smoke};
}

export function animateDeterrenceBlast(effect,group) {
  const {core,puffs,ring,smoke}=group.userData.deterrence,t=Math.min(1,effect.age/effect.duration),r=effect.size;
  const hot=Math.max(0,1-t*3.8);core.position.y=r*.13;core.scale.setScalar(r*(.12+Math.min(.2,t*.8)));core.material.opacity=hot*.82;
  smoke.opacity=Math.min(.84,t*5)*Math.min(1,(1-t)*2);
  puffs.forEach((p,i)=>{
    const cap=i>=7,j=cap?i-7:i,a=j*2.399;
    const rise=Math.min(1,t*1.8),spread=cap?r*(.11+rise*.28):r*(.025+rise*.04);
    p.position.set(Math.cos(a)*spread,cap?r*(.28+rise*.82)+Math.sin(j*1.7)*r*.035:r*(.06+j*.065)*rise,Math.sin(a)*spread);
    const size=cap?r*(.105+rise*.13):r*(.055+rise*.025);p.scale.set(size,cap?size*.65:size*1.3,size);
    p.rotation.y=a+t*.2;
  });
  ring.position.y=1;ring.scale.setScalar(r*Math.min(1,.12+t*3));ring.material.opacity=Math.max(0,1-t*3)*.38;
}
