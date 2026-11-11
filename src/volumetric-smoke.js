import * as THREE from 'three';

const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
let volume;
function smokeVolume(){
  if(volume)return volume;
  const size=32,data=new Uint8Array(size*size*size);
  const raw=(x,y,z)=>random(((x+size)%size)+((y+size)%size)*size+((z+size)%size)*size*size);
  for(let z=0;z<size;z++)for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let value=0;for(let dz=-1;dz<=1;dz++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)value+=raw(x+dx,y+dy,z+dz);
    data[x+y*size+z*size*size]=value/27*255;
  }
  volume=new THREE.Data3DTexture(data,size,size,size);volume.format=THREE.RedFormat;volume.minFilter=volume.magFilter=THREE.LinearFilter;volume.wrapS=volume.wrapT=volume.wrapR=THREE.RepeatWrapping;volume.needsUpdate=true;return volume;
}

// 固定容量、一次绘制的体积烟团。实例只保留表现状态，不写入单位、命中或存档。
export class VolumetricSmoke {
  constructor(scene,{capacity=320}={}){
    this.capacity=capacity;this.particles=[];this.sequence=0;
    const base=new THREE.PlaneGeometry(2,2),geometry=new THREE.InstancedBufferGeometry();geometry.index=base.index;geometry.attributes.position=base.attributes.position;geometry.attributes.uv=base.attributes.uv;
    const attribute=(name,size)=>{const a=new THREE.InstancedBufferAttribute(new Float32Array(capacity*size),size);a.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute(name,a);return a;};
    this.center=attribute('smokeCenter',3);this.size=attribute('smokeSize',1);this.life=attribute('smokeLife',3);this.phase=attribute('smokePhase',1);this.color=attribute('smokeColor',3);this.heat=attribute('smokeHeat',1);
    this.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{smokeVolume:{value:smokeVolume()},smokeSteps:{value:4}},vertexShader:`
      attribute vec3 smokeCenter;attribute float smokeSize;attribute vec3 smokeLife;attribute float smokePhase;attribute vec3 smokeColor;attribute float smokeHeat;
      varying vec2 smokeUv;varying vec3 smokeState;varying float smokeSeed;varying vec3 smokeTint;varying float smokeGlow;
      void main(){smokeUv=uv*2.0-1.0;smokeState=smokeLife;smokeSeed=smokePhase;smokeTint=smokeColor;smokeGlow=smokeHeat;
        vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
        vec3 world=smokeCenter+(right*position.x+up*position.y)*smokeSize;
        gl_Position=projectionMatrix*viewMatrix*vec4(world,1.0);}`,fragmentShader:`
      uniform highp sampler3D smokeVolume;uniform int smokeSteps;
      varying vec2 smokeUv;varying vec3 smokeState;varying float smokeSeed;varying vec3 smokeTint;varying float smokeGlow;
      float cloud(vec3 p){return texture(smokeVolume,p).r*.75+texture(smokeVolume,p*2.07).r*.25;}
      void main(){
        float r2=dot(smokeUv,smokeUv);if(r2>=1.0)discard;
        float thickness=sqrt(1.0-r2),transmission=1.0,light=0.0;
        for(int i=0;i<5;i++){if(i>=smokeSteps)break;
          float z=(float(i)+.5)/float(smokeSteps)*2.0-1.0;
          vec3 p=vec3(smokeUv*.48,z*thickness*.5)+vec3(smokeSeed,smokeState.x*.035,smokeSeed*.7);
          float noise=cloud(p),density=smoothstep(.43,.58,noise)*(1.0-r2)*thickness*smokeState.y/float(smokeSteps)*3.3;
          float sun=clamp(.58+(noise-cloud(p+vec3(-.07,.1,.04)))*4.0+smokeUv.y*.18,.12,1.0);
          light+=sun*density*transmission;transmission*=exp(-density);
        }
        float alpha=(1.0-transmission)*smokeState.z;if(alpha<.008)discard;
        vec3 lit=mix(smokeTint*.22,smokeTint,clamp(light/max(.02,1.0-transmission),0.0,1.0));
        lit=mix(lit,vec3(3.8,.8,.08),clamp(smokeGlow*(1.0-r2)*1.4,0.0,1.0));
        gl_FragColor=vec4(lit,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
    this.mesh=new THREE.Mesh(geometry,this.material);geometry.instanceCount=0;this.mesh.frustumCulled=false;this.mesh.renderOrder=3;scene.add(this.mesh);this.scene=scene;
  }
  emit({x,y,z,size=18,life=2.8,density=.9,rise=12,spread=4,source=null,start=0,color=[.25,.24,.21],wind=1,heat=0}){
    const seed=++this.sequence;
    if(this.particles.length>=this.capacity)this.particles.shift();
    this.particles.push({x,y,z,size,life,density,rise,spread,source,start,seed,color,wind,heat});
  }
  burst(x,z,y,radius,time,count=7){
    for(let i=0;i<count;i++){const angle=i*2.39996;this.emit({x:x+Math.cos(angle)*radius*.17,y:y+random(i)*radius*.18,z:z+Math.sin(angle)*radius*.17,size:radius*(.2+random(i+4)*.17),life:3.2+random(i+7)*2,rise:12+random(i+9)*14,spread:radius*.07,density:1.15,heat:i<3?.9:.3,start:time-i*.04});}
  }
  update(time,{visible=()=>true,sourceAlive=()=>true,high=false}={}){
    this.material.uniforms.smokeSteps.value=high?5:3;let count=0;
    this.particles=this.particles.filter(p=>{const age=time-p.start;return age<p.life&&(!p.source||sourceAlive(p.source));});
    for(const p of this.particles){
      const age=time-p.start;if(age<0)continue;const t=age/p.life,x=p.x+age*(3.8+Math.sin(p.seed)*1.8)*p.wind,z=p.z+age*(1.6+Math.cos(p.seed)*1.2)*p.wind;if(!visible(x,z))continue;
      const fade=Math.min(1,age/.14)*Math.min(1,(1-t)*2.4);
      this.center.setXYZ(count,x,p.y+age*p.rise,z);this.size.setX(count,p.size*(1+age*.44));this.life.setXYZ(count,t,p.density*Math.max(.15,1-t*.5),fade*.8);this.phase.setX(count,random(p.seed)*7);this.color.setXYZ(count,...p.color);this.heat.setX(count,p.heat*Math.max(0,1-age/.5));count++;
    }
    this.mesh.geometry.instanceCount=count;for(const a of[this.center,this.size,this.life,this.phase,this.color,this.heat])a.needsUpdate=true;
    return count;
  }
  dispose(){this.scene.remove(this.mesh);this.mesh.geometry.dispose();this.material.dispose();this.particles.length=0;}
}
