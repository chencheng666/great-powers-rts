import bpy
import os
import sys
import math
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
import build_military_assets as b

b.M['robot'] = b.material('月表陶瓷装甲', (.74, .79, .81), .45, .4)
b.M['titanium'] = b.material('机器人钛合金', (.38, .44, .47), .82, .35)


def robot(kind):
    b.root('robot_' + kind)
    b.box('骨盆承力框架', (0, 0, .95), (.32, .47, .18), 'titanium', .05)
    b.box('密封胸部机舱', (0, 0, 1.35), (.37, .57, .57), 'robot', .08)
    b.box('电池背包', (-.23, 0, 1.37), (.23, .48, .5), 'dark', .035)
    for z in [1.22, 1.34, 1.46]:
        b.box('电池散热鳍片', (-.36, 0, z), (.035, .43, .025), 'titanium', .004)
    b.box('胸部状态灯', (.2, 0, 1.38), (.03, .24, .08), 'team', .008)
    b.cylinder('颈部旋转机构', (0, 0, 1.72), .095, .12, 'titanium')
    b.box('光电传感器头部', (.015, 0, 1.89), (.33, .36, .26), 'robot', .04)
    b.box('光学传感器遮罩', (.193, 0, 1.9), (.045, .29, .12), 'dark', .02)
    for y in [-.075, .075]:
        b.sphere('光电镜头', (.22, y, 1.91), (.025, .034, .034), 'team')
    for side in [-1, 1]:
        y = side * .18
        joint = bpy.data.objects.new('robot_leg_' + ('left' if side < 0 else 'right'), None)
        bpy.context.collection.objects.link(joint)
        joint.parent = b.CURRENT
        joint.location = (0, y, .92)
        before = set(bpy.context.scene.objects)
        b.sphere('髋关节轴承', (0, y, .92), (.105, .105, .105), 'titanium')
        b.beam('大腿承力杆', (0, y, .86), (.055, y, .53), .073, 'dark')
        b.box('大腿装甲', (.02, y, .72), (.21, .2, .34), 'robot', .03)
        b.cylinder('膝关节电机', (.045, y, .5), .102, .21, 'titanium', rotate=(math.pi / 2, 0, 0))
        b.beam('小腿液压驱动', (.045, y, .44), (-.035, y, .16), .055, 'titanium')
        b.box('小腿防尘护甲', (0, y, .3), (.18, .18, .25), 'robot', .026)
        b.box('月表足底', (.05, y, .075), (.38, .24, .12), 'dark', .025)
        for x in [-.08, .02, .12]:
            b.box('足底抓地齿', (x, y, .02), (.04, .23, .035), 'titanium', .004)
        for obj in set(bpy.context.scene.objects) - before:
            obj.parent = joint
            obj.location -= joint.location
        b.sphere('肩关节', (0, side * .36, 1.56), (.105, .12, .105), 'titanium')
        b.beam('手臂上段', (0, side * .36, 1.53), (.12, side * .4, 1.26), .07, 'dark')
        b.box('肩部护甲', (0, side * .36, 1.57), (.26, .23, .17), 'robot', .035)
        b.sphere('肘关节', (.12, side * .4, 1.23), (.08, .08, .08), 'titanium')
        b.beam('前臂驱动杆', (.12, side * .4, 1.23), (.4, side * .23, 1.3), .062, 'titanium')
        b.box('夹持末端', (.4, side * .23, 1.3), (.14, .12, .12), 'dark', .02)
    if kind == 'rifle':
        b.box('脉冲电容武器', (.47, -.06, 1.3), (.55, .14, .19), 'dark', .03)
        b.beam('脉冲发射轨', (.62, -.06, 1.32), (.94, -.06, 1.32), .043, 'titanium')
        for x in [.37, .47, .57]:
            b.box('脉冲电容线圈', (x, -.14, 1.3), (.035, .024, .12), 'team', .003)
    elif kind == 'engineer':
        b.box('工具模块', (.46, -.08, 1.28), (.26, .22, .21), 'amber', .026)
        for y in [-.16, 0]:
            b.beam('工程夹爪', (.5, y, 1.28), (.75, y, 1.35), .022, 'titanium')
        b.box('接管通信终端', (-.24, .25, 1.5), (.2, .12, .29), 'amber', .02)
    else:
        b.beam('传感器桅杆', (-.24, 0, 1.63), (-.24, 0, 2.22), .02, 'titanium')
        b.sphere('扫描光电球', (-.24, 0, 2.18), (.095, .13, .1), 'dark')
        b.box('多光谱镜头', (-.135, 0, 2.18), (.025, .14, .06), 'team', .008)


for kind in ['rifle', 'engineer', 'scout']:
    robot(kind)
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.context.scene.objects:
    if obj.type in ['EMPTY', 'MESH']:
        obj.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(b.OUT, 'robot-library.glb'), export_format='GLB', use_selection=True, export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT, 'robot-library.blend'))
print('月表三型原创机器人模型已生成', flush=True)
