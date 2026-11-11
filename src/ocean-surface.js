import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { coastalField, geologicalNoiseGLSL } from './terrain-materials.js';
import { oceanWaveGLSL } from './ocean-motion.js';

export function createOceanSurface(game){
  const coast=coastalField(game),time={value:0},strength={value:0},matrix={value:new THREE.Matrix4()},reflection={value:null};
  const size=new THREE.Vector2(game.world.width,game.world.height);
  const material=new THREE.MeshPhysicalMaterial({name:'海岸深度与波浪海面',color:0xffffff,roughness:.26,metalness:0,clearcoat:.35,clearcoatRoughness:.2,envMapIntensity:.55});
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{oceanTime:time,oceanCoast:{value:coast.texture},oceanSize:{value:size},oceanReflection:reflection,oceanReflectMatrix:matrix,oceanReflectStrength:strength});
    const common=`uniform float oceanTime;uniform sampler2D oceanCoast;uniform vec2 oceanSize;\n${oceanWaveGLSL}`;
    shader.vertexShader=`${common}\nuniform mat4 oceanReflectMatrix;varying vec3 vOceanWorld;varying vec4 vOceanReflect;\n${shader.vertexShader}`.replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 seaWorld=(modelMatrix*vec4(position,1.0)).xyz;
float seaDistance=max(0.0,(.5-texture2D(oceanCoast,seaWorld.xz/oceanSize).r)*1024.0);
transformed.z+=oceanWave(seaWorld.xz,oceanTime,seaDistance).x;
vOceanWorld=(modelMatrix*vec4(transformed,1.0)).xyz;vOceanReflect=oceanReflectMatrix*vec4(vOceanWorld,1.0);`);
    shader.fragmentShader=`${common}\n${geologicalNoiseGLSL}\nuniform sampler2D oceanReflection;uniform float oceanReflectStrength;varying vec3 vOceanWorld;varying vec4 vOceanReflect;\n${shader.fragmentShader}`
    .replace('#include <map_fragment>',`#include <map_fragment>
float shoreDistance=max(0.0,(.5-texture2D(oceanCoast,vOceanWorld.xz/oceanSize).r)*1024.0);
float seaDepth=smoothstep(5.0,320.0,shoreDistance),oceanNoise=geoFbm(vOceanWorld.xz*.035+oceanTime*.016);
vec3 shallow=vec3(.035,.23,.20),deep=vec3(.006,.035,.069);
vec3 seaColor=mix(shallow,deep,seaDepth)*(.88+oceanNoise*.2);
float caustic=pow(max(0.0,sin(vOceanWorld.x*.16+vOceanWorld.z*.10+oceanNoise*6.0+oceanTime*.8)),9.0);
seaColor+=vec3(.025,.07,.045)*caustic*(1.0-seaDepth);
float foamBand=pow(max(0.0,sin(shoreDistance*.115-oceanTime*1.7+oceanNoise*2.7)),10.0);
float foam=foamBand*(1.0-smoothstep(5.0,65.0,shoreDistance))*smoothstep(0.0,9.0,shoreDistance)*smoothstep(.25,.7,oceanNoise);
diffuseColor.rgb=mix(seaColor,vec3(.55,.67,.62),foam*.75);`)
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec3 seaWave=oceanWave(vOceanWorld.xz,oceanTime,shoreDistance);
float microX=cos(dot(vOceanWorld.xz,vec2(.21,.13))+oceanTime*1.9+oceanNoise*2.0)*.024;
float microZ=cos(dot(vOceanWorld.xz,vec2(-.17,.31))-oceanTime*1.2+oceanNoise*2.0)*.017;
vec3 oceanNormal=normalize(vec3(-seaWave.y+microX,1.0,-seaWave.z+microZ));
normal=normalize(mat3(viewMatrix)*oceanNormal);`)
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(.23,.65,foam);')
    .replace('#include <opaque_fragment>',`vec3 oceanView=normalize(cameraPosition-vOceanWorld);
float oceanFresnel=.025+.975*pow(1.0-clamp(dot(oceanView,oceanNormal),0.0,1.0),5.0);
vec2 reflectUV=vOceanReflect.xy/max(.0001,vOceanReflect.w)+oceanNormal.xz*.007;
vec3 mirror=texture2D(oceanReflection,clamp(reflectUV,vec2(.002),vec2(.998))).rgb;
vec3 sky=mix(vec3(.15,.24,.31),vec3(.42,.55,.61),clamp(oceanView.y,0.0,1.0));
outgoingLight=mix(outgoingLight,mix(sky,mirror,oceanReflectStrength),oceanFresnel*.65*(1.0-foam));
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> '海岸深度与多尺度海浪:1';
  // 备用采样纹理保证流畅档也有完整的有效uniform，不依赖首次反射成功。
  const fallback=new THREE.DataTexture(new Uint8Array([63,91,112,255]),1,1);fallback.needsUpdate=true;reflection.value=fallback;
  return{material,time,strength,matrix,reflection,fallback};
}

export function prepareOceanReflection(renderer){
  const plane=new Reflector(new THREE.PlaneGeometry(1,1),{textureWidth:512,textureHeight:512,multisample:0,clipBias:.002});
  plane.rotation.x=-Math.PI/2;plane.position.set(renderer.world.width/2,.8,renderer.world.height/2);plane.visible=false;plane.updateMatrixWorld(true);
  renderer.scene.add(plane);renderer.oceanMirror=plane;
  renderer.track(plane.geometry);renderer.track({dispose:()=>plane.dispose()});
}
export function updateOceanReflection(renderer,now,count){
  const ocean=renderer.ocean;if(!ocean)return;
  const enabled=renderer.quality==='high'&&!renderer.mobileBudget&&renderer.adaptiveRender.scale>.8&&count<120&&!renderer.oceanReflectionFailed;
  ocean.strength.value=enabled?.85:0;
  if(!enabled||now-(renderer.lastOceanReflection??-1000)<120)return;
  const hidden=[];const water=renderer.waterMesh;
  try{
    if(!renderer.oceanMirror)prepareOceanReflection(renderer);
    renderer.scene.updateMatrixWorld(true);
    for(const entry of renderer.entities.values())for(const object of [entry.identity,entry.ring,entry.airShadow])if(object?.visible){hidden.push(object);object.visible=false;}
    for(const batch of renderer.identityBatches?.batches.values()||[])if(batch.mesh.visible){hidden.push(batch.mesh);batch.mesh.visible=false;}
    water.visible=false;const oldAuto=renderer.webgl.shadowMap.autoUpdate;renderer.webgl.shadowMap.autoUpdate=false;
    try{renderer.oceanMirror.onBeforeRender(renderer.webgl,renderer.scene,renderer.viewCamera);}finally{renderer.webgl.shadowMap.autoUpdate=oldAuto;}
    ocean.reflection.value=renderer.oceanMirror.getRenderTarget().texture;
    ocean.matrix.value.copy(renderer.oceanMirror.material.uniforms.textureMatrix.value);renderer.lastOceanReflection=now;
  }catch(error){renderer.oceanReflectionFailed=true;ocean.strength.value=0;console.warn('海面反射暂不可用，继续使用波浪与天空反射。',error);}
  finally{if(renderer.oceanMirror)renderer.oceanMirror.visible=false;water.visible=true;hidden.forEach(object=>{object.visible=true;});renderer.webgl.setRenderTarget(null);}
}
