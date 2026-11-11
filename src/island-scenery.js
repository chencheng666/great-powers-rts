import * as THREE from 'three';
import { islandHeight } from './island-map.js';
import { surfaceMaps } from './model-craft.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function paintIslandTerrain(ctx, map, groundImage) {
  ctx.fillStyle='#273e47';ctx.fillRect(0,0,map.world.width,map.world.height);
  let tile;
  if (groundImage) {
    tile = document.createElement('canvas');
    tile.width = tile.height = 420;
    const paint = tile.getContext('2d');
    paint.filter = 'saturate(1.1) brightness(.72)';
    paint.drawImage(groundImage, 0, 0, 420, 420);
  }
  for(const island of map.islands){
    ctx.save();ctx.beginPath();island.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();
    ctx.fillStyle='#637458';ctx.fill();ctx.strokeStyle='#968c61';ctx.lineWidth=32;ctx.stroke();ctx.clip();
    const xs = island.points.map(p => p[0]), ys = island.points.map(p => p[1]);
    const left = Math.min(...xs), top = Math.min(...ys), right = Math.max(...xs), bottom = Math.max(...ys);
    if (tile) {
      for (let y = Math.floor(top / 420) * 420; y < bottom; y += 420) {
        for (let x = Math.floor(left / 420) * 420; x < right; x += 420) ctx.drawImage(tile, x, y);
      }
    }
    const patches = Math.min(120, Math.ceil((right-left)*(bottom-top)/48000));
    for(let i=0;i<patches;i++){
      const x=left+(i*197.17)%(right-left),y=top+(i*353.73)%(bottom-top),r=40+i%60,g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,i%2?'#25483c55':'#a89d7233');g.addColorStop(1,'#314a3600');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    ctx.restore();
  }
}

export function createIslandShore(map) {
  const root=new THREE.Group();root.name='群岛海岸';
  const positions=[],colors=[],indices=[],foam=[];
  for(const island of map.islands){
    const count=island.points.length;
    const orientation = Math.sign(island.points.reduce((sum, [x,y], i) => {
      const [nextX,nextY] = island.points[(i + 1) % count];
      return sum + x * nextY - y * nextX;
    }, 0));
    const coastNormal = index => {
      const before = island.points[(index + count - 1) % count], here = island.points[index], after = island.points[(index + 1) % count];
      const a = new THREE.Vector2(here[1] - before[1], before[0] - here[0]).normalize();
      const b = new THREE.Vector2(after[1] - here[1], here[0] - after[0]).normalize();
      const direction = a.clone().add(b).normalize();
      return direction.multiplyScalar(orientation / Math.max(.5, direction.dot(b)));
    };
    for(let i=0;i<count;i++){
      const a=island.points[i], b=island.points[(i+1)%count];
      const length = Math.hypot(a[0]-b[0], a[1]-b[1]);
      if (!length || a[0] === b[0] && (a[0] === 0 || a[0] === map.world.width) ||
          a[1] === b[1] && (a[1] === 0 || a[1] === map.world.height)) continue;
      const startNormal = coastNormal(i), endNormal = coastNormal((i + 1) % count);
      foam.push(new THREE.Vector3(a[0],1.4,a[1]), new THREE.Vector3(b[0],1.4,b[1]));
      const steps = Math.ceil(length / 18);
      for(let n=0;n<steps;n++){
        const points=[n/steps,(n+1)/steps].map(t=>({
          x:a[0]+(b[0]-a[0])*t,y:a[1]+(b[1]-a[1])*t,
          dx:startNormal.x+(endNormal.x-startNormal.x)*t,
          dy:startNormal.y+(endNormal.y-startNormal.y)*t
        })),start=positions.length/3;
        for(const p of points){
          for(const width of [-34,22]){const x=p.x+p.dx*width,y=p.y+p.dy*width;positions.push(x,width>0?1.05:islandHeight(map,x,y)+.25,y);colors.push(...(width>0?[.09,.22,.22]:[.32,.28,.16]));}
        }
        indices.push(start,start+2,start+1,start+1,start+2,start+3);
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.88,side:THREE.DoubleSide});
  const coast=new THREE.Mesh(geometry,material);coast.receiveShadow=true;root.add(coast);
  const foamMaterial=new THREE.LineBasicMaterial({color:'#c0d8cb',transparent:true,opacity:.55});
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(foam), foamMaterial));
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
