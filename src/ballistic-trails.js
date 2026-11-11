import * as THREE from 'three';

// 连续尾烟按相邻的真实弹体位置连接；固定实例池避免齐射时创建数百个 Sprite。
export class BallisticTrails {
  constructor(scene,{capacity=720}={}){
    this.scene=scene;this.capacity=capacity;this.segments=[];this.previous=new Map();
    const base=new THREE.PlaneGeometry(1,1),g=new THREE.InstancedBufferGeometry();g.index=base.index;g.attributes.position=base.attributes.position;g.attributes.uv=base.attributes.uv;
    const attr=(name,size)=>{const a=new THREE.InstancedBufferAttribute(new Float32Array(capacity*size),size);a.setUsage(THREE.DynamicDrawUsage);g.setAttribute(name,a);return a;};
    this.from=attr('trailFrom',3);this.to=attr('trailTo',3);this.state=attr('trailState',3);
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,vertexShader:`
attribute vec3 trailFrom;attribute vec3 trailTo;attribute vec3 trailState;varying vec2 vTrailUV;varying vec2 vTrailLife;
void main(){
 vTrailUV=uv;vTrailLife=trailState.yz;
 vec3 along=normalize(trailTo-trailFrom),center=mix(trailFrom,trailTo,uv.x);
 vec3 side=cross(along,cameraPosition-center);float sideLength=length(side);side=sideLength>.0001?side/sideLength:vec3(1.0,0.0,0.0);
 vec3 world=center+side*(uv.y-.5)*trailState.x;gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);
}`,fragmentShader:`
varying vec2 vTrailUV;varying vec2 vTrailLife;
void main(){
 float edge=pow(max(0.0,1.0-abs(vTrailUV.y*2.0-1.0)),1.7);
 float ripple=.85+.15*sin(vTrailUV.x*19.0+vTrailLife.y*37.0+vTrailUV.y*8.0);
 float alpha=edge*ripple*vTrailLife.x;if(alpha<.007)discard;
 gl_FragColor=vec4(mix(vec3(.22,.23,.22),vec3(.49,.48,.44),vTrailUV.y),alpha);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`});
    this.mesh=new THREE.Mesh(g,this.material);this.mesh.name='连续导弹尾烟';this.mesh.frustumCulled=false;this.mesh.renderOrder=2;g.instanceCount=0;scene.add(this.mesh);
  }
  sample(id,position,time,{visible=true,heavy=false}={}){
    const prior=this.previous.get(id);this.previous.set(id,{...position,time,visible});
    if(!visible||!prior?.visible||time<=prior.time||time-prior.time>.2)return;
    const length=Math.hypot(position.x-prior.x,position.y-prior.y,position.z-prior.z);
    if(length<.08||length>150)return;
    if(this.segments.length>=this.capacity)this.segments.shift();
    this.segments.push({from:prior,to:{...position},start:time,width:heavy?5.5:3.4,life:heavy?1.8:1.25});
  }
  update(time,{active=new Set(),visible=()=>true}={}){
    for(const id of this.previous.keys())if(!active.has(id))this.previous.delete(id);
    this.segments=this.segments.filter(s=>time-s.start<s.life);let n=0;
    for(const s of this.segments){const age=Math.max(0,time-s.start),t=age/s.life;if(!visible((s.from.x+s.to.x)/2,(s.from.z+s.to.z)/2))continue;
      const wind=age*3,up=age*2.5;
      this.from.setXYZ(n,s.from.x+wind,s.from.y+up,s.from.z+age);this.to.setXYZ(n,s.to.x+wind,s.to.y+up,s.to.z+age);
      this.state.setXYZ(n,s.width*(1+age*2.5),.48*(1-t)**1.1,t);n++;
    }
    this.mesh.geometry.instanceCount=n;for(const a of[this.from,this.to,this.state])a.needsUpdate=true;return n;
  }
  dispose(){this.scene.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose();this.previous.clear();this.segments.length=0;}
}
