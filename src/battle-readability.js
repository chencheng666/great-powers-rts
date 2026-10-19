import * as THREE from 'three';

export const BATTLE_READABILITY = Object.freeze({
  groundFilter: 'saturate(1.05) contrast(1.12) brightness(.72)',
  lunarFilter: 'saturate(.45) contrast(1.08) brightness(.66)',
  rimStrength: .09,
  infantryRimStrength: .18,
});

const coatings = new Set(['装甲钢', '航空涂层', '建筑面板', '屋顶', '战术织物', '携行具', '作战服']);

export function readableMaterial(source, infantry = false) {
  if (!source.isMeshStandardMaterial || source.transparent || source.colorWrite === false) return source;
  const material = source.clone();
  if (coatings.has(source.name)) {
    material.color.lerp(new THREE.Color('#b4c0ba'), infantry ? .13 : .06);
  }
  // 保留原有迷彩和磨损着色，仅在掠视边缘补入冷色反射光。
  const compile = source.onBeforeCompile, cacheKey = source.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
float silhouetteLight = pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 3.0);
outgoingLight += vec3(.68, .82, .88) * silhouetteLight * ${infantry ? BATTLE_READABILITY.infantryRimStrength : BATTLE_READABILITY.rimStrength};
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:战场辨识度:${infantry ? '步兵' : '装备'}:1`;
  return material;
}

export function identityRadius(entity, tags = []) {
  if (entity.kind === 'building') return entity.size * .55;
  return tags.includes('infantry') ? 8 : tags.includes('ship') ? 35 : tags.includes('air') ? 20 : 27;
}

export function identityVisible(entity, visible, submerged = false) {
  return visible && entity.hp > 0 && !entity.embarkedIn && !submerged;
}
