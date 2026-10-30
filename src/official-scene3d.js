import * as T from 'three';
import {createChineseTank} from './domestic-models.js';
import {createModernAircraft} from './aircraft-models.js';
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export function createOfficialScene(canvas){
 const renderer=new T.WebGLRenderer({canvas,alpha:true,antialias:innerWidth>700,powerPreference:'low-power'});renderer.setClearColor(0,0);renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.45;
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.1,180);camera.position.set(0,4.2,23);camera.lookAt(0,3,0);
 scene.add(new T.HemisphereLight('#e2efff','#34322a',3));const sun=new T.DirectionalLight('#fff0cb',5);sun.position.set(-8,12,15);scene.add(sun);const rim=new T.DirectionalLight('#77d5ed',4);rim.position.set(10,4,-5);scene.add(rim);
 const tank=createChineseTank();tank.rotation.y=-1.18;scene.add(tank);
 const jets=[createModernAircraft('fighter_china'),createModernAircraft('fighter_china')];for(const j of jets){j.rotation.y=-Math.PI/2;scene.add(j);}
 const bomb=new T.Group();const shell=new T.MeshStandardMaterial({color:'#adb3a3',metalness:.7,roughness:.3});const tube=new T.Mesh(new T.CylinderGeometry(.24,.26,2.4,16),shell);tube.rotation.x=Math.PI/2;bomb.add(tube);const tip=new T.Mesh(new T.ConeGeometry(.24,.7,16),shell);tip.rotation.x=Math.PI/2;tip.position.z=1.55;bomb.add(tip);for(let i=0;i<4;i++){const fin=new T.Mesh(new T.BoxGeometry(.9,.05,.65),shell);fin.rotation.z=i*Math.PI/2;fin.position.z=-.9;bomb.add(fin);}scene.add(bomb);
 const cloud=new T.Group();scene.add(cloud);const cloudParts=[];
 // 程序化烟尘贴图：柔边、斑驳与多层叠加，避免硬质球体的塑料感。
 const smokeCanvas=document.createElement('canvas');smokeCanvas.width=smokeCanvas.height=128;const cx=smokeCanvas.getContext('2d');
 const g=cx.createRadialGradient(64,64,8,64,64,64);g.addColorStop(0,'rgba(255,244,215,.9)');g.addColorStop(.35,'rgba(232,205,169,.75)');g.addColorStop(.7,'rgba(123,115,102,.4)');g.addColorStop(1,'rgba(50,53,50,0)');cx.fillStyle=g;cx.fillRect(0,0,128,128);
 for(let i=0;i<250;i++){const x=(Math.sin(i*73.13)*43758.5%1+1)%1*128,y=(Math.cos(i*17.7)*12345.1%1+1)%1*128;cx.fillStyle=`rgba(30,30,25,${.02+i%7*.006})`;cx.beginPath();cx.arc(x,y,2+i%9,0,Math.PI*2);cx.fill();}
 const smokeMap=new T.CanvasTexture(smokeCanvas);const cool=new T.Color('#4b4d48'),hot=new T.Color('#ff9c31');
 for(let i=0;i<58;i++){const material=new T.SpriteMaterial({map:smokeMap,color:'#ffb34e',transparent:true,depthWrite:false,opacity:.9});const p=new T.Sprite(material);cloud.add(p);const a=i*2.39996;cloudParts.push({p,a,ring:i<18?0:1,r:.6+(i%9)/9});}
 const ring=new T.Mesh(new T.TorusGeometry(1,.012,6,96),new T.MeshBasicMaterial({color:'#ffe0a2',transparent:true}));ring.rotation.x=Math.PI/2;scene.add(ring);
 const light=new T.PointLight('#ff9d36',0,100,1);light.position.set(0,4,8);scene.add(light);
 const count=innerWidth<700?180:420,positions=new Float32Array(count*3),velocities=[];for(let i=0;i<count;i++){const a=i*2.39996,v=2+(i%17)*.6;velocities.push([Math.cos(a)*v,1+(i%11)*.7,Math.sin(a)*v]);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));const sparks=new T.Points(geometry,new T.PointsMaterial({color:'#ffb85a',size:.09,transparent:true,opacity:1,blending:T.AdditiveBlending,depthWrite:false}));scene.add(sparks);
 let raf=0,started=0,mode='assault',callbacks={},blasted=false,last=0;
 const resize=()=>{renderer.setSize(innerWidth,innerHeight,false);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();};window.addEventListener('resize',resize);resize();
 function stop(){cancelAnimationFrame(raf);raf=0;renderer.clear();}
 function frame(now){
  const t=(now-started)/1000;if(now-last<1000/40){raf=requestAnimationFrame(frame);return;}last=now;
  canvas.parentElement.dataset.time=t.toFixed(1);
  const nuke=mode==='nuclear',impact=nuke?1.65:2.8,d=t-impact,life=clamp(d/(nuke?3.6:1.8)),expand=1-Math.pow(1-clamp(d/2.8),3);
  tank.visible=!nuke&&t<impact+.2;tank.position.set(innerWidth<700?1.4:4.6,-1,-42+clamp(t/2.8)*57);tank.scale.setScalar((innerWidth<700?.68:1.05)*(1+clamp(t/2.8)*.35));
  jets.forEach((j,i)=>{j.visible=!nuke&&t<2.6;const k=clamp((t-i*.22)/2.25);j.position.set((i?-.7:1)*(3+Math.pow(k,3)*16),5+i*2,-65+k*100);j.rotation.x=(i?1:-1)*.12;j.rotation.z=-.08;});
  bomb.visible=nuke&&t<impact;bomb.position.set(0,11-t*5,-48+t*40);bomb.rotation.z=t*.8;
  cloud.visible=d>=0;ring.visible=d>=0;sparks.visible=d>=0;
  if(d>=0){
   if(!blasted){blasted=true;callbacks.blast?.();}
   const size=nuke?1: .36;cloud.position.set(nuke?0:4.6,-2,0);cloud.scale.setScalar((.15+expand)*size);
   for(let i=0;i<cloudParts.length;i++){const {p,a,ring:r,r:variation}=cloudParts[i];if(r){p.position.set(Math.cos(a)*(3+variation*3),6+Math.sin(a*2)*.6+expand*1.8,Math.sin(a)*(2+variation*2));p.scale.set(5.6,4.8+variation,1);}else{p.position.set(Math.cos(a)*.7,(i/18)*7,Math.sin(a)*.7);p.scale.set(3.8+variation,3.8,1);}p.material.color.copy(hot).lerp(cool,clamp((d-(i<18?.8:.25))/2.1));p.material.opacity=(1-Math.pow(life,3))*.86;p.material.rotation=d*.06+(i%5)*.3;}
   ring.position.set(0,-1,0);ring.scale.setScalar(1+Math.max(0,d)*35);ring.material.opacity=(1-life)*.65;
   for(let i=0;i<count;i++){const v=velocities[i];positions[i*3]=v[0]*d;positions[i*3+1]=2+v[1]*d-d*d*.8;positions[i*3+2]=v[2]*d;}geometry.attributes.position.needsUpdate=true;sparks.material.opacity=1-life;light.intensity=Math.max(0,350-d*160);
  }else light.intensity=0;
  renderer.render(scene,camera);
  if(t>(nuke?5.5:5)){callbacks.done?.();return;}raf=requestAnimationFrame(frame);
 }
 return {stop,play(next,cb){stop();mode=next;callbacks=cb;blasted=false;started=performance.now();last=0;raf=requestAnimationFrame(frame);}};
}
