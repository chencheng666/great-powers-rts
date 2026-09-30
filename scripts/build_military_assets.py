import bpy
import math
import os
import sys
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'models')
os.makedirs(OUT, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, metal=0, rough=0.5, emission=0):
    color = tuple(value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in color)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    mat.node_tree.nodes.clear()
    shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = rough
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return mat


M = {
    'armor': material('装甲钢', (0.29, 0.34, 0.30), .65, .55),
    'light': material('浅色金属', (.47, .52, .52), .75, .42),
    'dark': material('深色钢', (.075, .10, .115), .68, .4),
    'rubber': material('橡胶', (.026, .031, .033), .05, .87),
    'concrete': material('混凝土', (.36, .38, .36), .05, .87),
    'panel': material('建筑面板', (.41, .46, .46), .5, .56),
    'roof': material('屋顶', (.22, .27, .28), .55, .63),
    'glass': material('玻璃', (.035, .105, .135), .8, .17),
    'airpaint': material('航空涂层', (.37, .405, .42), .42, .56),
    'team': material('阵营标识', (.025, .66, .76), .45, .35, .3),
    'lamp': material('照明', (.82, .93, 1), .15, .25, 2),
    'amber': material('警示黄', (.67, .46, .16), .28, .62),
    'red': material('警示红', (.75, .035, .025), .4, .5),
    'skin': material('皮肤', (.44, .31, .23), .05, .8),
    'cloth': material('作战服', (.18, .22, .18), 0, .9),
    'ore': material('矿石', (.34, .285, .155), .48, .72),
    'gem': material('矿晶', (.19, .47, .50), .45, .21),
    'bark': material('树皮', (.17, .125, .09), 0, .92),
    'leaf': material('针叶', (.13, .205, .10), 0, .92),
    'rock': material('岩石', (.31, .30, .275), .05, .96),
}
CURRENT = None


def finish(obj, name, mat, bevel=0):
    obj.name = name
    obj.parent = CURRENT
    obj.data.materials.append(M[mat])
    if bevel:
        modifier = obj.modifiers.new('边缘倒角', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new('加权法线', 'WEIGHTED_NORMAL')
    return obj


def box(name, loc, size, mat='armor', bevel=.06, rotate=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if rotate:
        obj.rotation_euler = rotate
    return finish(obj, name, mat, bevel)


def cylinder(name, loc, radius, depth, mat='light', vertices=20, rotate=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    if rotate:
        obj.rotation_euler = rotate
    for p in obj.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    return finish(obj, name, mat, .025)


def sphere(name, loc, scale, mat='armor'):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=10, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    for p in obj.data.polygons:
        p.use_smooth = True
    return finish(obj, name, mat)


def beam(name, a, b, radius=.05, mat='light'):
    midpoint = (Vector(a) + Vector(b)) / 2
    delta = Vector(b) - Vector(a)
    obj = cylinder(name, midpoint, radius, delta.length, mat, 12)
    obj.rotation_euler = delta.to_track_quat('Z', 'Y').to_euler()
    return obj


def shape(name, points, bottom, top, mat='armor', bevel=.05):
    n = len(points)
    vertices = [(x, y, bottom) for x, y in points] + [(x, y, top) for x, y in points]
    faces = [tuple(reversed(range(n))), tuple(range(n, n * 2))]
    faces += [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return finish(obj, name, mat, bevel)


def fuselage(name, sections, y=0, z=.5):
    vertices, faces, count = [], [], 16
    for x, width, height in sections:
        vertices.extend((x, y + math.cos(i * math.tau / count) * width, z + math.sin(i * math.tau / count) * height) for i in range(count))
    for row in range(len(sections) - 1):
        for i in range(count):
            a, b = row * count + i, row * count + (i + 1) % count
            faces.append((a, b, b + count, a + count))
    faces.extend([tuple(reversed(range(count))), tuple(range((len(sections) - 1) * count, len(sections) * count))])
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    for polygon in mesh.polygons:
        polygon.use_smooth = len(polygon.vertices) == 4
    return finish(obj, name, 'airpaint')


def root(name):
    global CURRENT
    CURRENT = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(CURRENT)
    return CURRENT


def vent(loc, width=1, length=1):
    x, y, z = loc
    box('通风罩', loc, (width, length, .2), 'dark')
    for i in range(6):
        box('散热格栅', (x, y - length * .4 + length * .16 * i, z + .12), (width * .85, .035, .035), 'light', .005)


def railing(x1, x2, y, z):
    beam('护栏', (x1, y, z + .55), (x2, y, z + .55), .035)
    beam('护栏', (x1, y, z + .28), (x2, y, z + .28), .025)
    for i in range(6):
        x = x1 + (x2 - x1) * i / 5
        beam('栏杆立柱', (x, y, z), (x, y, z + .55), .035)


def pad(width=8, length=6):
    box('基础平台', (0, 0, .12), (width, length, .24), 'concrete', .08)
    for x in [-width / 2 + .2, width / 2 - .2]:
        for y in [-length / 2 + .2, length / 2 - .2]:
            box('角部警示', (x, y, .255), (.32, .32, .025), 'amber', .015)


def windows(x1, x2, y, z, count=7):
    for i in range(count):
        x = x1 + (x2 - x1) * (i + .5) / count
        box('窗框', (x, y, z), ((x2 - x1) / count * .85, .08, .58), 'dark', .018)
        box('防弹玻璃', (x, y - .048, z), ((x2 - x1) / count * .73, .04, .44), 'glass', .008)


def build_hq():
    root('hq'); pad(8, 6.4)
    box('指挥楼', (0, .3, 1.35), (5.8, 3.5, 2.35), 'panel', .12)
    box('防爆屋顶', (0, .3, 2.58), (6.2, 3.9, .28), 'roof', .10)
    windows(-2.8, 2.8, -1.5, 1.85)
    windows(-2.8, 2.8, -1.5, 1.0)
    box('入口门厅', (0, -2.15, .85), (2.0, 1.2, 1.5), 'dark')
    box('指挥中心装甲门', (0, -2.77, .85), (1.5, .08, 1.35), 'light')
    box('阵营灯带', (0, -2.82, 1.68), (1.65, .04, .1), 'team', .01)
    for x in [-3.0, 3.0]:
        box('通信侧塔', (x, .4, 1.25), (.7, 3.0, 2.1), 'roof')
        box('识别条', (x, -1.14, 1.15), (.36, .045, 1.65), 'team', .01)
    vent((-1.5, 1.0, 2.9), 1.3, 1.1)
    beam('天线塔', (1.8, .9, 2.75), (1.8, .9, 5.2), .07)
    for z in [4.3, 4.7]:
        beam('通信天线', (1.15, .9, z), (2.45, .9, z), .035)
    cylinder('卫星天线底座', (.1, .7, 2.85), .4, .35)
    sphere('卫星通信碟', (.1, .7, 3.28), (.8, .8, .15), 'light')


def build_power():
    root('power'); pad(7, 6)
    box('变电厂房', (0, 1.4, .8), (5.4, 2, 1.4), 'panel')
    for x in [-1.65, 1.65]:
        cylinder('发电机组', (x, -.5, 1.4), .95, 2.3, 'light', 32)
        cylinder('散热顶盖', (x, -.5, 2.63), 1.07, .22, 'dark', 32)
        for i in range(12):
            angle = i * math.tau / 12
            beam('纵向换热管', (x + math.cos(angle) * .99, -.5 + math.sin(angle) * .99, .5), (x + math.cos(angle) * .99, -.5 + math.sin(angle) * .99, 2.45), .045, 'armor')
        cylinder('发电识别带', (x, -.5, .72), 1.02, .12, 'team', 32)
    for x in [-.55, .55]:
        box('变压器', (x, -2.1, .65), (.8, 1.05, .8), 'dark')
        for j in range(5):
            box('变压器散热片', (x + j * .15 - .3, -2.1, .68), (.045, 1.2, .9), 'light', .01)
    for x in [-2, 2]:
        beam('高压接线', (x, 1.4, 1.5), (x, 1.4, 3.4), .055)
        for z in [2.0, 2.3, 2.6]:
            cylinder('绝缘子', (x, 1.4, z), .15, .08, 'dark')


def build_refinery():
    root('refinery'); pad(8, 6.5)
    box('装卸区', (0, -1.8, .4), (5, 2.3, .5), 'roof')
    for x in [-2.25, 2.25]:
        cylinder('储矿分离罐', (x, .7, 1.65), 1.15, 2.8, 'light', 32)
        cylinder('储罐盖', (x, .7, 3.12), 1.20, .17, 'dark', 32)
        cylinder('储罐识别带', (x, .7, 1.25), 1.17, .12, 'team', 32)
        railing(x - .9, x + .9, -.05, 3.22)
    box('加工塔', (0, 1.1, 2), (1.6, 1.9, 3.5), 'roof')
    for z in [1, 2, 3]:
        beam('输送管道', (-2.2, .4, z), (2.2, .4, z), .12)
    for y in [-2.4, -1.8, -1.2]:
        cylinder('装卸滚轮', (0, y, .74), .12, 3.7, 'light', 16, (0, math.pi / 2, 0))
    for x in [-1.6, 1.6]:
        box('防撞护栏', (x, -2.6, .6), (.18, .18, .8), 'amber')
    cylinder('排气烟囱', (.5, 1.5, 3.9), .2, 2.5, 'light')


def build_barracks():
    root('barracks'); pad(7, 5.8)
    box('营房主体', (0, .45, 1.1), (5.7, 3.4, 1.7), 'panel')
    box('营房屋顶', (0, .45, 2.03), (6.0, 3.7, .24), 'roof')
    windows(-2.65, 2.65, -1.28, 1.35, 6)
    for x in [-.85, .85]:
        box('营房入口', (x, -1.52, .85), (.72, .4, 1.1), 'dark')
        box('入口识别灯', (x, -1.75, 1.48), (.65, .045, .085), 'team', .01)
    vent((1.5, .8, 2.22), 1.0, 1.2)
    for x in [-2.2, -1.6]:
        box('装备箱', (x, -2.1, .51), (.45, .6, .55), 'armor')
    beam('旗杆', (2.8, -2.1, .25), (2.8, -2.1, 3.5), .045)
    box('识别旗', (2.43, -2.1, 3.05), (.7, .035, .43), 'team', .01)


def build_factory():
    root('factory'); pad(8, 7)
    box('装甲生产车间', (0, .7, 1.9), (6.4, 4.4, 3.3), 'panel', .12)
    box('车间屋顶', (0, .7, 3.68), (6.8, 4.8, .3), 'roof')
    box('大型出车门', (0, -1.55, 1.6), (4.7, .15, 2.4), 'dark')
    for z in [.52, .83, 1.14, 1.45, 1.76, 2.07, 2.38, 2.69]:
        box('钢制卷帘', (0, -1.66, z), (4.55, .05, .16), 'light', .015)
    box('厂房识别带', (0, -1.71, 3.0), (5.6, .08, .16), 'team')
    for x in [-2.2, 0, 2.2]:
        vent((x, .8, 3.94), 1.15, 1.5)
    for x in [-3, 3]:
        beam('吊装立柱', (x, -2.5, .25), (x, -2.5, 4.8), .15, 'amber')
    beam('吊装横梁', (-3.15, -2.5, 4.8), (3.15, -2.5, 4.8), .22, 'amber')
    beam('起重索', (1, -2.5, 4.8), (1, -2.5, 3.7), .03, 'dark')


def dish(loc, radius=1.2):
    x, y, z = loc
    sphere('相控阵雷达', loc, (radius, .22, radius * .65), 'light')
    for i in range(7):
        box('雷达阵列', (x - radius * .75 + i * radius * .25, y - .225, z), (.04, .035, radius * .9), 'dark', .005)
    beam('雷达波导', (x, y, z), (x, y - .8, z), .04, 'light')


def build_radar(name='radar'):
    root(name); pad(6.5, 5.4)
    box('雷达机房', (0, .4, .85), (4.4, 3.2, 1.2), 'roof')
    windows(-2, 2, -1.25, 1, 4)
    for x in [-.8, .8]:
        beam('雷达塔支撑', (x, .5, 1.5), (0, .5, 4.1), .13)
    dish((0, .5, 4.1), 1.8)
    box('雷达识别带', (0, -1.31, .54), (4.1, .05, .12), 'team')
    for x in [-2.7, 2.7]:
        beam('通信杆', (x, .8, .25), (x, .8, 3.7), .04)


def build_airfield():
    root('airfield'); pad(9.4, 7.8)
    box('停机坪', (0, -1.65, .29), (8.8, 3.7, .1), 'dark')
    for x in [-3.5, -1.8, 0, 1.8, 3.5]:
        box('停机坪标线', (x, -2, .355), (.06, 2.5, .012), 'lamp', .002)
    box('飞机库', (-1.0, 1.3, 1.2), (5.8, 3.5, 2), 'panel')
    shape('机库斜顶', [(-4, -.5), (2, -.5), (2, 3.2), (-4, 3.2)], 2.2, 2.5, 'roof')
    box('机库入口', (-1.0, -.52, 1.17), (4.8, .08, 1.7), 'dark')
    box('塔台', (3.25, 1.55, 2.1), (1.25, 1.6, 3.75), 'concrete')
    box('塔台观察窗', (3.25, 1.55, 4.2), (1.65, 1.9, .95), 'glass')
    box('塔台遮阳顶', (3.25, 1.55, 4.75), (1.95, 2.2, .18), 'roof')
    box('机库识别带', (-1, -.58, 2.17), (5.2, .06, .1), 'team')
    for x in [-4.3, 4.3]:
        for y in [-3.4, -.8]:
            sphere('跑道导航灯', (x, y, .42), (.08, .08, .08), 'team')


def build_lab():
    root('lab'); pad(7, 6.5)
    box('研究中心', (-.4, .2, 1.5), (4.9, 4.2, 2.5), 'panel')
    box('科研玻璃顶', (-.4, .2, 2.85), (4.6, 3.9, .24), 'glass')
    for y in [-1.5, -.3, .9, 2.1]:
        box('屋顶框架', (-.4, y, 3.0), (4.9, .06, .09), 'light')
    windows(-2.6, 1.8, -1.94, 1.8)
    cylinder('试验舱', (2.3, .8, 1.7), .85, 2.8, 'light', 24)
    cylinder('试验舱发光环', (2.3, .8, 2.4), .89, .11, 'team', 24)
    box('入口', (-.4, -2.35, .94), (1.7, .8, 1.6), 'dark')
    vent((-.9, 1.3, 3.22), 1.1, .8)


def build_super():
    root('super'); pad(7.5, 7)
    cylinder('导弹发射井', (0, 0, .65), 2.8, .7, 'dark', 32)
    cylinder('装甲井盖', (0, 0, 1.06), 2.4, .25, 'light', 32)
    for angle in [0, math.pi / 2, math.pi, math.pi * 1.5]:
        x, y = math.cos(angle) * 2.62, math.sin(angle) * 2.62
        box('发射井锁止', (x, y, 1.02), (.55, .55, .6), 'armor')
        box('状态灯', (x, y, 1.37), (.3, .3, .025), 'team')
    for x in [-2.7, 2.7]:
        box('控制机房', (x, 2.4, 1.0), (1.25, 1.25, 1.55), 'roof')
        beam('发射警戒灯', (x, -2.5, .2), (x, -2.5, 3), .06)
        sphere('警戒灯', (x, -2.5, 3.05), (.12, .12, .12), 'red')
    box('井盖分缝', (0, 0, 1.201), (.035, 4.7, .015), 'dark', .002)


def build_dock():
    root('dock'); pad(8, 6)
    box('船厂车间', (-.6, .6, 1.25), (5.5, 3.5, 2), 'panel')
    box('船厂屋顶', (-.6, .6, 2.4), (5.9, 3.9, .26), 'roof')
    windows(-3.1, 1.9, -1.19, 1.55)
    box('船坞栈桥', (5.0, 0, .13), (5.5, 3.1, .3), 'concrete')
    for x in [3, 5, 7]:
        box('泊位缓冲', (x, -1.6, .25), (.8, .22, .5), 'rubber')
        beam('泊位柱', (x, 1.0, .3), (x, 1.0, .75), .13, 'dark')
    for x in [-1.8, 3.6]:
        beam('港口起重立架', (x, .5, .25), (x, .5, 5.0), .18, 'amber')
    beam('港口吊臂', (-2.2, .5, 5), (6.4, .5, 5), .21, 'amber')
    beam('吊索', (5.7, .5, 5), (5.7, .5, 2.6), .03, 'dark')
    box('船厂标识', (-.6, -1.23, .65), (4.8, .05, .14), 'team')


def chassis(wheeled=False, heavy=False):
    length = 6.3 if heavy else 5.6
    box('车体底盘', (0, 0, .82), (length, 2.6, .8), 'dark', .18)
    shape('楔形装甲车体', [(-length / 2, -1.35), (2.0, -1.35), (length / 2 + .3, -1), (length / 2 + .3, 1), (2.0, 1.35), (-length / 2, 1.35)], .95, 1.55)
    for side in [-1, 1]:
        y = side * 1.48
        if wheeled:
            for x in [-2.0, -.65, .7, 2.1]:
                cylinder('越野车轮', (x, y, .6), .55, .4, 'rubber', 20, (math.pi / 2, 0, 0))
                cylinder('轮毂', (x, y + side * .22, .6), .29, .05, 'light', 16, (math.pi / 2, 0, 0))
        else:
            box('履带', (0, y, .63), (length + .12, .55, 1.05), 'rubber', .32)
            for x in [-2.25, -1.36, -.45, .45, 1.36, 2.25]:
                cylinder('负重轮', (x, y + side * .285, .64), .39, .09, 'dark', 16, (math.pi / 2, 0, 0))
                cylinder('轮轴', (x, y + side * .34, .64), .14, .04, 'light', 12, (math.pi / 2, 0, 0))
            for i in range(20):
                x = -length / 2 + i * length / 19
                box('履带板', (x, y, 1.17), (.19, .59, .055), 'light', .008)
                box('履带接地板', (x, y, .09), (.19, .59, .055), 'dark', .008)
        for i in range(5):
            box('侧裙装甲', (-2.0 + i * .95, side * 1.65, 1.33), (.84, .15, .52), 'armor', .04)
        box('车体识别条', (-.4, side * 1.742, 1.34), (1.0, .025, .13), 'team', .004)
    for y in [-.85, .85]:
        box('车头灯', (length / 2 + .29, y, 1.28), (.055, .24, .17), 'lamp', .015)
    vent((-1.9, 0, 1.65), 1.0, 1.5)
    beam('通信鞭状天线', (-2.3, .8, 1.55), (-2.45, .9, 3.35), .022, 'dark')


def tank(name='tank', heavy=False):
    root(name); chassis(heavy=heavy)
    cylinder('炮塔座圈', (.2, 0, 1.65), 1.2, .25, 'dark', 24)
    shape('复合装甲炮塔', [(-1.55, -.93), (.5, -1.12), (1.5, -.72), (1.55, .72), (.5, 1.12), (-1.55, .93)], 1.68, 2.45)
    for side in [-1, 1]:
        for i in range(4):
            box('反应装甲模块', (-.55 + i * .48, side * .96, 2.1), (.4, .20, .43), 'light', .035)
    cylinder('车长观察舱', (-.55, .45, 2.56), .38, .18, 'light')
    cylinder('舱盖', (-.55, .45, 2.7), .28, .07, 'dark')
    box('光学瞄准镜', (.7, -.45, 2.52), (.45, .3, .23), 'dark')
    box('瞄准玻璃', (.94, -.45, 2.54), (.025, .23, .11), 'glass', .006)
    beam('滑膛炮', (1.45, 0, 2.13), (6.8 if heavy else 6.2, 0, 2.13), .105, 'light')
    beam('炮管隔热套', (1.6, 0, 2.13), (3.65, 0, 2.13), .16, 'armor')
    cylinder('炮管抽烟器', (3.9, 0, 2.13), .19, .38, 'armor', 20, (0, math.pi / 2, 0))
    for x in [-.8, -.25, .3]:
        for y in [-.68, .68]:
            box('炮塔顶部防护模块', (x, y, 2.48), (.43, .36, .09), 'armor', .02)
    for y in [-1.08, 1.08]:
        for x in [-.9, -.65, -.4]:
            beam('炮塔烟幕弹发射管', (x, y, 2.15), (x + .14, y * 1.15, 2.36), .075, 'dark')
    beam('车长机枪', (-.4, .45, 2.86), (.55, .45, 2.86), .035, 'dark')
    box('炮塔识别装甲', (-1.55, 0, 2.18), (.045, .7, .20), 'team')


def vehicle(name, mode):
    root(name); chassis(wheeled=True)
    if mode == 'harvester':
        box('驾驶室', (1.6, 0, 2.1), (1.7, 2.4, 1.3), 'amber')
        box('驾驶室风挡', (2.49, 0, 2.28), (.06, 1.75, .65), 'glass')
        box('矿物装卸斗', (-1, 0, 2.0), (3.4, 2.5, .85), 'dark')
        for y in [-1.25, 1.25]:
            box('货斗侧板', (-1, y, 2.48), (3.4, .17, .65), 'amber')
            for x in [-2.25, -1.4, -.55, .3]:
                box('货斗加强筋', (x, y * 1.09, 2.28), (.07, .06, 1), 'dark', .01)
        box('驾驶室顶盖', (1.6, 0, 2.79), (1.8, 2.52, .13), 'armor', .04)
        for y in [-1.23, 1.23]:
            box('驾驶室侧窗', (1.8, y, 2.3), (.95, .035, .63), 'glass', .03)
            beam('登车扶手', (2.35, y * 1.04, 1.44), (2.35, y * 1.04, 2), .035, 'light')
        for z in [.65, .85, 1.05]:
            box('登车踏板', (2.3, -1.45, z), (.6, .28, .05), 'light', .01)
        for i in range(10):
            sphere('运载矿石', (-2.2 + (i % 4) * .75, -.75 + (i // 4) * .65, 2.55), (.4, .35, .26), 'ore')
        cylinder('采矿破碎滚筒', (3.3, 0, .65), .43, 3.2, 'light', 20, (math.pi / 2, 0, 0))
    elif mode == 'ew':
        box('电磁设备舱', (-.25, 0, 2), (3.5, 2.2, .85), 'panel')
        beam('电子天线塔', (-.9, 0, 2.4), (-.9, 0, 4), .08)
        dish((-.9, 0, 4), 1)
        for x in [.5, 1.2]:
            beam('干扰天线', (x, .4, 2.45), (x, .4, 3.8), .035, 'dark')
        box('电子设备识别', (0, -1.12, 2), (2.2, .04, .14), 'team')
    else:
        cylinder('武器旋转座', (0, 0, 1.7), .9, .2, 'dark')
        for y in [-.58, .58]:
            box('导弹发射箱', (.2, y, 2.2), (3.3 if mode == 'rocket' else 2.7, .72, .65), 'armor', .08, (0, -.20, 0))
            for j in [-.2, .2]:
                cylinder('导弹发射口', (1.72, y + j, 2.5), .13, .05, 'dark', 12, (0, math.pi / 2, 0))
        box('发射单元标识', (-.6, -.96, 2.1), (.8, .05, .15), 'team')
        beam('跟踪雷达支架', (-1.65, .2, 1.8), (-1.65, .2, 3.3), .075)
        dish((-1.65, .2, 3.4), .6)


def aircraft(name, wide=False):
    root(name)
    length = 9.0 if wide else 8.0
    fuselage('流线型隐身机身', [(-length/2,.44,.24),(-2.8,.62,.37),(-1,.8,.38),(.5,.65,.33),(1.6,.51,.26),(2.7,.33,.19),(length/2,.02,.035)])
    sphere('座舱整流罩', (1.35, 0, .74), (1.2, .37, .3), 'airpaint')
    sphere('驾驶舱', (1.4, 0, .87), (.95, .29, .22), 'glass')
    span = 4.2 if wide else 3.35
    for side in [-1, 1]:
        shape('后掠翼', [(1.25, side * .42), (-1.2, side * span), (-2.5, side * span), (-2, side * .48)], .35, .47, 'airpaint', .025)
        shape('尾翼', [(-2.6, side * .4), (-3.65, side * 1.9), (-4.2, side * 1.7), (-3.65, side * .4)], .6, .69, 'light', .025)
        box('垂直尾翼', (-3.2, side * .6, 1.18), (1.3, .12, 1.4), 'airpaint', .04, (side * .27, -.3, 0))
        fuselage('发动机整流舱', [(-length/2,.28,.24),(-2.8,.42,.29),(-.5,.43,.25),(1,.24,.15)], side*.6, .25)
        box('进气口外框', (.65, side * .73, .37), (.52, .5, .42), 'light', .05)
        box('发动机进气道', (.93, side * .73, .37), (.035, .39, .31), 'dark', .01)
        box('机翼识别', (-1.8, side * 1.6, .49), (.42, .34, .012), 'team', .005)
        for x in [-1.7, -1.3, -.9]:
            beam('机翼检修分缝', (x, side * .8, .49), (x-.75, side*2.5, .49), .009, 'dark')
        beam('机翼襟翼分缝', (-2.05, side*.8, .49), (-2.18, side*3, .49), .012, 'dark')
        beam('挂载导弹', (-.2, side * 1.7, .18), (-1.8, side * 1.7, .18), .11, 'light')
        cylinder('双发尾喷口', (-length / 2 - .1, side * .36, .43), .27, .36, 'dark', 20, (0, math.pi / 2, 0))
    for x in [-.6, .6, 2.0]:
        box('机身检修缝', (x, 0, .77), (.025, .85, .012), 'dark', .002)


def drone(name, large=False):
    root(name)
    box('无人机机身', (0, 0, .4), (1.6, .8, .65), 'dark', .16)
    box('无人机识别面板', (0, 0, .75), (.8, .4, .06), 'team')
    extent = 2.0 if large else 1.4
    for x in [-extent, extent]:
        for y in [-extent * .7, extent * .7]:
            beam('旋翼机臂', (0, 0, .42), (x, y, .42), .06)
            cylinder('旋翼电机', (x, y, .5), .17, .25, 'light')
            cylinder('旋翼盘', (x, y, .68), .64 if large else .48, .025, 'dark', 32)
    sphere('光电吊舱', (.7, 0, .12), (.18, .2, .17), 'glass')
    for y in [-.45, .45]:
        beam('无人机挂载', (-.55, y, .2), (.65, y, .2), .09, 'light')


def soldier(name, role):
    root(name)
    for y in [-.15, .15]:
        box('军靴', (.11, y, .09), (.34, .19, .18), 'rubber', .045)
        beam('腿部', (0, y, .22), (-.05, y, .88), .105, 'cloth')
    box('作战服躯干', (0, 0, 1.1), (.31, .45, .54), 'cloth', .12)
    box('防弹背心', (.12, 0, 1.1), (.15, .39, .44), 'armor', .055)
    box('背包', (-.25, 0, 1.16), (.22, .37, .42), 'dark', .06)
    sphere('头部', (0, 0, 1.54), (.12, .125, .17), 'skin')
    sphere('头盔', (-.015, 0, 1.63), (.16, .17, .12), 'amber' if role == 'engineer' else 'armor')
    box('肩部识别', (0, -.25, 1.31), (.15, .025, .08), 'team', .005)
    for y in [-.27, .27]:
        beam('上臂', (0, y, 1.3), (.25, y, 1.12), .074, 'cloth')
        beam('前臂', (.25, y, 1.12), (.47, y * .4, 1.28), .067, 'cloth')
    if role == 'rifle':
        box('突击步枪', (.57, 0, 1.3), (.6, .08, .13), 'dark', .015)
        beam('枪管', (.84, 0, 1.32), (1.03, 0, 1.32), .024, 'dark')
        box('弹匣', (.46, 0, 1.17), (.07, .07, .20), 'dark', .008)
    elif role == 'engineer':
        box('工具箱', (.3, -.4, .55), (.38, .23, .26), 'amber', .025)
    else:
        box('侦察光学仪', (.48, 0, 1.36), (.17, .21, .12), 'dark', .025)


def ship(name, large=False):
    root(name)
    length, width = (11, 2.7) if large else (7.5, 2.2)
    shape('舰船船体', [(-length / 2, -width / 2), (length / 2 - 2, -width / 2), (length / 2 + .35, 0), (length / 2 - 2, width / 2), (-length / 2, width / 2)], -.3, .6, 'dark', .14)
    shape('舰船主甲板', [(-length / 2 + .2, -width / 2 + .13), (length / 2 - 2, -width / 2 + .13), (length / 2, 0), (length / 2 - 2, width / 2 - .13), (-length / 2 + .2, width / 2 - .13)], .6, .74, 'light')
    box('舰桥', (-.65, 0, 1.25), (2.4, width * .68, 1), 'panel')
    box('舰桥观察窗', (.2, 0, 1.7), (.7, width * .72, .35), 'glass')
    box('舰桥顶', (-.65, 0, 1.85), (2.55, width * .75, .18), 'roof')
    cylinder('舰炮基座', (length / 2 - 2.25, 0, 1), .45, .35, 'armor')
    beam('舰炮', (length / 2 - 2.25, 0, 1.18), (length / 2 - .8, 0, 1.18), .065, 'light')
    beam('雷达桅杆', (-.9, 0, 1.9), (-.9, 0, 3.8), .055)
    dish((-.9, 0, 3.7), .7)
    for side in [-1, 1]:
        box('舰船识别涂装', (-.5, side * (width / 2 + .02), .3), (2, .025, .16), 'team')
        railing(-length / 2 + .2, length / 2 - 2, side * (width / 2 - .05), .77)
    if large:
        for x in [-3.7, -3]:
            for y in [-.5, .5]:
                box('垂直发射单元', (x, y, .83), (.5, .5, .16), 'dark', .025)


def turret():
    root('turret'); pad(4.5, 4.5)
    cylinder('炮塔基础', (0, 0, .65), 1.4, .8, 'concrete', 24)
    cylinder('炮塔回转座', (0, 0, 1.16), 1.05, .32, 'dark')
    box('遥控武器塔', (0, 0, 1.65), (1.8, 1.4, .8), 'armor', .14)
    for y in [-.32, .32]:
        beam('自动炮管', (.8, y, 1.75), (2.5, y, 1.75), .08, 'light')
    box('炮塔识别装甲', (-.93, 0, 1.7), (.04, .6, .18), 'team')


def props():
    root('oil'); pad(6, 4.8)
    box('泵站机座', (0, 0, .6), (3.3, 1.8, .8), 'roof')
    for x in [-1, 1]:
        beam('抽油机支架', (x, 0, .7), (0, 0, 3.2), .1)
    beam('抽油机横梁', (-1.7, 0, 3), (2.3, 0, 3.6), .15, 'light')
    beam('抽油杆', (2.3, 0, 3.6), (2.3, 0, .4), .035)
    cylinder('配重轮', (-1.7, 0, 1.4), .72, .22, 'armor', 24, (math.pi / 2, 0, 0))
    cylinder('储油罐', (-1.4, 1.65, 1.0), .7, 1.45, 'light')
    root('beacon'); pad(4.5, 4)
    box('通信机柜', (0, .2, .85), (2.2, 1.7, 1.25), 'roof')
    beam('中立通信塔', (0, .2, 1.5), (0, .2, 4.1), .1)
    dish((0, .2, 4.1), 1)
    box('信标灯带', (0, -.68, 1), (1.8, .05, .14), 'team')
    for name, mat in [('ore_gold', 'ore'), ('ore_gem', 'gem')]:
        root(name)
        for i in range(17):
            a = i * 2.4
            r = .55 + (i % 4) * .45
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=(math.cos(a) * r, math.sin(a) * r, .18 + (i % 3) * .13))
            obj = bpy.context.object
            obj.scale = (.38 + (i % 3) * .1, .31 + (i % 4) * .06, .20 + (i % 3) * .1)
            finish(obj, '矿石碎块', mat)
    root('tree')
    cylinder('树干', (0, 0, 1.6), .12, 3.2, 'bark', 10)
    for i in range(6):
        z = 1.4 + i * .5
        radius = 1.45 - i * .18
        for j in range(8):
            a = j * math.tau / 8 + i * .37
            beam('树枝', (0, 0, z), (math.cos(a) * radius, math.sin(a) * radius, z - .38), .035, 'bark')
            sphere('针叶枝簇', (math.cos(a) * radius * .65, math.sin(a) * radius * .65, z), (radius * .5, radius * .4, .36), 'leaf')
    root('rock')
    for i in range(4):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1, location=((i % 2) * .7 - .4, (i // 2) * .5 - .3, .3))
        obj = bpy.context.object; obj.scale = (.75, .55, .4 + i * .1)
        for polygon in obj.data.polygons:
            polygon.use_smooth = True
        finish(obj, '地表岩块', 'rock')


if __name__ == '__main__':
    build_hq(); build_power(); build_refinery(); build_barracks(); build_factory()
    build_radar(); build_airfield(); build_lab(); build_super(); build_dock(); turret()
    tank(); tank('elite_nato', True)
    vehicle('harvester', 'harvester'); vehicle('aa', 'aa')
    vehicle('elite_china', 'aa'); vehicle('elite_russia', 'rocket'); vehicle('elite_middleeast', 'ew')
    aircraft('fighter'); aircraft('strike', True)
    drone('drone'); drone('ghost'); drone('elite_asia', True)
    soldier('rifle', 'rifle'); soldier('engineer', 'engineer'); soldier('scout', 'scout')
    ship('patrol'); ship('frigate', True); props()

    # 游戏运行时按名称读取模型，所有模板以原点为共同基准。
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'military-library.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True)
    roots = [obj for obj in bpy.context.scene.objects if obj.parent is None]
    for i, obj in enumerate(roots):
        obj.location = ((i % 6) * 13, (i // 6) * 12, 0)
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 24; scene.world.color = (.35, .35, .35)
    bpy.ops.object.light_add(type='SUN', location=(0, 0, 20))
    sun = bpy.context.object; sun.name = '日照'; sun.rotation_euler = (.35, -.5, -.45); sun.data.energy = 3
    bpy.ops.object.camera_add(location=(25, -35, 46))
    camera = bpy.context.object
    camera.rotation_euler = (Vector((25, 10, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    camera.data.type = 'ORTHO'; camera.data.ortho_scale = 75; scene.camera = camera
    scene.render.resolution_x = 1600; scene.render.resolution_y = 1100; scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'military-library.blend'))
    print('模型库已生成:', len(roots), '类模型')
