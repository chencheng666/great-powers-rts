import bpy
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', 'wechat-logistics-20261006', 'images')


def render(name, filename, scale):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'assets', 'models', 'logistics-library.blend'))
    scene = bpy.context.scene
    root = bpy.data.objects[name]
    selected = {root, *root.children_recursive}
    for obj in scene.objects:
        obj.hide_render = obj not in selected
    bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.55))
    material = bpy.data.materials.new('模型展示地面')
    material.diffuse_color = (.12, .14, .16, 1)
    bpy.context.object.data.materials.append(material)
    scene.world.use_nodes = True
    background = next(node for node in scene.world.node_tree.nodes if node.type == 'BACKGROUND')
    background.inputs[0].default_value = (.25, .29, .34, 1)
    background.inputs[1].default_value = .35
    target = Vector((0, 0, 1.3))
    for location, power, size in [((0, -8, 16), 3500, 10), ((-6, 8, 12), 4200, 8), ((10, 5, 9), 2300, 7)]:
        data = bpy.data.lights.new('摄影棚柔光', 'AREA')
        data.energy, data.shape, data.size = power, 'DISK', size
        light = bpy.data.objects.new('摄影棚柔光', data)
        scene.collection.objects.link(light)
        light.location = location
        light.rotation_euler = (target - light.location).to_track_quat('-Z', 'Y').to_euler()
    data = bpy.data.cameras.new('装备镜头')
    camera = bpy.data.objects.new('装备镜头', data)
    scene.collection.objects.link(camera)
    camera.location = target + Vector((12, -17, 14))
    camera.rotation_euler = (target - camera.location).to_track_quat('-Z', 'Y').to_euler()
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
    # 展示实际游戏源模型，不写回模型库，不把摄影棚渲染称为游戏截图。
    bpy.ops.render.render(write_still=True)


render('landing', '11-landing-model.png', 24)
render('bomber', '12-bomber-model.png', 27)
render('airlift', '13-airlift-model.png', 27)
