// 原创程序化吸积盘与光子环，叠加页面收缩形成旋转吞噬演出。
export function createBlackHole(T){
 const material=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:false,uniforms:{uTime:{value:0},uAspect:{value:1},uFade:{value:0}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,fragmentShader:`
 precision highp float;varying vec2 vUv;uniform float uTime,uAspect,uFade;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec2 p=vUv-vec2(.6,.53);p.x*=uAspect;p*=1.55;float zoom=.35+smoothstep(0.,3.,uTime)*.75;p/=zoom;
 float r=length(p),a=atan(p.y,p.x);float orbit=a+uTime*.95+log(max(r,.01))*5.;
 float noise=hash(floor(vec2(orbit*65.,r*430.)));float streak=.5+.5*sin(orbit*19.+r*130.-uTime*2.);
 float diskR=length(vec2(p.x,p.y*3.8));float disk=exp(-abs(diskR-.34)*19.)*(.3+.7*streak)*(.65+.35*noise);
 float outer=exp(-abs(r-.19)*80.)+exp(-abs(r-.205)*130.)*.35;
 float glow=exp(-abs(r-.19)*14.)*.35;float shadow=1.-smoothstep(.158,.18,r);
 vec3 fire=mix(vec3(.95,.12,.025),vec3(1.,.83,.39),streak);vec3 color=fire*disk*1.7+vec3(1.,.57,.15)*outer+vec3(.26,.11,.04)*glow;
 float stars=step(.998,hash(floor((p/(.85+.25*sin(uTime*.4))+vec2(uTime*.013,0.))*240.)))*smoothstep(.22,.4,r);
 color+=vec3(.5,.8,1.)*stars*.65;float alpha=clamp(disk+outer+glow+shadow*.98+stars*.6,0.,1.);color*=1.-shadow;
 gl_FragColor=vec4(color,alpha*uFade);}`});
 const mesh=new T.Mesh(new T.PlaneGeometry(2,2),material);mesh.frustumCulled=false;mesh.renderOrder=100;
 return{mesh,update(t,aspect){material.uniforms.uTime.value=t;material.uniforms.uAspect.value=aspect;material.uniforms.uFade.value=Math.min(1,t/.65)*Math.max(0,Math.min(1,(7-t)/1.3));}};
}
