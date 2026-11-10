"""将 CC0 潜艇整理为游戏使用的低模；原始文件作为参数传入，不运行源脚本。"""
import bpy, sys, math
from mathutils import Matrix, Vector
args = sys.argv[sys.argv.index('--') + 1:]
bpy.ops.wm.open_mainfile(filepath=args[0], load_ui=False, use_scripts=False)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
# 以船体为中心，世界 +Y 船首转为游戏 +X；导出后 glTF 的 Y 轴朝上。
center = Vector((1.267225, -1.760790, 1.266500))
transform = Matrix.Rotation(-math.pi / 2, 4, 'Z') @ Matrix.Translation(-center)
root = bpy.data.objects.new('submarine', None)
bpy.context.collection.objects.link(root)
def material(name, color, metal=.35):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF'); bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal; bs.inputs['Roughness'].default_value = .58
    return m
body = material('潜艇暗灰船体', (.085,.125,.14))
cap = material('导弹舱盖', (.12,.17,.18))
team = material('阵营标识', (.2,.68,.72), .2)
for o in list(bpy.context.scene.objects):
    if o.type != 'MESH' and o != root: bpy.data.objects.remove(o, do_unlink=True)
for o in meshes:
    o.data.transform(transform @ o.matrix_world); o.matrix_world = Matrix.Identity(4)
    o.data.materials.clear(); o.data.materials.append(cap if o.name.startswith('Sphere.') else body)
    o.parent = root
    for p in o.data.polygons: p.use_smooth = o.name.startswith(('Sphere','Cylinder'))
# 小范围阵营识别带，保留原作者轮廓，不增加现实标志。
bpy.ops.mesh.primitive_cube_add(size=1, location=(-.68,0,.38))
stripe=bpy.context.object;stripe.name='submarine_team_band';stripe.scale=(.08,.36,.1);stripe.data.materials.append(team);stripe.parent=root
# 简单独立螺旋桨，渲染时可绕船体纵轴转动。
prop=bpy.data.objects.new('naval_propeller',None);bpy.context.collection.objects.link(prop);prop.location=(-2.28,0,0);prop.parent=root
for i in range(4):
    a=i*math.pi/2
    bpy.ops.mesh.primitive_cube_add(size=1)
    blade=bpy.context.object;blade.name='螺旋桨叶';blade.parent=prop
    blade.location=(0,math.cos(a)*.095,math.sin(a)*.095);blade.scale=(.035,.15,.04);blade.rotation_euler.x=a+.3;blade.data.materials.append(cap)
# 旧模型采用约 12.4 的局部长，维持已有潜航比例与碰撞规则。
root.scale=(2.8,)*3
bpy.ops.object.select_all(action='DESELECT');root.select_set(True)
for o in root.children_recursive:o.select_set(True)
bpy.context.view_layer.objects.active=root
bpy.ops.export_scene.gltf(filepath=args[1],export_format='GLB',use_selection=True,export_yup=True,export_apply=False)
print('已生成开源潜艇：',args[1])
