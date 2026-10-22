import * as THREE from 'three';
import { mergeParts, craftedMaterial } from './model-craft.js';

const noise=(x,y=1)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};

export function ridgeHeight(map,x,y) {
  for(const r of map.ridges||[])if(x>=r.x1&&x<=r.x2&&y>=r.y1&&y<=r.y2){
    const a=Math.sin((x-r.x1)/(r.x2-r.x1)*Math.PI),b=Math.sin((y-r.y1)/(r.y2-r.y1)*Math.PI);
    return 8+165*a*b*(.86+.14*Math.cos(y*.025));
  }
  return null;
}

export function ridgeGLSL(map) {
  const f=v=>Number(v).toFixed(5);
  return (map.ridges||[]).map(r=>`if(p.x>=${f(r.x1)}&&p.x<=${f(r.x2)}&&p.y>=${f(r.y1)}&&p.y<=${f(r.y2)})return 9.2+165.0*sin((p.x-${f(r.x1)})/${f(r.x2-r.x1)}*3.14159265359)*sin((p.y-${f(r.y1)})/${f(r.y2-r.y1)}*3.14159265359)*(.86+.14*cos(p.y*.025));`).join('\n');
}

export function paintTheaterGround(ctx,map,road,image) {
  if(map.climate==='cold'){
    ctx.save();ctx.beginPath();for(const island of map.islands){island.points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.closePath();}ctx.clip();
    ctx.fillStyle='rgba(192,208,215,.48)';ctx.fillRect(0,0,map.world.width,map.world.height);
    for(let i=0;i<450;i++){
      const x=noise(i,7)*map.world.width,y=noise(i,8)*map.world.height,r=35+noise(i,9)*100;
      const fill=ctx.createRadialGradient(x,y,0,x,y,r);fill.addColorStop(0,'rgba(216,226,229,.55)');fill.addColorStop(1,'rgba(216,226,229,0)');ctx.fillStyle=fill;ctx.fillRect(x-r,y-r,r*2,r*2);
    }ctx.restore();
  }
  if(map.industrial){ctx.fillStyle='rgba(85,90,91,.3)';ctx.fillRect(850,300,3200,2300);}
  for(const r of map.ridges||[]){
    const w=r.x2-r.x1,h=r.y2-r.y1,layer=document.createElement('canvas');layer.width=Math.ceil(w);layer.height=Math.ceil(h);
    const paint=layer.getContext('2d');paint.filter='grayscale(.8) contrast(1.35) brightness(.75)';
    for(let y=0;y<h;y+=230)for(let x=0;x<w;x+=230)paint.drawImage(image,x,y,230,230);
    paint.filter='none';
    const mask=document.createElement('canvas');mask.width=128;mask.height=256;
    const m=mask.getContext('2d'),pixels=m.createImageData(mask.width,mask.height);
    for(let y=0;y<mask.height;y++)for(let x=0;x<mask.width;x++){
      const nx=x/(mask.width-1),ny=y/(mask.height-1),height=Math.sin(nx*Math.PI)*Math.sin(ny*Math.PI);
      const edge=Math.max(0,Math.min(1,(height-.08-.07*Math.sin(y*.11+x*.2))*2.8));
      pixels.data[(y*mask.width+x)*4+3]=Math.round(edge*225);
    }
    m.putImageData(pixels,0,0);paint.globalCompositeOperation='destination-in';paint.drawImage(mask,0,0,w,h);
    ctx.drawImage(layer,r.x1,r.y1);
  }
  for(const points of map.roads||[])road(points,map.climate==='cold'?42:38);
  if(map.railway){
    const [a,b]=map.railway;ctx.strokeStyle='#66665f';ctx.lineWidth=36;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();
    for(let x=a[0];x<b[0];x+=19){ctx.fillStyle='#383d3a';ctx.fillRect(x,a[1]-13,7,26);}
    for(const dy of [-9,9]){ctx.strokeStyle='#a2a9a5';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(a[0],a[1]+dy);ctx.lineTo(b[0],b[1]+dy);ctx.stroke();}
  }
}

export function createTheaterScenery(game,track,elevation) {
  const entries=[];
  const materials={wall:track(craftedMaterial('墙体混凝土','#89938e','coating',.92,.05)),roof:track(craftedMaterial('屋面金属','#566969','coating',.65,.4)),glass:track(new THREE.MeshStandardMaterial({color:'#314c54',roughness:.25,metalness:.5})),rubble:track(craftedMaterial('遗址碎石','#646765','coating',1,0)),warning:track(new THREE.MeshStandardMaterial({color:'#d9bf76',roughness:.8}))};
  const group=(x,y,entityId)=>{const g=new THREE.Group();g.position.set(x,elevation(x,y),y);entries.push({group:g,x,y,entityId});return g;};
  const part=(g,size,pos,kind='wall',angle=0)=>{const geometry=new THREE.BoxGeometry(...size);const m=new THREE.Mesh(geometry,materials[kind]);m.position.set(...pos);m.rotation.y=angle;m.castShadow=m.receiveShadow=true;g.add(m);};
  for(const center of game.map.settlements||[])for(let i=0;i<6;i++){
    const x=center.x+(i%3)*135-150,y=center.y+Math.floor(i/3)*160-100,g=group(x,y),h=22+(i%3)*9;
    part(g,[65,h,45],[0,h/2,0]);part(g,[73,4,52],[0,h+2,0],'roof');part(g,[17,5,12],[-14,h+6,5],'roof');
    for(const z of [-23,23])for(const wx of [-21,0,21])for(let level=10;level<h;level+=11)part(g,[10,6,1],[wx,level,z],'glass');
    part(g,[10,14,1],[0,7,23],'glass');
  }
  if(game.map.industrial)for(const r of game.map.barriers){
    const g=group((r.x1+r.x2)/2,(r.y1+r.y2)/2),w=r.x2-r.x1,h=r.y2-r.y1;
    part(g,[w,45,h],[0,22.5,0]);part(g,[w+6,5,h+6],[0,47,0],'roof');
    for(let z=-h/2+20;z<h/2;z+=28)part(g,[w,2,3],[0,51,z],'glass');
    for(let x=-w/2+30;x<w/2;x+=80){part(g,[42,8,28],[x,55,-h*.25],'roof');part(g,[50,24,2],[x,14,h/2+1],'glass');}
  }
  for(const id of game.challenge?.operation?.facilities||[]){const e=game.getEntity(id),g=group(e.x,e.y,id);
    for(let i=0;i<16;i++){const w=8+noise(i,id)*15;part(g,[w,4+noise(i,3)*12,w*.65],[(noise(i,4)-.5)*e.size,4,(noise(i,5)-.5)*e.size],'rubble',noise(i,6)*Math.PI);}
    for(const x of [-1,1])part(g,[7,2,18],[x*e.size*.42,2,e.size*.4],'warning');
    g.visible=false;
  }
  for(const entry of entries){mergeParts(entry.group);entry.group.traverse(m=>{if(m.isMesh)track(m.geometry);});}
  return entries;
}
