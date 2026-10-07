import * as THREE from 'three';

// 原创游戏几何，不使用其他游戏模型，也不代表真实航天器或武器参数。
export function createSpaceAircraft(type) {
  const model = new THREE.Group(); model.name = `space_${type}`;
  const shell = new THREE.MeshStandardMaterial({ color: '#c3d0cc', roughness: .48, metalness: .55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#253b3b', roughness: .58, metalness: .65 });
  const team = new THREE.MeshStandardMaterial({ color: '#69dfef', emissive: '#69dfef', emissiveIntensity: .5 }); team.name = '阵营标识';
  const glow = new THREE.MeshStandardMaterial({ color: '#f3c787', emissive: '#eaae61', emissiveIntensity: .75 });
  const mesh = (geometry, material, x, y, z, rotation = null) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z); if (rotation) m.rotation.set(...rotation); m.castShadow = true; m.receiveShadow = true; model.add(m); return m; };
  const heavy = ['bomber', 'airlift', 'freightPlane'].includes(type), length = heavy ? 9.4 : 7.5;
  mesh(new THREE.CapsuleGeometry(heavy ? .8 : .54, length - 2, 6, 16), shell, 0, .65, 0, [0, 0, -Math.PI / 2]);
  const nose = mesh(new THREE.ConeGeometry(heavy ? .8 : .54, 1.8, 16), dark, length / 2, .65, 0, [0, 0, -Math.PI / 2]); nose.scale.z = .7;
  for (const z of [-1, 1]) {
    mesh(new THREE.BoxGeometry(heavy ? 5.2 : 3.8, .34, .8), dark, -.8, .5, z * (heavy ? 1.9 : 1.2));
    mesh(new THREE.CapsuleGeometry(.33, heavy ? 4.8 : 3.5, 4, 12), shell, -1.3, .4, z * (heavy ? 2.3 : 1.6), [0, 0, -Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(.38, .23, .42, 12), dark, -length / 2, .4, z * (heavy ? 2.3 : 1.6), [0, 0, Math.PI / 2]);
    mesh(new THREE.CylinderGeometry(.24, .18, .12, 12), glow, -length / 2 - .26, .4, z * (heavy ? 2.3 : 1.6), [0, 0, Math.PI / 2]);
    for (const x of [-2.7, -.8, 1.1]) {
      mesh(new THREE.BoxGeometry(.8, .22, .5), shell, x, .35, z * (heavy ? 3 : 2.2));
      mesh(new THREE.CylinderGeometry(.18, .18, .4, 10), team, x, .36, z * (heavy ? 3.25 : 2.45), [Math.PI / 2, 0, 0]);
    }
    mesh(new THREE.BoxGeometry(length * .58, .05, .15), team, -.3, heavy ? 1.43 : 1.2, z * .27);
  }
  for (let x = -3.2; x < 3; x += .6) mesh(new THREE.BoxGeometry(.035, .05, heavy ? 1.5 : .95), dark, x, heavy ? 1.5 : 1.2, 0);
  if (type === 'bomber') for (const z of [-.6, .6]) mesh(new THREE.BoxGeometry(3.9, .4, .52), dark, -.2, -.18, z);
  if (['airlift', 'freightPlane'].includes(type)) for (let x = -2.3; x <= 2.3; x += 1.5) mesh(new THREE.BoxGeometry(1.25, 1, 1.7), dark, x, -.3, 0);
  if (['fighter', 'aegis'].includes(type)) for (const z of [-.7, .7]) mesh(new THREE.CylinderGeometry(.14, .14, 3.2, 12), dark, 2.5, .2, z, [0, 0, -Math.PI / 2]);
  if (type === 'strike') for (const z of [-.95, .95]) {
    mesh(new THREE.BoxGeometry(2.7, .5, .6), dark, .4, .1, z);
    mesh(new THREE.BoxGeometry(.4, .2, .45), glow, 1.8, .1, z);
  }
  if (type === 'ewPlane') {
    mesh(new THREE.CylinderGeometry(.65, .65, .2, 20), dark, -.8, 1.3, 0);
    mesh(new THREE.BoxGeometry(2.4, .25, .65), team, -.8, 1.55, 0);
    for (const z of [-1, 1]) mesh(new THREE.BoxGeometry(2.8, .6, .45), dark, .8, .75, z * 1.5);
  }
  if (type === 'aegis') {
    mesh(new THREE.SphereGeometry(.45, 16, 10), team, 1.6, 1.1, 0);
    for (const z of [-1, 1]) mesh(new THREE.BoxGeometry(1.3, .7, .7), dark, -.7, .9, z * 1.5);
  }
  return model;
}

export function attachCamouflageCanopy(model, track) {
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 128; y += 8) for (let x = 0; x < 128; x += 8) { ctx.fillStyle = ['#3c5131', '#6d7551', '#23352b'][(x * 7 + y * 11) % 24 / 8 | 0]; ctx.fillRect(x + 1, y + 1, 6, 6); }
  const texture = track(new THREE.CanvasTexture(canvas)); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(4, 3);
  const material = track(new THREE.MeshStandardMaterial({ map: texture, transparent: true, alphaTest: .4, side: THREE.DoubleSide, roughness: .95 }));
  const net = new THREE.Mesh(track(new THREE.PlaneGeometry(size.x * .7, size.z * .65)), material); net.rotation.x = -Math.PI / 2;
  net.position.set(center.x, bounds.max.y + .18, center.z); net.castShadow = true; model.add(net);
}
