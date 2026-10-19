import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const surfaces = new Map();
const noise = (x, y) => { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); };

export function surfaceMaps(kind = 'coating') {
  if (surfaces.has(kind)) return surfaces.get(kind);
  const aircraft = kind === 'aircraft', size = aircraft ? 256 : 128, color = new Uint8Array(size * size * 4), normal = new Uint8Array(color.length), rough = new Uint8Array(color.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4, grain = noise(x, y), fabric = kind === 'fabric', rubber = kind === 'rubber';
    const weave = fabric ? ((x % 4 < 2) === (y % 4 < 2) ? 1 : -1) : 0;
    const scratch = !fabric && !rubber && x % 47 === 0 && y % 19 < 11;
    const panelX = x % 64, panelY = y % 64;
    const seam = aircraft && (panelX < 2 || panelY < 2);
    const rivet = aircraft && ((panelX === 6 || panelX === 57) && panelY % 16 < 2 || (panelY === 6 || panelY === 57) && panelX % 16 < 2);
    const panelTone = aircraft ? noise(Math.floor(x / 64), Math.floor(y / 64)) * 20 - 12 : 0;
    const value = (aircraft ? 226 : 244) + grain * 8 + weave * 2 + panelTone - (scratch ? 22 : 0) - (seam ? 55 : rivet ? 35 : 0);
    color[i] = color[i + 1] = color[i + 2] = value; color[i + 3] = 255;
    normal[i] = 128 + (aircraft && panelX < 3 ? panelX < 1 ? -26 : 26 : fabric ? weave * 13 : (grain - .5) * 13);
    normal[i + 1] = 128 + (aircraft && panelY < 3 ? panelY < 1 ? -26 : 26 : fabric ? (y % 4 < 2 ? 1 : -1) * 13 : (noise(x + 1, y) - .5) * 13);
    normal[i + 2] = normal[i + 3] = 255;
    rough[i] = rough[i + 1] = rough[i + 2] = (fabric || rubber ? 235 : aircraft ? 170 + panelTone : 185) + grain * 18 + (seam ? 35 : 0); rough[i + 3] = 255;
  }
  const texture = (data, srgb = false) => {
    const t = new THREE.DataTexture(data, size, size); t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t;
  };
  const maps = { map: texture(color, true), normalMap: texture(normal), roughnessMap: texture(rough) };
  surfaces.set(kind, maps); return maps;
}

export function craftedMaterial(name, color, kind = 'coating', roughness = .75, metalness = .15) {
  return new THREE.MeshStandardMaterial({ name, color, ...surfaceMaps(kind), normalScale: new THREE.Vector2(kind === 'fabric' ? .35 : .22, kind === 'fabric' ? .35 : .22), roughness, metalness });
}

export function roundedPart(size, radius = .035) {
  return new RoundedBoxGeometry(...size, 1, Math.min(radius, Math.min(...size) * .35));
}

export function bodyLoft(sections, segments = 20) {
  const positions = [], uv = [], indices = [];
  for (let row = 0; row < sections.length; row++) {
    const [y, rx, rz, cx = 0] = sections[row];
    for (let i = 0; i <= segments; i++) {
      const angle = i * Math.PI * 2 / segments;
      positions.push(cx + Math.cos(angle) * rx, y, Math.sin(angle) * rz); uv.push(i / segments, row / (sections.length - 1));
      if (row && i) { const a = row * (segments + 1) + i, b = a - segments - 1; indices.push(a - 1, a, b - 1, b - 1, a, b); }
    }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(indices); g.computeVertexNormals(); return g;
}

export function mergeParts(group) {
  const batches = new Map();
  for (const mesh of [...group.children]) {
    if (!mesh.isMesh) { mergeParts(mesh); continue; }
    mesh.updateMatrix(); const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(); geometry.applyMatrix4(mesh.matrix);
    for (const key of Object.keys(geometry.attributes)) if (!['position', 'normal', 'uv'].includes(key)) geometry.deleteAttribute(key);
    if (!batches.has(mesh.material)) batches.set(mesh.material, []); batches.get(mesh.material).push(geometry);
    group.remove(mesh); mesh.geometry.dispose();
  }
  for (const [material, geometries] of batches) {
    const mesh = new THREE.Mesh(mergeGeometries(geometries, false), material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
  return group;
}
