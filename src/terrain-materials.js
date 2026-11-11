import * as THREE from 'three';
import { islandDistance } from './island-map.js';

const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const hash=(x,y)=>{let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263))>>>0;h=Math.imul(h^(h>>>13),1274126177)>>>0;return((h^(h>>>16))>>>0)/4294967295;};
export function landscapeNoise(x,y,period=0){
  const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);
  const h=(a,b)=>hash(period?((a%period)+period)%period:a,period?((b%period)+period)%period:b);
  return (h(ix,iy)*(1-u)+h(ix+1,iy)*u)*(1-v)+(h(ix,iy+1)*(1-u)+h(ix+1,iy+1)*u)*v;
}
export const geologicalNoiseGLSL=`
float geoHash(vec2 p){uint h=uint(int(p.x))*374761393u+uint(int(p.y))*668265263u;h=(h^(h>>13u))*1274126177u;return float(h^(h>>16u))/4294967295.0;}
float geoNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(geoHash(i),geoHash(i+vec2(1,0)),f.x),mix(geoHash(i+vec2(0,1)),geoHash(i+vec2(1,1)),f.x),f.y);}
float geoFbm(vec2 p){return geoNoise(p)*.57+geoNoise(p*2.03+7.1)*.28+geoNoise(p*4.07+19.3)*.15;}
`;

let cached;
// 两张四层纹理数组共用：颜色和法线/粗糙度/遮蔽。周期噪声使每层独立重复，不在图集边缘串色。
export function landscapeMaterials(){
  if(cached)return cached;
  const size=256,layers=4,count=size*size*layers*4,albedo=new Uint8Array(count),surface=new Uint8Array(count);
  const bases=[[105,112,78],[137,120,95],[115,117,105],[191,177,142]];
  for(let layer=0;layer<layers;layer++){
    const heights=new Float32Array(size*size);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const a=landscapeNoise(x/32,y/32,8),b=landscapeNoise(x/8+layer*5,y/8,32),c=landscapeNoise(x/2,y/2,128);
      const ridge=1-Math.abs(b*2-1);
      const h=layer===2?a*.45+ridge*.35+c*.2:layer===3?a*.14+b*.12+Math.sin(x*.36+a*4)*.06+c*.12:a*.4+b*.3+c*.3;
      heights[y*size+x]=h;
      const grain=hash(x+layer*1000,y),mottle=.75+a*.3+b*.13,vein=layer===2?Math.pow(clamp((b-.62)*5),2)*.25:0;
      const i=((layer*size+y)*size+x)*4,base=bases[layer];
      for(let k=0;k<3;k++)albedo[i+k]=clamp(Math.round(base[k]*(mottle-vein)+(grain-.5)*(layer===3?9:22)),0,255);
      albedo[i+3]=255;surface[i+2]=layer===3?207+grain*25:layer===2?196+b*48:224+grain*25;surface[i+3]=210+h*45;
    }
    const height=(x,y)=>heights[((y+size)%size)*size+(x+size)%size];
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const i=((layer*size+y)*size+x)*4,strength=layer===2?4.5:layer===3?2:3;
      const nx=(height(x-1,y)-height(x+1,y))*strength,ny=(height(x,y-1)-height(x,y+1))*strength,len=Math.sqrt(nx*nx+ny*ny+1);
      surface[i]=Math.round((nx/len*.5+.5)*255);surface[i+1]=Math.round((ny/len*.5+.5)*255);
    }
  }
  const texture=(data,color)=>{const t=new THREE.DataArrayTexture(data,size,size,layers);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;return t;};
  cached={albedo:texture(albedo,true),surface:texture(surface,false),bytes:albedo.byteLength+surface.byteLength};return cached;
}

const coasts=new WeakMap();
export function coastDistance(map,x,z){
  if(map.islands)return islandDistance(map,x,z);
  if(!map.water)return 512;
  const w=map.water;
  return x>=w.x1&&x<=w.x2&&z>=w.y1&&z<=w.y2?-Math.min(x-w.x1,w.x2-x,z-w.y1,w.y2-z):Math.hypot(Math.max(w.x1-x,0,x-w.x2),Math.max(w.y1-z,0,z-w.y2));
}
export function coastalField(game){
  const {map,world}=game;let cached=coasts.get(map);
  if(cached&&cached.width===world.width&&cached.height===world.height)return cached;
  const width=384,height=Math.max(64,Math.round(width*world.height/world.width)),pixels=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const d=coastDistance(map,(x+.5)/width*world.width,(y+.5)/height*world.height),i=(y*width+x)*4;
    pixels[i]=Math.round(clamp(.5+d/1024)*255);pixels[i+1]=Math.round(clamp(-d/280)*255);pixels[i+2]=Math.round(clamp(1-Math.abs(d)/90)*255);pixels[i+3]=255;
  }
  const texture=new THREE.DataTexture(pixels,width,height);texture.magFilter=texture.minFilter=THREE.LinearFilter;texture.needsUpdate=true;
  cached={texture,width:world.width,height:world.height,bytes:pixels.byteLength};coasts.set(map,cached);return cached;
}

export function finishLandscape(material,{game,roadMask}){
  const textures=landscapeMaterials(),coast=coastalField(game),cold=game.map.climate==='cold';
  const uniforms={geoAlbedo:{value:textures.albedo},geoSurface:{value:textures.surface},geoCoast:{value:coast.texture},geoRoad:{value:roadMask},geoSize:{value:new THREE.Vector2(game.world.width,game.world.height)}};
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader='varying vec3 vGeoWorld;varying vec3 vGeoNormal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvGeoWorld=(modelMatrix*vec4(position,1.0)).xyz;vGeoNormal=normalize(mat3(modelMatrix)*normal);');
    shader.fragmentShader=`varying vec3 vGeoWorld;varying vec3 vGeoNormal;
uniform highp sampler2DArray geoAlbedo;uniform highp sampler2DArray geoSurface;uniform sampler2D geoCoast;uniform sampler2D geoRoad;uniform vec2 geoSize;
${geologicalNoiseGLSL}
vec4 geoSample(highp sampler2DArray tex,vec2 p,float layer){return texture(tex,vec3(p,layer));}
vec4 geoTriplanar(highp sampler2DArray tex,vec3 p,vec3 w,float layer){return geoSample(tex,p.zy,layer)*w.x+geoSample(tex,p.xz,layer)*w.y+geoSample(tex,p.xy,layer)*w.z;}
${shader.fragmentShader}`
    .replace('#include <map_fragment>',`#include <map_fragment>
vec3 geoWeights=pow(abs(normalize(vGeoNormal)),vec3(4.0));geoWeights/=max(.001,dot(geoWeights,vec3(1.0)));
float geoSlope=1.0-clamp(vGeoNormal.y,0.0,1.0),geoHeight=vGeoWorld.y;
float geoRock=smoothstep(.035,.28,geoSlope)*smoothstep(20.0,85.0,geoHeight);
float geoDirt=smoothstep(.39,.72,geoFbm(vGeoWorld.xz*.007));
float geoDistance=(texture2D(geoCoast,vGeoWorld.xz/geoSize).r-.5)*1024.0;
float geoSand=1.0-smoothstep(18.0,85.0,geoDistance);
float geoKeep=texture2D(geoRoad,vec2(vGeoWorld.x/geoSize.x,1.0-vGeoWorld.z/geoSize.y)).r;
vec4 geoGrass=geoSample(geoAlbedo,vGeoWorld.xz/64.0,0.0),geoEarth=geoSample(geoAlbedo,vGeoWorld.xz/71.0,1.0);
vec4 geoStone=geoTriplanar(geoAlbedo,vGeoWorld/55.0,geoWeights,2.0),geoBeach=geoSample(geoAlbedo,vGeoWorld.xz/48.0,3.0);
geoStone.rgb=mix(geoStone.rgb,vec3(dot(geoStone.rgb,vec3(.2126,.7152,.0722))),.45);
geoStone.rgb=mix(vec3(.18,.20,.21),geoStone.rgb,.65)*1.2;
vec3 geoColor=mix(mix(mix(geoGrass.rgb,geoEarth.rgb,geoDirt*.55),geoStone.rgb,geoRock),geoBeach.rgb,geoSand*(1.0-geoRock));
${cold?'geoColor=mix(geoColor,vec3(.58,.63,.65),.55);geoColor=mix(geoColor,vec3(.81,.85,.86),smoothstep(135.0,230.0,geoHeight)*smoothstep(.5,.9,vGeoNormal.y)*.7);':''}
float geoMacro=.87+geoFbm(vGeoWorld.xz*.002)*.24;
float geoWet=geoSand*(1.0-smoothstep(-5.0,35.0,geoDistance));
geoColor*=geoMacro*(1.0-geoWet*.25);
diffuseColor.rgb=mix(geoColor,diffuseColor.rgb,geoKeep);
`)
    .replace('#include <roughnessmap_fragment>',`#include <roughnessmap_fragment>
vec4 geoGroundDetail=mix(geoSample(geoSurface,vGeoWorld.xz/64.0,0.0),geoSample(geoSurface,vGeoWorld.xz/71.0,1.0),geoDirt*.55);
vec4 geoRockX=geoSample(geoSurface,vGeoWorld.zy/55.0,2.0),geoRockY=geoSample(geoSurface,vGeoWorld.xz/55.0,2.0),geoRockZ=geoSample(geoSurface,vGeoWorld.xy/55.0,2.0);
vec4 geoSandDetail=geoSample(geoSurface,vGeoWorld.xz/48.0,3.0);
vec4 geoRockDetail=geoRockX*geoWeights.x+geoRockY*geoWeights.y+geoRockZ*geoWeights.z;
vec4 geoDetail=mix(mix(geoGroundDetail,geoRockDetail,geoRock),geoSandDetail,geoSand*(1.0-geoRock));
roughnessFactor=mix(clamp(geoDetail.b-geoWet*.2,.5,1.0),roughnessFactor,geoKeep);`)
    .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
vec2 nx=geoRockX.rg*2.0-1.0,ny=geoRockY.rg*2.0-1.0,nz=geoRockZ.rg*2.0-1.0;
vec3 rockBump=vec3(ny.x*geoWeights.y+nz.x*geoWeights.z,nx.y*geoWeights.x+nz.y*geoWeights.z,nx.x*geoWeights.x+ny.y*geoWeights.y);
vec2 floorBump=mix(geoGroundDetail.rg,geoSandDetail.rg,geoSand)*2.0-1.0;
vec3 geoBump=mix(vec3(floorBump.x,0.0,floorBump.y),rockBump,geoRock)*(.3+geoRock*.3);
normal=normalize(mix(normal,normalize(mat3(viewMatrix)*normalize(vGeoNormal+geoBump)),1.0-geoKeep));`)
    .replace('#include <aomap_fragment>','#include <aomap_fragment>\nreflectedLight.indirectDiffuse*=mix(1.0,geoDetail.a,.5*(1.0-geoKeep));');
  };
  material.customProgramCacheKey=()=>`世界地表材质数组:1:${cold}`;
  material.userData.landscapeUniforms=uniforms;return material;
}

let photoPending;
const photoLayers=[
  {layer:0,color:new URL('../assets/third-party/polyhaven-terrain-20261111/leafy_grass-color.webp',import.meta.url).href,surface:new URL('../assets/third-party/polyhaven-terrain-20261111/leafy_grass-surface.webp',import.meta.url).href},
  {layer:2,color:new URL('../assets/third-party/polyhaven-terrain-20261111/rock_face-color.webp',import.meta.url).href,surface:new URL('../assets/third-party/polyhaven-terrain-20261111/rock_face-surface.webp',import.meta.url).href},
];
export function prepareLandscapePhotoLayers(){
  if(typeof document==='undefined')return Promise.resolve(false);
  photoPending ||= Promise.all(photoLayers.flatMap(p=>['color','surface'].map(role=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({layer:p.layer,role,image});image.onerror=()=>reject(new Error('地表贴图未能载入'));image.src=p[role];}))))
    .then(images=>{
      const textures=landscapeMaterials(),canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d',{willReadFrequently:true});
      for(const{layer,role,image}of images){ctx.clearRect(0,0,256,256);ctx.drawImage(image,0,0,256,256);const data=ctx.getImageData(0,0,256,256).data;
        if(role==='color'&&layer===0)for(let i=0;i<data.length;i+=4){data[i]*=.68;data[i+1]*=.86;data[i+2]*=.65;}
        const target=textures[role==='color'?'albedo':'surface'].image.data;
        for(let y=0;y<256;y++)target.set(data.subarray(y*1024,(y+1)*1024),layer*256*256*4+(255-y)*1024);
      }
      textures.albedo.needsUpdate=textures.surface.needsUpdate=true;textures.photosReady=true;return true;
    }).catch(error=>{photoPending=null;console.warn('摄影地表暂未载入，本局继续使用程序材质。',error);return false;});
  return photoPending;
}
