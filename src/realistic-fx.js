import * as THREE from 'three';
import { impactProfile, tracerEndpoints } from './visual-detail.js';
import { createCraterDebris, conformGroundMark } from './community-visuals.js';

const noise = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return n - Math.floor(n); };
const point = (x, y, h) => new THREE.Vector3(x, h, y);

export const realisticEffects = {
  createCombatAtmosphere() {
    // 固定数量的灯光避免每次交火都改变着色器配置；地面痕迹使用有上限的实例池。
    this.flashLights = Array.from({ length: 4 }, () => {
      const light = new THREE.PointLight('#ffb66b', 0, 260, 2); this.scene.add(light);
      return { light, until: 0, start: 0, power: 0 };
    });
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(128, 128);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const i = (y * 128 + x) * 4, angle = Math.atan2(y - 64, x - 64);
      const edge = .85 + Math.sin(angle * 7) * .07 + Math.cos(angle * 11) * .06;
      const r = Math.hypot(x - 64, y - 64) / (64 * edge);
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = 255;
      pixels.data[i + 3] = Math.max(0, 1 - r) ** .75 * (noise(Math.floor(x / 4), Math.floor(y / 4)) * .35 + .65) * 245;
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = this.track(new THREE.CanvasTexture(canvas));
    const geometry = this.track(new THREE.PlaneGeometry(1, 1, 8, 8)); geometry.rotateX(-Math.PI / 2);
    // 网格焦痕沿真实地形高度投影，起伏地面也不会将平面贴花吞入地下。
    const material = this.track(conformGroundMark(new THREE.MeshBasicMaterial({ map: texture, color: '#171a17', opacity: .85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), this.game));
    this.scorchMesh = new THREE.InstancedMesh(geometry, material, 80); this.scorchMesh.count = 0; this.scorchMesh.frustumCulled = false;
    this.scorchMarks = []; this.scorchCursor = 0; this.scorchDummy = new THREE.Object3D(); this.scene.add(this.scorchMesh);
    const rim = this.track(createCraterDebris());
    const earth = this.track(new THREE.MeshStandardMaterial({ color: '#69685e', roughness: 1 }));
    this.craterMesh = new THREE.InstancedMesh(rim, earth, 80); this.craterMesh.count = 0; this.craterMesh.frustumCulled = false; this.craterMesh.receiveShadow = true; this.scene.add(this.craterMesh);
  },

  combatFlash(x, y, height, color, power, seconds) {
    const slot = this.flashLights.find(s => s.until <= this.game.time) || this.flashLights.reduce((a, b) => a.until < b.until ? a : b);
    slot.light.position.set(x, height, y); slot.light.color.set(color); slot.start = this.game.time; slot.until = this.game.time + seconds; slot.power = power;
  },

  updateCombatAtmosphere() {
    for (const slot of this.flashLights) {
      const life = Math.max(0, (slot.until - this.game.time) / Math.max(.001, slot.until - slot.start));
      slot.light.intensity = this.game.isVisibleFor(0, slot.light.position.x, slot.light.position.z) ? slot.power * life ** 2 : 0;
    }
    let count = 0;
    for (const mark of this.scorchMarks) {
      const age = this.game.time - mark.start;
      if (age >= 35 || !this.game.isVisibleFor(0, mark.x, mark.y)) continue;
      const d = this.scorchDummy; d.position.set(mark.x, this.elevation(mark.x, mark.y) + .2, mark.y);
      d.rotation.y = mark.angle; d.scale.set(mark.size * Math.min(1, (35 - age) / 8), 1, mark.size * .75); d.updateMatrix();
      this.scorchMesh.setMatrixAt(count++, d.matrix);
      d.position.y += .15; d.scale.y = mark.size * .65; d.updateMatrix(); this.craterMesh.setMatrixAt(count - 1, d.matrix);
    }
    this.scorchMesh.count = count; this.scorchMesh.instanceMatrix.needsUpdate = true;
    this.craterMesh.count = count; this.craterMesh.instanceMatrix.needsUpdate = true;
  },

  createWeaponEffect(effect, group) {
    const from = this.effectHeight(effect.sourceType, effect.x, effect.y), to = this.effectHeight(effect.targetType, effect.toX, effect.toY);
    const color = ['laser', 'robotPulse'].includes(effect.style) ? '#85eaff' : effect.style === 'repair' ? '#77dcb7' : effect.style === 'railgun' ? '#b9e9f5' : '#ffcf91';
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([point(effect.x, effect.y, from), point(effect.toX, effect.toY, to)]), new THREE.LineBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const flash = this.effectSprite('#fff0c5'), flare = this.effectSprite(color);
    group.add(line, flash, flare); group.userData.weapon = { from, to, color };
    const { muzzle, beam } = tracerEndpoints(effect), x = effect.x + (effect.toX - effect.x) * muzzle, y = effect.y + (effect.toY - effect.y) * muzzle;
    if (effect.style !== 'repair') this.combatFlash(x, y, from, color, beam ? 1600 : effect.sourceType === 'tank' ? 6500 : 1200, .09);
    if (!beam && this.trails.length < 120) {
      const smoke = this.effectSprite('#7b776c', true); smoke.position.set(x, from, y); smoke.scale.setScalar(effect.sourceType === 'tank' ? 15 : 5); smoke.material.opacity = .24;
      this.scene.add(smoke); this.trails.push({ sprite: smoke, baseY: from, start: this.game.time, muzzle: true });
    }
  },

  animateWeaponEffect(effect, group) {
    const { from, to, color } = group.userData.weapon, { muzzle, beam, head, tail, flash } = tracerEndpoints(effect), t = effect.age / effect.duration;
    group.position.set(0, 0, 0);
    const [line, core, flare] = group.children, positions = line.geometry.attributes.position;
    for (const [i, progress] of [[0, tail], [1, head]]) positions.setXYZ(i, effect.x + (effect.toX - effect.x) * progress, from + (to - from) * progress, effect.y + (effect.toY - effect.y) * progress);
    positions.needsUpdate = true; line.material.opacity = beam ? (1 - t) * .75 : Math.sin(Math.min(1, t * 2) * Math.PI / 2);
    const x = effect.x + (effect.toX - effect.x) * muzzle, y = effect.y + (effect.toY - effect.y) * muzzle;
    const size = effect.sourceType === 'tank' ? 20 : beam ? 9 : 6;
    core.position.set(x, from, y); core.scale.set(size * flash, size * .65 * flash, 1); core.material.opacity = flash;
    flare.material.color.set(color); flare.position.copy(core.position); flare.scale.set(size * flash * 1.8, size * flash * .55, 1); flare.material.opacity = flash * .55;
  },

  createImpactEffect(effect, group) {
    const profile = impactProfile(effect); group.userData.impact = profile;
    group.add(this.effectSprite(profile.fire), this.effectSprite(profile.energy ? '#d7faff' : '#fff3c8'));
    for (let i = 0; i < profile.smoke; i++) {
      const puff = this.effectSprite(profile.water ? '#cbdedc' : i % 2 ? '#7a746b' : '#404747', true);
      puff.material.rotation = noise(i, effect.x) * Math.PI * 2; group.add(puff);
    }
    const positions = new Float32Array(profile.particles * 3);
    const sparks = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(positions, 3)), new THREE.PointsMaterial({ color: profile.water ? '#e1eeeb' : profile.energy ? '#a5eeff' : '#f0c792', size: profile.explosion ? 2 : 1.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    sparks.frustumCulled = false; group.add(sparks);
    const geometry = new THREE.RingGeometry(.73, 1, 64); geometry.rotateX(-Math.PI / 2);
    group.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: profile.water ? '#b5d5d5' : '#918c7b', opacity: 0, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    this.combatFlash(effect.x, effect.y, this.effectHeight(effect.targetType, effect.x, effect.y), profile.fire, profile.explosion ? 16000 : 1400, profile.explosion ? .22 : .08);
    const tags = ['fighter', 'strike', 'drone', 'ghost', 'aegis', 'bomber', 'airlift', 'navalFighter', 'navalStrike', 'freightPlane'];
    if (profile.explosion && !profile.water && !tags.includes(effect.targetType)) {
      this.scorchMarks[this.scorchCursor] = { x: effect.x, y: effect.y, size: Math.min(190, profile.radius * 1.65), angle: noise(effect.x, effect.y) * Math.PI * 2, start: this.game.time };
      this.scorchCursor = (this.scorchCursor + 1) % 80;
    }
    if (profile.explosion && this.trails.length < 100) for (let i = 0; i < 4; i++) {
      const smoke = this.effectSprite(profile.water ? '#bbd3d4' : '#51534f', true), a = i * 2.399;
      smoke.position.set(effect.x + Math.cos(a) * profile.radius * .25, this.elevation(effect.x, effect.y) + profile.radius * .25, effect.y + Math.sin(a) * profile.radius * .25);
      smoke.scale.setScalar(profile.radius * .6); this.scene.add(smoke);
      this.trails.push({ sprite: smoke, baseY: smoke.position.y, start: this.game.time, damage: true, explosionSize: profile.radius });
    }
  },

  animateImpactEffect(effect, group) {
    const p = group.userData.impact, t = Math.min(1, effect.age / effect.duration), r = p.radius;
    const hot = Math.max(0, 1 - t * (p.explosion ? 3.4 : 4.6));
    group.children[0].scale.setScalar(r * (.5 + t)); group.children[0].material.opacity = hot * .9;
    group.children[1].scale.setScalar(r * .5 * hot); group.children[1].material.opacity = hot ** 2;
    for (let i = 0; i < p.smoke; i++) {
      const puff = group.children[i + 2], a = i * 2.399, spread = r * t * .6;
      puff.position.set(Math.cos(a) * spread, r * t * (.3 + noise(i, effect.x) * .65), Math.sin(a) * spread);
      puff.scale.setScalar(r * (.35 + t * (p.water ? 1.1 : 1.5))); puff.material.opacity = Math.sin(t * Math.PI) * (p.explosion ? .68 : .36);
    }
    const sparks = group.children[2 + p.smoke], positions = sparks.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const a = i * 2.399, velocity = r * (1 + noise(i, effect.x) * .9);
      positions.setXYZ(i, Math.cos(a) * velocity * t, velocity * t * (.5 + noise(i, effect.y)) - r * t * t * 2.1, Math.sin(a) * velocity * t);
    }
    positions.needsUpdate = true; sparks.material.opacity = (1 - t) ** 2;
    const wave = group.children.at(-1); wave.position.y = -group.position.y + this.elevation(effect.x, effect.y) + 1.2;
    wave.scale.setScalar(r * (.35 + t * 2.4)); wave.material.opacity = (1 - t) ** 3 * (p.explosion ? .35 : .12);
  }
};
