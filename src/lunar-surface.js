import { geologicalNoiseGLSL } from './terrain-materials.js';

// 月壤独立于草地/湿沙：毫米级颗粒只参与法线和粗糙度，不改变可行走地形。
export function finishLunarSurface(material){
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec3 vRegolith;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvRegolith=(modelMatrix*vec4(position,1.0)).xyz;');
    shader.fragmentShader=`varying vec3 vRegolith;\n${geologicalNoiseGLSL}\n${shader.fragmentShader}`
      .replace('#include <map_fragment>',`#include <map_fragment>
float lunarMacro=geoFbm(vRegolith.xz*.003),lunarFine=geoNoise(vRegolith.xz*.19);
float ejecta=smoothstep(.55,.8,lunarMacro);
diffuseColor.rgb*=vec3(.92,.96,1.0)*(.85+lunarMacro*.25);
diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*1.12,ejecta*.35);`)
      .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(.9+lunarFine*.1,.9,1.0);')
      .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec2 p=vRegolith.xz*.19;
vec2 grit=vec2(geoNoise(p+vec2(.12,0.0))-lunarFine,geoNoise(p+vec2(0.0,.12))-lunarFine);
normal=normalize(normal+mat3(viewMatrix)*vec3(grit.x,0.0,grit.y)*.35);`);
  };
  material.customProgramCacheKey=()=> '月壤粗粒与喷出层:1';return material;
}
