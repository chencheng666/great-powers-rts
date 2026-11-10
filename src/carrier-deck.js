import * as THREE from 'three';
import { craftedMaterial, mergeParts } from './model-craft.js';

// 游戏化平直甲板：船首沿 +X，舰岛在 +Z 侧；总长保持原有 24 局部单位。
export const CARRIER_DECK_OUTLINE = Object.freeze([
  [-11.6,-2.1],[-10.7,-2.9],[-4.5,-3.45],[2.8,-3.95],[4.5,-3.1],
  [5.0,-2.4],[10.5,-2.15],[12.4,-1.8],[12.4,1.75],[10.8,2.1],
  [6.2,2.1],[5.6,2.95],[3.2,2.95],[2.6,2.45],[1.7,2.8],
  [-2.5,2.8],[-3.1,2.95],[-6.9,2.95],[-7.5,2.55],[-10.8,2.55],[-11.6,1.8],
].map(point=>Object.freeze(point)));
export const CARRIER_PARKING = Object.freeze([[-8.3,1.05],[-4.8,1.05],[4.8,1.05]].map(p=>Object.freeze(p)));
export function onCarrierDeck(x,z) {
  let inside=false;
  for(let i=0,j=CARRIER_DECK_OUTLINE.length-1;i<CARRIER_DECK_OUTLINE.length;j=i++){
    const [ax,az]=CARRIER_DECK_OUTLINE[i],[bx,bz]=CARRIER_DECK_OUTLINE[j];
    if((az>z)!==(bz>z)&&x<(bx-ax)*(z-az)/(bz-az)+ax)inside=!inside;
  }
  return inside;
}
export function carrierDeckPose(index, taxi) {
  const [x,z]=CARRIER_PARKING[index%CARRIER_PARKING.length];
  const progress=taxi?.phase==='out'?taxi.progress:taxi?.phase==='in'?1-taxi.progress:0;
  const t=Math.max(0,Math.min(1,progress));
  // 先离开停车位，再沿舰岛内侧通道向前，保留原起飞队列终点。
  if(t<.35)return{x,z:z+(-.1-z)*t/.35,yaw:0};
  if(t<.9)return{x:x+(4-x)*(t-.35)/.55,z:-.1,yaw:0};
  return{x:4,z:t===1?0:-.1+(t-.9),yaw:0};
}

export function createCarrierDeck() {
  const group=new THREE.Group();group.name='carrier_flight_deck';
  const deck=craftedMaterial('航母防滑飞行甲板','#45515a','deck',.94,.08);
  const edge=new THREE.MeshStandardMaterial({name:'航母甲板侧壁',color:'#7b8990',roughness:.8,metalness:.25});
  const white=new THREE.MeshBasicMaterial({name:'航母跑道标线',color:'#dddcd1'});
  const amber=new THREE.MeshBasicMaterial({name:'航母引导标线',color:'#d9b35a'});
  const dark=new THREE.MeshStandardMaterial({name:'航母弹射滑轨',color:'#1b282f',roughness:.65,metalness:.45});
  const shape=new THREE.Shape();CARRIER_DECK_OUTLINE.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:.24,bevelEnabled:false,steps:1});geometry.rotateX(-Math.PI/2);geometry.translate(0,1.06,0);
  const surface=new THREE.Mesh(geometry,deck);surface.castShadow=surface.receiveShadow=true;group.add(surface);
  const box=(size,pos,material)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material);m.position.set(...pos);group.add(m);return m;};
  const line=(a,b,width,material,height=1.32)=>{const dx=b[0]-a[0],dz=b[1]-a[1];const m=box([Math.hypot(dx,dz),.014,width],[(a[0]+b[0])/2,height,(a[1]+b[1])/2],material);m.rotation.y=-Math.atan2(dz,dx);};
  // 沿真实轮廓描边，斜角外伸与舰艏收窄在俯视和100%镜头下都可辨认。
  for(let i=0;i<CARRIER_DECK_OUTLINE.length;i++)line(CARRIER_DECK_OUTLINE[i],CARRIER_DECK_OUTLINE[(i+1)%CARRIER_DECK_OUTLINE.length],.045,white);
  const aft=[-10.6,-1.45],fore=[3.7,-2.45],length=Math.hypot(fore[0]-aft[0],fore[1]-aft[1]);
  const nx=-(fore[1]-aft[1])/length,nz=(fore[0]-aft[0])/length;
  for(const sign of [-1,1])line([aft[0]+nx*.82*sign,aft[1]+nz*.82*sign],[fore[0]+nx*.82*sign,fore[1]+nz*.82*sign],.065,white);
  for(let i=0;i<22;i++){const t=i/22,u=Math.min(1,t+.018);line([aft[0]+(fore[0]-aft[0])*t,aft[1]+(fore[1]-aft[1])*t],[aft[0]+(fore[0]-aft[0])*u,aft[1]+(fore[1]-aft[1])*u],.055,amber);}
  for(const x of [-8.5,-7.7,-6.9,-6.1]){const z=-1.45+(x+10.6)/14.3*-1;line([x-.04,z-.72],[x+.04,z+.72],.025,dark,1.337);}
  for(const z of [-.6,-1.65]){line([2.2,z],[11.7,z],.055,dark);line([2.2,z+.18],[11.4,z+.18],.025,white);for(let x=2.4;x<11.5;x+=.7)line([x,z-.15],[x+.32,z-.15],.028,amber);}
  for(const[x,z]of CARRIER_PARKING){line([x-1,z],[x+1,z],.035,amber);line([x+.3,z-.52],[x+.3,z+.52],.035,amber);}
  for(const x of [-5,4.4]){box([2.2,.035,.55],[x,1.318,2.55],edge);for(const z of [2.3,2.8])line([x-1.05,z],[x+1.05,z],.035,amber,1.345);}
  group.userData.deckOutlineVersion=1;return mergeParts(group);
}
