import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_military_assets as b

# 独立模型库保留旋翼关节，避免重建已有陆海空资产。
b.M['carbon'] = b.material('碳纤维', (.12, .15, .17), .35, .66)
b.M['ceramic'] = b.material('复合陶瓷', (.48, .54, .56), .38, .42)
b.M['optic'] = b.material('光学镀膜', (.05, .24, .31), .75, .13)


def rotor(x, y, z, radius, index):
    b.cylinder('无刷电机', (x, y, z - .10), .14, .28, 'dark', 24)
    b.cylinder('电机散热环', (x, y, z), .16, .045, 'light', 24)
    root = b.CURRENT
    joint = bpy.data.objects.new(f'rotor_{index}_{root.name}', None)
    bpy.context.collection.objects.link(joint)
    joint.parent = root
    joint.location = (x, y, z + .06)
    for angle in [0, math.pi]:
        blade = b.shape('复合材料旋翼', [(.08, -.045), (radius * .9, -.065), (radius, .04), (.16, .075)], z + .055, z + .08, 'carbon', .006)
        blade.rotation_euler.z = angle
        blade.location = (x, y, 0)
        blade.parent = joint
        blade.location = (0, 0, -z - .06)
    b.cylinder('桨毂', (x, y, z + .105), .10, .11, 'ceramic', 20)


def quad(name, heavy=False):
    b.root(name)
    b.fuselage('流线型复合机身', [(-1.02, .22, .18), (-.72, .43, .30), (.48, .36, .25), (.98, .14, .15)], z=.62)
    b.box('密封航电舱', (-.18, 0, .84), (.94, .46, .12), 'carbon', .04)
    b.box('机顶识别带', (-.08, 0, .93), (.55, .22, .04), 'team', .012)
    b.box('前向传感窗', (.77, 0, .64), (.07, .26, .15), 'optic', .012)
    points = [(1.35, -.95), (1.35, .95), (-1.35, -.95), (-1.35, .95)]
    if heavy:
        points = [(math.cos(i * math.tau / 6) * 1.95, math.sin(i * math.tau / 6) * 1.95) for i in range(6)]
        b.box('蜂群中继设备', (-.1, 0, 1.04), (.72, .43, .27), 'ceramic', .055)
    for index, (x, y) in enumerate(points):
        b.beam('碳纤维承力臂', (x * .23, y * .22, .68), (x, y, .70), .075, 'carbon')
        b.beam('臂部加强筋', (x * .36, y * .32, .58), (x * .89, y * .87, .69), .035, 'light')
        b.box('机臂识别标', (x * .79, y * .79, .77), (.20, .18, .035), 'team', .005)
        rotor(x, y, .86, .57 if heavy else .55, index)
    for y in [-.37, .37]:
        b.beam('起落架支柱', (-.62, y, .50), (-.55, y * 1.65, .05), .035, 'light')
        b.beam('前起落架', (.48, y, .48), (.48, y * 1.65, .05), .035, 'light')
        b.beam('起落滑橇', (-.8, y * 1.65, .04), (.75, y * 1.65, .04), .035, 'dark')
        b.beam('任务挂架', (-.48, y * 1.72, .43), (.50, y * 1.72, .43), .055, 'dark')
        b.beam('模块化挂载', (-.66, y * 1.72, .32), (.70, y * 1.72, .32), .12, 'ceramic')
        b.box('挂载封盖', (.73, y * 1.72, .32), (.055, .17, .17), 'dark', .015)
    b.sphere('稳定光电吊舱', (.59, 0, .29), (.22, .22, .22), 'dark')
    b.sphere('光学镜头', (.77, 0, .29), (.05, .135, .135), 'optic')
    b.beam('通信天线', (-.68, .18, .90), (-.74, .18, 1.29), .012, 'dark')
    for x in [-.44, -.24, -.04, .16]:
        b.box('散热栅', (x, -.40, .59), (.10, .025, .15), 'dark', .005)


def stealth():
    b.root('ghost')
    b.shape('隐形飞翼机体', [(1.42, 0), (.18, -1.90), (-.83, -1.80), (-.40, -.48), (-.82, 0), (-.40, .48), (-.83, 1.80), (.18, 1.90)], .42, .58, 'airpaint', .045)
    b.fuselage('低可探测机身', [(-.73, .25, .14), (-.30, .34, .20), (.52, .30, .17), (1.38, .035, .055)], z=.62)
    for side in [-1, 1]:
        b.shape('分段控制翼面', [(-.77, side * 1.71), (-.35, side * .70), (-.13, side * .73), (-.54, side * 1.74)], .586, .609, 'carbon', .008)
        b.box('飞翼识别标', (-.10, side * 1.10, .62), (.38, .13, .018), 'team', .005, (0, 0, side * -.38))
        b.box('埋入式进气口', (-.19, side * .22, .79), (.43, .14, .06), 'dark', .012)
    b.box('扁平尾喷口', (-.70, 0, .64), (.08, .32, .08), 'dark', .012)
    b.sphere('腹部侦察载荷', (.49, 0, .36), (.22, .20, .10), 'dark')
    b.sphere('多谱段传感器', (.62, 0, .34), (.07, .13, .08), 'optic')
    b.box('脊背标识', (.40, 0, .83), (.30, .16, .025), 'team', .005)


quad('drone')
stealth()
quad('elite_asia', True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(b.OUT, 'drone-library.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT, 'drone-library.blend'))
print('无人机模型库已生成：攻击四旋翼、隐形飞翼、六旋翼母机')
