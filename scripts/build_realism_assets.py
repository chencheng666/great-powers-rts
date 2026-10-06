import bpy
import os
import sys
import math

sys.path.insert(0, os.path.dirname(__file__))
import build_military_assets as b


def append_models(library, names):
    with bpy.data.libraries.load(os.path.join(b.OUT, library + '.blend'), link=False) as (source, target):
        target.objects = source.objects
    roots = [obj for obj in target.objects if obj and obj.name in names and obj.parent is None]
    keep = {obj for root in roots for obj in [root, *root.children_recursive]}
    for obj in target.objects:
        if not obj:
            continue
        if obj in keep:
            bpy.context.collection.objects.link(obj)
        else:
            bpy.data.objects.remove(obj, do_unlink=True)
    canonical = {mat.name: mat for mat in b.M.values()}
    for obj in keep:
        if obj.type != 'MESH':
            continue
        for i, mat in enumerate(obj.data.materials):
            base = mat.name.rsplit('.', 1)[0] if mat.name.rsplit('.', 1)[-1].isdigit() else mat.name
            if base in canonical:
                obj.data.materials[i] = canonical[base]
    return roots


def building_details(name):
    b.CURRENT = bpy.data.objects[name]
    roof = 4.0 if name in ['factory', 'armory'] else 2.85 if name == 'hq' else 2.23
    for side in [-1, 1]:
        for x in [-2.6, -1.3, 0, 1.3, 2.6]:
            b.box('墙面检修分缝', (x, side * 1.71, 1.08), (.025, .035, 1.45), 'dark', .002)
        b.box('屋面检修走道', (0, side * 1.45, roof), (5.5, .42, .055), 'light', .01)
        b.railing(-2.7, 2.7, side * 1.64, roof)
        b.beam('落水管', (-2.78, side * 1.8, .4), (-2.78, side * 1.8, roof), .04, 'dark')
        for x in [-3.1, 3.1]:
            b.box('混凝土防撞墩', (x, side * 2.5, .48), (.42, .5, .72), 'concrete', .02)
            b.box('防撞墩警示', (x, side * 2.5, .62), (.43, .51, .09), 'amber', .004)
    for x in [-1.4, .2, 1.7]:
        b.vent((x, .7, roof + .1), .65, .75)
    b.box('配电检修箱', (-2.9, .6, 1.05), (.22, .7, .85), 'dark', .015)
    b.beam('检修扶梯', (-3.12, .6, .35), (-3.12, .6, 2.55), .025, 'light')
    b.beam('检修扶梯', (-3.12, 1.02, .35), (-3.12, 1.02, 2.55), .025, 'light')
    for z in [.45, .75, 1.05, 1.35, 1.65, 1.95, 2.25]:
        b.beam('扶梯踏步', (-3.12, .6, z), (-3.12, 1.02, z), .023, 'light')
    if name in ['factory', 'armory']:
        for x in [-2, 0, 2]:
            b.box('工业屋顶采光带', (x, 0, roof + .04), (.8, 2.15, .05), 'glass', .008)
            for y in [-.7, 0, .7]:
                b.box('采光带框架', (x, y, roof + .08), (.86, .035, .04), 'light', .003)
        for side in [-1, 1]:
            for x in [-1.8, -.9, 0, .9, 1.8]:
                b.box('装配厅框架立柱', (x, side * 2.5, 1.4), (.07, .12, 2.3), 'light', .008)
    if name == 'hq':
        b.box('屋顶通信设备柜', (-1.65, .8, 3.1), (.65, .55, .6), 'dark', .025)
        b.cylinder('相控阵转台', (1.9, -.5, 3.1), .22, .3, 'dark')
        b.box('指挥通信阵面', (1.9, -.5, 3.62), (.95, .12, .7), 'light', .02, (0, .2, 0))


b.build_hq(); b.build_power(); b.build_barracks(); b.build_factory()
b.build_factory(); b.CURRENT.name = 'armory'
for obj in list(b.CURRENT.children_recursive):
    if obj.name.startswith(('大型出车门', '钢制卷帘', '吊装立柱', '吊装横梁', '起重索')):
        bpy.data.objects.remove(obj, do_unlink=True)
b.box('精密装配密封门', (3.21, 0, 1.05), (.09, 1.3, 1.8), 'dark', .02)
b.box('兵工电子设备舱', (-1.3, 0, 4.4), (1.4, 1.2, .8), 'light', .04)
for y in [-1.15, 0, 1.15]:
    b.box('兵工储运集装箱', (-4, y, .65), (1.2, .85, 1.0), 'armor', .035)
b.beam('兵工通信杆', (-1.3, 0, 4.8), (-1.3, 0, 5.6), .025, 'dark')
for name in ['hq', 'barracks', 'factory', 'armory']:
    building_details(name)

roots = append_models('equipment-library', ['tank_' + f for f in ['china', 'russia', 'nato', 'asia', 'middleeast']] + ['future_' + t for t in ['hq', 'barracks', 'factory', 'armory', 'power']])
for root in roots:
    b.CURRENT = root
    if root.name.startswith('tank_'):
        for side in [-1, 1]:
            for x in [-2.4, -1.3, -.2, .9, 2]:
                for z in [1.1, 1.49]:
                    b.cylinder('侧裙紧固件', (x, side * 1.74, z), .035, .025, 'light', 12, (math.pi / 2, 0, 0))
            b.beam('车体牵引钢索', (-2.4, side * 1.2, 1.65), (1.8, side * 1.2, 1.65), .027, 'dark')
            b.beam('炮塔通信天线', (-1.25, side * .78, 2.48), (-1.25, side * .78, 3.48), .016, 'dark')
            b.box('车体排气隔热罩', (-2.8, side * .65, 1.25), (.2, .55, .42), 'dark', .025)
        for x in [-2.2, -1.95, -1.7]:
            b.box('发动机散热百叶', (x, 0, 1.69), (.05, 1.65, .04), 'light', .004)
        b.box('炮塔全景观瞄底座', (-.45, -.53, 2.66), (.23, .23, .22), 'dark', .025)
        b.cylinder('炮塔全景观瞄头', (-.45, -.53, 2.9), .17, .21, 'light')
        b.box('炮塔观瞄镜片', (-.25, -.53, 2.91), (.015, .14, .09), 'glass', .004)
    else:
        for side in [-1, 1]:
            b.box('隔热屏连接带', (0, side * 1.75, 2.81), (4.7, .065, .06), 'dark', .008)
            for x in [-2.1, -1.4, -.7, 0, .7, 1.4, 2.1]:
                b.cylinder('舱壁外露紧固件', (x, side * 2.04, .63), .028, .04, 'light', 12, (math.pi / 2, 0, 0))
        b.box('舱外供电接口', (-2.92, 0, .8), (.15, .45, .55), 'amber', .02)

for name in ['fighter', 'strike']:
    b.aircraft(name, name == 'strike')
    for side in [-1, 1]:
        b.box('机翼襟翼接缝', (-1.6, side * 2.05, .57), (.045, 1.4, .025), 'dark', .003)
        b.box('机翼挂架', (-.5, side * 1.45, .39), (.72, .055, .1), 'dark', .01)
        b.beam('机翼导弹轨', (.2, side * 1.45, .23), (-1.3, side * 1.45, .23), .055, 'light')
        b.box('进气口内层', (.3, side * .62, .55), (.7, .16, .28), 'dark', .025)

# 模型采用独立库覆盖对应模板，旧库和其他兵种保持不变。
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type in ['EMPTY', 'MESH']:
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(b.OUT, 'realism-library.glb'), export_format='GLB', use_selection=True, export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT, 'realism-library.blend'))
print('已生成五类常规设施、五类月表设施、五阵营坦克与两类飞机细化模型', flush=True)
