import * as THREE from 'three';
import { islandHeight } from './island-map.js';
import { surfaceMaps } from './model-craft.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function paintIslandTerrain(ctx, map, groundImage) {
  ctx.fillStyle='#273e47';ctx.fillRect(0,0,map.world.width,map.world.height);
  for(const island of map.islands){
    ctx.save();ctx.beginPath();island.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    ctx.fillStyle='#637458';ctx.fill();ctx.strokeStyle='#968c61';ctx.lineWidth=32;ctx.stroke();ctx.clip();
    if(groundImage){ctx.filter='saturate(1.1) brightness(.72)';for(let y=0;y<map.world.height;y+=420)for(let x=0;x<map.world.width;x+=420)ctx.drawImage(groundImage,x,y,420,420);ctx.filter='none';}
    for(let i=0;i<120;i++){
      const x=(i*197.17)%map.world.width,y=(i*353.73)%map.world.height,r=40+i%60,g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,i%2?'#25483c55':'#a89d7233');g.addColorStop(1,'#314a3600');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    ctx.restore();
  }
  ctx.lineCap='round';ctx.lineJoin='round';
  for(const points of [[[2190,1620],[2320,1470],[2600,1560],[2440,1750],[2260,1790]],[[520,2540],[680,2630],[950,2550],[1180,2520]]]){
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));
    ctx.strokeStyle='#b0a480';ctx.lineWidth=34;ctx.stroke();ctx.strokeStyle='#626b65';ctx.lineWidth=24;ctx.stroke();
    ctx.setLineDash([8,18]);ctx.strokeStyle='#c8c4a4';ctx.lineWidth=1.5;ctx.stroke();ctx.setLineDash([]);
  }
}

export function createIslandShore(map) {
  const root=new THREE.Group();root.name='群岛海岸';
  const positions=[],colors=[],indices=[];
  for(const island of map.islands){
    const center=island.points.reduce((p,[x,y])=>({x:p.x+x/island.points.length,y:p.y+y/island.points.length}),{x:0,y:0});
    const count=island.points.length;
    for(let i=0;i<count;i++){
      const a=island.points[i],b=island.points[(i+1)%count],steps=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/18);
      for(let n=0;n<steps;n++){
        const points=[n/steps,(n+1)/steps].map(t=>({x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t})),start=positions.length/3;
        for(const p of points){
          const len=Math.hypot(p.x-center.x,p.y-center.y),dx=(p.x-center.x)/len,dy=(p.y-center.y)/len;
          for(const width of [-34,22]){const x=p.x+dx*width,y=p.y+dy*width;positions.push(x,width>0?1.05:islandHeight(map,x,y)+.25,y);colors.push(...(width>0?[.09,.22,.22]:[.32,.28,.16]));}
        }
        indices.push(start,start+2,start+1,start+1,start+2,start+3);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide});
  const coast=new THREE.Mesh(geometry,material);coast.receiveShadow=true;root.add(coast);
  const foamMaterial=new THREE.LineBasicMaterial({color:'#c0d8cb',transparent:true,opacity:.55});
  for(const island of map.islands){const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(island.points.map(([x,y])=>new THREE.Vector3(x,1.4,y))),foamMaterial);root.add(line);}
  return root;
}

export function createIslandInfrastructure(map) {
  const root=new THREE.Group();root.name='岛屿能源与登陆设施';
  const parts={metal:[],panel:[],mark:[]};
  const box=(size,position,kind,tilt=0)=>{const g=new THREE.BoxGeometry(...size);g.rotateZ(tilt);g.translate(...position);parts[kind].push(g);};
  for(const x of [2670,2720,2770])for(const y of [1540,1600]){
    box([38,3,42],[x,24,y],'panel',.15);box([4,18,4],[x,15,y],'metal');
    for(let row=-1;row<=1;row++)box([.8,.5,40],[x+row*11,27,y],'metal');
  }
  for(const y of [1440,1530,1620,1710]){
    box([7,15,7],[2094,8,y],'mark');box([3,3,3],[2094,18,y],'metal');
  }
  const materials={metal:new THREE.MeshStandardMaterial({color:'#869695',metalness:.72,roughness:.5,...surfaceMaps('armor')}),panel:new THREE.MeshStandardMaterial({color:'#244450',metalness:.4,roughness:.24,...surfaceMaps('coating')}),mark:new THREE.MeshStandardMaterial({color:'#d2b75c',metalness:.15,roughness:.7})};
  for(const [kind,list] of Object.entries(parts)){const geometry=mergeGeometries(list);list.forEach(g=>g.dispose());const mesh=new THREE.Mesh(geometry,materials[kind]);mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
  return root;
}
