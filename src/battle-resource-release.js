// dispose 只释放 GPU 句柄；库中的几何、图片和材质对象仍可在下一局重新上传。
export function releaseBattleResources(scene){
  const geometries=new Set(),materials=new Set(),textures=new Set(),instances=new Set(),shadows=new Set();
  const collectMaterial=material=>{
    if(!material||materials.has(material))return;materials.add(material);
    for(const value of Object.values(material))if(value?.isTexture)textures.add(value);
    for(const uniform of Object.values(material.uniforms||{}))if(uniform?.value?.isTexture)textures.add(uniform.value);
    for(const uniform of Object.values(material.userData?.landscapeUniforms||{}))if(uniform?.value?.isTexture)textures.add(uniform.value);
  };
  scene?.traverse(object=>{
    if(object.geometry)geometries.add(object.geometry);
    for(const material of Array.isArray(object.material)?object.material:[object.material])collectMaterial(material);
    collectMaterial(object.customDepthMaterial);collectMaterial(object.customDistanceMaterial);
    if(object.isInstancedMesh)instances.add(object);
    if(object.isLight&&object.shadow)shadows.add(object.shadow);
  });
  for(const resource of [...instances,...shadows,...geometries,...materials,...textures])resource.dispose();
  return{geometries:geometries.size,materials:materials.size,textures:textures.size,instances:instances.size,shadows:shadows.size};
}
