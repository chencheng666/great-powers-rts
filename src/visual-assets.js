import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createSpaceAircraft } from './feedback-models.js';
import { createPersonnel,createResourceModel } from './personnel-models.js';
import { createHarbor, refineFacility, COMMUNITY_3D_BUILDINGS } from './community-visuals.js';
import { surfaceMaps } from './model-craft.js';
import { refineEquipment, hasRefinedTracks } from './equipment-finishing.js';
import { refineAirfieldRunway, refineAircraftCanopy } from './airfield-presentation.js';
import { replacedNavalPart, refineNavalHull, refineTransportBody } from './naval-presentation.js';
import { refinePowerFans } from './facility-motion.js';

const modelURL = new URL('../assets/models/military-library.glb', import.meta.url).href;
const modernURL = new URL('../assets/models/modern-library.glb', import.meta.url).href;
const droneURL = new URL('../assets/models/drone-library.glb', import.meta.url).href;
const equipmentURL = new URL('../assets/models/equipment-library.glb', import.meta.url).href;
const logisticsURL = new URL('../assets/models/logistics-library.glb', import.meta.url).href;
const convoyURL = new URL('../assets/models/convoy-library.glb', import.meta.url).href;
const robotURL = new URL('../assets/models/robot-library.glb', import.meta.url).href;
const realismURL = new URL('../assets/models/realism-library.glb', import.meta.url).href;
const meridianURL = new URL('../assets/meridian-regolith-v2.png', import.meta.url).href;
const groundURL = new URL('../assets/terrain-material-v3.png', import.meta.url).href;
const buildingsURL = new URL('../assets/buildings-realistic-v2.png', import.meta.url).href;
const foliageURL = new URL('../assets/foliage-realistic-v2.png', import.meta.url).href;
const armoryURL = new URL('../assets/armory-v1.png', import.meta.url).href;
const buildingNames = ['hq', 'power', 'refinery', 'barracks', 'factory', 'dock', 'radar', 'airfield', 'turret', 'lab', 'super', 'oil', 'armory'];
const names = ['hq', 'power', 'refinery', 'barracks', 'factory', 'dock', 'radar', 'airfield', 'turret', 'lab', 'super', 'tank', 'harvester', 'aa', 'fighter', 'strike', 'drone', 'ghost', 'rifle', 'engineer', 'scout', 'patrol', 'frigate', 'elite_china', 'elite_russia', 'elite_nato', 'elite_asia', 'elite_middleeast', 'oil', 'beacon', 'ore_gold', 'ore_gem', 'tree', 'rock'];
names.push('loiterer', 'jammer', 'laser', 'rocket', 'apc', 'supply', 'destroyer', 'carrier', 'submarine');
names.push('railgun', 'aegis', 'relay', ...['china','russia','nato','asia','middleeast'].flatMap(faction => [`tank_${faction}`, `rocket_${faction}`]), ...buildingNames.filter(name => name !== 'dock').map(name => `future_${name}`), 'future_beacon');
names.push('landing', 'bomber', 'airlift');
names.push('logistics_depot', 'containerShip', 'freightPlane', 'destroyer_china');
names.push('robot_rifle', 'robot_engineer', 'robot_scout');
names.push('armory');
let pending;
let library;
const variants = new Map();
const sprites = new Map();
const thumbnails = new Map();
let portraitRenderer;

export function weatherMaterial(material, domain = 'land') {
  if (material.name === '玻璃') return new THREE.MeshPhysicalMaterial({ name: '玻璃', color: '#294953', roughness: .14, metalness: .03, transparent: true, opacity: .82, depthWrite: false, clearcoat: 1, clearcoatRoughness: .08, envMapIntensity: 1.2, map: material.map, normalMap: material.normalMap });
  if (!['装甲钢', '浅色金属', '深色钢', '航空涂层', '建筑面板', '混凝土', '屋顶', '岩石', '矿石', '矿晶', '航天复合外墙', '航天浅色合金', '热防护屋面', '月表陶瓷装甲', '机器人钛合金', '橡胶', '作战服'].includes(material.name)) return material;
  const result = material.clone(), stone = ['岩石', '矿石', '矿晶'].includes(material.name);
  const fabric = material.name === '作战服', rubber = material.name === '橡胶';
  if (!stone) {
    const maps = surfaceMaps(fabric ? 'fabric' : rubber ? 'rubber' : 'coating');
    for (const key of ['map', 'normalMap', 'roughnessMap']) if (!result[key]) result[key] = maps[key];
    if (!material.normalMap) result.normalScale.setScalar(fabric ? .28 : .18);
    if (fabric || rubber) { result.metalness = 0; result.roughness = .94; }
    else if (['浅色金属', '深色钢', '航天浅色合金', '机器人钛合金'].includes(material.name)) { result.metalness = .72; result.roughness = .42; }
    else if (['装甲钢', '航空涂层', '建筑面板', '屋顶'].includes(material.name)) { result.metalness = .23; result.roughness = .72; }
  }
  if (domain === 'naval' && ['装甲钢', '建筑面板', '屋顶', '浅色金属'].includes(material.name)) result.color.set(material.name === '屋顶' ? '#515b61' : '#929da4');
  result.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vSurface;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurface = position;');
    shader.fragmentShader = `varying vec3 vSurface;
float grain(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float surfaceNoise(vec3 p) {
  vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(grain(i),grain(i+vec3(1,0,0)),f.x),mix(grain(i+vec3(0,1,0)),grain(i+vec3(1,1,0)),f.x),f.y),mix(mix(grain(i+vec3(0,0,1)),grain(i+vec3(1,0,1)),f.x),mix(grain(i+vec3(0,1,1)),grain(i+vec3(1,1,1)),f.x),f.y),f.z);
}
${shader.fragmentShader}`.replace('#include <map_fragment>', `#include <map_fragment>
float weather = surfaceNoise(vSurface * ${stone ? '9.0' : '35.0'});
float patches = surfaceNoise(vSurface * ${stone ? '2.5' : '1.5'});
diffuseColor.rgb *= ${stone ? '0.64 + weather * 0.52 + patches * 0.28' : '0.84 + weather * 0.24'};
${domain === 'land' && ['装甲钢', '建筑面板', '屋顶'].includes(material.name) ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.19,.24,.15), smoothstep(.42,.49,patches) * .42); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.075,.10,.085), smoothstep(.59,.65,patches) * .48);' : ''}
${stone ? 'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.19,.18,.16), smoothstep(.69,.83,weather) * .35);' : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (surfaceNoise(vSurface * 28.0) - .4) * .18, .28, 1.0);');
  };
  result.customProgramCacheKey = () => `军用表面:${domain}:${material.name}`;
  return result;
}

export function prepareVisualAssets() {
  pending ||= Promise.all([new GLTFLoader().loadAsync(modelURL), new THREE.TextureLoader().loadAsync(groundURL), new THREE.TextureLoader().loadAsync(buildingsURL), new THREE.TextureLoader().loadAsync(foliageURL), new THREE.TextureLoader().loadAsync(armoryURL), new GLTFLoader().loadAsync(modernURL), new GLTFLoader().loadAsync(droneURL), new GLTFLoader().loadAsync(equipmentURL), new THREE.TextureLoader().loadAsync(meridianURL), new GLTFLoader().loadAsync(logisticsURL), new GLTFLoader().loadAsync(convoyURL), new GLTFLoader().loadAsync(robotURL), new GLTFLoader().loadAsync(realismURL)]).then(([gltf, ground, buildings, foliage, armory, modern, drones, equipment, meridian, logistics, convoy, robots, realism]) => {
    const models = new Map();
    gltf.scene.updateMatrixWorld(true);
    modern.scene.updateMatrixWorld(true);
    drones.scene.updateMatrixWorld(true);
    equipment.scene.updateMatrixWorld(true);
    logistics.scene.updateMatrixWorld(true);
    convoy.scene.updateMatrixWorld(true);
    robots.scene.updateMatrixWorld(true);
    realism.scene.updateMatrixWorld(true);
    for (const name of names) {
      const source = realism.scene.getObjectByName(name) || robots.scene.getObjectByName(name) || convoy.scene.getObjectByName(name) || logistics.scene.getObjectByName(name) || equipment.scene.getObjectByName(name) || drones.scene.getObjectByName(name) || gltf.scene.getObjectByName(name) || modern.scene.getObjectByName(name);
      if (!source) throw new Error(`缺少战场模型：${name}`);
      const batches = new Map();
      source.traverse(mesh => {
        if (!mesh.isMesh) return;
        if (replacedNavalPart(name, mesh.name) || ['airlift', 'freightPlane'].includes(name) && mesh.name.startsWith('气动机身') || name === 'power' && mesh.name.startsWith('散热顶盖')) return;
        if (hasRefinedTracks(name) && /^(履带|履带板|履带接地板)/.test(mesh.name)) return;
        if (name === 'carrier' && /甲板停放机翼|甲板飞机/.test(mesh.name)) return;
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.applyMatrix4(mesh.matrixWorld);
        for (const attr of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(attr)) geometry.deleteAttribute(attr);
        if (!geometry.attributes.uv) geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 2), 2));
        const material = mesh.material;
        const articulated = (['tank', 'elite_nato'].includes(name) || name.startsWith('tank_')) && /炮塔|滑膛炮|炮管|车长|舱盖|瞄准|反应装甲/.test(mesh.name) || name === 'railgun' && /炮塔|加速器|线圈|电容/.test(mesh.name);
        let limb = null;
        let pivot = null;
        if (hasRefinedTracks(name) && /^(滑膛炮|炮管)/.test(mesh.name)) limb = 'barrel';
        if (name === 'radar' && /^(相控阵雷达|雷达阵列|雷达波导)/.test(mesh.name)) { limb = 'facility_radar'; pivot = new THREE.Vector3(0, 4.1, -.5); }
        if (['rifle', 'engineer', 'scout'].includes(name) && /腿部|军靴/.test(mesh.name)) {
          geometry.computeBoundingBox();
          limb = geometry.boundingBox.getCenter(new THREE.Vector3()).z < 0 ? 'leg_left' : 'leg_right';
        }
        for (let parent = mesh.parent; parent && parent !== source; parent = parent.parent) {
          const leg = parent.name.match(/^robot_leg_(left|right)/);
          if (leg) { limb = `leg_${leg[1]}`; pivot = new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld); break; }
          if (/^rotor_\d+_/.test(parent.name)) { limb = parent.name; pivot = new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld); break; }
        }
        const key = `${material.uuid}:${articulated}:${limb}`;
        const domain = ['patrol', 'frigate', 'destroyer', 'destroyer_china', 'carrier', 'submarine', 'landing', 'containerShip'].includes(name) ? 'naval' : name.startsWith('future_') || name.startsWith('robot_') ? 'space' : 'land';
        if (!batches.has(key)) batches.set(key, { material: weatherMaterial(material, domain), geometries: [], articulated, limb, pivot });
        batches.get(key).geometries.push(geometry);
      });
      const template = new THREE.Group(); template.name = name;
      const weapon = new THREE.Group(); weapon.name = 'weapon'; template.add(weapon);
      const legs = new Map();
      for (const { material, geometries, articulated, limb, pivot } of batches.values()) {
        let parent = articulated ? weapon : template;
        if (limb) {
          if (!legs.has(limb)) { const joint = new THREE.Group(); joint.name = limb; if (pivot) joint.position.copy(pivot); else if (limb !== 'barrel') joint.position.set(-.05, .88, limb === 'leg_left' ? -.15 : .15); (limb === 'barrel' ? weapon : template).add(joint); legs.set(limb, joint); }
          parent = legs.get(limb);
        }
        const geometry = mergeGeometries(geometries, false);
        if (limb) geometry.translate(-parent.position.x, -parent.position.y, -parent.position.z);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
        geometries.forEach(item => item.dispose());
      }
      refineEquipment(template, name);
      refineNavalHull(template, name); refineTransportBody(template);
      if (name === 'power') refinePowerFans(template);
      models.set(name, template);
    }
    for (const type of ['fighter', 'strike', 'bomber', 'airlift', 'freightPlane', 'aegis', 'ewPlane']) models.set(`space_${type}`, createSpaceAircraft(type));
    for(const type of ['rifle','engineer','scout'])models.set(type,createPersonnel(type));
    for(const type of ['cache','salvage','depot'])models.set(`resource_${type}`,createResourceModel(type));
    models.set('dock', createHarbor(weatherMaterial));
    for (const type of COMMUNITY_3D_BUILDINGS.filter(type => type !== 'dock')) refineFacility(models.get(type), type, weatherMaterial);
    const electronic = models.get('strike').clone(); electronic.name = 'ewPlane';
    const podMaterial = new THREE.MeshStandardMaterial({ color: '#687667', roughness: .65, metalness: .5 });
    for (const z of [-2.3, 2.3]) { const pod = new THREE.Mesh(new THREE.CapsuleGeometry(.3, 2.2, 4, 12), podMaterial); pod.rotation.z = Math.PI / 2; pod.position.set(-.5, -.2, z); electronic.add(pod); }
    models.set('ewPlane', electronic);
    refineAirfieldRunway(models.get('airfield'));
    for (const name of ['fighter', 'strike', 'bomber', 'ewPlane', 'airlift', 'freightPlane', 'ghost']) refineAircraftCanopy(models.get(name));
    ground.colorSpace = THREE.SRGBColorSpace; ground.wrapS = ground.wrapT = THREE.RepeatWrapping;
    meridian.colorSpace = THREE.SRGBColorSpace;
    library = { models, ground, buildings, foliage, armory, meridian }; return library;
  });
  return pending;
}

export function spriteTexture(name, teamColor = '#59d7ec') {
  const key = `${name}:${teamColor}`;
  if (sprites.has(key)) return sprites.get(key);
  const tree = name.startsWith('tree_'), standalone = name === 'armory', source = tree ? visualLibrary().foliage.image : standalone ? visualLibrary().armory.image : visualLibrary().buildings.image;
  const index = standalone ? 0 : tree ? Number(name.slice(5)) : buildingNames.indexOf(name);
  const columns = standalone ? [0, 1] : tree ? [0, .5, 1] : [0, 377 / 1448, 733 / 1448, 1082 / 1448, 1];
  const rows = standalone ? [0, 1] : tree ? [0, .5, 1] : [0, 392 / 1086, 741 / 1086, 1];
  const col = standalone ? 0 : index % (tree ? 2 : 4), row = standalone ? 0 : Math.floor(index / (tree ? 2 : 4));
  const x = Math.round(columns[col] * source.width), y = Math.round(rows[row] * source.height);
  const width = Math.round(columns[col + 1] * source.width) - x, height = Math.round(rows[row + 1] * source.height) - y;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.drawImage(source, x, y, width, height, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height), color = new THREE.Color(teamColor);
  color.convertLinearToSRGB();
  let left = width, right = 0, top = height, bottom = 0;
  for (let i = 0; i < pixels.data.length; i += 4) {
    const r = pixels.data[i], g = pixels.data[i + 1], b = pixels.data[i + 2], alpha = pixels.data[i + 3];
    if (alpha > 24) { const px = (i / 4) % width, py = Math.floor(i / 4 / width); left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py); }
    if (tree || !alpha || b < r * 1.2 || g < r * 1.15 || Math.abs(b - g) > 85) continue;
    const brightness = Math.max(g, b) / 255;
    pixels.data[i] = color.r * brightness * 255; pixels.data[i + 1] = color.g * brightness * 255; pixels.data[i + 2] = color.b * brightness * 255;
  }
  ctx.putImageData(pixels, 0, 0);
  const trimmed = document.createElement('canvas'); trimmed.width = right - left + 7; trimmed.height = bottom - top + 7;
  trimmed.getContext('2d').drawImage(canvas, left, top, right - left + 1, bottom - top + 1, 3, 3, right - left + 1, bottom - top + 1);
  const texture = new THREE.CanvasTexture(trimmed); texture.colorSpace = THREE.SRGBColorSpace;
  sprites.set(key, texture); return texture;
}

export function modelThumbnail(name, color) {
  const key = `${name}:${color}`;
  if (thumbnails.has(key)) return thumbnails.get(key);
  if (buildingNames.includes(name) && !['hq', 'power', 'barracks', 'factory', 'armory', ...COMMUNITY_3D_BUILDINGS].includes(name)) {
    const url = spriteTexture(name, color).image.toDataURL(); thumbnails.set(key, url); return url;
  }
  portraitRenderer ||= new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  portraitRenderer.setSize(120, 100); portraitRenderer.outputColorSpace = THREE.SRGBColorSpace; portraitRenderer.toneMapping = THREE.ACESFilmicToneMapping; portraitRenderer.toneMappingExposure = 1.25;
  const model = createModel(name, color), scene = new THREE.Scene(); scene.add(model, new THREE.HemisphereLight('#e0edf2', '#665b46', 2.1));
  const sun = new THREE.DirectionalLight('#fff2dc', 3.7); sun.position.set(-3, 9, 5); scene.add(sun);
  const bounds = new THREE.Box3().setFromObject(model), center = bounds.getCenter(new THREE.Vector3()), size = bounds.getSize(new THREE.Vector3()), span = Math.max(size.x, size.y, size.z) * .71;
  const camera = new THREE.OrthographicCamera(-span * 1.2, span * 1.2, span, -span, .1, 100);
  camera.position.copy(center).add(new THREE.Vector3(10, 14, 16)); camera.lookAt(center); portraitRenderer.render(scene, camera);
  const url = portraitRenderer.domElement.toDataURL(); thumbnails.set(key, url); return url;
}

export function visualLibrary() {
  if (!library) throw new Error('战场素材尚未载入');
  return library;
}

export function createModel(name, teamColor = '#59d7ec') {
  const key = `${name}:${teamColor}`;
  if (!variants.has(key)) {
    const template = visualLibrary().models.get(name);
    if (!template) throw new Error(`无法部署模型：${name}`);
    const model = template.clone();
    model.traverse(mesh => {
      if (!mesh.isMesh || mesh.material.name !== '阵营标识') return;
      mesh.material = mesh.material.clone(); mesh.material.color.set(teamColor); mesh.material.emissive.set(teamColor); mesh.material.emissiveIntensity = .22;
    });
    variants.set(key, model);
  }
  return variants.get(key).clone();
}
