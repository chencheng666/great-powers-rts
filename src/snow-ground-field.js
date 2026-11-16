import * as THREE from 'three';
import { snowElevation } from './snow-to-sea.js';

const fields=new WeakMap();
// 地面焦痕也采样同一高度，避免高山和桥面上的特效掉回旧地图的平面。
export function snowGroundField(map){
  if(fields.has(map))return fields.get(map);
  const width=385,height=257,data=new Float32Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data[y*width+x]=snowElevation(map,x/(width-1)*map.world.width,y/(height-1)*map.world.height);
  const texture=new THREE.DataTexture(data,width,height,THREE.RedFormat,THREE.FloatType);texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;
  const field={texture,width,height};fields.set(map,field);return field;
}
export function conformSnowMark(material,game){
  const f=snowGroundField(game.map);
  material.onBeforeCompile=shader=>{
    shader.uniforms.snowGround={value:f.texture};shader.uniforms.snowWorld={value:new THREE.Vector2(game.world.width,game.world.height)};
    shader.vertexShader=`uniform sampler2D snowGround;uniform vec2 snowWorld;
float snowMarkHeight(vec2 p){vec2 size=vec2(${f.width}.0,${f.height}.0),v=clamp(p/snowWorld,0.0,1.0)*(size-1.0),cell=floor(v),t=fract(v);vec2 uv=(cell+.5)/size,stepUV=1.0/size;
float a=texture2D(snowGround,uv).r,b=texture2D(snowGround,uv+vec2(stepUV.x,0)).r,c=texture2D(snowGround,uv+vec2(0,stepUV.y)).r,d=texture2D(snowGround,uv+stepUV).r;return mix(mix(a,b,t.x),mix(c,d,t.x),t.y)+1.1;}
${shader.vertexShader}`.replace('#include <project_vertex>',`#include <project_vertex>
vec4 groundWorld=vec4(transformed,1.0);
#ifdef USE_INSTANCING
groundWorld=instanceMatrix*groundWorld;
#endif
groundWorld=modelMatrix*groundWorld;groundWorld.y=snowMarkHeight(groundWorld.xz);gl_Position=projectionMatrix*viewMatrix*groundWorld;`);
  };
  material.customProgramCacheKey=()=> '雪岭入海贴地特效';return material;
}
