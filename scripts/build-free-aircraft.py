"""将 Captain_Ahab_62 的 CC0 战机转换为本地游戏模型；不运行源文件脚本。"""
import bpy, json, math, hashlib
from pathlib import Path
from mathutils import Matrix, Vector
ROOT=Path(__file__).resolve().parent.parent
SOURCE=ROOT/'releases/open-aircraft-source/oga-fighter-jets/basic_replacements.blend'
OUT=ROOT/'assets/third-party/free-aircraft-20261111'
OUT.mkdir(parents=True,exist_ok=True)
CONFIGS={
 'bomber':['f_111_aardvark_fuselage','f_111_aardvark_wing_l','f_111_aardvark_wing_r'],
 'ewPlane':['ea6b_prowler'],
 'navalFighter_nato':['f14_tomcat','f14_tomcat_wing_l','f14_tomcat_wing_r'],
 'navalStrike_nato':['a6e_intruder'],
}
REPORT={}

def palette(name):
 m=bpy.data.materials.new(name);m.use_nodes=True
 colors={'航空涂层':(.36,.42,.45,1),'深色面板':(.12,.17,.2,1),'进气口与喷口':(.025,.04,.05,1),'座舱玻璃':(.13,.3,.38,1)}
 color=colors[name];m.diffuse_color=color
 p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=color
 p.inputs['Roughness'].default_value=.18 if name=='座舱玻璃'else .7
 p.inputs['Metallic'].default_value=.25
 return m

def merge_materials(objects,parent,ratio):
 for o in objects:
  if ratio<1:
   bpy.context.view_layer.objects.active=o
   d=o.modifiers.new('远景减面','DECIMATE');d.ratio=ratio;d.use_collapse_triangulate=True
   bpy.ops.object.modifier_apply(modifier=d.name)
 bpy.ops.object.select_all(action='DESELECT')
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join()
 joined=bpy.context.object;joined.parent=parent
 unique=[];indices={}
 for i,material in enumerate(joined.data.materials):
  if material not in unique:unique.append(material)
  indices[i]=unique.index(material)
 assignments=[indices[p.material_index] for p in joined.data.polygons]
 joined.data.materials.clear()
 for material in unique:joined.data.materials.append(material)
 for polygon,index in zip(joined.data.polygons,assignments):polygon.material_index=index
 bpy.ops.mesh.separate(type='MATERIAL')
 return [o for o in bpy.context.selected_objects if o.type=='MESH']

for name,names in CONFIGS.items():
 bpy.ops.wm.open_mainfile(filepath=str(SOURCE),load_ui=False,use_scripts=False)
 originals=[bpy.data.objects[n] for n in names]
 points=[o.matrix_world@Vector(v) for o in originals for v in o.bound_box]
 low=Vector(tuple(min(p[i] for p in points)for i in range(3)));high=Vector(tuple(max(p[i] for p in points)for i in range(3)))
 center=Vector(((low.x+high.x)/2,(low.y+high.y)/2,low.z))
 factor=9.4/(high.x-low.x)
 transform=Matrix.Scale(factor,4)@Matrix.Translation(-center)
 # 从原作者玻璃位置判断机首，全部统一为 +X，避免出现倒飞模型。
 glass=[]
 for o in originals:
  for p in o.data.polygons:
   if o.data.materials[p.material_index] and 'glass'in o.data.materials[p.material_index].name:
    glass.extend(o.matrix_world@o.data.vertices[i].co for i in p.vertices)
 if glass and sum(p.x for p in glass)/len(glass)<center.x:
  transform=Matrix.Rotation(math.pi,4,'Z')@transform
 materials={n:palette(n)for n in ['航空涂层','深色面板','进气口与喷口','座舱玻璃']}
 source_materials={'gray':'航空涂层','dark_gray':'深色面板','black':'进气口与喷口','glass':'座舱玻璃'}
 objects=[]
 for original in originals:
  o=original.copy();o.data=original.data.copy();bpy.context.collection.objects.link(o)
  o.data.transform(transform@original.matrix_world);o.matrix_world=Matrix.Identity(4)
  for i,m in enumerate(o.data.materials):o.data.materials[i]=materials[source_materials.get(m.name,'航空涂层')]
  objects.append(o)
 for o in list(bpy.data.objects):
  if o not in objects:bpy.data.objects.remove(o,do_unlink=True)
 root=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(root)
 root['sourceModel']=';'.join(names);root['license']='CC0-1.0';root['author']='Captain_Ahab_62';root['openAsset']='free-aircraft'
 # 尾部深色面片中心作为喷口，按横向分组；输出为 glTF 局部坐标。
 rear=[]
 for o in objects:
  for p in o.data.polygons:
   if o.data.materials[p.material_index].name=='进气口与喷口':
    rear.extend(o.data.vertices[i].co.copy()for i in p.vertices)
 anchors=[]
 for side in [-1,1]:
  part=[p for p in rear if p.y*side>=0]
  if part:
   tail=min(p.x for p in part);part=[p for p in part if p.x<tail+.2]
   c=sum(part,Vector())/len(part);anchors.append([tail-.03,c.z,-c.y,.21])
 if not anchors:anchors=[[-4.73,.45,-.32,.22],[-4.73,.45,.32,.22]]
 root['jetExhausts']=anchors
 near=bpy.data.objects.new('airframe_near',None);bpy.context.collection.objects.link(near);near.parent=root
 far=bpy.data.objects.new('airframe_far',None);bpy.context.collection.objects.link(far);far.parent=root
 parked=None
 if name.startswith('naval'):
  parked=bpy.data.objects.new('parked_'+name,None);bpy.context.collection.objects.link(parked)
  parked['openAsset']='free-aircraft';parked['license']='CC0-1.0';parked['sourceModel']=';'.join(names)
  parked_objects=[]
  for source_name,o in zip(names,objects):
   copy=o.copy();copy.data=o.data.copy();bpy.context.collection.objects.link(copy)
   # F-14 按独立机翼后掠收拢；A-6 只折起外翼，保留各自的停机轮廓。
   if name=='navalFighter_nato' and '_wing_' in source_name:
    side=1 if sum(v.co.y for v in copy.data.vertices)>0 else -1
    pivot=Vector((-.6,side*.8,.45))
    copy.data.transform(Matrix.Translation(pivot)@Matrix.Rotation(side*.85,4,'Z')@Matrix.Translation(-pivot))
   elif name=='navalStrike_nato':
    for v in copy.data.vertices:
     if abs(v.co.y)>1.55 and v.co.x>-2.2:
      side=1 if v.co.y>0 else -1;distance=abs(v.co.y)-1.55
      v.co.y=side*(1.55+distance*math.cos(1.25));v.co.z+=distance*math.sin(1.25)
   copy.data.transform(Matrix.Scale(1.85/9.4,4))
   # 停机远景把座舱、进气口并为深色面板，减少满甲板绘制批次。
   for i,m in enumerate(copy.data.materials):
    if m.name!='航空涂层':copy.data.materials[i]=materials['深色面板']
   parked_objects.append(copy)
  merge_materials(parked_objects,parked,.32)
 far_objects=[]
 for o in objects:
  duplicate=o.copy();duplicate.data=o.data.copy();bpy.context.collection.objects.link(duplicate);far_objects.append(duplicate)
 merge_materials(objects,near,1);merge_materials(far_objects,far,.38)
 counts={}
 for level in [near,far]:
  for o in level.children:o.data.calc_loop_triangles()
  counts[level.name]=sum(len(o.data.loop_triangles)for o in level.children)
 bpy.ops.object.select_all(action='SELECT')
 bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_yup=True,export_extras=True,export_cameras=False,export_lights=False)
 data=(OUT/(name+'.glb')).read_bytes()
 REPORT[name]={'sourceObjects':names,'triangles':counts,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'jetExhausts':anchors}
 if parked:
  for o in parked.children:o.data.calc_loop_triangles()
  REPORT[name]['parkedTriangles']=sum(len(o.data.loop_triangles)for o in parked.children)
 # 独立渲染真实几何用于验收，不采用资源站的宣传图。
 far.hide_render=True
 for child in far.children:child.hide_render=True
 if parked:
  for child in parked.children:child.hide_render=True
 bpy.ops.object.camera_add(location=(11,-15,12));camera=bpy.context.object;camera.rotation_euler=(Vector((0,0,1))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.type='ORTHO';camera.data.ortho_scale=13
 scene=bpy.context.scene;scene.camera=camera;scene.render.engine='CYCLES';scene.cycles.samples=12
 scene.world=bpy.data.worlds.new('模型预览');scene.world.use_nodes=True;scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.16,.2,.23,1)
 bpy.ops.object.light_add(type='AREA',location=(2,-5,10));bpy.context.object.data.energy=1300;bpy.context.object.data.shape='DISK';bpy.context.object.data.size=7
 scene.render.resolution_x=900;scene.render.resolution_y=700;scene.render.resolution_percentage=100;scene.render.filepath=str(ROOT/'qa/airforce-20261111'/f'{name}-source-adapted.png');bpy.ops.render.render(write_still=True)
(OUT/'geometry-report.json').write_text(json.dumps(REPORT,ensure_ascii=False,indent=2)+'\n')
print('AIRCRAFT_REPORT',json.dumps(REPORT))
