import bpy
import json
import math
from mathutils import Vector
from pathlib import Path

root = Path(__file__).resolve().parent.parent
cache = root / 'releases/open-assets-source'
for file in [cache / 'abrams/abrams-tank.blend', cache / 'f22/f22.glb', cache / 'overhead_crane/overhead_crane.gltf']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if file.suffix == '.blend':
        bpy.ops.wm.open_mainfile(filepath=str(file), load_ui=False, use_scripts=False)
    else:
        bpy.ops.import_scene.gltf(filepath=str(file))
    objects = []
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        obj.data.calc_loop_triangles()
        objects.append({'name': obj.name, 'triangles': len(obj.data.loop_triangles), 'location': list(obj.location), 'rotation': list(obj.rotation_euler), 'dimensions': list(obj.dimensions), 'materials': [m.name for m in obj.data.materials if m], 'parent': obj.parent.name if obj.parent else None, 'hidden': obj.hide_render})
    result = {'source': str(file.relative_to(cache)), 'objects': objects, 'images': [{'name': i.name, 'size': list(i.size), 'path': i.filepath, 'packed': bool(i.packed_file)} for i in bpy.data.images], 'materials': [{'name': m.name, 'color': list(m.diffuse_color)} for m in bpy.data.materials]}
    output = file.parent / 'inspection.json'
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({'source': result['source'], 'objects': len(objects), 'triangles': sum(o['triangles'] for o in objects), 'images': len(result['images']), 'output': str(output)}, ensure_ascii=False))
    if file.parent.name == 'abrams':
        meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and not o.hide_render and o.name != 'Cube.003']
        for obj in list(bpy.data.objects):
            if obj not in meshes:
                bpy.data.objects.remove(obj, do_unlink=True)
        points = [o.matrix_world @ Vector(p) for o in meshes for p in o.bound_box]
        low = Vector(tuple(min(v[i] for v in points) for i in range(3)))
        high = Vector(tuple(max(v[i] for v in points) for i in range(3)))
        center = (low + high) / 2
        span = max(high - low)
        bpy.ops.object.camera_add(location=center + Vector((span, -span, span * .7)))
        camera = bpy.context.object
        camera.rotation_euler = (center - camera.location).to_track_quat('-Z', 'Y').to_euler()
        camera.data.type = 'ORTHO'; camera.data.ortho_scale = span * 1.6
        scene = bpy.context.scene; scene.camera = camera
        scene.render.engine = 'CYCLES'; scene.cycles.samples = 12
        scene.world = bpy.data.worlds.new('预览环境'); scene.world.use_nodes = True
        scene.world.node_tree.nodes.get('Background').inputs['Color'].default_value = (.3, .35, .4, 1)
        scene.world.node_tree.nodes.get('Background').inputs['Strength'].default_value = .7
        bpy.ops.object.light_add(type='SUN', rotation=(.4, -.5, -.4))
        bpy.context.object.data.energy = 3
        scene.render.resolution_x = 900; scene.render.resolution_y = 700; scene.render.resolution_percentage = 100
        scene.render.filepath = str(file.parent / 'preview.png')
        bpy.ops.render.render(write_still=True)
