import * as THREE from 'three';

// 保留原模型关节与选取，只把可重复的不透明网格提交合并到实例批次。
export class ArmyBatches {
  constructor(scene) {
    this.scene = scene;
    this.batches = new Map();
    this.masked = [];
    this.frame = 0;
    this.stats = { sources: 0, batches: 0 };
  }

  restore() {
    for (const [mesh, mask] of this.masked) mesh.layers.mask = mask;
    this.masked.length = 0;
  }

  update(entries, visibleIds) {
    this.restore();
    this.frame++;
    const groups = new Map();
    for (const entry of entries) {
      if (entry.entity.kind !== 'unit' || !entry.model.visible) continue;
      entry.model.updateMatrixWorld(true);
      entry.model.traverseVisible(mesh => {
        if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isSkinnedMesh || Array.isArray(mesh.material) ||
            mesh.material.transparent || mesh.material.opacity < 1 || mesh.morphTargetInfluences?.length) return;
        this.masked.push([mesh, mesh.layers.mask]);
        mesh.layers.set(1);
        if (!visibleIds.has(entry.entity.id)) return;
        const key = `${mesh.geometry.uuid}:${mesh.material.uuid}:${Number(mesh.castShadow)}:${Number(mesh.receiveShadow)}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(mesh);
      });
    }
    let sources = 0;
    for (const [key, meshes] of groups) {
      let batch = this.batches.get(key);
      if (!batch || batch.capacity < meshes.length) {
        if (batch) { this.scene.remove(batch.mesh); batch.mesh.dispose(); }
        const capacity = Math.max(8, 2 ** Math.ceil(Math.log2(meshes.length)));
        const source = meshes[0], mesh = new THREE.InstancedMesh(source.geometry, source.material, capacity);
        mesh.name = '军团共享绘制'; mesh.castShadow = source.castShadow; mesh.receiveShadow = source.receiveShadow;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // 入口已按实体与视口裁剪，不使用可能过期的实例包围球。
        mesh.frustumCulled = false;
        this.scene.add(mesh); batch = { mesh, capacity, usedAt: this.frame }; this.batches.set(key, batch);
      }
      batch.usedAt = this.frame; batch.mesh.visible = true; batch.mesh.count = meshes.length;
      meshes.forEach((mesh, i) => batch.mesh.setMatrixAt(i, mesh.matrixWorld));
      batch.mesh.instanceMatrix.needsUpdate = true;
      sources += meshes.length;
    }
    for (const [key, batch] of this.batches) if (batch.usedAt !== this.frame) {
      batch.mesh.visible = false; batch.mesh.count = 0;
      if (this.frame - batch.usedAt > 120) { this.scene.remove(batch.mesh); batch.mesh.dispose(); this.batches.delete(key); }
    }
    this.stats = { sources, batches: groups.size };
  }

  dispose() {
    this.restore();
    for (const batch of this.batches.values()) { this.scene.remove(batch.mesh); batch.mesh.dispose(); }
    this.batches.clear();
  }
}

export function armyRenderBudget(quality, count, pixelRatio = 1) {
  const dense = count > 144;
  return {
    pixelRatio: Math.min(pixelRatio, quality === 'standard' ? 1 : dense ? 1.25 : 1.75),
    shadowSize: quality === 'standard' || dense ? 2048 : 4096,
    shadowInterval: dense ? 50 : 0,
  };
}
