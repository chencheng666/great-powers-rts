import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createModel } from './visual-assets.js';

export function modelFitDistance(bounds, camera, margin = .84) {
  const direction = camera.position.clone().normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const vertical = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  let distance = 3.5;
  // 逐角点匹配透视视锥，倾斜镜头下也为基座和天线留出边距。
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const point = new THREE.Vector3(x, y, z);
    distance = Math.max(distance, point.dot(direction) + Math.max(Math.abs(point.dot(right)) / (vertical * camera.aspect * margin), Math.abs(point.dot(up)) / (vertical * margin)));
  }
  return distance;
}

export class CatalogPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene(); this.scene.add(new THREE.HemisphereLight('#e2eff2', '#46514c', 2.4));
    const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environmentTarget = pmrem.fromScene(room, .04); this.scene.environment = this.environmentTarget.texture;
    this.scene.environmentIntensity = .45; room.dispose(); pmrem.dispose();
    const light = new THREE.DirectionalLight('#fff1d8', 3.5); light.position.set(-5, 8, 5); this.scene.add(light);
    this.camera = new THREE.PerspectiveCamera(38, 1, .01, 200);
    this.controls = new OrbitControls(this.camera, canvas); this.controls.enablePan = false; this.controls.enableDamping = true;
    this.controls.autoRotateSpeed = 1.2; this.controls.minDistance = 3; this.controls.maxDistance = 14;
    this.controls.maxPolarAngle = Math.PI * .85;
    this.controls.addEventListener('start', () => { this.controls.autoRotate = false; this.onRotate?.(false); });
    this.clock = new THREE.Clock();
    this.resizeObserver = new ResizeObserver(() => { this.resize(); }); this.resizeObserver.observe(canvas.parentElement);
  }
  show(entry) {
    if (this.model) this.scene.remove(this.model);
    // 模型资源由公共素材库持有，切换图鉴时不销毁共享几何和材质。
    this.model = createModel(entry.model); const box = new THREE.Box3().setFromObject(this.model), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    const scale = 3 / Math.max(size.x, size.y, size.z); this.model.scale.multiplyScalar(scale); this.model.position.sub(center).multiplyScalar(scale);
    this.scene.add(this.model); this.bounds = new THREE.Box3().setFromObject(this.model); this.resize();
  }
  reset() {
    const { autoRotate, enableDamping } = this.controls;
    this.controls.autoRotate = false; this.controls.enableDamping = false; this.controls.update();
    this.controls.target.set(0, 0, 0); this.camera.position.set(3.2, 2.3, 3.2); this.controls.update();
    if (this.bounds) this.camera.position.setLength(modelFitDistance(this.bounds, this.camera));
    this.controls.update(); this.resetDistance = this.camera.position.length();
    this.controls.autoRotate = autoRotate; this.controls.enableDamping = enableDamping;
  }
  resize() { const rect = this.canvas.parentElement.getBoundingClientRect(); if (rect.width <= 0 || rect.height <= 0) return; this.renderer.setSize(rect.width, rect.height, false); this.camera.aspect = rect.width / rect.height; this.camera.updateProjectionMatrix(); if (this.model) this.reset(); }
  zoom(factor) { this.camera.position.multiplyScalar(factor); this.controls.update(); }
  start() {
    this.stop(); this.clock.start();
    const frame = () => { this.controls.update(Math.min(.05, this.clock.getDelta())); this.renderer.render(this.scene, this.camera); this.frame = requestAnimationFrame(frame); }; frame();
  }
  stop() { cancelAnimationFrame(this.frame); this.frame = null; this.clock.stop(); }
}
