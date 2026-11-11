"""用 Blender 和 pycollada 将场景素材转换为统一比例的索引网格。"""
import json
from pathlib import Path

import bpy
import collada

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / 'assets/third-party/scenery-20261111'


def collada_mesh(path):
    document = collada.Collada(str(path))
    geometries = list(document.scene.objects('geometry')) if document.scene else []
    if not geometries:
        geometries = document.geometries
    if path.parent.name == 'industrial-props':
        geometries = [g for g in geometries if 'collision' not in g.original.id.lower()]
        reduced = [g for g in geometries if g.original.id.endswith('100')]
        geometries = reduced or geometries
    up = document.assetInfo.upaxis
    for geometry in geometries:
        primitives = geometry.primitives
        for primitive in primitives() if callable(primitives) else primitives:
            if hasattr(primitive, 'triangleset'):
                primitive = primitive.triangleset()
            for face in primitive.vertex_index:
                if len(face) != 3:
                    raise ValueError(f'无法读取三角面 {path.name}')
                corners = [tuple(primitive.vertex[i]) for i in face]
                yield [(x, z, -y) if up == 'Z_UP' else (x, y, z) for x, y, z in corners]


def blender_mesh(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if path.suffix == '.fbx':
        bpy.ops.import_scene.fbx(filepath=str(path))
    else:
        bpy.ops.import_scene.gltf(filepath=str(path))
    for obj in bpy.context.scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = obj.data
        mesh.calc_loop_triangles()
        vertices = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
        for face in mesh.loop_triangles:
            yield [(vertices[i].x, vertices[i].z, -vertices[i].y) for i in face.vertices]


def indexed_model(faces, color):
    corners = [v for face in faces for v in face]
    bounds = [(min(v[i] for v in corners), max(v[i] for v in corners)) for i in range(3)]
    size = max(high - low for low, high in bounds)
    center = [(low + high) / 2 for low, high in bounds]
    center[1] = bounds[1][0]
    vertices, indices, seen = [], [], {}
    for face in faces:
        points = [tuple(round(float((v[i] - center[i]) / size), 4) for i in range(3)) for v in face]
        if len(set(points)) != 3:
            continue
        for point in points:
            if point not in seen:
                seen[point] = len(vertices) // 3
                vertices.extend(point)
            indices.append(seen[point])
    return {'vertices': vertices, 'indices': indices, 'color': color}


sources = json.loads((SOURCES / 'source.json').read_text())
models = {}
for name, source in sources.items():
    path = SOURCES / source['file']
    faces = list(collada_mesh(path) if path.suffix.lower() == '.dae' else blender_mesh(path))
    model = indexed_model(faces, source['color'])
    count = len(model['indices']) // 3
    if not 1 <= count <= 2500:
        raise ValueError(f'{name} 面数超出预算 {count}')
    models[name] = model
    print(f'{name} {count} 三角面', flush=True)

output = ROOT / 'src/map-scenery-mesh-data.js'
output.write_text('// 根据各自许可转换的地图道具。来源和修改说明位于 assets/third-party/scenery-20261111。\n'
                  'export const SCENERY_MESHES = ' + json.dumps(models, separators=(',', ':')) + ';\n')
print(f'运行时几何 {output.stat().st_size} 字节')
