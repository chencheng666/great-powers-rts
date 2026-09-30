import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BUILDINGS, FACTIONS, UNITS } from './data.js';
import { createModel, prepareVisualAssets, spriteTexture, visualLibrary } from './visual-assets.js';
import { architectureLayout, CAMERA_ELEVATION } from './architecture.js';
import { layoutHealthBars } from './health-layout.js';
import { unitRadius } from './unit-spacing.js';

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hash = (x, y, seed = 0) => { const value = Math.sin(x * 127.1 + y * 311.7 + seed * 47.7) * 43758.5453; return value - Math.floor(value); };
const SIN_ELEVATION = .819;
const UNIT_SCALE = { rifle: 12, engineer: 12, scout: 12, tank: 10, harvester: 9.5, aa: 10, elite: 10, fighter: 11, strike: 11, drone: 10, ghost: 10, patrol: 10, frigate: 10 };
Object.assign(UNIT_SCALE, { loiterer: 10, jammer: 10, laser: 10, rocket: 10, apc: 10, supply: 10, destroyer: 9, carrier: 8, submarine: 8 });
const vector = (x, z, y = 0) => new THREE.Vector3(x, y, z);
const makeCanvas = (width, height) => { const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas; };

function particleTexture(smoke = false) {
  const canvas = makeCanvas(128, 128), ctx = canvas.getContext('2d'), image = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const r = Math.hypot(x - 64, y - 64) / 64, noise = hash(Math.floor(x / 4), Math.floor(y / 4)), i = (y * 128 + x) * 4;
    image.data[i] = image.data[i + 1] = image.data[i + 2] = 255;
    image.data[i + 3] = Math.max(0, 1 - r) ** (smoke ? 1.2 : 2.4) * (smoke ? .45 + noise * .55 : .8 + noise * .2) * 255;
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
    this.webgl.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 700 ? 1.5 : 2));
    this.webgl.shadowMap.enabled = true; this.webgl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.webgl.outputColorSpace = THREE.SRGBColorSpace; this.webgl.toneMapping = THREE.ACESFilmicToneMapping; this.webgl.toneMappingExposure = 1.22;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color('#10181d');
    this.viewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 8000);
    this.raycaster = new THREE.Raycaster(); this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const pmrem = new THREE.PMREMGenerator(this.webgl), room = new RoomEnvironment();
    const environment = this.track(pmrem.fromScene(room, .06)); this.scene.environment = environment.texture; this.scene.environmentIntensity = .4; room.dispose(); pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight('#d7e8ef', '#4b4940', 1.55));
    const sun = new THREE.DirectionalLight('#fff2db', 3.2); sun.position.set(this.world.width / 2 - 1750, 2450, this.world.height / 2 - 1520); sun.target.position.set(this.world.width / 2, 0, this.world.height / 2); sun.castShadow = true;
    const shadowSize = innerWidth < 700 ? 2048 : 4096; sun.shadow.mapSize.set(shadowSize, shadowSize);
    Object.assign(sun.shadow.camera, { left: -this.world.width * .7, right: this.world.width * .7, top: this.world.height * .85, bottom: -this.world.height * .85, near: 10, far: 6000 });
    sun.shadow.bias = -.0004; sun.shadow.normalBias = .8; this.scene.add(sun, sun.target);
    this.fireTexture = particleTexture(); this.smokeTexture = particleTexture(true);
    this.createTerrain(); this.createBridges(); this.createEnvironment(); this.createSites(); this.createFog(); this.createOverlays();
    this.createTracks();
    this.resize(); this.centerOn(innerWidth < 700 ? 400 : 470, game.homeY);
  }

  track(resource) { this.ownedResources.push(resource); return resource; }

  box(x, y, z, width, height, depth, material) {
    const mesh = new THREE.Mesh(this.track(new THREE.BoxGeometry(width, height, depth)), material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh); this.bridges.push(mesh); return mesh;
  }

  createTerrain() {
    const canvas = makeCanvas(this.world.width, this.world.height), ctx = canvas.getContext('2d'), image = visualLibrary().ground.image;
    ctx.filter = 'saturate(.8) contrast(.95) brightness(.94)';
    ctx.drawImage(image, 0, 0, this.world.width, this.world.height);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(97,102,79,.12)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const road = (points, width) => {
      const trace = () => { ctx.beginPath(); ctx.moveTo(...points[0]); points.slice(1).forEach(point => ctx.lineTo(...point)); };
      trace(); ctx.lineJoin = 'round'; ctx.strokeStyle = '#686962'; ctx.lineWidth = width + 11; ctx.stroke();
      trace(); ctx.strokeStyle = '#454a4b'; ctx.lineWidth = width; ctx.stroke();
      trace(); ctx.strokeStyle = '#535758'; ctx.lineWidth = width - 7; ctx.stroke();
      ctx.setLineDash([18, 25]); trace(); ctx.strokeStyle = 'rgba(222,218,183,.43)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]);
    };
    const cy = this.game.homeY;
    road([[-20, cy], [520, cy], [this.world.width - 520, cy], [this.world.width + 20, cy]], 54);
    if (this.game.mapId === 'ocean') for (const bridge of this.game.map.bridges) {
      const y = (bridge.y1 + bridge.y2) / 2;
      road([[410, cy], [850, y], [this.world.width - 850, y], [this.world.width - 410, cy]], 36);
    } else road([[410, -20], [680, 350], [930, 545], [1310, 895], [1560, 1090], [1830, 1460]], 30);
    for (let i = 0; i < 1600; i++) {
      const x = hash(i, 11) * this.world.width, y = hash(i, 17) * this.world.height;
      if (Math.abs(y - cy) > 38) continue;
      ctx.strokeStyle = 'rgba(23,29,29,.23)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7, y + 3); ctx.lineTo(x + 14, y - 2); ctx.stroke();
    }
    if (this.game.map.water) {
      const water = this.game.map.water; ctx.fillStyle = '#717563'; ctx.fillRect(water.x1 - 24, 0, water.x2 - water.x1 + 48, this.world.height);
      ctx.fillStyle = '#334044'; ctx.fillRect(water.x1, 0, water.x2 - water.x1, this.world.height);
    } else for (const rect of this.game.map.barriers) {
      ctx.fillStyle = '#242e2c'; ctx.fillRect(rect.x1, rect.y1, rect.x2 - rect.x1, rect.y2 - rect.y1);
      ctx.fillStyle = 'rgba(98,99,84,.55)'; ctx.fillRect(rect.x1 - 12, rect.y1, 22, rect.y2 - rect.y1); ctx.fillRect(rect.x2 - 10, rect.y1, 22, rect.y2 - rect.y1);
    }
    const texture = this.track(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.min(8, this.webgl.capabilities.getMaxAnisotropy()); this.terrainTexture = texture;
    const geometry = this.track(new THREE.PlaneGeometry(this.world.width, this.world.height, 112, 72)); geometry.rotateX(-Math.PI / 2); geometry.translate(this.world.width / 2, 0, this.world.height / 2);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), z = positions.getZ(i); let height = (hash(x, z) - .5) * 1.2;
      if (this.game.map.water && x > this.game.map.water.x1 && x < this.game.map.water.x2) height = -15;
      else if (this.game.map.barriers.some(rect => x > rect.x1 && x < rect.x2 && z > rect.y1 && z < rect.y2)) height = -28;
      positions.setY(i, height);
    }
    geometry.computeVertexNormals();
    const terrain = new THREE.Mesh(geometry, this.track(new THREE.MeshStandardMaterial({ map: texture, roughness: .93, metalness: .015 }))); terrain.receiveShadow = true; this.scene.add(terrain);
    if (this.game.map.water) this.createWater();
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
    if (!this.game.map.bridges.length) return 1;
    const west = this.game.map.water ? this.game.map.water.x1 - 38 : 1010, east = this.game.map.water ? this.game.map.water.x2 + 38 : 1230;
    return x >= west && x <= east && this.game.map.bridges.some(bridge => z >= bridge.y1 && z <= bridge.y2) ? 27 : 1;
  }

  createEnvironment() {
    const points = { tree: [], rock: [] }, forbidden = [...this.game.buildings, ...this.game.ore, ...this.game.oil, ...this.game.beacons];
    for (let i = 0; i < (this.game.mapId === 'ocean' ? 360 : 230); i++) {
      const x = 45 + hash(i, 91) * (this.world.width - 90), z = 40 + hash(i, 193) * (this.world.height - 80);
      if (Math.abs(z - this.game.homeY) < 145 || forbidden.some(item => Math.hypot(item.x - x, item.y - z) < 100)) continue;
      if (this.game.map.noBuild.some(rect => x > rect.x1 - 25 && x < rect.x2 + 25)) continue;
      const kind = hash(i, 71) > .24 ? 'tree' : 'rock'; points[kind].push({ x, z, scale: kind === 'tree' ? 8 + hash(i, 25) * 7 : 12 + hash(i, 45) * 11, angle: hash(i, 33) * TAU });
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
      const mesh = new THREE.InstancedMesh(child.geometry, child.material, transforms.length); mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      transforms.forEach((point, index) => { dummy.position.set(point.x, point.heightOffset ?? 1, point.z); dummy.rotation.set(0, point.angle, 0); dummy.scale.set(point.scale, point.verticalScale || point.scale, point.scale); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
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

  createSites() {
    this.sites = [];
    for (const site of [...this.game.oil, ...this.game.beacons]) {
      const oil = this.game.oil.includes(site), model = createModel(oil ? 'oil' : 'beacon', '#dac17b'); model.scale.setScalar(oil ? 13 : 10);
      const sprite = oil ? this.attachArchitecture(model, 'oil', '#dac17b', 8.5) : null;
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
    this.selectionMaterial = this.track(new THREE.MeshBasicMaterial({ color: '#82e9f2', transparent: true, opacity: .78, depthWrite: false })); this.placement = null;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect(); if (rect.width < 1 || rect.height < 1) return;
    this.viewport = { width: rect.width, height: rect.height }; this.webgl.setSize(rect.width, rect.height, false);
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
  zoomAt(factor, sx, sy) { const before = this.screenToWorld(sx, sy); this.camera.zoom = clamp(this.camera.zoom * factor, .65, 1.85); this.updateCamera(); const after = this.screenToWorld(sx, sy); this.center.x += before.x - after.x; this.center.y += before.y - after.y; this.clampCamera(); this.updateCamera(); }

  createEntity(entity) {
    const color = FACTIONS[this.game.players[entity.owner].faction].color, name = entity.type === 'elite' ? `elite_${this.game.players[entity.owner].faction}` : entity.type;
    const model = createModel(name, color), scale = entity.kind === 'building' ? entity.size / 7.2 : UNIT_SCALE[entity.type]; model.scale.setScalar(scale);
    model.userData.entity = entity;
    const sprite = entity.kind === 'building' && entity.type !== 'turret' ? this.attachArchitecture(model, name, color) : null;
    const ring = new THREE.Mesh(this.selectionGeometry, this.selectionMaterial); ring.visible = false; this.scene.add(model, ring);
    const exhausts = [];
    if (entity.kind === 'unit' && UNITS[entity.type].tags.includes('jet')) for (const z of [-.36, .36]) {
      const exhaust = this.effectSprite('#89c7ff'); exhaust.position.set(-4.2, .42, z); exhaust.scale.set(1.25, .43, 1); model.add(exhaust); exhausts.push(exhaust);
    }
    model.updateMatrixWorld(true);
    const topHeight = entity.kind === 'unit' ? new THREE.Box3().setFromObject(model).max.y : 0;
    const value = { model, ring, entity, scale, sprite, exhausts, topHeight, heading: entity.angle, lastX: entity.x, lastY: entity.y, trackX: entity.x, trackY: entity.y, trailAt: 0, smokeAt: 0, healthEcho: entity.hp / entity.maxHp, healthAt: this.game.time, weapon: model.getObjectByName('weapon') }; this.entities.set(entity.id, value); return value;
  }

  updateEntities(now) {
    const dt = this.game.paused ? 0 : Math.min(.05, Math.max(0, (now - (this.lastEntityFrame ?? now)) / 1000)); this.lastEntityFrame = now;
    const active = new Set();
    for (const entity of [...this.game.buildings, ...this.game.units]) {
      if (entity.hp <= 0) continue; active.add(entity.id);
      const entry = this.entities.get(entity.id) || this.createEntity(entity), visible = this.game.canSeeEntity(0, entity); entry.model.visible = visible;
      const moving = Math.hypot(entity.x - entry.lastX, entity.y - entry.lastY) > .05;
      let height = this.elevation(entity.x, entity.y);
      if (entity.kind === 'unit') {
        const tags = UNITS[entity.type].tags;
        if (tags.includes('jet')) height = 95 + Math.sin(now * .001 + entity.id) * 2;
        else if (tags.includes('drone')) height = 23 + Math.sin(now * .003 + entity.id) * 1.5;
        else if (tags.includes('ship')) height = 2 + Math.sin(now * .002 + entity.id) * .6;
        const turn = Math.atan2(Math.sin(entity.angle - entry.heading), Math.cos(entity.angle - entry.heading));
        entry.heading += turn * (1 - Math.exp(-dt * (tags.includes('infantry') ? 18 : 9)));
        entry.model.rotation.y = -entry.heading;
        if (entry.weapon) entry.weapon.rotation.y = entry.heading - entity.turretAngle;
        if (tags.includes('infantry')) entry.model.rotation.z = moving ? Math.sin(entity.movePulse * 1.8) * .025 : 0;
      } else if (entity.type === 'dock') entry.model.rotation.y = entity.x > this.world.width / 2 ? Math.PI : 0;
      else if (entity.type === 'turret') entry.model.rotation.y = -entity.angle;
      entry.model.position.set(entity.x, height, entity.y);
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
      entry.ring.visible = this.game.selected.includes(entity.id) && visible; entry.ring.position.set(entity.x, this.elevation(entity.x, entity.y) + .65, entity.y);
      if (UNITS[entity.type]?.tags.includes('ship')) entry.ring.position.y = 3;
      const radius = entity.kind === 'building' ? entity.size * .65 : unitRadius(entity) + 4; entry.ring.scale.set(radius, 1, radius);
    }
    for (const [id, entry] of this.entities) if (!active.has(id)) { entry.exhausts.forEach(sprite => sprite.material.dispose()); this.scene.remove(entry.model, entry.ring); this.entities.delete(id); }
    for (const site of this.sites) {
      site.model.visible = this.game.hasExploredFor(0, site.entity.x, site.entity.y);
      if (site.entity.owner !== site.owner) {
        const color = site.entity.owner === null ? '#d5bd7e' : FACTIONS[this.game.players[site.entity.owner].faction].color;
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
    return tags.includes('jet') ? 98 : tags.includes('drone') ? 29 : this.elevation(x, y) + (BUILDINGS[type] ? 28 : 18);
  }

  updateEffects() {
    this.trails = this.trails.filter(trail => {
      const age = this.game.time - trail.start;
      if (age > 1.6) { this.scene.remove(trail.sprite); trail.sprite.material.dispose(); return false; }
      const size = trail.ship ? 25 + age * 13 : 13 + age * 12;
      trail.sprite.scale.set(size, trail.ship ? 8 + age * 4 : size, 1); trail.sprite.material.opacity = (1 - age / 1.6) * (trail.damage ? .38 : .15);
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
        if (effect.type === 'shot') {
          group.userData.fromHeight = this.effectHeight(effect.sourceType, effect.x, effect.y); group.userData.toHeight = this.effectHeight(effect.targetType, effect.toX, effect.toY);
          const color = effect.style === 'laser' ? '#72edff' : effect.style === 'repair' ? '#6dffbd' : effect.style === 'elite' ? '#8ddff0' : '#ffd9a0';
          group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([vector(effect.x, effect.y, group.userData.fromHeight), vector(effect.toX, effect.toY, group.userData.toHeight)]), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })), this.effectSprite(color));
        } else if (['hit', 'explosion'].includes(effect.type)) group.add(this.effectSprite('#ffc177'), this.effectSprite('#f47a34'), this.effectSprite('#465059', true));
        else if (['order', 'build', 'capture', 'ability', 'jam', 'sonar'].includes(effect.type)) group.add(new THREE.Mesh(this.selectionGeometry, new THREE.MeshBasicMaterial({ color: effect.type === 'jam' ? '#c2a4ff' : effect.type === 'sonar' ? '#83ccd9' : effect.owner === 1 ? '#fb7968' : '#8cdff0', transparent: true, depthWrite: false })));
        group.position.set(effect.x, ['hit', 'explosion'].includes(effect.type) ? this.effectHeight(effect.targetType, effect.x, effect.y) : this.elevation(effect.x, effect.y) + 2, effect.y); this.scene.add(group); this.effects.set(effect, group);
        if (effect.type === 'sonar') group.position.y = 3;
      }
      if (effect.type === 'shot') {
        group.position.set(0, 0, 0); group.children[0].material.opacity = (1 - t) * .8; group.children[1].position.set(effect.x + (effect.toX - effect.x) * t, group.userData.fromHeight + (group.userData.toHeight - group.userData.fromHeight) * t + Math.sin(t * Math.PI) * 6, effect.y + (effect.toY - effect.y) * t); group.children[1].scale.setScalar(9 * (1 - t));
      } else if (['hit', 'explosion'].includes(effect.type)) {
        const size = effect.type === 'explosion' ? effect.size * 1.25 : 20;
        group.children.forEach((sprite, i) => { const smoke = i === 2; sprite.position.set(Math.sin(i * 3.1) * size * t * .15, size * t * (smoke ? .65 : .22), Math.cos(i * 3.1) * size * t * .1); sprite.scale.setScalar(size * (.3 + t * (smoke ? 1.3 : .6))); sprite.material.opacity = smoke ? Math.sin(t * Math.PI) * .72 : (1 - t) ** 1.5; });
      } else if (group.children[0]) { const pulse = ['jam', 'sonar'].includes(effect.type), radius = pulse ? effect.size * t : effect.type === 'ability' ? 245 * Math.min(1, t * 2) : 10 + t * 24; group.children[0].scale.set(radius, 1, radius); group.children[0].material.opacity = (1 - t) * (pulse ? .3 : 1); }
    }
    for (const [effect, group] of this.effects) if (!current.has(effect)) { group.traverse(item => { if (item.geometry && item.geometry !== this.selectionGeometry) item.geometry.dispose(); if (item.material) item.material.dispose(); }); this.scene.remove(group); this.effects.delete(effect); }
  }

  updateProjectileModels(now) {
    const active = new Set();
    for (const p of this.game.projectiles) {
      if (p.finished) continue;
      active.add(p.id);
      let model = this.projectileModels.get(p.id);
      if (!model) {
        const color = FACTIONS[this.game.players[p.owner].faction].color;
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
        this.scene.add(model); this.projectileModels.set(p.id, model);
      }
      model.visible = p.owner === 0 || this.game.isVisibleFor(0, p.x, p.y);
      const span = Math.hypot(p.toX - p.startX, p.toY - p.startY) || 1, progress = Math.min(1, Math.hypot(p.x - p.startX, p.y - p.startY) / span);
      const height = p.kind === 'wing' ? 88 + Math.sin(now * .004 + p.id) * 2 : p.kind === 'torpedo' ? 2 : p.kind === 'rocket' ? 22 + Math.sin(progress * Math.PI) * 135 : 35;
      model.position.set(p.x, height, p.y); model.rotation.y = -p.angle;
    }
    for (const [id, model] of this.projectileModels) if (!active.has(id)) { model.children.at(-1)?.material?.dispose(); this.scene.remove(model); this.projectileModels.delete(id); }
  }

  drawOverlay() {
    const ctx = this.overlay; ctx.clearRect(0, 0, this.viewport.width, this.viewport.height);
    const selected = new Set(this.game.selected), bars = [], viewportRect = this.canvas.getBoundingClientRect();
    const obstacles = [...this.canvas.parentElement.querySelectorAll('.battle-hud, .command-toolbar, .compact-radar:not([hidden]), .toast')].map(element => {
      const rect = element.getBoundingClientRect(); return { x: rect.x - viewportRect.x, y: rect.y - viewportRect.y, width: rect.width, height: rect.height };
    });
    for (const entry of this.entities.values()) {
      const { entity, model, scale, sprite } = entry, ratio = clamp(entity.hp / entity.maxHp, 0, 1), hovered = this.hoveredId === entity.id, isSelected = selected.has(entity.id);
      const elapsed = Math.max(0, this.game.time - entry.healthAt); entry.healthAt = this.game.time;
      entry.healthEcho = Math.max(ratio, entry.healthEcho - elapsed * .24);
      if (!model.visible || ratio === 1 && !isSelected && !hovered) continue;
      let screen;
      if (sprite) { screen = this.worldToScreen(entity.x, entity.y + sprite.position.z * scale, model.position.y + sprite.position.y * scale); screen.y -= sprite.scale.y * scale * this.camera.zoom + 7; }
      else screen = this.worldToScreen(entity.x, entity.y, model.position.y + entry.topHeight + 9);
      if (screen.x < 0 || screen.x > this.viewport.width || screen.y < 0 || screen.y > this.viewport.height) continue;
      const infantry = entity.kind === 'unit' && UNITS[entity.type].tags.includes('infantry'), ammo = UNITS[entity.type]?.ammo;
      const numeric = hovered || isSelected && selected.size === 1;
      bars.push({ id: entity.id, entity, ratio, echo: entry.healthEcho, selected: isSelected, numeric, ammo, anchorX: screen.x, anchorY: screen.y, width: entity.kind === 'building' ? 76 : infantry ? 28 : 50, height: 10 + (numeric ? 12 : 0) + (ammo ? 6 : 0), priority: isSelected ? 4 : hovered ? 3 : entity.owner === 1 ? 2 : 1 });
    }
    this.healthBars = layoutHealthBars(bars, this.viewport, obstacles);
    for (const bar of this.healthBars) {
      const { entity, x, y, width, numeric, ammo, selected: isSelected } = bar, top = y + (numeric ? 12 : 0), color = bar.ratio > .5 ? '#81e3b5' : bar.ratio > .25 ? '#f3c66e' : '#fc7e70';
      if (Math.abs(x + width / 2 - bar.anchorX) > 2 || Math.abs(y + bar.height - bar.anchorY) > 2) {
        ctx.strokeStyle = isSelected ? '#9cc8d98f' : '#83979c66'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x + width / 2, y + bar.height); ctx.lineTo(bar.anchorX, bar.anchorY + 4); ctx.stroke();
      }
      if (numeric) { ctx.font = '500 10px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = '#0b1218'; const label = `${Math.ceil(entity.hp)}/${Math.ceil(entity.maxHp)}`; ctx.strokeText(label, x + width / 2, y + 9); ctx.fillStyle = '#e5f4f4'; ctx.fillText(label, x + width / 2, y + 9); }
      ctx.fillStyle = '#081116ed'; ctx.fillRect(x, top, width, 9); ctx.strokeStyle = isSelected ? '#b6edf4' : '#657a8299'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, top + .5, width - 1, 8);
      ctx.fillStyle = entity.owner === 0 ? '#91d9ed' : '#ff8d81'; ctx.fillRect(x + 2, top + 2, 3, 5);
      const innerWidth = width - 10;
      ctx.fillStyle = '#b8a981'; ctx.fillRect(x + 7, top + 2, innerWidth * bar.echo, 5);
      ctx.fillStyle = color; ctx.fillRect(x + 7, top + 2, innerWidth * bar.ratio, 5);
      ctx.fillStyle = '#0c191b77'; const segments = entity.kind === 'building' ? 10 : width < 30 ? 4 : 6;
      for (let i = 1; i < segments; i++) ctx.fillRect(Math.round(x + 7 + innerWidth * i / segments), top + 2, 1, 5);
      if (ammo) for (let i = 0; i < ammo; i++) { ctx.fillStyle = i < entity.ammo ? '#c8ddec' : '#273a47'; ctx.fillRect(x + 2 + i * (width - 4) / ammo, top + 11, Math.max(1, (width - 4) / ammo - 2), 3); }
    }
    if (this.dragBox) {
      const a = this.worldToScreen(this.dragBox.start.x, this.dragBox.start.y), b = this.worldToScreen(this.dragBox.end.x, this.dragBox.end.y); ctx.fillStyle = 'rgba(104,220,239,.1)'; ctx.strokeStyle = '#8de5f0'; ctx.lineWidth = 1; ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
    }
    for (const effect of this.game.effects) if (effect.type === 'income' && this.game.isVisibleFor(0, effect.x, effect.y)) {
      const point = this.worldToScreen(effect.x, effect.y, 20 + effect.age / effect.duration * 32); ctx.font = '600 13px "Noto Sans SC",sans-serif'; ctx.fillStyle = '#e9cd90'; ctx.textAlign = 'center'; ctx.fillText(`+${effect.amount}`, point.x, point.y);
    }
    if (this.pointer && (this.game.pendingAbility || this.game.orderMode === 'attackMove')) {
      const point = this.worldToScreen(this.pointer.x, this.pointer.y); ctx.strokeStyle = '#c4edf2'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(point.x, point.y, 18, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(point.x - 26, point.y); ctx.lineTo(point.x + 26, point.y); ctx.moveTo(point.x, point.y - 26); ctx.lineTo(point.x, point.y + 26); ctx.stroke();
    }
  }

  updatePlacement() {
    const type = this.game.pendingBuilding;
    if (this.placement && this.placement.type !== type) { this.scene.remove(this.placement.model); this.placement = null; }
    if (!type || !this.pointer) { if (this.placement) this.placement.model.visible = false; return; }
    if (!this.placement) {
      const model = createModel(type), sprite = type !== 'turret' ? this.attachArchitecture(model, type, '#59d7ec') : null;
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
    this.webgl.render(this.scene, this.viewCamera); this.drawOverlay();
    if (now - this.lastMinimap >= 180) { this.drawMinimap(); this.lastMinimap = now; }
  }

  drawMinimap() {
    const ctx = this.mctx, width = this.minimap.width, height = this.minimap.height; ctx.clearRect(0, 0, width, height);
    if (!this.game.hasRadarIntel(0)) {
      ctx.fillStyle = '#0e171d'; ctx.fillRect(0, 0, width, height); ctx.strokeStyle = '#263842'; ctx.lineWidth = 1;
      for (let y = 0; y < height; y += 12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke(); }
      ctx.fillStyle = '#95abb4'; ctx.font = '500 12px "Noto Sans SC",sans-serif'; ctx.textAlign = 'center'; ctx.fillText(this.game.hasBuilding(0, 'radar') ? '电力不足 · 雷达离线' : '雷达站未建造', width / 2, height / 2); return;
    }
    ctx.drawImage(this.terrainTexture.image, 0, 0, width, height);
    const sx = width / this.world.width, sy = height / this.world.height;
    if (this.game.map.water) { const water = this.game.map.water; ctx.fillStyle = '#315662'; ctx.fillRect(water.x1 * sx, 0, (water.x2 - water.x1) * sx, height); }
    for (const bridge of this.game.map.bridges) { ctx.fillStyle = '#a0a296'; ctx.fillRect((this.game.map.water ? this.game.map.water.x1 - 38 : 1010) * sx, bridge.y1 * sy, (this.game.map.water ? this.game.map.water.x2 - this.game.map.water.x1 + 76 : 220) * sx, (bridge.y2 - bridge.y1) * sy); }
    for (const ore of this.game.ore) if (ore.amount > 0) { ctx.fillStyle = ore.kind === 'gem' ? '#93b9b8' : '#c6ae75'; ctx.fillRect(ore.x * sx - 2, ore.y * sy - 2, 4, 4); }
    for (const site of [...this.game.oil, ...this.game.beacons]) { ctx.fillStyle = site.owner === null ? '#dcc998' : FACTIONS[this.game.players[site.owner].faction].color; ctx.fillRect(site.x * sx - 2, site.y * sy - 2, 5, 5); }
    for (const entity of [...this.game.buildings, ...this.game.units]) if (entity.hp > 0 && this.game.canSeeEntity(0, entity)) { ctx.fillStyle = FACTIONS[this.game.players[entity.owner].faction].color; const size = entity.kind === 'building' ? 5 : 2.5; ctx.fillRect(entity.x * sx - size / 2, entity.y * sy - size / 2, size, size); }
    ctx.drawImage(this.fogCanvas, 0, 0, width, height);
    const a = this.screenToWorld(0, 0), b = this.screenToWorld(this.viewport.width, this.viewport.height); ctx.strokeStyle = '#d5edf0'; ctx.lineWidth = 1; ctx.strokeRect(a.x * sx, a.y * sy, (b.x - a.x) * sx, (b.y - a.y) * sy);
  }

  dispose() {
    this.projectileModels.forEach(model => model.children.at(-1)?.material?.dispose());
    this.trails.forEach(trail => trail.sprite.material.dispose());
    this.entities.forEach(entry => entry.exhausts.forEach(sprite => sprite.material.dispose()));
    this.ownedResources.forEach(resource => resource.dispose());
    this.effects.forEach(group => group.traverse(item => { if (item.geometry && item.geometry !== this.selectionGeometry) item.geometry.dispose(); if (item.material) item.material.dispose(); }));
    this.fireTexture.dispose(); this.smokeTexture.dispose(); this.overlayCanvas.remove(); this.webgl.dispose();
  }
}
