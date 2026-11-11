const waves=[[.017,.008,1.25,.83],[.011,-.027,.67,-.61],[.047,.031,.22,1.13]];
export function oceanWavePose(x,z,time,distance=300){
  const t=Math.max(0,Math.min(1,distance/85)),fade=t*t*(3-2*t);let height=0,dx=0,dz=0;
  for(const[kx,kz,a,speed]of waves){const phase=x*kx+z*kz+time*speed,heightPart=Math.sin(phase)*a*fade; height+=heightPart;dx+=Math.cos(phase)*kx*a*fade;dz+=Math.cos(phase)*kz*a*fade;}
  return{height,pitch:Math.atan(dx),roll:Math.atan(dz)};
}
export const oceanWaveGLSL=`
vec3 oceanWave(vec2 p,float t,float distance){
 float fade=smoothstep(0.0,85.0,distance);vec3 h=vec3(0.0);
 ${waves.map(([x,z,a,s])=>`{vec2 k=vec2(${x},${z});float phase=dot(p,k)+t*${s};h+=vec3(sin(phase),cos(phase)*k.x,cos(phase)*k.y)*${a}*fade;}`).join('\n')}
 return h;
}`;
