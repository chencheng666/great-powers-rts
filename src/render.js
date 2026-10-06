import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, FACTIONS, UNITS } from './data.js';
import { createModel, prepareVisualAssets, spriteTexture, visualLibrary, weatherMaterial } from './visual-assets.js';
import { architectureLayout, CAMERA_ELEVATION } from './architecture.js';
import { productionExit } from './battlefield-details.js';
import { healthVisual, showHealthBar, teamVisual } from './team-visuals.js';
import { layoutHealthBars } from './health-layout.js';
import { unitRadius } from './unit-spacing.js';
import { equipmentModel } from './equipment.js';
import { isLunarRobot } from './lunar-robots.js';
import { projectileFlightPose } from './projectile-flight.js';
import { weatherState } from './tactical-rules.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { terrainHeight, REALISM_BUILDINGS } from './visual-detail.js';
import { realisticEffects } from './realistic-fx.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hash = (x, y, seed = 0) => { const value = Math.sin(x * 127.1 + y * 311.7 + seed * 47.7) * 43758.5453; return value - Math.floor(value); };
const SIN_ELEVATION = .819;
const UNIT_SCALE = { rifle: 12, engineer: 12, scout: 12, tank: 10, harvester: 9.5, aa: 10, elite: 10, fighter: 11, strike: 11, drone: 10, ghost: 10, patrol: 10, frigate: 10 };
Object.assign(UNIT_SCALE, { loiterer: 10, jammer: 10, laser: 10, rocket: 10, apc: 10, supply: 10, destroyer: 9, carrier: 8, submarine: 8 });
Object.assign(UNIT_SCALE, { landing: 9, bomber: 11, airlift: 11 });
Object.assign(UNIT_SCALE, { freightPlane: 9, containerShip: 8 });
Object.assign(UNIT_SCALE, { navalFighter: 11, navalStrike: 11 });
Object.assign(UNIT_SCALE, { railgun: 10, relay: 10, aegis: 11 });
const vector = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const makeCanvas = (width, height) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; };

function particleTexture(smoke = false) {
  const size = 256, canvas = makeCanvas(size, size), ctx = canvas.getContext('2d'), image = ctx.createImageData(size, size);
  const smoothNoise = (x, y, scale) => {
    const gx = x / scale, gy = y / scale, ix = Math.floor(gx), iy = Math.floor(gy);
    const fx = gx - ix, fy = gy - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy) * (1 - sx) + hash(ix + 1, iy) * sx;
    const b = hash(ix, iy + 1) * (1 - sx) + hash(ix + 1, iy + 1) * sx;
    return a * (1 - sy) + b * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const noise = smoothNoise(x, y, 42) * .6 + smoothNoise(x, y, 17) * .3 + smoothNoise(x, y, 7) * .1;
    const r = Math.hypot(x - size / 2, y - size / 2) / (size / 2), i = (y * size + x) * 4;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
    image.data[i + 3] = Math.max(0, 1 - r) ** (smoke ? 1.15 : 2.4) * (smoke ? .15 + noise * .85 : .7 + noise * .3) * 255;
  }
  ctx.putImageData(image, 0, 0); return new THREE.CanvasTexture(canvas);
}

export class Renderer {
  static prepare = prepareVisualAssets;

  constructor(canvas, minimap, game) {
    this.canvas = canvas; this.minimap = minimap; this.mctx = minimap.getContext('2d'); this.game = game;
    this.world = game.world;
    this.projectileModels = new Map();
    this.munitionTemplates = new Map();
    this.camera = { x: 0, y: 0, zoom: innerWidth < 700 ? .7 : .98 }; this.center = { x: 450, y: 720 }; this.viewport = { width: 1, height: 1 };
    this.pointer = null; this.dragBox = null; this.lastMinimap = 0; this.lastFog = -1000;
    this.entities = new Map(); this.effects = new Map(); this.environment = []; this.bridges = []; this.trails = []; this.ownedResources = [];
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    // 返回菜单或读档时复用同一画布，先清理上一渲染器遗留的 WebGL 绑定。
    this.webgl.resetState();
    this.webgl.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 2));
    this.webgl.shadowMap.enabled = true; this.webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.webgl.outputColorSpace = THREE.SRGBColorSpace; this.webgl.toneMapping = THREE.ACESFilmicToneMapping; this.webgl.toneMappingExposure = 1.06;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#10181d');
    this.viewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);
    this.raycaster = new THREE.Raycaster(); this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pmrem = new THREE.PMREMGenerator(this.webgl), room = new RoomEnvironment();
    const environment = this.track(pmrem.fromScene(room, .06)); this.scene.environment = environment.texture; this.scene.environmentIntensity = .58; room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#d7e8ef', game.map.future ? '#3e434c' : '#3b4739', .95));
    const sun = new THREE.DirectionalLight(game.map.future ? '#e8f2ff' : '#ffedd4', 3.05); sun.position.set(this.world.width / 2 - 1750, 2450, this.world.height / 2 - 1520); sun.target.position.set(this.world.width / 2, 0, this.world.height / 2); sun.castShadow = true; this.sun = sun;
    const shadowSize = innerWidth < 700 ? 2048 : 4096; sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -this.world.width * .7, right: this.world.width * .7, top: this.world.height * .85, bottom: -this.world.height * .85, near: 10, far: 6000 });
    sun.shadow.bias = -.00015; sun.shadow.normalBias = .24; sun.shadow.radius = 2; this.scene.add(sun, sun.target);
    this.fireTexture = particleTexture(); this.smokeTexture = particleTexture(true);
    this.createTerrain(); this.createBridges(); this.createEnvironment(); this.createFutureStructures(); this.createSites(); this.createFog(); this.createOverlays();
    this.createTracks(); this.createCombatAtmosphere();
    this.createPostprocessing();
    this.resize(); this.centerOn(innerWidth < 700 ? 400 : 470, game.homeY);
  }

  track(resource) { this.ownedResources.push(resource); return resource; }

  createPostprocessing() {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }); target.samples = 4;
    this.composer = new EffectComposer(this.webgl, target);
    this.composer.addPass(new RenderPass(this.scene, this.viewCamera));
    this.ambientPass = new SSAOPass(this.scene, this.viewCamera, 1, 1, 16);
    this.ambientPass.kernelRadius = 12; this.ambientPass.minDistance = .00025; this.ambientPass.maxDistance = .006;
    const render = this.ambientPass.render.bind(this.ambientPass);
    // 透明贴片和战争迷雾不参加法线预处理，避免矩形阴影与迷雾泄露。
    this.ambientPass.render = (...args) => {
      const hidden = [];
      this.scene.traverse(object => {
        if (object.visible && (object.isSprite || object.material?.transparent || object.material?.colorWrite === false)) { hidden.push(object); object.visible = false; }
      });
      try { render(...args); } finally { hidden.forEach(object => { object.visible = true; }); }
    };
    this.composer.addPass(this.ambientPass); this.composer.addPass(new OutputPass());
    this.quality = 'high';
    try { this.quality = localStorage.getItem('great-powers-quality') === 'standard' ? 'standard' : 'high'; } catch { /* 无本地存储时使用默认画质。 */ }
    this.ambientPass.enabled = this.quality === 'high';
  }

  setQuality(value) {
    this.quality = value === 'standard' ? 'standard' : 'high'; this.ambientPass.enabled = this.quality === 'high';
    try { localStorage.setItem('great-powers-quality', this.quality); } catch { /* 当前战局仍可切换画质。 */ }
    this.resize();
  }

  box(x, y, z, width, height, depth, material) {
    const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(width, height, depth)), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh); this.bridges.push(mesh); return mesh;
  }

  createTerrain() {
    const factor = Math.min(1, (innerWidth < 700 ? 2048 : 4096) / this.world.width);
    const canvas = makeCanvas(Math.round(this.world.width * factor), Math.round(this.world.height * factor)), ctx = canvas.getContext('2d'), image = (this.game.map.future ? visualLibrary().meridian : visualLibrary().ground).image;
    ctx.scale(factor, factor);
    ctx.filter = this.game.map.future ? 'saturate(.25) contrast(.72) brightness(.75)' : 'saturate(.78) contrast(.82) brightness(.85)';
    const tile = this.game.map.future ? 560 : 420;
    for (let y = 0; y < this.world.height; y += tile) for (let x = 0; x < this.world.width; x += tile) ctx.drawImage(image, x, y, tile, tile);
    ctx.filter = 'none';
    ctx.fillStyle = this.game.map.future ? 'rgba(86,100,120,.06)' : 'rgba(97,102,79,.12)'; ctx.fillRect(0, 0, this.world.width, this.world.height);
    const road = (points, width) => {
      const trace = () => { ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(point => ctx.lineTo(...point)); };
      trace(); ctx.lineJoin = 'round'; ctx.strokeStyle = '#686962'; ctx.lineWidth = width + 11; ctx.stroke();
      trace(); ctx.strokeStyle = '#454a4b'; ctx.lineWidth = width; ctx.stroke();
      trace(); ctx.strokeStyle = '#535758'; ctx.lineWidth = width - 7; ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.save(); ctx.translate(0, side * width * .22); trace(); ctx.strokeStyle = 'rgba(23,28,27,.23)'; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
      }
      ctx.setLineDash([18, 25]); trace(); ctx.strokeStyle = 'rgba(222,218,183,.43)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    };
    const cy = this.game.homeY;
    road([[-20, cy], [520, cy], [this.world.width - 520, cy], [this.world.width + 20, cy]], 54);
    if (this.game.mapId === 'ocean') for (const bridge of this.game.map.bridges) {
      const y = (bridge.y1 + bridge.y2) / 2;
      road([[410, cy], [850, y], [this.world.width - 850, y], [this.world.width - 410, cy]], 36);
    } else if (this.game.map.future) {
      for (const y of [400, 1680]) road([[410, cy], [800, y], [2400, y], [2790, cy]], 28);
      road([[1600, 80], [1600, this.world.height - 80]], 24);
    } else if (this.game.mapId === 'frontier') {
      for (const offset of [-1, 1]) road([[410, cy], [880, cy + offset * 380], [2240, cy + offset * 620], [3600, cy + offset * 380], [4070, cy]], 32);
      road([[2240, 100], [2240, this.world.height - 100]], 24);
    } else road([[410, -20], [680, 350], [930, 545], [1310, 895], [1560, 1090], [1830, 1460]], 30);
    for (const building of this.game.buildings) {
      const radius = building.size * 1.05, fade = ctx.createRadialGradient(building.x, building.y + 14, radius * .32, building.x, building.y + 14, radius);
      fade.addColorStop(0, '#7a827380'); fade.addColorStop(.7, '#64705d35'); fade.addColorStop(1, '#64705d00');
      ctx.fillStyle = fade; ctx.fillRect(building.x - radius, building.y + 14 - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 1600; i++) {
      const x = hash(i, 11) * this.world.width, y = hash(i, 17) * this.world.height;
      if (Math.abs(y - cy) > 38) continue;
      ctx.strokeStyle = 'rgba(23,29,29,.23)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7, y + 3); ctx.lineTo(x + 14, y - 2); ctx.stroke();
    }
    if (this.game.map.water) {
      const water = this.game.map.water;
      for (const [edge, side] of [[water.x1, -1], [water.x2, 1]]) {
        const shore = ctx.createLinearGradient(edge - 54, 0, edge + 54, 0);
        shore.addColorStop(side < 0 ? 0 : 1, '#64716400'); shore.addColorStop(.5, '#929d89b0'); shore.addColorStop(side < 0 ? 1 : 0, '#3e646b');
        ctx.fillStyle = shore; ctx.fillRect(edge - 54, 0, 108, this.world.height);
      }
      ctx.fillStyle = '#334044'; ctx.fillRect(water.x1, 0, water.x2 - water.x1, this.world.height);
    } else if (!this.game.map.future) for (const rect of this.game.map.barriers) {
      ctx.fillStyle = '#242e2c'; ctx.fillRect(rect.x1, rect.y1, rect.x2 - rect.x1, rect.y2 - rect.y1);
      ctx.fillStyle = 'rgba(98,99,84,.55)'; ctx.fillRect(rect.x1 - 12, rect.y1, 22, rect.y2 - rect.y1); ctx.fillRect(rect.x2 - 10, rect.y1, 22, rect.y2 - rect.y1);
    }
    const texture = this.track(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, this.webgl.capabilities.getMaxAnisotropy()); this.terrainTexture = texture;
    const geometry = this.track(new THREE.PlaneGeometry(this.world.width, this.world.height, 192, 128)); geometry.rotateX(-Math.PI / 2); geometry.translate(this.world.width / 2, 0, this.world.height / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      positions.setY(i, terrainHeight(this.game, positions.getX(i), positions.getZ(i)));
    }
    geometry.computeVertexNormals();
    const detailCanvas = makeCanvas(256, 256), detailContext = detailCanvas.getContext('2d'), detail = detailContext.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4, value = 105 + hash(x, y, 37) * 35 + hash(Math.floor(x / 4), Math.floor(y / 4), 18) * 22;
      detail.data[i] = detail.data[i + 1] = detail.data[i + 2] = value; detail.data[i + 3] = 255;
    }
    detailContext.putImageData(detail, 0, 0);
    const bump = this.track(new THREE.CanvasTexture(detailCanvas)); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(this.world.width / 100, this.world.height / 100);
    bump.anisotropy = Math.min(8, this.webgl.capabilities.getMaxAnisotropy());
    const terrain = new THREE.Mesh(geometry, this.track(new THREE.MeshStandardMaterial({ map: texture, bumpMap: bump, bumpScale: .65, roughness: .96, metalness: 0 }))); terrain.receiveShadow = true; this.scene.add(terrain);
    if (this.game.map.water) { this.createWater(); this.createShoreline(); }
  }

  createShoreline() {
    const water = this.game.map.water, canvas = makeCanvas(64, 256), ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(64, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 64; x++) {
      const i = (y * 64 + x) * 4, crest = 27 + Math.sin(y * TAU / 256 * 3) * 4;
      pixels.data[i] = 214; pixels.data[i + 1] = 230; pixels.data[i + 2] = 220;
      pixels.data[i + 3] = Math.exp(-(((x - crest) / 11) ** 2)) * (130 + Math.sin(y * TAU / 256 * 5) * 45);
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = this.track(new THREE.CanvasTexture(canvas)); texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.y = this.world.height / 380;
    this.shoreMaterial = this.track(new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }));
    for (const [edge, side] of [[water.x1, 1], [water.x2, -1]]) {
      const steps = Math.ceil(this.world.height / 16), positions = [], uv = [], indices = [];
      for (let n = 0; n <= steps; n++) {
        const z = n / steps * this.world.height, width = 22 + Math.sin(z * .025) * 3 + Math.sin(z * .009) * 5;
        positions.push(edge - side * 9, 1.16, z, edge + side * width, 1.16, z);
        uv.push(0, n / steps, 1, n / steps);
        if (n < steps) { const a = n * 2; indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices);
      this.scene.add(new THREE.Mesh(this.track(geometry), this.shoreMaterial));
    }
  }

  createWater() {
    const canvas = makeCanvas(256, 256), ctx = canvas.getContext('2d'), pixels = ctx.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4, a = x * TAU / 256, b = y * TAU / 256;
      pixels.data[i] = 128 + Math.sin(a * 7 + b * 3 + Math.sin(b * 2)) * 12 + Math.sin(a * 19 - b * 11) * 5 + Math.cos(a * 3 + b * 13) * 5;
      pixels.data[i + 1] = 128 + Math.cos(a * 5 + b * 9 + Math.sin(a * 4)) * 13 + Math.sin(b * 23 + a * 11) * 6;
      pixels.data[i + 2] = 245; pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const normal = this.track(new THREE.CanvasTexture(canvas)); normal.wrapS = normal.wrapT = THREE.RepeatWrapping; normal.repeat.set((this.game.map.water.x2 - this.game.map.water.x1) / 100, this.world.height / 120); this.waterNormal = normal;
    const water = this.game.map.water;
    const mesh = new THREE.Mesh(this.track(new THREE.PlaneGeometry(water.x2 - water.x1, this.world.height)), this.track(new THREE.MeshStandardMaterial({ color: '#32626a', metalness: .45, roughness: .32, normalMap: normal, normalScale: new THREE.Vector2(.19, .19) })));
    mesh.rotation.x = -Math.PI / 2; mesh.position.set((water.x1 + water.x2) / 2, .8, this.world.height / 2); mesh.receiveShadow = true; this.scene.add(mesh);
  }

  createBridges() {
    if (!this.game.map.bridges.length) return;
    const water = this.game.map.water, west = water ? water.x1 - 38 : 1010, east = water ? water.x2 + 38 : 1230;
    const concrete = this.track(new THREE.MeshStandardMaterial({ color: '#888b85', roughness: .86 }));
    const asphalt = this.track(new THREE.MeshStandardMaterial({ color: '#3b4144', roughness: .89 }));
    const steel = this.track(new THREE.MeshStandardMaterial({ color: '#475256', roughness: .55, metalness: .67 }));
    const white = this.track(new THREE.MeshStandardMaterial({ color: '#d3cbb3', roughness: .8 }));
    for (const bridge of this.game.map.bridges) {
      const z = (bridge.y1 + bridge.y2) / 2, length = bridge.y2 - bridge.y1;
      const batchStart = this.bridges.length;
      this.box((west + east) / 2, 20, z, east - west, 11, length, concrete); this.box((west + east) / 2, 26, z, east - west - 8, 1.8, length - 15, asphalt);
      for (const side of [bridge.y1 + 3, bridge.y2 - 3]) {
        this.box((west + east) / 2, 37, side, east - west, 2.2, 2.2, steel); this.box((west + east) / 2, 30, side, east - west, 1.5, 1.6, steel);
        for (let x = west + 5; x < east; x += 22) this.box(x, 32, side, 1.8, 13, 1.8, steel);
        for (let x = west + 10; x < east; x += 48) this.box(x, 37, side, 3, 2.5, 3, white);
      }
      for (let x = west + 15; x < east - 15; x += 42) this.box(x, 27.2, z, 20, .3, 1.2, white);
      const supports = [west + 30, east - 30];
      if (east - west > 600) for (let x = west + 210; x < east - 160; x += 230) supports.push(x);
      for (const x of supports) this.box(x, -3, z, 14, 45, length - 20, concrete);
      const pieces = this.bridges.splice(batchStart), batches = new Map();
      for (const piece of pieces) {
        piece.updateMatrix();
        const geometry = piece.geometry.clone().applyMatrix4(piece.matrix); geometry.translate(-(west + east) / 2, 0, -z);
        if (!batches.has(piece.material)) batches.set(piece.material, []);
        batches.get(piece.material).push(geometry); this.scene.remove(piece);
      }
      for (const [material, geometries] of batches) {
        const mesh = new THREE.Mesh(this.track(mergeGeometries(geometries)), material); mesh.position.set((west + east) / 2, 0, z); mesh.castShadow = true; mesh.receiveShadow = true;
        this.scene.add(mesh); this.bridges.push(mesh); geometries.forEach(geometry => geometry.dispose());
      }
    }
  }

  elevation(x, z) {
    if (!this.game.map.bridges.length) return terrainHeight(this.game, x, z) + 1;
    const west = this.game.map.water ? this.game.map.water.x1 - 38 : 1010, east = this.game.map.water ? this.game.map.water.x2 + 38 : 1230;
    return x >= west && x <= east && this.game.map.bridges.some(bridge => z >= bridge.y1 && z <= bridge.y2) ? 27 : this.game.map.water && x > west && x < east ? 1 : terrainHeight(this.game, x, z) + 1;
  }

  createEnvironment() {
    const points = { tree: [], rock: [] }, forbidden = [...this.game.buildings, ...this.game.ore, ...this.game.oil, ...this.game.beacons];
    const density = Math.min(850, Math.round(this.world.width * this.world.height / (2240 * 1440) * 230));
    for (let i = 0; i < density; i++) {
      const x = 45 + hash(i, 91) * (this.world.width - 90), z = 40 + hash(i, 193) * (this.world.height - 80);
      if (Math.abs(z - this.game.homeY) < 145 || forbidden.some(item => Math.hypot(item.x - x, item.y - z) < 100)) continue;
      if (this.game.map.noBuild.some(rect => x > rect.x1 - 25 && x < rect.x2 + 25)) continue;
      const kind = this.game.map.future ? 'rock' : hash(i, 71) > .24 ? 'tree' : 'rock'; points[kind].push({ x, z, scale: kind === 'tree' ? 8 + hash(i, 25) * 7 : 12 + hash(i, 45) * 11, angle: hash(i, 33) * TAU });
    }
    if (this.game.mapId === 'canyon') for (const rect of this.game.map.barriers) {
      for (let z = rect.y1 + 12; z < rect.y2 - 8; z += 32) for (const [side, x] of [[0, rect.x1 + 10], [1, rect.x2 - 10]]) {
        const n = hash(z, side, 39);
        points.rock.push({ x: x + (n - .5) * 13, z, scale: 23 + n * 14, verticalScale: 47 + n * 20, heightOffset: -22, angle: n * TAU });
      }
    }
    if (this.game.map.water) for (let z = 30; z < this.world.height; z += 64) for (const x of [this.game.map.water.x1 - 12, this.game.map.water.x2 + 12]) {
      if (this.game.map.bridges.some(bridge => z > bridge.y1 - 30 && z < bridge.y2 + 30)) continue;
      const n = hash(x, z, 45); points.rock.push({ x: x + (n - .5) * 22, z: z + (hash(z, x, 23) - .5) * 30, scale: 8 + n * 13, heightOffset: -5, angle: n * TAU });
    }
    const dummy = new THREE.Object3D();
    this.createFoliage(points.tree);
    for (const [name, transforms] of [['rock', points.rock]]) for (const child of visualLibrary().models.get(name).children) {
      if (!child.isMesh) continue;
      const base = new THREE.MeshStandardMaterial({ color: this.game.map.future ? '#555b63' : '#64665c', roughness: .96 }); base.name = '岩石';
      const material = this.track(weatherMaterial(base)); base.dispose();
      const geometry = this.track(new THREE.IcosahedronGeometry(.7, 3)), vertices = geometry.attributes.position;
      for (let n = 0; n < vertices.count; n++) {
        const x = vertices.getX(n), y = vertices.getY(n), z = vertices.getZ(n), shape = .82 + hash(Math.round(x * 25), Math.round(z * 25), Math.round(y * 25)) * .3;
        vertices.setXYZ(n, x * shape * 1.2, y * shape * .65 + .38, z * shape);
      }
      geometry.computeVertexNormals();
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length); mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      transforms.forEach((point, index) => { dummy.position.set(point.x, point.heightOffset ?? this.elevation(point.x, point.z), point.z); dummy.rotation.set(0, point.angle, 0); dummy.scale.set(point.scale, point.verticalScale || point.scale, point.scale); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
      this.scene.add(mesh); this.environment.push({ mesh, transforms });
    }
  }

  createFoliage(points) {
    const geometry = this.track(new THREE.PlaneGeometry(1, 1)), dummy = new THREE.Object3D();
    for (let variant = 0; variant < 4; variant++) {
      const texture = spriteTexture(`tree_${variant}`), transforms = points.filter((point, i) => i % 4 === variant);
      const material = this.track(new THREE.MeshBasicMaterial({ map: texture, alphaTest: .18, side: THREE.DoubleSide, toneMapped: false }));
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length); mesh.castShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      transforms.forEach(point => { point.height = point.scale * 6.5; point.width = point.height * texture.image.width / texture.image.height; });
      transforms.forEach((point, index) => { dummy.position.set(point.x, point.height * .574 / 2, point.z - point.height * .819 / 2); dummy.rotation.set(-Math.atan2(1700, 1190), 0, 0); dummy.scale.set(point.width, point.height, 1); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
      this.scene.add(mesh); this.environment.push({ mesh, transforms, foliage: true });
    }
  }

  attachArchitecture(model, name, color, width = 11.6) {
    const texture = spriteTexture(name, color);
    model.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.material = this.track(mesh.material.clone()); mesh.material.colorWrite = false; mesh.material.depthWrite = false; mesh.castShadow = false;
    });
    const sprite = new THREE.Sprite(this.track(new THREE.SpriteMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false })));
    const layout = architectureLayout(width, texture.image.width, texture.image.height);
    sprite.center.set(.5, 0); sprite.scale.set(layout.width, layout.height, 1); sprite.position.set(0, layout.groundClearance, layout.frontDepth);
    const caster = new THREE.Mesh(this.track(new THREE.PlaneGeometry(layout.width, layout.height)), this.track(new THREE.MeshBasicMaterial({ map: texture, alphaTest: .18, side: THREE.DoubleSide, colorWrite: false, depthWrite: false })));
    caster.rotation.x = -CAMERA_ELEVATION;
    caster.position.set(0, layout.groundClearance + layout.height * Math.cos(CAMERA_ELEVATION) / 2, layout.frontDepth - layout.height * Math.sin(CAMERA_ELEVATION) / 2);
    caster.castShadow = true;
    model.add(sprite, caster); return sprite;
  }

  createFutureStructures() {
    if (!this.game.map.future) return;
    const steel = this.track(new THREE.MeshStandardMaterial({ color: '#9ba6ac', metalness: .65, roughness: .52 }));
    const cells = this.track(new THREE.MeshStandardMaterial({ color: '#293d46', metalness: .4, roughness: .37 }));
    const stripe = this.track(new THREE.MeshStandardMaterial({ color: '#dfbb66', roughness: .7 }));
    for (const rect of this.game.map.barriers) {
      const x = (rect.x1 + rect.x2) / 2, y = (rect.y1 + rect.y2) / 2;
      const core = createModel('future_power', '#d6b363'); core.scale.setScalar(30); core.position.set(x, 1, y); this.scene.add(core); this.bridges.push(core);
      this.box(x, 1, y, rect.x2 - rect.x1, 2, rect.y2 - rect.y1, steel);
      for (const z of [rect.y1 + 6, rect.y2 - 6]) this.box(x, 3, z, rect.x2 - rect.x1 - 12, 2, 3, stripe);
    }
    for (const rect of this.game.map.cover) {
      const x = (rect.x1 + rect.x2) / 2, y = (rect.y1 + rect.y2) / 2;
      for (let offset = -60; offset <= 60; offset += 30) {
        this.box(x + offset, 6, y, 2, 12, rect.y2 - rect.y1, steel);
        const panel = this.box(x + offset, 13, y, 27, 1.5, rect.y2 - rect.y1, cells); panel.rotation.z = .18;
        for (let z = rect.y1 + 15; z < rect.y2; z += 20) this.box(x + offset, 14, z, 25, .6, .7, steel);
      }
    }
  }

  createSites() {
    this.sites = [];
    for (const site of [...this.game.oil, ...this.game.beacons]) {
      const oil = this.game.oil.includes(site), model = createModel(this.game.map.future ? oil ? 'future_oil' : 'future_beacon' : oil ? 'oil' : 'beacon', '#dac17b'); model.scale.setScalar(oil ? 13 : 10);
      const sprite = oil && !this.game.map.future ? this.attachArchitecture(model, 'oil', '#dac17b', 8.5) : null;
      model.userData.entity = site; model.position.set(site.x, this.elevation(site.x, site.y), site.y); this.scene.add(model); this.sites.push({ entity: site, model, owner: null, sprite });
    }
    this.ores = this.game.ore.map(ore => { const model = createModel(`ore_${ore.kind}`); model.scale.setScalar(22); model.position.set(ore.x, 1, ore.y); this.scene.add(model); return { ore, model }; });
  }

  createFog() {
    this.fogSmall = makeCanvas(this.game.fog.cols, this.game.fog.rows); this.fogCanvas = makeCanvas(560, 360); this.fogTexture = this.track(new THREE.CanvasTexture(this.fogCanvas)); this.fogTexture.colorSpace = THREE.SRGBColorSpace;
    const material = this.track(new THREE.MeshBasicMaterial({ map: this.fogTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 }));
    const mesh = new THREE.Mesh(this.track(new THREE.PlaneGeometry(this.world.width, this.world.height)), material); mesh.rotation.x = -Math.PI / 2; mesh.position.set(this.world.width / 2, 2, this.world.height / 2); mesh.renderOrder = 5; this.scene.add(mesh);
  }

  updateFog() {
    const { cols, rows, visible, explored } = this.game.fog, ctx = this.fogSmall.getContext('2d'); ctx.clearRect(0, 0, cols, rows);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const i = y * cols + x; if (visible[i]) continue; ctx.fillStyle = explored[i] ? 'rgba(13,21,26,.52)' : 'rgba(7,12,17,.96)'; ctx.fillRect(x, y, 1, 1); }
    const fog = this.fogCanvas.getContext('2d'); fog.clearRect(0, 0, 560, 360); fog.filter = 'blur(9px)'; fog.drawImage(this.fogSmall, -5, -5, 570, 370); fog.filter = 'none'; this.fogTexture.needsUpdate = true;
    const dummy = new THREE.Object3D();
    for (const mesh of this.bridges) mesh.visible = this.game.hasExploredFor(0, mesh.position.x, mesh.position.z);
    for (const { mesh, transforms, foliage } of this.environment) {
      transforms.forEach((point, index) => {
        const known = this.game.hasExploredFor(0, point.x, point.z);
        if (foliage) { dummy.position.set(point.x, point.height * .574 / 2, point.z - point.height * .819 / 2); dummy.rotation.set(-Math.atan2(1700, 1190), 0, 0); dummy.scale.set(known ? point.width : 0, known ? point.height : 0, 1); }
        else { dummy.position.set(point.x, point.heightOffset ?? 1, point.z); dummy.rotation.set(0, point.angle, 0); dummy.scale.set(known ? point.scale : 0, known ? point.verticalScale || point.scale : 0, known ? point.scale : 0); }
        dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
      }); mesh.instanceMatrix.needsUpdate = true;
    }
  }

  createOverlays() {
    this.overlayCanvas = makeCanvas(1, 1); this.overlayCanvas.className = 'world-overlay'; Object.assign(this.overlayCanvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    this.canvas.after(this.overlayCanvas); this.overlay = this.overlayCanvas.getContext('2d');
    this.selectionGeometry = this.track(new THREE.RingGeometry(.94, 1, 64)); this.selectionGeometry.rotateX(-Math.PI / 2);
    this.selectionMaterial = this.track(new THREE.MeshBasicMaterial({ color: teamVisual(0).color, transparent: true, opacity: .78, depthWrite: false })); this.placement = null;
    this.enemySelectionMaterial = this.track(new THREE.MeshBasicMaterial({ color: teamVisual(1).color, transparent: true, opacity: .85, depthWrite: false }));
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
    this.viewport = { width: rect.width, height: rect.height }; this.webgl.setSize(rect.width, rect.height, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.webgl.getPixelRatio()); this.composer.setSize(rect.width, rect.height);
      this.ambientPass.setSize(Math.round(rect.width * .65), Math.round(rect.height * .65));
    }
    const dpr = Math.min(devicePixelRatio, 2); this.overlayCanvas.width = rect.width * dpr; this.overlayCanvas.height = rect.height * dpr; this.overlay.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clampCamera(); this.updateCamera();
  }

  centerOn(x, y) { this.center.x = x; this.center.y = y; this.clampCamera(); this.updateCamera(); }

  clampCamera() {
    const halfWidth = this.viewport.width / this.camera.zoom / 2, halfHeight = this.viewport.height / this.camera.zoom / SIN_ELEVATION / 2;
    this.center.x = clamp(this.center.x, Math.min(halfWidth, this.world.width / 2), Math.max(this.world.width - halfWidth, this.world.width / 2));
    this.center.y = clamp(this.center.y, Math.min(halfHeight, this.world.height / 2), Math.max(this.world.height - halfHeight, this.world.height / 2)); this.camera.x = this.center.x - halfWidth; this.camera.y = this.center.y - halfHeight;
  }

  updateCamera() {
    const halfWidth = this.viewport.width / this.camera.zoom / 2, halfHeight = this.viewport.height / this.camera.zoom / 2;
    Object.assign(this.viewCamera, { left: -halfWidth, right: halfWidth, top: halfHeight, bottom: -halfHeight }); this.viewCamera.position.set(this.center.x, 1700, this.center.y + 1190);
    this.viewCamera.lookAt(this.center.x, 0, this.center.y); this.viewCamera.updateProjectionMatrix(); this.viewCamera.updateMatrixWorld();
    if (this.sun) {
      const radius = Math.max(700, halfWidth * 1.3, halfHeight / SIN_ELEVATION * 1.3);
      const snappedX = Math.round(this.center.x / 4) * 4, snappedY = Math.round(this.center.y / 4) * 4;
      this.sun.position.set(snappedX - 1750, 2450, snappedY - 1520); this.sun.target.position.set(snappedX, 0, snappedY);
      Object.assign(this.sun.shadow.camera, { left: -radius, right: radius, top: radius, bottom: -radius }); this.sun.shadow.camera.updateProjectionMatrix();
    }
    if (this.ambientPass) {
      this.ambientPass.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(this.viewCamera.projectionMatrix);
      this.ambientPass.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(this.viewCamera.projectionMatrixInverse);
    }
  }

  screenToWorld(x, y) {
    this.raycaster.setFromCamera(new THREE.Vector2(x / this.viewport.width * 2 - 1, 1 - y / this.viewport.height * 2), this.viewCamera);
    const point = this.raycaster.ray.intersectPlane(this.groundPlane, new THREE.Vector3()); return { x: point?.x || 0, y: point?.z || 0 };
  }

  worldToScreen(x, y, height = 0) { const point = vector(x, y, height).project(this.viewCamera); return { x: (point.x + 1) * this.viewport.width / 2, y: (1 - point.y) * this.viewport.height / 2 }; }
  pickPoint(x, y) {
    const entity = this.pickEntity(x, y);
    return entity ? { x: entity.x, y: entity.y } : this.screenToWorld(x, y);
  }
  pickEntity(x, y) {
    this.screenToWorld(x, y);
    const targets = [...this.entities.values(), ...this.sites].filter(entry => entry.model.visible).map(entry => entry.model);
    const hits = this.raycaster.intersectObjects(targets, true);
    if (!hits.length) return null;
    let model = hits[0].object;
    while (model && !model.userData.entity) model = model.parent;
    return model?.userData.entity || null;
  }
  selectBox(start, end, additive) {
    const a = this.worldToScreen(start.x, start.y), b = this.worldToScreen(end.x, end.y);
    if (!additive) this.game.selected = [];
    for (const { entity, model } of this.entities.values()) {
      if (entity.kind !== 'unit' || entity.owner !== 0 || !model.visible) continue;
      const screen = this.worldToScreen(entity.x, entity.y, model.position.y + 10);
      if (screen.x >= Math.min(a.x, b.x) && screen.x <= Math.max(a.x, b.x) && screen.y >= Math.min(a.y, b.y) && screen.y <= Math.max(a.y, b.y) && !this.game.selected.includes(entity.id)) this.game.selected.push(entity.id);
    }
    this.game.events.selection?.();
  }
  pan(dx, dy) { this.center.x += dx / this.camera.zoom; this.center.y += dy / this.camera.zoom / SIN_ELEVATION; this.clampCamera(); this.updateCamera(); }
  zoomAt(factor, sx, sy) { const before = this.screenToWorld(sx, sy); this.camera.zoom = clamp(this.camera.zoom * factor, .45, 2.4); this.updateCamera(); const after = this.screenToWorld(sx, sy); this.center.x += before.x - after.x; this.center.y += before.y - after.y; this.clampCamera(); this.updateCamera(); }

  createEntity(entity) {
    const color = teamVisual(entity.owner).color, name = equipmentModel(this.game.players[entity.owner].faction, entity.type, this.game.map.future);
    const model = createModel(name, color), scale = entity.kind === 'building' ? entity.size / 7.2 : UNIT_SCALE[entity.type]; model.scale.setScalar(scale);
    model.userData.entity = entity;
    const sprite = entity.kind === 'building' && !['turret', 'refinery', ...REALISM_BUILDINGS].includes(entity.type) && !this.game.map.future ? this.attachArchitecture(model, name, color) : null;
    const entrance = entity.kind === 'building' && ['barracks', 'factory', 'armory', 'airfield'].includes(entity.type) ? this.createEntrance(entity, model, scale) : null;
    const ring = new THREE.Mesh(this.selectionGeometry, entity.owner === 0 ? this.selectionMaterial : this.enemySelectionMaterial); ring.visible = false; this.scene.add(model, ring);
    const exhausts = [];
    if (entity.kind === 'unit' && UNITS[entity.type].tags.includes('jet')) for (const z of [-.36, .36]) {
      const exhaust = this.effectSprite('#89c7ff'); exhaust.position.set(-4.2, .42, z); exhaust.scale.set(1.25, .43, 1); model.add(exhaust); exhausts.push(exhaust);
    }
    model.updateMatrixWorld(true);
    const topHeight = new THREE.Box3().setFromObject(model).max.y;
    const rotors = []; model.traverse(object => { if (/^rotor_\d+_/.test(object.name)) rotors.push(object); });
    rotors.sort((a, b) => Number(a.name.split('_')[1]) - Number(b.name.split('_')[1]));
    const value = { model, ring, entity, scale, sprite, entrance, exhausts, topHeight, heading: entity.angle, lastX: entity.x, lastY: entity.y, trackX: entity.x, trackY: entity.y, trailAt: 0, smokeAt: 0, healthEcho: entity.hp / entity.maxHp, healthAt: this.game.time, weapon: model.getObjectByName('weapon'), legs: [model.getObjectByName('leg_left'), model.getObjectByName('leg_right')].filter(Boolean), rotors, bank: 0, pitch: 0, deckModels: new Map() }; this.entities.set(entity.id, value); return value;
  }

  createEntrance(building, model, scale) {
    const infantry = building.type === 'barracks', exit = productionExit(building, infantry ? 'rifle' : 'tank');
    const root = new THREE.Group(); root.scale.setScalar(1 / scale); root.position.set((exit.x - building.x) / scale, 0, (exit.y - building.y) / scale); root.rotation.y = building.owner ? Math.PI : 0;
    const steel = this.track(new THREE.MeshStandardMaterial({ color: '#59666a', roughness: .58, metalness: .62 }));
    const concrete = this.track(new THREE.MeshStandardMaterial({ color: '#808779', roughness: .94 }));
    const stripes = this.track(new THREE.MeshStandardMaterial({ color: '#d1b15f', roughness: .76 }));
    const lampMaterial = this.track(new THREE.MeshStandardMaterial({ color: '#8cedce', emissive: '#70c3ae', emissiveIntensity: .7 }));
    const height = infantry ? 20 : 31, width = infantry ? 23 : 48;
    const piece = (w, h, d, x, y, z, material) => { const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(w, h, d)), material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); return mesh; };
    piece(72, .6, width + 12, 28, .4, 0, concrete);
    for (const z of [-width / 2, width / 2]) { piece(4, height, 4, 0, height / 2, z, steel); piece(61, .7, 1.6, 31, .9, z - Math.sign(z) * 3, stripes); }
    piece(5, 4, width + 4, 0, height, 0, steel);
    const door = piece(2, height - 4, width - 5, 0, height / 2 + 1, 0, steel);
    for (let x = 7; x < 55; x += 12) piece(4, .7, 7, x, 1, width / 2 - 7, stripes);
    piece(4, 2, 5, 2, height + 3, width / 2, lampMaterial);
    model.add(root); return { root, door, lampMaterial, height };
  }

  entityAnchor(entity) {
    const entry = this.entities.get(entity.id);
    if (!entry) return this.worldToScreen(entity.x, entity.y);
    if (!entry.sprite) return this.worldToScreen(entity.x, entity.y, entry.model.position.y + entry.topHeight + 9);
    const point = this.worldToScreen(entity.x, entity.y + entry.sprite.position.z * entry.scale, entry.model.position.y + entry.sprite.position.y * entry.scale);
    point.y -= entry.sprite.scale.y * entry.scale * this.camera.zoom / 2;
    return point;
  }

  updateEntities(now) {
    const dt = this.game.paused ? 0 : Math.min(.05, Math.max(0, (now - (this.lastEntityFrame ?? now)) / 1000)); this.lastEntityFrame = now;
    const active = new Set();
    const targeted = new Set(this.game.selected.map(id => this.game.getEntity(id)).filter(entity => entity?.owner === 0).map(entity => entity.order?.targetId || entity.targetId).filter(Boolean));
    for (const entity of [...this.game.buildings, ...this.game.units]) {
      if (entity.hp <= 0) continue; active.add(entity.id);
      const entry = this.entities.get(entity.id) || this.createEntity(entity), visible = this.game.canSeeEntity(0, entity); entry.model.visible = visible;
      const moving = Math.hypot(entity.x - entry.lastX, entity.y - entry.lastY) > .05;
      let height = this.elevation(entity.x, entity.y);
      if (entity.kind === 'unit') {
        const tags = UNITS[entity.type].tags;
        if (tags.includes('jet')) height = 95 * (entity.deployment ? Math.min(1, (this.game.time - entity.deployment.start) / 2.6) : 1) + Math.sin(now * .001 + entity.id) * 2;
        if (entity.deckApproach) height = 15 + 80 * Math.max(0, (entity.deckApproach.until - this.game.time) / 2.4);
        if (entity.embarkedIn) height = 15;
        else if (tags.includes('drone')) height = 23 + Math.sin(this.game.time * 3 + entity.id) * 1.5;
        if (entity.type === 'airlift' && !moving && this.game.transportGrounded(entity)) height = this.elevation(entity.x, entity.y) + 6;
        else if (tags.includes('ship')) height = 2 + Math.sin(now * .002 + entity.id) * .6;
        const turn = Math.atan2(Math.sin(entity.angle - entry.heading), Math.cos(entity.angle - entry.heading));
        entry.heading += turn * (1 - Math.exp(-dt * (tags.includes('infantry') ? 18 : 9)));
        entry.model.rotation.y = -entry.heading;
        if (tags.includes('jet')) {
          entry.bank += (clamp(turn * .65, -.4, .4) - entry.bank) * (1 - Math.exp(-dt * 5));
          entry.model.rotation.x = entry.bank;
          entry.flightHeight ??= height;
          entry.flightHeight += (height - entry.flightHeight) * (1 - Math.exp(-dt * 5));
          height = entry.flightHeight;
        }
        if (entry.weapon) { entry.weapon.rotation.y = entry.heading - entity.turretAngle; entry.weapon.position.x = -.35 * Math.exp(-Math.max(0, this.game.time - (entity.lastFireAt ?? -100)) * 18); }
        if (tags.includes('infantry')) entry.model.rotation.z = moving ? Math.sin(entity.movePulse * 1.8) * .025 : 0;
        entry.legs.forEach((leg, index) => { leg.rotation.z = moving ? Math.sin(entity.movePulse * 2 + index * Math.PI) * .47 : 0; });
        if (tags.includes('drone') || entry.rotors.length) {
          const activeFlight = this.game.time >= entity.stunUntil;
          entry.rotors.forEach((rotor, index) => { rotor.rotation.y += dt * (activeFlight ? 47 : 7) * (index % 2 ? -1 : 1); });
          const smoothing = 1 - Math.exp(-dt * 7);
          entry.bank += ((activeFlight ? clamp(turn * .45, -.17, .17) : 0) - entry.bank) * smoothing;
          entry.pitch += ((moving && activeFlight ? -.09 : 0) - entry.pitch) * smoothing;
          entry.model.rotation.x = entry.bank; entry.model.rotation.z = entry.pitch;
          if (tags.includes('drone')) height += Math.sin(this.game.time * 2.3 + entity.id * .7) * .7;
        }
      } else if (entity.type === 'dock') entry.model.rotation.y = entity.x > this.world.width / 2 ? Math.PI : 0;
      else if (entity.type === 'turret') entry.model.rotation.y = -entity.angle;
      entry.model.position.set(entity.x, height, entity.y);
      if (entity.type === 'carrier') {
        const assigned = this.game.carrierAircraft(entity).length;
        const flights = this.game.projectiles.filter(p => !p.finished && p.kind === 'wing' && p.sourceId === entity.id).length;
        const parked = assigned ? entity.passengers.map(id => this.game.getEntity(id)).filter(p => p?.hp > 0) : Array.from({ length: Math.max(0, entity.wing - flights) }, (_, i) => ({ id: -i - 1, type: 'navalStrike' }));
        const ids = new Set(parked.map(p => p.id));
        for (const [id, plane] of entry.deckModels) if (!ids.has(id)) { entry.model.remove(plane); entry.deckModels.delete(id); }
        parked.forEach((plane, i) => {
          let mesh = entry.deckModels.get(plane.id);
          if (!mesh) { mesh = createModel(equipmentModel(this.game.players[entity.owner].faction, plane.type), teamVisual(entity.owner).color); mesh.scale.setScalar(.3); entry.model.add(mesh); entry.deckModels.set(plane.id, mesh); }
          mesh.position.set(-8 + i * 4.1, 1.3, -1.3);
        });
      }
      if (entry.entrance) {
        const age = this.game.time - ((entity.exitUntil || -10) - 2.6), open = entity.exitUntil > this.game.time ? Math.min(1, age / .3) : Math.max(0, 1 - (this.game.time - (entity.exitUntil || -10)) / .45);
        entry.entrance.door.scale.y = Math.max(.03, 1 - open); entry.entrance.door.position.y = entry.entrance.height - 2 - (entry.entrance.height - 4) * (1 - open) / 2;
        entry.entrance.lampMaterial.emissiveIntensity = entity.active ? .9 + Math.sin(now * .005) * .4 : .4;
      }
      if (entity.kind === 'unit' && visible && moving && this.game.time >= entry.trailAt && this.trails.length < 100) {
        const tags = UNITS[entity.type].tags, ship = tags.includes('ship');
        if (!tags.includes('jet') && !tags.includes('drone') && !tags.includes('infantry')) {
          const sprite = this.effectSprite(ship ? '#d4e9e9' : '#a89a80', true);
          sprite.position.set(entity.x - Math.cos(entity.angle) * (ship ? 35 : 20), ship ? 2 : height + 3, entity.y - Math.sin(entity.angle) * (ship ? 35 : 20));
          sprite.scale.set(ship ? 25 : 13, ship ? 8 : 13, 1); sprite.material.opacity = .15;
          this.scene.add(sprite); this.trails.push({ sprite, baseY: sprite.position.y, start: this.game.time, ship }); entry.trailAt = this.game.time + .14;
        }
      }
      if (entity.kind === 'unit' && visible && moving && !UNITS[entity.type].tags.some(tag => ['jet', 'drone', 'ship', 'infantry'].includes(tag)) && Math.hypot(entity.x - entry.trackX, entity.y - entry.trackY) >= 13) {
        this.leaveTracks(entry); entry.trackX = entity.x; entry.trackY = entity.y;
      }
      if (visible && entity.hp / entity.maxHp < .3 && this.game.time >= entry.smokeAt && (entity.kind === 'building' || !UNITS[entity.type].tags.includes('infantry')) && this.trails.length < 120) {
        const smoke = this.effectSprite('#4d555a', true); smoke.position.set(entity.x, height + (entity.kind === 'building' ? 42 : 23), entity.y); smoke.scale.setScalar(12); smoke.material.opacity = .35;
        this.scene.add(smoke); this.trails.push({ sprite: smoke, baseY: smoke.position.y, start: this.game.time, damage: true }); entry.smokeAt = this.game.time + .55;
      }
      entry.lastX = entity.x; entry.lastY = entity.y;
      for (const exhaust of entry.exhausts) exhaust.material.opacity = .7 + Math.sin(now * .02 + entity.id) * .15;
      entry.ring.visible = visible && (this.game.selected.includes(entity.id) || entity.owner !== 0 && (this.hoveredId === entity.id || targeted.has(entity.id))); entry.ring.position.set(entity.x, this.elevation(entity.x, entity.y) + .65, entity.y);
      if (UNITS[entity.type]?.tags.includes('ship')) entry.ring.position.y = 3;
      const radius = entity.kind === 'building' ? entity.size * .65 : unitRadius(entity) + 4; entry.ring.scale.set(radius, 1, radius);
    }
    for (const [id, entry] of this.entities) if (!active.has(id)) { entry.exhausts.forEach(sprite => sprite.material.dispose()); this.scene.remove(entry.model, entry.ring); this.entities.delete(id); }
    for (const site of this.sites) {
      site.model.visible = this.game.hasExploredFor(0, site.entity.x, site.entity.y);
      if (site.entity.owner !== site.owner) {
        const color = teamVisual(site.entity.owner).color;
        site.model.traverse(mesh => { if (mesh.isMesh && mesh.material.name === '阵营标识') { mesh.material = mesh.material.clone(); mesh.material.color.set(color); mesh.material.emissive.set(color); } }); site.owner = site.entity.owner;
        if (site.sprite) site.sprite.material.map = spriteTexture('oil', color);
      }
    }
    for (const { ore, model } of this.ores) { model.visible = ore.amount > 0 && this.game.hasExploredFor(0, ore.x, ore.y); model.scale.setScalar(22 * (.55 + .45 * ore.amount / ore.max)); }
  }

  createTracks() {
    const geometry = this.track(new THREE.PlaneGeometry(1, 1)); geometry.rotateX(-Math.PI / 2);
    const stamp = makeCanvas(32, 128), ctx = stamp.getContext('2d');
    ctx.fillStyle = '#fff'; for (let y = 0; y < 128; y += 8) ctx.fillRect(2, y, 28, 4);
    ctx.globalCompositeOperation = 'destination-in'; const fade = ctx.createLinearGradient(0, 0, 32, 0); fade.addColorStop(0, 'transparent'); fade.addColorStop(.2, '#fff'); fade.addColorStop(.8, '#fff'); fade.addColorStop(1, 'transparent'); ctx.fillStyle = fade; ctx.fillRect(0, 0, 32, 128);
    const texture = this.track(new THREE.CanvasTexture(stamp));
    const material = this.track(new THREE.MeshBasicMaterial({ map: texture, color: '#31362d', transparent: true, opacity: .16, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }));
    this.trackMesh = new THREE.InstancedMesh(geometry, material, 600); this.trackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.trackMesh.frustumCulled = false; this.trackMesh.count = 0;
    this.trackMarks = []; this.trackCursor = 0; this.scene.add(this.trackMesh); this.trackDummy = new THREE.Object3D();
  }

  leaveTracks({ entity, heading }) {
    for (const side of [-1, 1]) {
      const mark = { x: entity.x - Math.sin(heading) * side * 17, y: entity.y + Math.cos(heading) * side * 17, angle: heading, start: this.game.time, width: entity.type === 'harvester' ? 3 : 5 };
      this.trackMarks[this.trackCursor] = mark; this.trackCursor = (this.trackCursor + 1) % 600;
    }
  }

  updateTracks() {
    let count = 0;
    for (const mark of this.trackMarks) {
      const age = this.game.time - mark.start;
      if (age > 24 || !this.game.isVisibleFor(0, mark.x, mark.y)) continue;
      const dummy = this.trackDummy; dummy.position.set(mark.x, this.elevation(mark.x, mark.y) + .18, mark.y); dummy.rotation.y = Math.PI / 2 - mark.angle;
      dummy.scale.set(mark.width * Math.min(1, (24 - age) / 6), 1, 15); dummy.updateMatrix(); this.trackMesh.setMatrixAt(count++, dummy.matrix);
    }
    this.trackMesh.count = count; this.trackMesh.instanceMatrix.needsUpdate = true;
  }

  effectSprite(color, smoke = false) { return new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke ? this.smokeTexture : this.fireTexture, color, transparent: true, depthWrite: false, blending: smoke ? THREE.NormalBlending : THREE.AdditiveBlending })); }

  effectHeight(type, x, y) {
    const tags = UNITS[type]?.tags || [];
    return tags.includes('jet') ? 98 : tags.includes('drone') ? 29 : this.elevation(x, y) + (BUILDINGS[type] ? 28 : type === 'tank' ? 21.3 : tags.includes('infantry') ? 15.5 : 18);
  }

  updateEffects() {
    this.trails = this.trails.filter(trail => {
      const age = this.game.time - trail.start;
      if (age > 1.6) { this.scene.remove(trail.sprite); trail.sprite.material.dispose(); return false; }
      const size = trail.explosionSize ? trail.explosionSize * (.6 + Math.max(0, age) * 1.2) : trail.muzzle ? 7 + age * 9 : trail.ship ? 25 + age * 13 : 13 + age * 12;
      trail.sprite.scale.set(size, trail.ship ? 8 + age * 4 : size, 1); trail.sprite.material.opacity = Math.max(0, 1 - Math.max(0, age) / 1.6) * (trail.damage ? .38 : trail.muzzle ? .2 : .15);
      if (!trail.ship) trail.sprite.position.y = trail.baseY + age * (trail.damage ? 13 : 3);
      trail.sprite.visible = this.game.isVisibleFor(0, trail.sprite.position.x, trail.sprite.position.z); return true;
    });
    const current = new Set(this.game.effects);
    for (const effect of this.game.effects) {
      const source = effect.type === 'sonar' ? this.game.getEntity(effect.sourceId) : null;
      const visible = this.game.isVisibleFor(0, effect.x, effect.y) && (effect.type !== 'sonar' || effect.owner === 0 || source && this.game.canSeeEntity(0, source));
      if (this.effects.has(effect)) this.effects.get(effect).visible = !!visible;
      if (!visible) continue;
      const t = effect.age / effect.duration; let group = this.effects.get(effect);
      if (!group) {
        group = new THREE.Group();
        if (effect.type === 'shot') this.createWeaponEffect(effect, group);
        else if (['hit', 'explosion'].includes(effect.type)) this.createImpactEffect(effect, group);
        else if (effect.type === 'supplyDrop') {
          const crate = new THREE.Mesh(new THREE.BoxGeometry(14, 11, 12), new THREE.MeshStandardMaterial({ color: '#69756a', roughness: .75, metalness: .25 })); crate.castShadow = true; group.add(crate);
          const canopy = new THREE.Mesh(new THREE.SphereGeometry(15, 20, 8, 0, TAU, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#d4ded6', roughness: .85, side: THREE.DoubleSide })); canopy.position.y = 27; group.add(canopy);
          for (const [x, z] of [[-10,-10],[-10,10],[10,-10],[10,10]]) group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, 27, z), new THREE.Vector3(x * .45, 6, z * .45)]), new THREE.LineBasicMaterial({ color: '#ccd7cf' })));
        }
        else if (['order', 'build', 'capture', 'ability', 'jam', 'sonar'].includes(effect.type)) group.add(new THREE.Mesh(this.selectionGeometry, new THREE.MeshBasicMaterial({ color: effect.type === 'jam' ? '#c2a4ff' : effect.type === 'sonar' ? '#83ccd9' : effect.owner === 1 ? '#fb7968' : '#8cdff0', transparent: true, depthWrite: false })));
        group.position.set(effect.x, ['hit', 'explosion'].includes(effect.type) ? this.effectHeight(effect.targetType, effect.x, effect.y) : this.elevation(effect.x, effect.y) + 2, effect.y); this.scene.add(group); this.effects.set(effect, group);
        if (effect.type === 'sonar') group.position.y = 3;
      }
      if (effect.type === 'shot') this.animateWeaponEffect(effect, group);
      else if (['hit', 'explosion'].includes(effect.type)) this.animateImpactEffect(effect, group);
      else if (effect.type === 'supplyDrop') {
        group.position.y = 7 + (1 - t) * 80; group.rotation.y = Math.sin(t * 4) * .15;
        group.children.forEach(mesh => { mesh.material.transparent = true; mesh.material.opacity = t > .8 ? (1 - t) * 5 : 1; });
      } else if (group.children[0]) { const pulse = ['jam', 'sonar'].includes(effect.type), radius = pulse ? effect.size * t : effect.type === 'ability' ? 245 * Math.min(1, t * 2) : 10 + t * 24; group.children[0].scale.set(radius, 1, radius); group.children[0].material.opacity = (1 - t) * (pulse ? .3 : 1); }
    }
    for (const [effect, group] of this.effects) if (!current.has(effect)) { group.traverse(item => { if (item.geometry && item.geometry !== this.selectionGeometry) item.geometry.dispose(); if (item.material) item.material.dispose(); }); this.scene.remove(group); this.effects.delete(effect); }
    this.updateCombatAtmosphere();
  }

  updateProjectileModels(now) {
    const active = new Set();
    for (const p of this.game.projectiles) {
      if (p.finished) continue;
      active.add(p.id);
      let model = this.projectileModels.get(p.id);
      if (!model) {
        const color = teamVisual(p.owner).color;
        if (['wing', 'loitering'].includes(p.kind)) {
          model = createModel(p.kind === 'wing' ? 'strike' : 'drone', color);
          model.scale.setScalar(p.kind === 'wing' ? 6 : 3);
        } else {
          if (!this.munitionTemplates.has(p.kind)) {
            const template = new THREE.Group();
            const material = this.track(new THREE.MeshStandardMaterial({ color: p.kind === 'torpedo' ? '#58676b' : '#d2d9d7', metalness: .65, roughness: .42 }));
            const geometry = this.track(new THREE.CapsuleGeometry(1.1, 11, 4, 12)), finGeometry = this.track(new THREE.BoxGeometry(3, 4, .35));
            const body = new THREE.Mesh(geometry, material); body.rotation.z = -Math.PI / 2; template.add(body);
            for (const angle of [0, Math.PI / 2]) { const fin = new THREE.Mesh(finGeometry, material); fin.position.x = -4; fin.rotation.x = angle; template.add(fin); }
            this.munitionTemplates.set(p.kind, template);
          }
          model = this.munitionTemplates.get(p.kind).clone();
        }
        const plume = this.effectSprite(p.kind === 'torpedo' ? '#bbebee' : '#ffb578'); plume.position.set(p.kind === 'wing' ? -4.8 : -7, .4, 0); plume.scale.set(p.kind === 'wing' ? 2.5 : 12, p.kind === 'wing' ? .6 : 3, 1); model.add(plume);
        if (p.kind === 'bomb') plume.visible = false;
        this.scene.add(model); this.projectileModels.set(p.id, model);
      }
      model.visible = p.owner === 0 || this.game.isVisibleFor(0, p.x, p.y);
      const pose = projectileFlightPose(p), height = pose.height + (p.kind === 'wing' ? Math.sin(now * .004 + p.id) * 2 : 0);
      model.position.set(p.x, height, p.y); model.rotation.y = -p.angle; model.rotation.z = pose.pitch;
      if (model.visible && ['rocket', 'missile'].includes(p.kind) && this.game.time >= (p.trailAt || 0) && this.trails.length < 100) {
        const sprite = this.effectSprite('#a7a9a7', true); sprite.position.set(p.x, height, p.y); sprite.scale.setScalar(8); sprite.material.opacity = .2;
        this.scene.add(sprite); this.trails.push({ sprite, baseY: height, start: this.game.time }); p.trailAt = this.game.time + .09;
      }
    }
    for (const [id, model] of this.projectileModels) if (!active.has(id)) { model.children.at(-1)?.material?.dispose(); this.scene.remove(model); this.projectileModels.delete(id); }
  }

  drawOverlay() {
    const ctx = this.overlay; ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    if (weatherState(this.game.map, this.game.time).phase === 'storm') {
      ctx.strokeStyle = '#a5d1e526'; ctx.lineWidth = 1;
      for (let i = 0; i < 12; i++) { const x = hash(i, 7) * this.viewport.width, y = (hash(i, 9) * this.viewport.height + this.game.time * 45) % this.viewport.height; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y - 8); ctx.stroke(); }
    }
    const selected = new Set(this.game.selected), bars = [], viewportRect = this.canvas.getBoundingClientRect();
    const obstacles = [...this.canvas.parentElement.querySelectorAll('.battle-hud, .command-toolbar, .camera-tools, .building-info:not([hidden]), .compact-radar:not([hidden]), .attack-alert:not([hidden]), .toast')].map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x - viewportRect.x, y: rect.y - viewportRect.y, width: rect.width, height: rect.height };
    });
    for (const entry of this.entities.values()) {
      const { entity, model, scale, sprite } = entry, ratio = clamp(entity.hp / entity.maxHp, 0, 1), hovered = this.hoveredId === entity.id, isSelected = selected.has(entity.id);
      const elapsed = Math.max(0, this.game.time - entry.healthAt); entry.healthAt = this.game.time;
      entry.healthEcho = Math.max(ratio, entry.healthEcho - elapsed * .24);
      if (!showHealthBar(entity, model.visible, isSelected, hovered, this.game.time - (entity.lastDamageAt ?? -100) < 2)) continue;
      let screen;
      if (sprite) { screen = this.entityAnchor(entity); screen.y -= 7; }
      else screen = this.worldToScreen(entity.x, entity.y, model.position.y + entry.topHeight + 9);
      if (screen.x < 0 || screen.x > this.viewport.width || screen.y < 0 || screen.y > this.viewport.height) continue;
      const infantry = entity.kind === 'unit' && UNITS[entity.type].tags.includes('infantry'), robot = entity.kind === 'unit' && isLunarRobot(this.game.map, entity.type), ammo = robot ? 10 : UNITS[entity.type]?.ammo;
      const numeric = hovered || isSelected && selected.size === 1;
      const label = `${entity.owner === 1 ? '敌 ' : ''}${Math.ceil(entity.hp)}/${Math.ceil(entity.maxHp)}`;
      const status = entity.stunUntil > this.game.time ? '瘫痪' : entity.jammedUntil > this.game.time ? '干扰' : robot && entity.battery <= 0 ? '电量耗尽' : entity.freight ? entity.freight.phase === 'unloading' ? '物资交付' : entity.freight.phase === 'outbound' ? '空载返航' : '补给运输' : entity.order?.type === 'rearm' || entity.order?.type === 'restock' ? robot ? '充电整备' : UNITS[entity.type]?.tags.includes('ship') ? '返港整备' : '补给' : '';
      ctx.font = '500 10px "Noto Sans SC",sans-serif';
      const width = Math.max(entity.kind === 'building' ? 76 : infantry ? 28 : 50, numeric ? Math.ceil(ctx.measureText(label).width) + 8 : 0);
      bars.push({ id: entity.id, entity, ratio, echo: entry.healthEcho, selected: isSelected, numeric, label, status, ammo, charge: robot ? entity.battery / 10 : entity.ammo, anchorX: screen.x, anchorY: screen.y, width, height: 10 + (numeric ? 12 : 0) + (ammo ? 6 : 0) + (status ? 12 : 0), priority: isSelected ? 4 : hovered ? 3 : entity.owner === 1 ? 2 : 1 });
    }
    this.healthBars = layoutHealthBars(bars, this.viewport, obstacles);
    for (const bar of this.healthBars) {
      const { entity, x, y, width, numeric, ammo } = bar, top = y + (numeric ? 12 : 0), style = healthVisual(entity.owner, bar.ratio);
      if (Math.abs(x + width / 2 - bar.anchorX) > 2 || Math.abs(y + bar.height - bar.anchorY) > 2) {
        ctx.strokeStyle = style.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + width / 2, y + bar.height); ctx.lineTo(bar.anchorX, bar.anchorY + 4); ctx.stroke();
      }
      if (numeric) { ctx.font = '500 10px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#0b1218'; ctx.strokeText(bar.label, x + width / 2, y + 9); ctx.fillStyle = style.frame; ctx.fillText(bar.label, x + width / 2, y + 9); }
      ctx.fillStyle = '#081116ed'; ctx.fillRect(x, top, width, 9); ctx.strokeStyle = style.warning ? '#f3c66e' : style.frame; ctx.lineWidth = 1; ctx.strokeRect(x + .5, top + .5, width - 1, 8);
      ctx.fillStyle = style.color;
      if (style.hostile) { ctx.beginPath(); ctx.moveTo(x + 3.5, top + 1); ctx.lineTo(x + 6, top + 4.5); ctx.lineTo(x + 3.5, top + 8); ctx.lineTo(x + 1, top + 4.5); ctx.closePath(); ctx.fill(); }
      else ctx.fillRect(x + 2, top + 2, 3, 5);
      const innerWidth = width - 10;
      ctx.fillStyle = style.echo; ctx.fillRect(x + 7, top + 2, innerWidth * bar.echo, 5);
      ctx.fillStyle = style.fill; ctx.fillRect(x + 7, top + 2, innerWidth * bar.ratio, 5);
      ctx.fillStyle = '#0c191b77'; const segments = entity.kind === 'building' ? 10 : width < 30 ? 4 : 6;
      for (let i = 1; i < segments; i++) ctx.fillRect(Math.round(x + 7 + innerWidth * i / segments), top + 2, 1, 5);
      if (ammo) for (let i = 0; i < ammo; i++) { ctx.fillStyle = i < bar.charge ? style.frame : '#273a47'; ctx.fillRect(x + 2 + i * (width - 4) / ammo, top + 11, Math.max(1, (width - 4) / ammo - 2), 3); }
      if (bar.status) { const baseline = top + (ammo ? 26 : 20); ctx.font = '500 9px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#0b1218'; ctx.strokeText(bar.status, x + width / 2, baseline); ctx.fillStyle = '#f4ce82'; ctx.fillText(bar.status, x + width / 2, baseline); }
    }
    if (this.dragBox) {
      const a = this.worldToScreen(this.dragBox.start.x, this.dragBox.start.y), b = this.worldToScreen(this.dragBox.end.x, this.dragBox.end.y); ctx.fillStyle = 'rgba(104,220,239,.1)'; ctx.strokeStyle = '#8de5f0'; ctx.lineWidth = 1; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    for (const building of this.game.ownedBuildings(0)) if (selected.has(building.id) && building.rallyPoint) {
      const start = this.worldToScreen(building.x, building.y), point = this.worldToScreen(building.rallyPoint.x, building.rallyPoint.y);
      ctx.save(); ctx.strokeStyle = '#b6ead7'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(point.x, point.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#91d8b5'; ctx.beginPath(); ctx.moveTo(point.x, point.y - 22); ctx.lineTo(point.x + 18, point.y - 17); ctx.lineTo(point.x, point.y - 10); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(point.x, point.y); ctx.lineTo(point.x, point.y - 22); ctx.stroke(); ctx.restore();
    }
    for (const effect of this.game.effects) if (effect.type === 'income' && this.game.isVisibleFor(0, effect.x, effect.y)) {
      const point = this.worldToScreen(effect.x, effect.y, 20 + effect.age / effect.duration * 32); ctx.font = '600 13px "Noto Sans SC",sans-serif'; ctx.fillStyle = '#e9cd90'; ctx.textAlign = 'center'; ctx.fillText(`+${effect.amount}`, point.x, point.y);
    }
    this.drawAttackFeedback();
    if (this.pointer && (this.game.pendingAbility || ['attackMove', 'rally'].includes(this.game.orderMode))) {
      const point = this.worldToScreen(this.pointer.x, this.pointer.y); ctx.strokeStyle = '#c4edf2'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(point.x, point.y, 18, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(point.x - 26, point.y); ctx.lineTo(point.x + 26, point.y); ctx.moveTo(point.x, point.y - 26); ctx.lineTo(point.x, point.y + 26); ctx.stroke();
    }
  }

  updatePlacement() {
    const type = this.game.pendingBuilding;
    if (this.placement && this.placement.type !== type) { this.scene.remove(this.placement.model); this.placement = null; }
    if (!type || !this.pointer) { if (this.placement) this.placement.model.visible = false; return; }
    if (!this.placement) {
      const name = equipmentModel(this.game.players[0].faction, type, this.game.map.future);
      const model = createModel(name), sprite = !this.game.map.future && !['turret', 'refinery'].includes(type) ? this.attachArchitecture(model, type, '#59d7ec') : null;
      if (sprite) sprite.material.opacity = .55;
      model.traverse(mesh => { if (!mesh.isMesh) return; if (!sprite) { mesh.material = this.track(mesh.material.clone()); mesh.material.transparent = true; mesh.material.opacity = .48; } mesh.castShadow = false; });
      model.scale.setScalar(BUILDINGS[type].size / 7.2); this.scene.add(model); this.placement = { type, model, sprite };
    }
    const valid = this.game.canPlace(0, type, this.pointer.x, this.pointer.y); this.placement.model.visible = true; this.placement.model.position.set(this.pointer.x, this.elevation(this.pointer.x, this.pointer.y), this.pointer.y);
    this.placement.model.traverse(mesh => { if (mesh.isMesh) mesh.material.color.set(valid ? '#87d7b1' : '#ee7366'); });
    if (this.placement.sprite) this.placement.sprite.material.color.set(valid ? '#ade4cf' : '#f17a72');
  }

  render(now = 0) {
    this.updateEntities(now); this.updateEffects(); this.updateProjectileModels(now); this.updateTracks(); this.updatePlacement();
    if (now - this.lastFog >= 180) { this.updateFog(); this.lastFog = now; }
    if (this.waterNormal) this.waterNormal.offset.set(now * .000004, now * .000007);
    if (this.shoreMaterial) this.shoreMaterial.opacity = .4 + Math.sin(now * .0012) * .05;
    this.composer.render(); this.drawOverlay();
    if (now - this.lastMinimap >= 180) { this.drawMinimap(); this.lastMinimap = now; }
  }

  drawAttackFeedback() {
    const ctx = this.overlay, time = this.game.time;
    for (const entry of this.entities.values()) {
      const entity = entry.entity, age = time - (entity.lastDamageAt ?? -100);
      if (!entry.model.visible || entity.owner !== 0 || age < 0 || age > 1.15) continue;
      const point = this.worldToScreen(entity.x, entity.y, entry.model.position.y + (entity.kind === 'building' ? entry.topHeight * .45 : 12));
      const radius = clamp((entity.kind === 'building' ? entity.size * .4 : 24) * this.camera.zoom, 16, 58);
      ctx.save(); ctx.globalAlpha = (1 - age / 1.15) * .9; ctx.strokeStyle = '#ff8164'; ctx.lineWidth = 2;
      for (const direction of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(point.x + direction * (radius - 8), point.y - radius * .65); ctx.lineTo(point.x + direction * radius, point.y - radius * .65); ctx.lineTo(point.x + direction * radius, point.y - radius * .3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(point.x + direction * (radius - 8), point.y + radius * .65); ctx.lineTo(point.x + direction * radius, point.y + radius * .65); ctx.lineTo(point.x + direction * radius, point.y + radius * .3); ctx.stroke();
      }
      ctx.restore();
    }
    const age = time - (this.game.lastAttackVoiceAt ?? -100);
    if (age >= 0 && age < .85) {
      ctx.save(); ctx.strokeStyle = `rgba(245,85,65,${(1 - age / .85) * .35})`; ctx.lineWidth = 5;
      ctx.strokeRect(2.5, 2.5, this.viewport.width - 5, this.viewport.height - 5); ctx.restore();
    }
  }

  drawMinimapAlerts(ctx, width, height) {
    for (const alert of this.game.attackAlerts || []) {
      const age = this.game.time - alert.at; if (age > 7) continue;
      const x = alert.x / this.world.width * width, y = alert.y / this.world.height * height, pulse = (this.game.time * 1.8) % 1;
      ctx.save(); ctx.lineWidth = 1.8; ctx.strokeStyle = '#ff8c72'; ctx.globalAlpha = (1 - age / 7) * (1 - pulse * .5);
      ctx.beginPath(); ctx.arc(x, y, 5 + pulse * 9, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#fff0ce'; ctx.fillRect(x - 1.5, y - 1.5, 3, 3); ctx.restore();
    }
  }

  drawMinimap() {
    const ctx = this.mctx, width = this.minimap.width, height = this.minimap.height; ctx.clearRect(0, 0, width, height);
    if (!this.game.hasRadarIntel(0)) {
      ctx.fillStyle = '#0e171d'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = '#263842'; ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      ctx.fillStyle = '#95abb4'; ctx.font = '500 12px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.game.hasBuilding(0, 'radar') ? '电力不足 · 雷达离线' : '雷达站未建造', width / 2, height / 2); this.drawMinimapAlerts(ctx, width, height); return;
    }
    ctx.drawImage(this.terrainTexture.image, 0, 0, width, height);
    const sx = width / this.world.width, sy = height / this.world.height;
    if (this.game.map.water) { const water = this.game.map.water; ctx.fillStyle = '#315662'; ctx.fillRect(water.x1 * sx, 0, (water.x2 - water.x1) * sx, height); }
    for (const bridge of this.game.map.bridges) { ctx.fillStyle = '#a0a296'; ctx.fillRect((this.game.map.water ? this.game.map.water.x1 - 38 : 1010) * sx, bridge.y1 * sy, (this.game.map.water ? this.game.map.water.x2 - this.game.map.water.x1 + 76 : 220) * sx, (bridge.y2 - bridge.y1) * sy); }
    for (const ore of this.game.ore) if (ore.amount > 0) { ctx.fillStyle = ore.kind === 'gem' ? '#93b9b8' : '#c6ae75'; ctx.fillRect(ore.x * sx - 2, ore.y * sy - 2, 4, 4); }
    for (const site of [...this.game.oil, ...this.game.beacons]) { ctx.fillStyle = teamVisual(site.owner).color; ctx.fillRect(site.x * sx - 2, site.y * sy - 2, 5, 5); }
    for (const entity of [...this.game.buildings, ...this.game.units]) if (entity.hp > 0 && this.game.canSeeEntity(0, entity)) {
      ctx.fillStyle = teamVisual(entity.owner).color; const size = entity.kind === 'building' ? 5 : 3;
      if (entity.owner === 0) ctx.fillRect(entity.x * sx - size / 2, entity.y * sy - size / 2, size, size);
      else { const x = entity.x * sx, y = entity.y * sy; ctx.beginPath(); ctx.moveTo(x, y - size); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size); ctx.lineTo(x - size, y); ctx.closePath(); ctx.fill(); }
    }
    ctx.drawImage(this.fogCanvas, 0, 0, width, height);
    this.drawMinimapAlerts(ctx, width, height);
    const a = this.screenToWorld(0, 0), b = this.screenToWorld(this.viewport.width, this.viewport.height); ctx.strokeStyle = '#d5edf0'; ctx.lineWidth = 1; ctx.strokeRect(a.x * sx, a.y * sy, (b.x - a.x) * sx, (b.y - a.y) * sy);
  }

  dispose() {
    this.webgl.setRenderTarget(null); this.webgl.resetState();
    this.composer?.passes.forEach(pass => pass.dispose()); this.composer?.dispose();
    this.projectileModels.forEach(model => model.children.at(-1)?.material?.dispose());
    this.trails.forEach(trail => trail.sprite.material.dispose());
    this.entities.forEach(entry => entry.exhausts.forEach(sprite => sprite.material.dispose()));
    this.ownedResources.forEach(resource => resource.dispose());
    this.effects.forEach(group => group.traverse(item => { if (item.geometry && item.geometry !== this.selectionGeometry) item.geometry.dispose(); if (item.material) item.material.dispose(); }));
    this.fireTexture.dispose(); this.smokeTexture.dispose(); this.overlayCanvas.remove(); this.webgl.dispose();
  }
}

Object.assign(Renderer.prototype, realisticEffects);
