"""将游戏程序模型导入独立 Blender 场景，保留层级、UV、材质和实例并生成检查图。"""
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

folder = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
bpy.ops.wm.read_factory_settings(use_empty=True)
texture_cache = {}
material_cache = {}
report = {'blender': bpy.app.version_string, 'models': {}}


def matrix(values):
    return Matrix([values[i:i + 4] for i in range(0, 16, 4)]).transposed()


def read_model(name):
    source = json.loads((folder / (name + '.json')).read_text())
    images = {v['uuid']: v['url'] for v in source.get('images', [])}
    textures = {v['uuid']: v for v in source.get('textures', [])}

    def texture(uuid):
        if uuid in texture_cache:
            return texture_cache[uuid]
        spec = textures[uuid]
        data = images[spec['image']]
        image = bpy.data.images.new(uuid, width=data['width'], height=data['height'], alpha=True)
        image.colorspace_settings.name = 'sRGB' if spec.get('colorSpace') == 'srgb' else 'Non-Color'
        image.pixels.foreach_set([v / 255 for v in data['data']]); image.update()
        image.pack()
        texture_cache[uuid] = image
        return image

    materials = {}
    for spec in source['materials']:
        key = spec['uuid']
        if key not in material_cache:
            mat = bpy.data.materials.new(spec.get('name', key))
            mat.use_nodes = True
            nodes, links = mat.node_tree.nodes, mat.node_tree.links
            shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
            value = spec.get('color', 0xffffff)
            # Three.js 材质 JSON 的十六进制颜色为 sRGB，节点输入使用线性颜色。
            linear = lambda v: v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4
            color = tuple(linear(((value >> shift) & 255) / 255) for shift in (16, 8, 0)) + (1,)
            shader.inputs['Base Color'].default_value = color
            shader.inputs['Roughness'].default_value = spec.get('roughness', .7)
            shader.inputs['Metallic'].default_value = spec.get('metalness', 0)
            if spec.get('map'):
                tex = nodes.new('ShaderNodeTexImage'); tex.image = texture(spec['map'])
                multiply = nodes.new('ShaderNodeMixRGB'); multiply.blend_type = 'MULTIPLY'
                multiply.inputs[0].default_value = 1; multiply.inputs[2].default_value = color
                links.new(tex.outputs['Color'], multiply.inputs[1]); links.new(multiply.outputs[0], shader.inputs['Base Color'])
            if spec.get('normalMap'):
                tex = nodes.new('ShaderNodeTexImage'); tex.image = texture(spec['normalMap'])
                normal = nodes.new('ShaderNodeNormalMap'); normal.inputs['Strength'].default_value = spec.get('normalScale', [.22])[0]
                links.new(tex.outputs['Color'], normal.inputs['Color']); links.new(normal.outputs['Normal'], shader.inputs['Normal'])
            if spec.get('roughnessMap'):
                tex = nodes.new('ShaderNodeTexImage'); tex.image = texture(spec['roughnessMap'])
                separate = nodes.new('ShaderNodeSeparateColor'); multiply = nodes.new('ShaderNodeMath'); multiply.operation = 'MULTIPLY'
                multiply.inputs[1].default_value = spec.get('roughness', .7)
                links.new(tex.outputs['Color'], separate.inputs[0]); links.new(separate.outputs[1], multiply.inputs[0]); links.new(multiply.outputs[0], shader.inputs['Roughness'])
            material_cache[key] = mat
        materials[key] = material_cache[key]
    geometries = {v['uuid']: v for v in source['geometries']}
    stats = {'meshObjects': 0, 'triangles': 0, 'invalidPositions': 0, 'degenerateTriangles': 0, 'nodes': []}

    def mesh_data(uuid, material_ids):
        spec = geometries[uuid]['data']; attrs = spec['attributes']; p = attrs['position']['array']
        vertices = [p[i:i + 3] for i in range(0, len(p), 3)]
        indices = spec.get('index', {}).get('array', list(range(len(vertices))))
        faces = [indices[i:i + 3] for i in range(0, len(indices), 3)]
        mesh = bpy.data.meshes.new(uuid); mesh.from_pydata(vertices, [], faces); mesh.update()
        for mid in material_ids: mesh.materials.append(materials[mid])
        for group in spec.get('groups', []):
            for face in mesh.polygons[group['start'] // 3:(group['start'] + group['count']) // 3]:
                face.material_index = group['materialIndex']
        if 'uv' in attrs:
            uv = attrs['uv']['array']; layer = mesh.uv_layers.new(name='UVMap')
            for loop in mesh.loops: layer.data[loop.index].uv = uv[loop.vertex_index * 2:loop.vertex_index * 2 + 2]
        if 'normal' in attrs:
            normals = attrs['normal']['array']; mesh.normals_split_custom_set_from_vertices([normals[i:i + 3] for i in range(0, len(normals), 3)])
            for face in mesh.polygons: face.use_smooth = True
        stats['invalidPositions'] += sum(not math.isfinite(v) for v in p)
        stats['degenerateTriangles'] += sum(face.area < 1e-12 for face in mesh.polygons)
        return mesh

    def node(spec, parent=None):
        if not spec.get('visible', True): return
        geom = spec.get('geometry'); mids = spec.get('material', [])
        if isinstance(mids, str): mids = [mids]
        data = mesh_data(geom, mids) if geom else None
        obj = bpy.data.objects.new(spec.get('name') or spec['type'], data if spec['type'] != 'InstancedMesh' else None)
        bpy.context.collection.objects.link(obj); obj.parent = parent
        obj.matrix_local = matrix(spec['matrix'])
        if spec.get('name'): stats['nodes'].append(spec['name'])
        if spec['type'] == 'InstancedMesh':
            transforms = spec['instanceMatrix']['array']
            for i in range(spec['count']):
                part = bpy.data.objects.new(f"{obj.name}_{i}", data); bpy.context.collection.objects.link(part)
                part.parent = obj; part.matrix_local = matrix(transforms[i * 16:i * 16 + 16]); stats['meshObjects'] += 1; stats['triangles'] += len(data.polygons)
        elif data:
            stats['meshObjects'] += 1; stats['triangles'] += len(data.polygons)
        for child in spec.get('children', []): node(child, obj)
        return obj

    root = node(source['object']); root.rotation_euler.x = math.pi / 2
    report['models'][name] = stats
    return root


roots = [read_model(name) for name in ['tank_china', 'destroyer_china', 'navalFighter_china']]
scene = bpy.context.scene
# 检查实际可用引擎，旧版本没有该枚举时保留默认引擎。
try:
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
except TypeError:
    pass
scene.render.resolution_x = 1280; scene.render.resolution_y = 800; scene.render.resolution_percentage = 100
scene.world = bpy.data.worlds.new('检查棚环境'); scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs['Color'].default_value = (.2, .26, .32, 1); background.inputs['Strength'].default_value = .65
for name, position, energy, size in [('主光', (8, -12, 18), 3000, 12), ('轮廓光', (-8, 5, 12), 2200, 9)]:
    data = bpy.data.lights.new(name, 'AREA'); data.energy = energy; data.shape = 'DISK'; data.size = size
    obj = bpy.data.objects.new(name, data); scene.collection.objects.link(obj); obj.location = position; obj.rotation_euler = (-obj.location).to_track_quat('-Z', 'Y').to_euler()
data = bpy.data.cameras.new('检查相机'); camera = bpy.data.objects.new('检查相机', data); scene.collection.objects.link(camera); scene.camera = camera; data.type = 'ORTHO'
for root in roots:
    for other in roots:
        for obj in [other, *other.children_recursive]: obj.hide_render = other != root
    meshes = [o for o in root.children_recursive if o.type == 'MESH']
    corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    # 更新变换后再测量，确保 Three.js 的 Y 轴已正确换到 Blender Z 轴。
    bpy.context.view_layer.update(); corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    low = Vector(tuple(min(p[a] for p in corners) for a in range(3))); high = Vector(tuple(max(p[a] for p in corners) for a in range(3)))
    center = (low + high) / 2; length = max(high - low)
    camera.location = center + Vector((1.1, -1.2, .95)) * length
    camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler(); data.ortho_scale = length * 1.55
    scene.render.filepath = str(folder / (root.name + '-blender.png')); bpy.ops.render.render(write_still=True)
for index, root in enumerate(roots):
    for obj in [root, *root.children_recursive]: obj.hide_render = False
    root.location.x = (index - 1) * 24
assert all(v['invalidPositions'] == 0 for v in report['models'].values())
bpy.ops.wm.save_as_mainfile(filepath=str(folder / '程序模型检查.blend'))
(folder / 'blender-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print('BLENDER_AUDIT', json.dumps(report, ensure_ascii=False))
