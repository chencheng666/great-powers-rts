import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { surfaceMaps } from './model-craft.js';
import { createMovingTracks } from './track-motion.js';

const urls = {
  tank: new URL('../assets/third-party/abrams.glb', import.meta.url).href,
  aircraft: new URL('../assets/third-party/f22.glb', import.meta.url).href,
  crane: new URL('../assets/third-party/harbor-crane.glb', import.meta.url).href,
  ground: [new URL('../assets/third-party/ground-diff.jpg', import.meta.url).href, new URL('../assets/third-party/ground-nor_gl.jpg', import.meta.url).href, new URL('../assets/third-party/ground-rough.jpg', import.meta.url).href],
  concrete: [new URL('../assets/third-party/concrete-diff.jpg', import.meta.url).href, new URL('../assets/third-party/concrete-nor_gl.jpg', import.meta.url).href, new URL('../assets/third-party/concrete-rough.jpg', import.meta.url).href]
};

async function loadSurface(paths) {
  const [map, normalMap, roughnessMap] = await Promise.all(paths.map(url => new THREE.TextureLoader().loadAsync(url)));
  map.colorSpace = THREE.SRGBColorSpace;
  for (const texture of [map, normalMap, roughnessMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 4;
  }
  return { map, normalMap, roughnessMap };
}

export async function loadOpenAssets() {
  // 第三方资源随本地包分发，单项损坏时保留对应的原模型，不影响开始游戏。
  const keys = ['tank', 'aircraft', 'crane', 'ground', 'concrete'];
  const results = await Promise.allSettled([
    ...keys.slice(0, 3).map(key => new GLTFLoader().loadAsync(urls[key]).then(gltf => validateOpenModel(key, gltf.scene))),
    loadSurface(urls.ground), loadSurface(urls.concrete)
  ]);
  return Object.fromEntries(results.map((result, index) => {
    if (result.status === 'rejected') console.warn(`开放资产载入失败，使用原资源：${keys[index]}`, result.reason);
    return [keys[index], result.status === 'fulfilled' ? result.value : null];
  }));
}

export function validateOpenModel(key, scene) {
  const names = key === 'tank' ? ['body_near','body_far','weapon_near','weapon_far','barrel_near','barrel_far'] : key === 'aircraft' ? ['airframe_near','airframe_far'] : ['harbor_crane'];
  for (const name of names) if (!scene.getObjectByName(name)) throw new Error(`开放模型缺少部件：${name}`);
  return scene;
}

function attachLevel(root, source, name, parent = root) {
  const part = source.getObjectByName(name);
  if (!part) throw new Error(`开放模型缺少部件：${name}`);
  part.userData.openAssetLOD = name.endsWith('_far') ? 'far' : 'near';
  part.visible = part.userData.openAssetLOD === 'near';
  parent.add(part);
}

function teamMark(root, size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({ name: '阵营标识', color: '#59d7ec', roughness: .55 }));
  mesh.position.set(...position); root.add(mesh);
}

export function installOpenModels(models, assets, weather = material => material) {
  if (assets.tank) {
    const root = new THREE.Group(); root.name = 'tank_nato'; root.userData.openAsset = 'abrams';
    const weapon = new THREE.Group(); weapon.name = 'weapon'; root.add(weapon);
    const barrel = new THREE.Group(); barrel.name = 'barrel'; weapon.add(barrel);
    for (const level of ['near', 'far']) {
      attachLevel(root, assets.tank, `body_${level}`);
      attachLevel(root, assets.tank, `weapon_${level}`, weapon);
      attachLevel(root, assets.tank, `barrel_${level}`, barrel);
    }
    const barrelShape = barrel.getObjectByName('barrel_near'), points = [];
    root.updateMatrixWorld(true);
    barrelShape.traverse(mesh => {
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) points.push(new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld));
    });
    const front = Math.max(...points.map(p => p.x)), rim = points.filter(p => p.x >= front - .025);
    const muzzle = new THREE.Object3D(); muzzle.name = 'open_asset_muzzle';
    for (const point of rim) muzzle.position.add(point);
    muzzle.position.divideScalar(rim.length); barrel.add(muzzle);
    const materials = new Map();
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      const original = mesh.material;
      if (!materials.has(original)) {
        const material = original.clone();
        const rubber = material.name.includes('橡胶');
        if (material.name.includes('装甲')) material.name = '装甲钢';
        Object.assign(material, surfaceMaps(rubber ? 'rubber' : 'armor'));
        material.normalScale.setScalar(.22);
        materials.set(original, weather(material));
      }
      mesh.material = materials.get(original);
    });
    // 循环履带共用现有实例化动画，源模型负重轮和裙板仍保留。
    const tracks = createMovingTracks(2.5, new THREE.MeshStandardMaterial({ color: '#66706b', roughness: .65, metalness: .6 }), new THREE.MeshStandardMaterial({ color: '#242927', roughness: .94 }));
    tracks.scale.set(.93, .92, 1.07); root.add(tracks);
    for (const side of [-1, 1]) teamMark(weapon, [1.15, .16, .025], [-.65, 1.22, side * 1.26]);
    root.traverse(mesh => { if (mesh.isMesh) mesh.castShadow = mesh.receiveShadow = true; });
    models.set(root.name, root);
  }
  if (assets.aircraft) {
    const previous = models.get('fighter_nato');
    const root = new THREE.Group(); root.name = 'fighter_nato'; root.userData.openAsset = 'f22'; root.userData.groundClearance = 1.07;
    attachLevel(root, assets.aircraft, 'airframe_near'); attachLevel(root, assets.aircraft, 'airframe_far');
    root.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      if (mesh.material.name.startsWith('f22_')) mesh.material.color.set('#9ba6ab');
      if (mesh.material.name === 'glass') {
        mesh.material = new THREE.MeshPhysicalMaterial({ name: '座舱玻璃', color: '#8a8064', transparent: true, opacity: .68, depthWrite: false, roughness: .13, metalness: .15, clearcoat: 1 });
      }
    });
    for (const name of ['fighter_gear_left', 'fighter_gear_right', 'fighter_gear_nose', 'fighter_bay_left', 'fighter_bay_right']) {
      const part = previous?.getObjectByName(name); if (part) root.add(part.clone());
    }
    root.updateMatrixWorld(true);
    const wingMeshes = [];
    root.traverse(mesh => { if (mesh.isMesh && mesh.material.name.startsWith('f22_top')) wingMeshes.push(mesh); });
    for (const side of [-1, 1]) {
      const x = -.8, z = side * 2.2;
      const hit = new THREE.Raycaster(new THREE.Vector3(x, 10, z), new THREE.Vector3(0, -1, 0)).intersectObjects(wingMeshes, false)[0];
      if (hit) teamMark(root, [.7, .012, .12], [x, hit.point.y + .018, z]);
    }
    models.set(root.name, root);
  }
}

export function openAssetDetail(zoom, quality, count, selected, previous) {
  if (selected) return 'near';
  const threshold = (quality === 'high' ? 1.7 : 2.1) + (previous === 'near' ? -.12 : .12);
  return zoom >= threshold && count <= (previous === 'near' ? 112 : 96) ? 'near' : 'far';
}

export function syncOpenAssetLOD(entry, level) {
  if (!entry.model.userData.openAsset || entry.openAssetLevel === level) return;
  entry.openAssetParts ||= [];
  if (!entry.openAssetParts.length) entry.model.traverse(part => { if (part.userData.openAssetLOD) entry.openAssetParts.push(part); });
  for (const part of entry.openAssetParts) part.visible = part.userData.openAssetLOD === level;
  entry.openAssetLevel = level;
}

export function modelShotOrigin(effect, entry) {
  const muzzle = entry?.model.getObjectByName('open_asset_muzzle');
  if (!muzzle) return null;
  const position = muzzle.getWorldPosition(new THREE.Vector3());
  // 仅修正渲染起点，不修改战斗效果、伤害事件或网络快照。
  return { x: position.x, y: position.z, sourceHeight: position.y, muzzleDistance: 0 };
}
