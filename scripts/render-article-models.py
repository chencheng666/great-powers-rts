import bpy
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'wechat-national-day-20261002', 'images')
os.makedirs(OUT, exist_ok=True)


def render(library, items, filename, scale, target=(0, 0, 1)):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'assets', 'models', library))
    scene = bpy.context.scene
    chosen = []
    for name, location, angle in items:
        obj = bpy.data.objects[name]
        obj.location = location
        obj.rotation_euler.z = angle
        chosen.extend([obj, *obj.children_recursive])
    selected = set(chosen)
    for obj in scene.objects:
        obj.hide_render = obj not in selected
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.035))
    mat = bpy.data.materials.new('摄影棚石墨地面')
    mat.diffuse_color = (.12, .14, .16, 1)
    mat.use_nodes = True
    shader = next(node for node in mat.node_tree.nodes if node.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.12, .14, .16, 1)
    shader.inputs['Roughness'].default_value = .72
    bpy.context.object.data.materials.append(mat)
    scene.world.use_nodes = True
    background = next(node for node in scene.world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs[0].default_value = (.25, .29, .34, 1)
    background.inputs[1].default_value = .35
    for name, location, power, size, color in [
        ('柔光主灯', (0, -8, 16), 3000, 10, (1, .92, .82)),
        ('轮廓灯', (-6, 8, 12), 4200, 8, (.67, .83, 1)),
        ('补光灯', (10, 5, 9), 2300, 7, (1, 1, 1)),
    ]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.shape, data.size, data.color = power, 'DISK', size, color
        obj = bpy.data.objects.new(name, data)
        scene.collection.objects.link(obj)
        obj.location = location
        obj.rotation_euler = (Vector(target) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('装备展示镜头')
    camera = bpy.data.objects.new('装备展示镜头', data)
    scene.collection.objects.link(camera)
    camera.location = Vector(target) + Vector((12, -17, 14))
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    data.type, data.ortho_scale = 'ORTHO', scale
    scene.camera = camera
    scene.render.engine = 'CYCLES'
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = 1600, 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'AgX'
    scene.render.filepath = os.path.join(OUT, filename)
    # 只渲染现有源模型，不保存改动，也不改游戏使用的模型库。
    bpy.ops.render.render(write_still=True)
    print('文章模型渲染完成：', filename, flush=True)


render('equipment-library.blend', [('tank_china', (0, -2.5, 0), -.15), ('rocket_china', (-1, 4, 0), -.15)], '02-china-equipment.png', 18, (0, 1, 1))
render('equipment-library.blend', [('tank_' + faction, (x, y, 0), -.2) for faction, x, y in [('china', -6, -4), ('russia', 2, -4), ('nato', -8, 4), ('asia', 0, 4), ('middleeast', 8, 4)]], '03-five-tanks.png', 30, (0, 0, 1))
render('drone-library.blend', [('drone', (-4, -1, 1), -.3), ('ghost', (2.5, -1, 1), -.3), ('elite_asia', (0, 4, 1), -.3)], '05-drone-models.png', 16, (0, 1, 1))
render('equipment-library.blend', [('railgun', (-5, -2, 0), -.1), ('relay', (3.5, -1, 0), -.1), ('aegis', (0, 5, 1), -.3)], '10-future-models.png', 23, (0, 1, 1))
