import * as THREE from 'three';
import { bodyLoft, mergeParts } from './model-craft.js';
import { finishAirframe } from './airframe-finish.js';

// 依公开外观特征原创搭建的游戏化曲面，不是厂商工程模型或精确复刻。
export const PROCEDURAL_AIRCRAFT = Object.freeze({
  bomber: '下一代飞翼轰炸机',
  ewPlane: '双座舰载电子战机',
  navalFighter_nato: '单发隐身舰载机',
  navalStrike_nato: '双发多用途舰载机',
  navalFighter_china: '双发隐身舰载机',
  navalStrike_china: '重型舰载多用途战机',
  ewPlane_china: '重型舰载电子战机',
});

function airframe(name, detail, parked = false) {
  const root=new THREE.Group();root.name=name;
  const flyingWing=name==='bomber', stealth=/navalFighter/.test(name), single=name==='navalFighter_nato';
  const heavy=name.endsWith('_china')&&!stealth, electronic=name.startsWith('ewPlane');
  const paint=new THREE.MeshStandardMaterial({name:'航空涂层',color:flyingWing?'#505d67':heavy?'#82979e':stealth?'#91a1ac':'#9baab1',roughness:.65,metalness:.32});
  const dark=new THREE.MeshStandardMaterial({name:'进气口与喷口',color:'#17252c',roughness:.7,metalness:.25});
  const glass=new THREE.MeshPhysicalMaterial({name:'座舱玻璃',color:'#284e60',roughness:.13,metalness:.48,clearcoat:1,clearcoatRoughness:.15});
  const accent=new THREE.MeshStandardMaterial({name:'阵营标识',color:'#59d7ec',emissive:'#59d7ec',emissiveIntensity:.1,roughness:.6});
  const add=(geometry,material,position=[0,0,0],rotation=[0,0,0])=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.rotation.set(...rotation);root.add(mesh);return mesh;
  };
  const wing=(points,height,thickness=.12,material=paint)=>{
    const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();
    const geometry=new THREE.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:detail,bevelSegments:1,steps:1,bevelSize:.035,bevelThickness:.025});
    geometry.rotateX(-Math.PI/2);geometry.translate(0,height,0);return add(geometry,material);
  };
  const tube=(radius,length,position,material=dark)=>add(new THREE.CylinderGeometry(radius,radius*.94,length,detail?18:10),material,position,[0,0,Math.PI/2]);
  const panel=(size,position,material=dark,rotation)=>add(new THREE.BoxGeometry(...size),material,position,rotation);
  const fin=(side,x=-3.5,height=1.8,offset=.68)=>{
    const shape=new THREE.Shape();shape.moveTo(x-.8,.6);shape.lineTo(x-.45,height);shape.lineTo(x+.35,height+.12);shape.lineTo(x+.8,.6);shape.closePath();
    add(new THREE.ExtrudeGeometry(shape,{depth:.07,bevelEnabled:false}),paint,[0,0,side*offset],[side*.28,0,0]);
  };
  if(flyingWing){
    wing([[4.7,0],[1.45,-3.2],[-2.25,-10],[-3.35,-10],[-2.35,-4.4],[-3.8,-3.2],[-3.15,-2.1],[-4.7,-1.1],[-4.7,1.1],[-3.15,2.1],[-3.8,3.2],[-2.35,4.4],[-3.35,10],[-2.25,10],[1.45,3.2]],.32,.15);
    const geometry=bodyLoft([[-4.6,.11,.8],[-2.6,.38,1.45],[.6,.63,1.32],[2.8,.3,.8],[4.65,.025,.04]],detail?24:12);
    geometry.rotateZ(-Math.PI/2);geometry.translate(0,.55,0);add(geometry,paint);
    for(const side of [-1,1]){
      wing([[1.3,side*1.12],[-.5,side*1.6],[-1.3,side*1.5],[.1,side*.92]],.86,.035,dark);
      panel([1.2,.04,.52],[-3.35,.62,side*.85]);
      panel([.6,.035,.18],[-1.1,.52,side*6.1],accent,[0,side*.3,0]);
    }
    const canopy=add(new THREE.SphereGeometry(.42,detail?20:10,detail?10:6),glass,[2.4,.93,0]);canopy.scale.set(1.6,.35,1.25);
    root.userData.jetExhausts=false;
  }else{
    const body=bodyLoft([[-4.65,.16,single?.28:.62],[-3.7,.34,single?.45:.78],[-1.9,.48,stealth?.7:.63],[.8,.44,.58],[2.7,.31,.37],[4.65,.025,.04]],detail?28:12);
    body.rotateZ(-Math.PI/2);body.translate(0,.58,0);add(body,paint);
    for(const side of [-1,1]){
      const outline=heavy?[[1.25,side*.45],[-.9,side*3.8],[-2.85,side*3.5],[-2.4,side*.5]]:stealth?[[1.1,side*.55],[-1.25,side*3.65],[-2.7,side*2.95],[-2.8,side*.48]]:[[.55,side*.5],[-1.35,side*3.25],[-2.5,side*3.2],[-1.75,side*.5]];
      wing(outline,.52,.12);
      // 翼根肩部和后机身曲面承接机翼，避免平板贴在圆柱上的玩具感。
      wing([[2.25,side*.35],[.35,side*1.12],[-3.45,side*.92],[-4.15,side*.36]],.48,.18);
      wing([[-2.7,side*.45],[-3.4,side*1.95],[-4.6,side*1.6],[-4.25,side*.38]],.57,.085);
      fin(side,heavy?-3.15:-3.55,stealth?1.7:1.9,heavy?.76:.65);
      panel([.7,.23,.22],[1.15,.42,side*.55]);
      wing([[1.48,side*.4],[.85,side*.76],[.18,side*.73],[.55,side*.4]],.39,.07,dark);
      if(heavy)wing([[2.2,side*.35],[1.5,side*1.55],[.85,side*1.33],[1.2,side*.35]],.62,.07);
      if(!single){tube(.235,.65,[-4.2,.5,side*.34],paint);tube(.19,.12,[-4.58,.5,side*.34]);}
      if(electronic){
        const pod=add(new THREE.CapsuleGeometry(.17,1.55,3,detail?12:6),paint,[-1.6,.53,side*(heavy?3.7:3.18)],[0,0,Math.PI/2]);pod.name='翼尖电子任务舱';
        if(detail)for(const z of [1.3,2.1]){
          add(new THREE.CapsuleGeometry(.16,1.3,3,8),dark,[-1.1,.18,side*z],[0,0,Math.PI/2]);
          panel([.5,.2,.09],[-1.1,.38,side*z],paint);
        }
      }
      panel([.65,.035,.18],[-1.3,.685,side*2.4],accent,[0,side*.35,0]);
      if(detail){
        for(let i=0;i<3;i++)panel([.33,.018,.025],[-.75-i*.57,.91-i*.055,side*.39]);
        panel([1.15,.022,.025],[-2.2,.73,side*1.4],dark,[0,side*-.55,0]);
        // 翼面舵缝与喷口加强环只在近景生成，远景保留清楚的机型轮廓。
        panel([.9,.018,.035],[-2.15,.66,side*2.25],dark,[0,side*-.25,0]);
        panel([.045,.018,.5],[-1.48,.66,side*2.6],dark);
        if(!single){
          const ring=add(new THREE.TorusGeometry(.215,.025,4,12),paint,[-4.48,.5,side*.34],[0,Math.PI/2,0]);
          ring.name='喷口加强环';
        }
      }
    }
    if(single){tube(.3,.72,[-4.2,.52,0],paint);tube(.25,.14,[-4.61,.52,0]);if(detail)add(new THREE.TorusGeometry(.28,.025,4,12),paint,[-4.49,.52,0],[0,Math.PI/2,0]);}
    const canopy=add(new THREE.SphereGeometry(.37,detail?24:12,detail?14:7),glass,[1.7,.93,0]);canopy.scale.set(electronic?2.3:1.7,.75,.82);
    if(electronic)panel([.07,.58,.05],[-1.5,1.1,0],paint,[0,0,-.18]);
    root.userData.jetExhausts=single?[[-4.69,.52,0,.28]]:[[-4.65,.5,-.34,.22],[-4.65,.5,.34,.22]];
  }
  if(parked){
    // 外翼折起，起落架保持接地；停机缩放只影响显示，不改变舰载机容量。
    root.traverse(mesh=>{
      if(!mesh.isMesh)return;if(mesh.material===glass)mesh.material=dark;const p=mesh.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const z=p.getZ(i),x=p.getX(i);
        if(Math.abs(z)>1.45&&x> -3.05){const d=Math.abs(z)-1.45;p.setZ(i,Math.sign(z)*(1.45+d*.15));p.setY(i,p.getY(i)+d*.99);}
      }
      mesh.geometry.computeVertexNormals();
    });
    for(const z of [-.45,.45]){panel([.08,.45,.08],[-1.55,.18,z],paint);tube(.13,.13,[-1.55,-.04,z]);}
    panel([.08,.45,.08],[2.4,.18,0],paint);tube(.1,.12,[2.4,-.04,0]);
  }
  mergeParts(root);
  root.userData.proceduralAircraft=true;root.userData.role=PROCEDURAL_AIRCRAFT[name];
  return root;
}

export function createProceduralAircraft(name) {
  if(!PROCEDURAL_AIRCRAFT[name])throw new Error(`未知程序飞机：${name}`);
  const root=new THREE.Group();root.name=name;root.userData.proceduralAircraft=true;root.userData.openAsset='procedural-aircraft';
  for(const [level,detail]of [['near',true],['far',false]]){
    const part=airframe(name,detail);part.name=`airframe_${level}`;part.userData.openAssetLOD=level;part.visible=detail;root.add(part);
    if(detail)root.userData.jetExhausts=part.userData.jetExhausts;
  }
  finishAirframe(root);return root;
}

export function createProceduralParkedAircraft(name) {
  const root=airframe(name,false,true);root.name=`parked_${name}`;
  const bounds=new THREE.Box3().setFromObject(root),size=bounds.getSize(new THREE.Vector3()),scale=1.85/size.x;
  const transform=new THREE.Matrix4().makeScale(scale,scale,scale).multiply(new THREE.Matrix4().makeTranslation(-(bounds.min.x+bounds.max.x)/2,-bounds.min.y,-(bounds.min.z+bounds.max.z)/2));
  root.traverse(m=>{if(m.isMesh){m.geometry.applyMatrix4(transform);m.castShadow=m.receiveShadow=true;}});
  return root;
}

export function installProceduralAircraft(models) {
  for(const name of Object.keys(PROCEDURAL_AIRCRAFT)){
    models.set(name,createProceduralAircraft(name));
    if(name.startsWith('naval'))models.set(`parked_${name}`,createProceduralParkedAircraft(name));
  }
}
