import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_military_assets as b
from build_logistics_assets import aircraft

b.M['naval'] = b.material('海军灰涂层', (.58, .63, .65), .35, .6)
b.M['cargoBlue'] = b.material('货箱蓝灰涂层', (.18, .37, .43), .35, .65)
b.M['cargoRed'] = b.material('货箱砖红涂层', (.48, .21, .17), .3, .72)
b.M['cargoLight'] = b.material('货箱浅灰涂层', (.68, .69, .62), .3, .65)


def tapered(name, center, bottom, top, height, material='naval'):
    verts = [(x * width / 2, y * depth / 2, z) for width, depth, z in [(bottom[0], bottom[1], 0), (top[0], top[1], height)] for x, y in [(-1,-1),(1,-1),(1,1),(-1,1)]]
    faces = [(3,2,1,0),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.location = center
    b.finish(obj, name, material, .035)


def container(x, y, z, material='panel', length=2.4):
    b.box('标准集装箱', (x, y, z), (length, .93, .95), material, .035)
    for n in range(12):
        b.box('箱壁加强筋', (x - length / 2 + .1 + n * length / 12, y, z), (.035, .96, .93), material, .002)
    for dy in [-.24, .24]:
        b.beam('箱门锁杆', (x - length / 2 - .02, y + dy, z - .4), (x - length / 2 - .02, y + dy, z + .4), .017, 'dark')


def depot():
    b.root('logistics_depot')
    b.box('物流中心地基', (0, 0, .08), (7.2, 6.4, .16), 'roof', .025)
    b.box('物资仓库', (-1.3, -.9, 1.14), (3.7, 3.4, 2.12), 'panel')
    b.box('仓库金属顶棚', (-1.3, -.9, 2.3), (3.9, 3.7, .25), 'light')
    for n in range(20):
        b.box('仓库屋面接缝', (-3.05 + n * .185, -.9, 2.45), (.022, 3.55, .028), 'roof', .002)
    for y in [-2.62, .82]:
        for n in range(18):
            b.box('仓库侧面金属加强筋', (-3 + n * .195, y, 1.2), (.04, .045, 1.85), 'light', .004)
    for x in [-2.3, -1.6]:
        b.box('仓库空调机组', (x, -.2, 2.7), (.53, .9, .47), 'panel')
        for y in [-.48,-.3,-.12,.06]:
            b.box('空调散热格栅', (x, y, 2.95), (.44, .08, .02), 'dark', .002)
    for y in [-1.9, -.5]:
        b.box('卸货月台门', (.58, y, .92), (.06, .85, 1.5), 'dark', .01)
        b.box('月台识别条', (.63, y, 1.85), (.045, .85, .1), 'team', .003)
    b.box('调度室', (-2.2, 1.3, .83), (1.65, 1.1, 1.4), 'light')
    b.box('调度室窗', (-1.36, 1.3, 1.05), (.04, .8, .45), 'glass', .01)
    for x, y, z, m in [(1.2, 1.5, .6, 'cargoBlue'), (1.2, 1.5, 1.58, 'cargoRed'), (1.6, 2.6, .6, 'cargoLight')]:
        container(x, y, z, m)
    for y in [-2.1, -.8]:
        b.box('起重架立柱', (2.6, y, 1.9), (.2, .2, 3.7), 'amber')
    b.box('起重架横梁', (2.6, -1.45, 3.72), (.25, 1.75, .22), 'amber')
    b.beam('吊索', (2.6, -1.45, 3.5), (2.6, -1.45, 1.35), .026, 'dark')
    b.box('吊具', (2.6, -1.45, 1.33), (.55, .7, .1), 'dark')
    for y in [-2.3, -1.3]:
        b.box('卸货车道线', (1.55, y, .19), (1.4, .045, .025), 'lamp', .002)
    b.beam('通信天线', (-2.2, 1.3, 1.55), (-2.2, 1.3, 2.9), .025)


def freighter():
    b.root('containerShip')
    b.shape('集装箱船体', [(-10, -2.3), (6.8, -2.3), (10.4, 0), (6.8, 2.3), (-10, 2.3)], -.55, .9, 'dark', .15)
    b.shape('货运甲板', [(-9.7, -2.2), (6.6, -2.2), (9.6, 0), (6.6, 2.2), (-9.7, 2.2)], .9, 1.08, 'roof')
    for i, x in enumerate([-4.8, -2.1, .6, 3.3]):
        for j, y in enumerate([-1.05, .05, 1.15]):
            colors = ['cargoBlue', 'cargoRed', 'cargoLight']
            container(x, y, 1.58, colors[(i + j) % 3])
            container(x, y, 2.55, colors[(i + j + 1) % 3])
    tapered('货船驾驶楼', (-8, 0, 1.08), (2.7, 3.5), (2.25, 3.1), 3.05)
    b.box('驾驶楼舰桥', (-7.4, 0, 4.18), (1.55, 4, .65), 'panel')
    for y in [-1.4, -.47, .47, 1.4]:
        b.box('舰桥窗', (-6.59, y, 4.22), (.03, .7, .31), 'glass', .003)
    b.box('烟囱', (-8.9, -.9, 4.9), (.8, .75, 1.2), 'dark')
    b.beam('桅杆', (-8, 0, 4.5), (-8, 0, 6.1), .045)
    b.dish((-8, 0, 5.8), .32)
    for y in [-1.9, 1.9]:
        b.sphere('货船救生艇', (-8.6, y, 2.1), (.75, .28, .35), 'amber')
    for z in [1.5, 2.2, 2.9, 3.6]:
        b.box('驾驶楼层线', (-8, 0, z), (2.72, 3.53, .045), 'light', .004)
    for y in [-2.34, 2.34]:
        b.box('后勤识别带', (3, y, .5), (4.2, .035, .21), 'team')
        b.railing(-9.8, 6.2, y, 1.18)


def destroyer():
    b.root('destroyer_china')
    b.shape('驱逐舰船体', [(-10, -1.7), (-7.3, -2), (6.6, -1.9), (10.5, 0), (6.6, 1.9), (-7.3, 2), (-10, 1.7)], -.35, .9, 'dark', .13)
    b.shape('驱逐舰主甲板', [(-9.8, -1.6), (-7.2, -1.9), (6.5, -1.8), (10, 0), (6.5, 1.8), (-7.2, 1.9), (-9.8, 1.6)], .9, 1.1, 'light')
    tapered('隐身舰桥主体', (1.6, 0, 1.1), (3.5, 2.95), (2.85, 2.35), 2.12)
    for y in [-.92,-.46,0,.46,.92]:
        b.box('舰桥驾驶窗', (3.04, y, 2.9), (.045, .35, .25), 'glass', .008)
    for x, y, angle in [(1.7, -1.43, 0), (1.7, 1.43, 0), (3.3, 0, math.pi / 2), (-.08, 0, math.pi / 2)]:
        b.box('相控阵外观面板', (x, y, 2.1), (1.25, .05, 1.15), 'dark', .04, (0, 0, angle))
    b.box('一体化通信桅杆', (1.2, 0, 4.3), (.65, .62, 2.1), 'light', .07)
    b.beam('桅杆天线', (1.2, 0, 5.2), (1.2, 0, 6), .036)
    b.box('雷达横梁', (1.2, 0, 5.15), (.2, 2.1, .16), 'dark')
    for base in [4.6, -4.8]:
        for dx in [-.55, 0, .55]:
            for dy in [-.64, 0, .64]:
                b.box('垂发舱盖外观', (base + dx, dy, 1.16), (.45, .53, .11), 'dark', .01)
    b.box('主炮炮塔', (7.2, 0, 1.67), (1.65, 1.45, 1.05), 'panel', .18)
    b.beam('舰炮炮管', (7.6, 0, 1.94), (9.5, 0, 2.07), .082, 'dark')
    b.box('后部机库', (-7.1, 0, 1.78), (2.15, 2.6, 1.35), 'panel')
    b.box('直升机甲板', (-9.1, 0, 1.14), (1.6, 2.9, .1), 'roof')
    for y in [-.45, .45]:
        b.box('停机坪标线', (-9.1, y, 1.22), (.82, .055, .015), 'lamp', .001)
    b.box('停机坪横线', (-9.1, 0, 1.22), (.055, .95, .015), 'lamp', .001)
    for y in [-1.97, 1.97]:
        b.box('舰队识别带', (-1.5, y, .7), (2.6, .035, .2), 'team')
        b.railing(-9.4, 6.2, y, 1.22)
    for x in [-1.5, -3]:
        b.box('隐身排气道', (x, 0, 2.06), (.82, 1.32, 1.65), 'panel')
        for y in [-.42, -.14, .14, .42]:
            b.box('排气道格栅', (x, y, 2.91), (.7, .12, .035), 'dark', .002)
    for y in [-1.3, 1.3]:
        b.sphere('舰艇救生艇', (-2.7, y, 1.5), (.7, .2, .25), 'amber')
    for x in [-8.1, -6, -3.9, -1.8, .3, 2.4, 4.5, 6.6]:
        b.box('甲板焊缝', (x, 0, 1.11), (.018, 3.1, .018), 'roof', .002)


def carrier():
    b.root('carrier')
    b.shape('航母船体', [(-11,-2.2),(-7,-2.6),(7.6,-2.5),(12,0),(7.6,2.5),(-7,2.6),(-11,2.2)], -.45, .85, 'naval', .18)
    b.shape('航母水线', [(-11,-2.2),(-7,-2.6),(7.6,-2.5),(12,0),(7.6,2.5),(-7,2.6),(-11,2.2)], -.4, -.05, 'dark', .04)
    b.shape('斜角飞行甲板', [(-11.5,-3.7),(6.5,-3.7),(12.4,-1.7),(12.4,2.65),(-11.5,2.65)], 1, 1.25, 'roof', .08)
    tapered('隐身舰岛', (-.35, 1.5, 1.25), (4.2, 1.2), (3.6, .9), 2.5)
    tapered('飞行指挥桥', (.3, 1.5, 3.75), (3.3, 1.5), (2.95, 1.3), .75)
    for x in [-1,-.5,0,.5,1,1.5]:
        for y in [.82,2.18]:
            b.box('舰桥观察窗', (x,y,4.15), (.35,.045,.26), 'glass', .007)
    for x in [-1.6,-.7,.2,1.1]:
        b.box('舰岛侧门', (x, .88, 2), (.33, .055, .65), 'light', .01)
    b.box('飞行指挥桥窗', (1.78, 1.5, 4.15), (.04,1.05,.25), 'glass', .006)
    tapered('综合通信桅杆', (-.4,1.5,4.5), (.6,.55), (.3,.3), 1.7)
    b.dish((-.4,1.5,6), .55)
    b.beam('桅杆顶天线', (-.4,1.5,6), (-.4,1.5,7), .03)
    b.box('通信桅杆横梁', (-.4,1.5,6.4), (.2,1.8,.14), 'dark')
    for x in [-1.6, .8]:
        b.cylinder('舰岛顶部雷达罩', (x,1.5,4.8), .23, .65, 'naval', 20)
    for x in [-8.4,-4.2]:
        b.box('机舱升降机', (x,2.15,1.28), (2.6,.75,.055), 'light', .025)
        b.box('升降机安全线', (x,1.76,1.33), (2.7,.06,.025), 'amber', .003)
    for y in [-1.55,-.35]:
        b.box('弹射滑轨', (5.9,y,1.3), (10.6,.07,.035), 'dark', .003)
        for x in [1.4 + n * .72 for n in range(15)]:
            b.box('弹射跑道黄色边线', (x,y+.25,1.32), (.4,.045,.018), 'amber', .002)
    for n in range(19):
        b.box('斜角甲板着舰中线', (-10.2+n*.64,-2.6+n*.065,1.31), (.38,.09,.018), 'lamp', .002)
    for x in [-8,-7,-6,-5]:
        b.box('阻拦索', (x,-1.2,1.33), (.025,4.1,.025), 'light', .003)
    for y in [-2.7, 2.3]:
        b.railing(-10.5,6,y,1.3)
        for x in [-9,-6,-3,0,3,6]:
            b.box('舷侧结构板', (x,y*.85,.6), (2.6,.07,.5), 'light', .025)
            b.box('甲板航行灯', (x,y,1.4), (.17,.12,.12), 'team', .008)
    for x in [-9,-7.3,-5.6]:
        b.sphere('航母舷侧救生艇', (x,2.45,.65), (.55,.22,.23), 'amber')
    for x in [-10,-6,-2,2,6,10]:
        b.box('甲板分块接缝', (x,-.5,1.29), (.018,5.2,.01), 'light', .002)


depot()
freighter()
destroyer()
carrier()
aircraft('freightPlane', True)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type in ['EMPTY', 'MESH']:
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(b.OUT, 'convoy-library.glb'), export_format='GLB', use_selection=True, export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT, 'convoy-library.blend'))
print('后勤航线与原创 052D 外观模型已生成', flush=True)
