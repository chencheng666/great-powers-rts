import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 世界坐标的低频斑块与细节分开采样；不改变战场高度、寻路和碰撞。
const noiseGLSL=`
float battleHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float battleNoise(vec2 p){
 vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(battleHash(i),battleHash(i+vec2(1,0)),f.x),mix(battleHash(i+vec2(0,1)),battleHash(i+vec2(1,1)),f.x),f.y);
}
`;

export function finishBattleTerrain(material,{cold=false,future=false}={}) {
  if(future)return material;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`varying vec3 vBattleGround;varying vec3 vBattleSlope;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvBattleGround=(modelMatrix*vec4(position,1.0)).xyz;vBattleSlope=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader=`varying vec3 vBattleGround;varying vec3 vBattleSlope;\n${noiseGLSL}${shader.fragmentShader}`
      .replace('#include <map_fragment>',`#include <map_fragment>
float macro=battleNoise(vBattleGround.xz*.004);
float micro=battleNoise(vBattleGround.xz*.055);
float slope=1.0-clamp(vBattleSlope.y,0.0,1.0);
float rockMix=smoothstep(.025,.26,slope)*smoothstep(18.0,80.0,vBattleGround.y);
float rockGrain=(battleNoise(vBattleGround.xy*.18)+battleNoise(vBattleGround.zy*.18))*.5;
float strata=.93+.07*sin(vBattleGround.y*.14+macro*8.0+rockGrain*1.6);
vec3 rockTone=vec3(${cold?'.43,.47,.49':'.33,.32,.29'})*strata*(.76+.32*rockGrain);
diffuseColor.rgb*=mix(vec3(.86,.92,.78),vec3(1.07,1.03,.94),macro)*(.94+.1*micro);
diffuseColor.rgb=mix(diffuseColor.rgb,rockTone,rockMix*.9);
`)
      .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
float damp=smoothstep(.64,.86,battleNoise(vBattleGround.xz*.008))*clamp(vBattleSlope.y,0.0,1.0);
roughnessFactor=clamp(roughnessFactor-damp*.16,.7,1.0);`);
  };
  material.customProgramCacheKey=()=>`程序山地分层:3:${cold}`;
  material.userData.proceduralSurface='分层山岩、植被色斑与局部潮湿';return material;
}

export function createBattleWaterMaterial(normal) {
  const time={value:0};
  const material=new THREE.MeshStandardMaterial({name:'程序海面',vertexColors:true,metalness:.2,roughness:.42,normalMap:normal,normalScale:new THREE.Vector2(.075,.075),transparent:true,opacity:.97,depthWrite:false,envMapIntensity:.3});
  material.onBeforeCompile=shader=>{
    shader.uniforms.battleWaterTime=time;
    shader.vertexShader=`uniform float battleWaterTime;varying vec3 vBattleSea;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 waveWorld=(modelMatrix*vec4(position,1.0)).xyz;
transformed.z+=sin(waveWorld.x*.019+waveWorld.z*.011+battleWaterTime*.8)*.42+sin(waveWorld.x*.034-waveWorld.z*.025-battleWaterTime*.63)*.22;
vBattleSea=(modelMatrix*vec4(transformed,1.0)).xyz;`);
    shader.fragmentShader=`uniform float battleWaterTime;varying vec3 vBattleSea;\n${noiseGLSL}${shader.fragmentShader}`
      .replace('#include <map_fragment>',`#include <map_fragment>
float winds=battleNoise(vBattleSea.xz*.012+vec2(battleWaterTime*.025,0.0));
diffuseColor.rgb*=.83+.24*winds;
float waveCrest=pow(max(0.0,sin(vBattleSea.x*.245+vBattleSea.z*.134+battleWaterTime*1.1)),18.0);
diffuseColor.rgb+=vec3(.008,.016,.018)*waveCrest*winds;`)
      .replace('#include <opaque_fragment>',`vec3 seaView=normalize(cameraPosition-vBattleSea);
vec3 waterNormal=normalize(vec3(-cos(vBattleSea.x*.019+vBattleSea.z*.011+battleWaterTime*.8)*.008,1.0,-cos(vBattleSea.x*.034-vBattleSea.z*.025-battleWaterTime*.63)*.006));
float fresnel=pow(1.0-clamp(dot(seaView,waterNormal),0.0,1.0),4.0);
vec3 reflected=reflect(-seaView,waterNormal);
float glitter=pow(max(0.0,dot(reflected,normalize(vec3(-.65,.69,-.39)))),300.0);
outgoingLight=mix(outgoingLight,vec3(.22,.35,.46),fresnel*.46)+vec3(1.1,.92,.65)*glitter*.025;
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey=()=> '程序海面双向波纹与天空反射:3';
  material.userData.waterTime=time;material.userData.proceduralSurface='双向波浪、风斑、天空近似反射与太阳碎光';
  return material;
}

let leafTexture;
function leafClusterTexture() {
  if(leafTexture)return leafTexture;
  const size=96,pixels=new Uint8Array(size*size*4);let seed=813;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  for(let leaf=0;leaf<115;leaf++){
    const angle=random()*Math.PI*2,radius=Math.sqrt(random())*.39,cx=.5+Math.cos(angle)*radius,cy=.5+Math.sin(angle)*radius;
    const rx=.025+random()*.045,ry=.018+random()*.03,tone=190+random()*65;
    for(let y=Math.max(0,Math.floor((cy-ry)*size));y<Math.min(size,(cy+ry)*size);y++)for(let x=Math.max(0,Math.floor((cx-rx)*size));x<Math.min(size,(cx+rx)*size);x++){
      const d=((x/size-cx)/rx)**2+((y/size-cy)/ry)**2;if(d>1)continue;const i=(y*size+x)*4;
      pixels[i]=tone;pixels[i+1]=tone;pixels[i+2]=tone*.9;pixels[i+3]=Math.min(255,(1-d)*1200);
    }
  }
  leafTexture=new THREE.DataTexture(pixels,size,size);leafTexture.colorSpace=THREE.SRGBColorSpace;leafTexture.magFilter=THREE.LinearFilter;leafTexture.minFilter=THREE.LinearMipmapLinearFilter;leafTexture.generateMipmaps=true;leafTexture.needsUpdate=true;
  return leafTexture;
}

export function proceduralTreeGeometry(variant) {
  const group=new THREE.Group();
  const canopyMaterial=new THREE.MeshStandardMaterial({name:'程序树冠',map:leafClusterTexture(),color:variant%2?'#597346':'#34533e',roughness:.93,vertexColors:true,alphaTest:.45,side:THREE.DoubleSide});
  const trunkMaterial=new THREE.MeshStandardMaterial({name:'树皮',color:'#655442',roughness:1});
  const trunk=new THREE.Mesh(new THREE.CylinderGeometry(.045,.085,1,7),trunkMaterial);trunk.position.y=.5;group.add(trunk);
  const parts=[];
  const cluster=(x,y,z,width,height,yaw,tilt)=>{
    const g=new THREE.PlaneGeometry(width,height,2,2);g.rotateX(tilt);g.rotateY(yaw);g.translate(x,y,z);parts.push(g);
  };
  if(variant%2===0){
    for(let tier=0;tier<6;tier++)for(let branch=0;branch<7;branch++){
      const angle=branch*Math.PI*2/7+tier*.55,radius=.23-tier*.032;
      cluster(Math.cos(angle)*radius,.42+tier*.15,Math.sin(angle)*radius,.38-tier*.045,.33,angle,-.45);
    }
  }else{
    // 每簇两片交错叶面，保留透光间隙与真实轮廓，不用光滑大球替代树冠。
    for(let i=0;i<22;i++){
      const angle=i*2.39996,top=i>=15,radius=top?.11:.23,y=.72+(i%7)*.045+(top?.22:0);
      for(const cross of [0,Math.PI/2])cluster(Math.cos(angle)*radius,y,Math.sin(angle)*radius,.46,.45,angle+cross,-.25+(i%3)*.4);
    }
  }
  for(const geometry of parts){
    const positions=geometry.attributes.position,colors=[];
    for(let i=0;i<positions.count;i++){
      const x=positions.getX(i),y=positions.getY(i),z=positions.getZ(i),tone=.78+y*.14+Math.sin(x*19+z*17)*.075;
      colors.push(tone,tone,Math.min(1,tone*.94));
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  }
  group.add(new THREE.Mesh(mergeGeometries(parts,false),canopyMaterial));parts.forEach(g=>g.dispose());
  return group;
}
