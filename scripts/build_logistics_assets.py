import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_military_assets as b


def landing():
    b.root('landing')
    b.shape('平底登陆舰体', [(-8, -2.4), (6.5, -2.4), (8, -1.8), (8, 1.8), (6.5, 2.4), (-8, 2.4)], -.45, .65, 'dark', .16)
    b.box('车辆甲板', (0, 0, .78), (15.5, 4.5, .24), 'roof')
    for y in [-2.25, 2.25]:
        b.box('舷侧防护', (-.5, y, 1.4), (14.3, .24, 1.1), 'light')
        b.box('舰队识别带', (1, y * 1.07, .44), (3, .04, .18), 'team')
        b.railing(-7, 5.8, y, 2)
    b.box('舰艏跳板', (7.76, 0, 1.1), (.23, 3.7, 1.1), 'light', .06)
    for y in [-1.6, 1.6]:
        b.beam('跳板液压臂', (6.1, y, 1.2), (7.9, y, 1.8), .075, 'amber')
    for x in range(-6, 7):
        for y in [-1.25, 1.25]:
            b.box('甲板车道线', (x, y, .93), (.52, .08, .025), 'lamp', .002)
    b.box('后部舰桥', (-5.7, 0, 2.2), (3.2, 3.6, 2.5), 'panel')
    b.box('驾驶室', (-4.6, 0, 3.68), (1.8, 3.5, .62), 'light')
    for y in [-1.16, -.38, .38, 1.16]:
        b.box('舰桥观察窗', (-3.66, y, 3.72), (.05, .55, .29), 'glass', .01)
    b.beam('通信桅杆', (-5.7, 0, 3.8), (-5.7, 0, 5.7), .075)
    b.dish((-5.7, 0, 5.2), .57)
    for y in [-1.5, 1.5]:
        b.cylinder('排气管', (-6.5, y, 3.9), .26, 1.8, 'dark')
    for x in [-2.6, -1.7]:
        b.box('甲板绑扎箱', (x, -1.7, 1.13), (.7, .5, .4), 'armor')


def aircraft(name, transport=False):
    b.root(name)
    b.sphere('气动机身', (0, 0, 1.2), (7.2, 1.05 if transport else .65, .95 if transport else .6), 'airpaint')
    b.sphere('机鼻驾驶舱', (4.4, 0, 1.9), (1.55, .78 if transport else .48, .45), 'glass')
    b.shape('后掠主翼', [(-3.5, -8.1), (1.2, -2), (2, -.8), (2, .8), (1.2, 2), (-3.5, 8.1), (-5, 8.1), (-2.3, 1), (-2.3, -1), (-5, -8.1)], .98, 1.13, 'airpaint', .05)
    b.shape('水平尾翼', [(-6.1, -.65), (-6.8, -3.4), (-7.5, -3.4), (-7.1, 0), (-7.5, 3.4), (-6.8, 3.4), (-6.1, .65)], 1.6 if transport else 1.2, 1.76 if transport else 1.36, 'light')
    b.box('垂直尾翼', (-6.5, 0, 2.5), (1.75, .13, 2.75), 'airpaint', .1, (0, -.3, 0))
    for y in [-4.3, -2.3, 2.3, 4.3]:
        b.sphere('发动机短舱', (-.1, y, .64), (1.8, .42, .48), 'light')
        b.cylinder('发动机进气口', (1.46, y, .64), .31, .08, 'dark', 24, (0, math.pi / 2, 0))
        b.cylinder('排气喷口', (-1.8, y, .64), .26, .18, 'dark', 24, (0, math.pi / 2, 0))
    for y in [-.92, .92]:
        b.box('机身识别', (.2, y, 1.52), (1.6, .05, .17), 'team')
        for x in [-2.8, -1.5, -.2, 1.1, 2.4]:
            b.box('维护检修缝', (x, y * .82, 1.12), (.035, .035, .65), 'dark', .002)
    if transport:
        b.box('后舱运输跳板', (-6.15, 0, .78), (.14, 1.65, .9), 'light')
        for x, y in [(3.3, 0), (-1.7, -1.1), (-1.7, 1.1)]:
            b.beam('起落架支柱', (x, y, .7), (x, y, .08), .07, 'light')
            b.cylinder('起落架轮胎', (x, y, .08), .2, .14, 'rubber', 16, (math.pi / 2, 0, 0))
    else:
        b.box('腹部弹舱', (-.8, 0, .4), (3.8, 1.15, .15), 'dark', .04)
        for x in [-2.2, -1.4, -.6, .2]:
            b.beam('弹舱挂架', (x, -.4, .42), (x, .4, .42), .04, 'light')


if __name__ == '__main__':
    landing()
    aircraft('bomber')
    aircraft('airlift', True)
    roots = [o for o in bpy.context.scene.objects if o.type == 'EMPTY' and o.parent is None]
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.context.scene.objects:
        if obj.type in ['EMPTY', 'MESH']:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(b.OUT, 'logistics-library.glb'), export_format='GLB', use_selection=True, export_apply=True, export_extras=True)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT, 'logistics-library.blend'))
    print('补给运输模型库已生成：', len(roots), '类模型', flush=True)
