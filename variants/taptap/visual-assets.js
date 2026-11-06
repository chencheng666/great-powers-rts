import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadAsset } from '../../src/asset-loading.js';
import { createSpaceAircraft } from '../../src/feedback-models.js';
import { UNITS } from '../../src/data.js';
const modelURL = new URL('./assets/starport-library.glb', import.meta.url).href;
const surfaceURL = new URL('../../assets/meridian-regolith-v2.webp', import.meta.url).href;
let pending, library, portrait;
const previews = new Map();
const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .45, ...extra });
const mesh = (geometry, mat, x, y, z) => { const m = new THREE.Mesh(geometry, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; };

// 悬浮底盘、发光核心与模组节点组成原创无人机体，不映射现实装备外形。
function createMech(type) {
  const root = new THREE.Group(), armor = material('#c0ccd8'), dark = material('#29394c');
  const band = material('#59d7ec', { emissive: '#59d7ec', emissiveIntensity: .5 }); band.name = '阵营标识';
  const small = ['drone', 'loiterer', 'ghost'].includes(type), size = small ? .75 : 1;
  root.add(mesh(new THREE.BoxGeometry(3 * size, .55, 1.9 * size), armor, 0, .85, 0));
  for (const z of [-1, 1]) {
    root.add(mesh(new THREE.BoxGeometry(2.7 * size, .5, .36), dark, 0, .35, z * size));
    root.add(mesh(new THREE.BoxGeometry(2.1 * size, .10, .39), band, 0, .2, z * size));
  }
  root.add(mesh(new THREE.OctahedronGeometry(.42, 0), band, -.65 * size, 1.35, 0));
  const weapon = new THREE.Group(); weapon.name = 'weapon'; weapon.position.y = 1.2;
  if (type === 'harvester') {
    weapon.add(mesh(new THREE.CylinderGeometry(.5, .7, .7, 6), armor, .6, .15, 0));
    weapon.add(mesh(new THREE.OctahedronGeometry(.3), band, .6, .75, 0));
  } else if (['supply', 'apc', 'relay', 'jammer'].includes(type)) {
    weapon.add(mesh(new THREE.BoxGeometry(1.2, .8, 1.3), dark, .3, .3, 0));
    weapon.add(mesh(new THREE.TorusGeometry(.5, .07, 6, 14), band, .3, .9, 0));
  } else {
    weapon.add(mesh(new THREE.BoxGeometry(1, .55, 1.1), dark, .2, .1, 0));
    weapon.add(mesh(new THREE.BoxGeometry(1.2, .15, .2), band, 1, .18, 0));
  }
  root.add(weapon); return root;
}

export function prepareVisualAssets() {
  return pending ||= Promise.all([
    loadAsset(modelURL, () => new GLTFLoader().loadAsync(modelURL)),
    loadAsset(surfaceURL, () => new THREE.TextureLoader().loadAsync(surfaceURL))
  ]).then(([gltf, surface]) => {
    const models = new Map();
    for (const child of gltf.scene.children) { child.traverse(m => { if (m.isMesh) m.castShadow = m.receiveShadow = true; }); models.set(child.name, child); }
    for (const type of ['cache', 'salvage', 'depot']) {
      const model = new THREE.Group(), band = material('#72dfe6', { emissive: '#72dfe6', emissiveIntensity: .3 }); band.name = '阵营标识';
      model.add(mesh(new THREE.BoxGeometry(2.5, 1.4, 1.8), material('#7c8d9c'), 0, .7, 0));
      model.add(mesh(new THREE.BoxGeometry(2.55, .2, 1.85), band, 0, 1.25, 0));
      model.add(mesh(new THREE.OctahedronGeometry(.45), band, 0, 1.9, 0)); models.set(`resource_${type}`, model);
    }
    for (const type of Object.keys(UNITS)) {
      const air = ['fighter', 'strike', 'bomber', 'airlift', 'freightPlane', 'aegis', 'ewPlane'].includes(type);
      const model = air ? createSpaceAircraft(type) : createMech(type);
      if (!model.getObjectByName('weapon')) { const weapon = new THREE.Group(); weapon.name = 'weapon'; model.add(weapon); }
      model.name = `scifi_${type}`; models.set(model.name, model); models.set(type, model);
    }
    surface.colorSpace = THREE.SRGBColorSpace; surface.wrapS = surface.wrapT = THREE.RepeatWrapping;
    library = { models, ground: surface, meridian: surface, groundSurface: null, buildings: surface, foliage: surface, armory: surface };
    return library;
  });
}
export function visualLibrary() { if (!library) throw new Error('星港模型尚未就绪'); return library; }
export function weatherMaterial(value) { return value; }
export function createModel(name, color = '#59d7ec') {
  const source = visualLibrary().models.get(name); if (!source) throw new Error(`星港模型缺失：${name}`);
  const result = source.clone(true);
  result.traverse(m => { if (m.isMesh && m.material.name === '阵营标识') { m.material = m.material.clone(); m.material.color.set(color); m.material.emissive.set(color); } });
  return result;
}
export function spriteTexture(name, color = '#59d7ec') {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(32, 32, 64, 64); return new THREE.CanvasTexture(canvas);
}
export function modelThumbnail(name, color = '#59d7ec') {
  const key = `${name}:${color}`; if (previews.has(key)) return previews.get(key);
  portrait ||= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); portrait.setSize(120, 100);
  const scene = new THREE.Scene(), model = createModel(name, color); scene.add(model, new THREE.HemisphereLight('#c9e9ff', '#152838', 2));
  const light = new THREE.DirectionalLight('#fff5df', 3); light.position.set(4, 8, 6); scene.add(light);
  const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()), span = Math.max(size.x, size.y, size.z) * .8;
  const camera = new THREE.OrthographicCamera(-span * 1.2, span * 1.2, span, -span, .1, 1000);
  camera.position.copy(center).add(new THREE.Vector3(10, 14, 16)); camera.lookAt(center); portrait.render(scene, camera);
  const url = portrait.domElement.toDataURL(); previews.set(key, url); return url;
}
