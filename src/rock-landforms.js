import * as THREE from 'three';
import { landscapeNoise,landscapeMaterials } from './terrain-materials.js';

export function createRockLandform(variant=0){
  const geometry=new THREE.SphereGeometry(.7,20,14),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++){
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i),n=landscapeNoise(x*4.8+y*.8+variant*3,z*4.8+y*2.1);
    const ledge=.8+n*.33;
    p.setXYZ(i,x*ledge*(variant?1.2:1),Math.max(0,(y*ledge+.46)*(.78+variant*.1)),z*ledge*(variant?.82:1.08));
  }
  geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry;
}
export function createRockMaterial(cold=false){
  const textures=landscapeMaterials();
  const material=new THREE.MeshStandardMaterial({name:'风化岩体',color:0xffffff,roughness:.91,metalness:0});
  material.onBeforeCompile=shader=>{
    shader.uniforms.rockColor={value:textures.albedo};shader.uniforms.rockSurface={value:textures.surface};
    shader.vertexShader='varying vec3 vRockLocal;varying vec3 vRockNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRockLocal=position;vRockNormal=normal;');
    shader.fragmentShader=`varying vec3 vRockLocal;varying vec3 vRockNormal;uniform highp sampler2DArray rockColor;uniform highp sampler2DArray rockSurface;
vec4 rockSample(highp sampler2DArray tex,vec3 p,vec3 w){return texture(tex,vec3(p.zy,2.0))*w.x+texture(tex,vec3(p.xz,2.0))*w.y+texture(tex,vec3(p.xy,2.0))*w.z;}
${shader.fragmentShader}`.replace('#include <map_fragment>',`#include <map_fragment>
vec3 rockWeight=pow(abs(normalize(vRockNormal)),vec3(4.0));rockWeight/=dot(rockWeight,vec3(1.0));
vec4 rockTex=rockSample(rockColor,vRockLocal*1.4,rockWeight);
rockTex.rgb=mix(rockTex.rgb,vec3(dot(rockTex.rgb,vec3(.2126,.7152,.0722))),.45);
rockTex.rgb=mix(vec3(.18,.20,.21),rockTex.rgb,.65)*1.2;
diffuseColor.rgb=rockTex.rgb*${cold?'vec3(.93,1.0,1.04)':'vec3(.9,.94,.92)'};`)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>\nvec4 rockDetail=rockSample(rockSurface,vRockLocal*1.4,rockWeight);roughnessFactor=clamp(rockDetail.b,.7,1.0);`)
    .replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=mix(1.0,rockDetail.a,.5);');
  };
  material.customProgramCacheKey=()=>`三平面风化岩体:1:${cold}`;return material;
}
