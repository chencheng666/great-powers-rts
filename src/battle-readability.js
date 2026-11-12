import * as THREE from 'three';

export const BATTLE_READABILITY = Object.freeze({
  groundFilter: 'saturate(.70) contrast(.78) brightness(.86)',
  lunarFilter: 'saturate(.45) contrast(1.08) brightness(.66)',
  rimStrength: .09,
  infantryRimStrength: .34,
});

const coatings = new Set(['装甲钢', '航空涂层', '建筑面板', '屋顶', '战术织物', '携行具', '作战服', '工程作业服', '侦察外套', '撤离人员外套', '海军船壳', '海军甲板', '登陆舰防腐船壳', '登陆舰防滑甲板', '港口外墙', '墙体混凝土', '军用复合涂层', '分区蒙皮']);

export function readableMaterial(source, infantry = false, domain = 'land') {
  if (!source.isMeshStandardMaterial || source.transparent || source.colorWrite === false) return source;
  const material = source.clone();
  if (coatings.has(source.name)) {
    material.color.lerp(new THREE.Color(infantry ? '#ddd8b4' : '#b4c0ba'), infantry ? .27 : .06);
    if (infantry) { material.emissive.lerp(new THREE.Color('#718c91'), .12); }
  }
  // 保留原有迷彩和磨损着色，仅在掠视边缘补入冷色反射光。
  const compile = source.onBeforeCompile, cacheKey = source.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(material, shader, renderer);
    shader.vertexShader='varying vec3 vEquipmentLocal;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvEquipmentLocal=position;');
    shader.fragmentShader='varying vec3 vEquipmentLocal;\n'+shader.fragmentShader;
    if(coatings.has(source.name)&&!infantry){
      const grime=domain==='naval'?'vec3(.33,.38,.35)':domain==='building'?'vec3(.24,.25,.23)':'vec3(.28,.23,.16)';
      shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float surfaceStreak=.5+.5*sin(vEquipmentLocal.x*19.0+sin(vEquipmentLocal.z*13.0)*3.0);
float lowerDirt=${domain==='air'?'0.0':'(1.0-smoothstep(.35,1.4,vEquipmentLocal.y))*.14'};
float rainMark=pow(surfaceStreak,9.0)*${domain==='naval'?'.07':'.025'};
diffuseColor.rgb=mix(diffuseColor.rgb,${grime},lowerDirt+rainMark);`)
        .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(roughnessFactor+lowerDirt*.45+rainMark,.18,1.0);');
    }
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
float silhouetteLight = pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 3.0);
outgoingLight += vec3(.68, .82, .88) * silhouetteLight * ${infantry ? BATTLE_READABILITY.infantryRimStrength : BATTLE_READABILITY.rimStrength};
#include <opaque_fragment>`);
  };
  material.customProgramCacheKey = () => `${cacheKey}:战场辨识度:${infantry ? '步兵' : '装备'}:2:${domain}`;
  return material;
}

export function identityRadius(entity, tags = []) {
  if (entity.kind === 'building') return entity.size * .55;
  return tags.includes('infantry') ? 8 : tags.includes('ship') ? 35 : tags.includes('air') ? 20 : 27;
}

export function identityVisible(entity, visible, submerged = false) {
  return visible && entity.hp > 0 && !entity.embarkedIn && (!submerged || entity.owner === 0);
}
