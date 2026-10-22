"""将已核验许可的社区模型转换为游戏部件，不执行源文件脚本。"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'releases/open-assets-source'
OUT = ROOT / 'assets/third-party'
OUT.mkdir(parents=True, exist_ok=True)
REPORT = {}


def reset(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.suffix == '.blend':
        bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False, use_scripts=False)
    else:
        bpy.ops.import_scene.gltf(filepath=str(path))
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.hide_render]
    for o in meshes:
        matrix = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = Matrix.Identity(4)
        o.data = o.data.copy()
        o.data.transform(matrix)
    for o in list(bpy.data.objects):
        if o not in meshes:
            bpy.data.objects.remove(o, do_unlink=True)
    return meshes


def material(name, color, roughness, metalness):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    p = mat.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metalness
    return mat


def triangles(obj):
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def simplify(obj, ratio):
    if triangles(obj) < 120 or ratio >= 1:
        return
    bpy.context.view_layer.objects.active = obj
    dec = obj.modifiers.new('实时游戏减面', 'DECIMATE')
    dec.ratio = ratio
    dec.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=dec.name)


def merge(objects, name):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    return obj


def export(name, objects):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.data.validate(clean_customdata=False)
        obj.data.validate_material_indices()
        obj.select_set(True)
    path = OUT / f'{name}.glb'
    bpy.ops.export_scene.gltf(filepath=str(path), export_format='GLB', use_selection=True,
                              export_yup=True, export_extras=True, export_cameras=False,
                              export_lights=False, export_image_format='AUTO')
    REPORT[name] = {'bytes': path.stat().st_size, 'parts': {o.name: triangles(o) for o in objects}}


def preview(name, objects):
    points = [o.matrix_world @ Vector(v) for o in objects for v in o.bound_box]
    low = Vector(tuple(min(v[i] for v in points) for i in range(3)))
    high = Vector(tuple(max(v[i] for v in points) for i in range(3)))
    center = (low + high) / 2
    span = max(high - low)
    bpy.ops.object.camera_add(location=center + Vector((span, -span, span * .8)))
    camera = bpy.context.object
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = span * 1.5
    scene = bpy.context.scene
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 16
    scene.world = bpy.data.worlds.new('预览环境')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.18, .22, .26, 1)
    scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .8
    bpy.ops.object.light_add(type='SUN', rotation=(.4, -.5, -.4))
    bpy.context.object.data.energy = 3
    scene.render.resolution_x = 1000
    scene.render.resolution_y = 720
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(CACHE / f'{name}-adapted.png')
    bpy.ops.render.render(write_still=True)


meshes = reset(CACHE / 'abrams/abrams-tank.blend')
coat = material('开放资产装甲涂层', (.26, .29, .19), .78, .2)
rubber = material('开放资产履带橡胶', (.028, .034, .031), .94, 0)
metal = material('开放资产裸露金属', (.13, .16, .17), .46, .7)
groups = {'body': [], 'weapon': [], 'barrel': []}
turret_parts = {'Cube.001', 'Cube.013', 'Plane.002', 'Cylinder', 'Circle.000', 'Circle.020', 'Circle.021', 'Circle.022'}
turret_parts.update(f'Cylinder.{i:03}' for i in [16, 17, 18, 19, 20, 21, 22, 25, 26, 27, 28, 29, 58, 59, 60])
pivot = Vector((.096639, .045987, 0))
for obj in meshes:
    if obj.name == 'Cube.003':
        bpy.data.objects.remove(obj, do_unlink=True)
        continue
    key = 'barrel' if obj.name == 'Circle.020' else 'weapon' if obj.name in turret_parts else 'body'
    original = ' '.join(m.name for m in obj.data.materials if m)
    obj.data.materials.clear()
    obj.data.materials.append(rubber if 'nukclear' in original or 'wheel' in original else metal if 'metal barrel' in original or 'guide' in original else coat)
    for face in obj.data.polygons:
        face.material_index = 0
    if key != 'body':
        obj.data.transform(Matrix.Translation(pivot) @ Matrix.Rotation(.431505, 4, 'Z') @ Matrix.Translation(-pivot))
    # 原模型朝 -Y，统一为游戏 +X；保留模型自身的宽高比例。
    obj.data.transform(Matrix.Scale(1.78, 4) @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Translation(-pivot))
    simplify(obj, .22 if triangles(obj) > 400 else .6)
    groups[key].append(obj)
parts = [merge(items, f'{key}_near') for key, items in groups.items()]
minimum = min(v.co.z for o in parts for v in o.data.vertices)
for obj in parts:
    obj.data.transform(Matrix.Translation((0, 0, -minimum)))
    # 为旧版无贴图模型生成统一 UV，供涂层、橡胶及粗糙度贴图使用。
    uv = obj.data.uv_layers.active or obj.data.uv_layers.new(name='UVMap')
    for face in obj.data.polygons:
        axis = max(range(3), key=lambda i: abs(face.normal[i]))
        a, b = [i for i in range(3) if i != axis]
        for index in face.loop_indices:
            co = obj.data.vertices[obj.data.loops[index].vertex_index].co
            uv.data[index].uv = (co[a] * .35, co[b] * .35)
far_parts = []
for obj in parts:
    far = obj.copy()
    far.data = obj.data.copy()
    bpy.context.collection.objects.link(far)
    far.name = obj.name.replace('_near', '_far')
    simplify(far, .27)
    far_parts.append(far)
export('abrams', parts + far_parts)
for obj in far_parts:
    obj.hide_render = True
preview('abrams', parts)

meshes = reset(CACHE / 'f22/f22.glb')
# 源模型的机身有轻微展示俯仰，先恢复水平，再按现有战机长度缩放。
for obj in meshes:
    obj.data.transform(Matrix.Rotation(-.081506, 4, 'Y'))
    if any(m and m.name.startswith('plumes') for m in obj.data.materials):
        bpy.data.objects.remove(obj, do_unlink=True)
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
points = [v.co for o in meshes for v in o.data.vertices]
low = Vector(tuple(min(v[i] for v in points) for i in range(3)))
high = Vector(tuple(max(v[i] for v in points) for i in range(3)))
center = (low + high) / 2
transform = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Scale(8.9 / (high.x - low.x), 4) @ Matrix.Translation(-center)
for obj in meshes:
    obj.data.transform(transform)
    for mat in obj.data.materials:
        if not mat or not mat.use_nodes:
            continue
        p = mat.node_tree.nodes.get('Principled BSDF')
        if p:
            p.inputs['Emission Strength'].default_value = 0
            p.inputs['Roughness'].default_value = .62
            p.inputs['Metallic'].default_value = .22
            if mat.name.startswith('f22_'):
                p.inputs['Base Color'].default_value = (.45, .48, .5, 1)
            if mat.name == 'glass':
                p.inputs['Base Color'].default_value = (.23, .19, .11, 1)
                p.inputs['Roughness'].default_value = .12
                p.inputs['Metallic'].default_value = .5
body = merge(meshes, 'airframe_near')
far = body.copy()
far.data = body.data.copy()
bpy.context.collection.objects.link(far)
far.name = 'airframe_far'
simplify(far, .32)
export('f22', [body, far])
far.hide_render = True
preview('f22', [body])

meshes = reset(CACHE / 'overhead_crane/overhead_crane.gltf')
for obj in meshes:
    simplify(obj, .12)
    obj.data.transform(Matrix.Scale(.42, 4))
crane = merge(meshes, 'harbor_crane')
export('harbor-crane', [crane])
preview('harbor-crane', [crane])
(OUT / 'geometry-report.json').write_text(json.dumps(REPORT, ensure_ascii=False, indent=2))
print(json.dumps(REPORT, ensure_ascii=False))
