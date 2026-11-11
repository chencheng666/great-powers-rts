import * as THREE from 'three';

// 为外景烘焙同太阳方向的天空环境，避免室内灯箱高光出现在舰体和座舱上。
export function outdoorEnvironment(renderer,{future=false,cold=false}={}){
  const width=256,height=128,data=new Uint16Array(width*height*4);
  const sun=new THREE.Vector3(-1750,1850,-1050).normalize();
  const horizon=new THREE.Color(future?'#080c18':cold?'#bed0db':'#c2cbd0');
  const zenith=new THREE.Color(future?'#010207':cold?'#507da3':'#427da9');
  const ground=new THREE.Color(future?'#373e49':cold?'#626d72':'#454d3e');
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const phi=(x+.5)/width*Math.PI*2,theta=(y+.5)/height*Math.PI;
    // 与 Three.js 的经纬环境采样约定保持一致。
    const direction=new THREE.Vector3(-Math.cos(phi)*Math.sin(theta),Math.cos(theta),Math.sin(phi)*Math.sin(theta));
    const color=direction.y>=0?horizon.clone().lerp(zenith,Math.sqrt(direction.y)):horizon.clone().lerp(ground,Math.min(1,-direction.y*7));
    const disc=Math.exp((direction.dot(sun)-1)*1500),halo=Math.exp((direction.dot(sun)-1)*22)*.18;
    const i=(y*width+x)*4;
    data[i]=THREE.DataUtils.toHalfFloat(color.r*.7+disc*9+halo);data[i+1]=THREE.DataUtils.toHalfFloat(color.g*.7+disc*7.6+halo*.8);data[i+2]=THREE.DataUtils.toHalfFloat(color.b*.7+disc*5.8+halo*.5);data[i+3]=THREE.DataUtils.toHalfFloat(1);
  }
  const panorama=new THREE.DataTexture(data,width,height,THREE.RGBAFormat,THREE.HalfFloatType);panorama.mapping=THREE.EquirectangularReflectionMapping;panorama.needsUpdate=true;
  const generator=new THREE.PMREMGenerator(renderer);
  try{return generator.fromEquirectangular(panorama);}finally{generator.dispose();panorama.dispose();}
}
