import * as THREE from 'three';
import { NATURE_MESH_DATA } from './nature-kit-mesh-data.js';

export const NATURE_LOGS=Object.freeze(['log_pineA','log_pineB']);
export const NATURE_ROCKS=Object.freeze(['rock_largeB','rock_largeD']);

export function natureGeometry(name) {
  const data=NATURE_MESH_DATA[name];
  if(!data)throw new Error(`缺少自然场景模型：${name}`);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));
  // 岩体与倒木统一为低饱和顶点色，不携带色板贴图或多份材质。
  const color=new THREE.Color(name.startsWith('log_')?'#69523d':name==='rock_largeB'?'#77796d':'#696d65');
  const colors=[];for(let i=0;i<data.positions.length/3;i++)colors.push(color.r,color.g,color.b);
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData={source:'Kenney Nature Kit 2.1',model:data.sourceModel,license:'CC0-1.0'};return geometry;
}
