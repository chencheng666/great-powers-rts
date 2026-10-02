import bpy
import math
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import build_military_assets as b

# 以公开外形特征制作原创简化模型，不复制厂商网格或声称精确工程复刻。
def tank_variant(faction):
    b.tank('tank_' + faction, faction in ['nato', 'middleeast'])
    if faction == 'china':
        for side in [-1, 1]:
            b.shape('箭形炮塔前装甲', [(1.5,side*.1),(1.9,side*.9),(.25,side*1.25)], 1.75, 2.43, 'armor')
            b.box('数字化观瞄', (.38,side*.68,2.75), (.38,.32,.32), 'dark', .03)
    elif faction == 'russia':
        for x in [-.8,-.3,.2,.7,1.2]:
            for side in [-1,1]: b.box('炮塔爆反模块', (x,side*1.05,2.38), (.36,.28,.23), 'armor', .018, (0,-.15,side*.15))
        for side in [-1,1]:
            for z in [1.74,1.98,2.22]: b.beam('炮塔尾部格栅', (-1.95,side*1.13,z), (-1.95,-side*1.13,z), .016, 'dark')
    elif faction == 'nato':
        b.box('炮塔尾舱', (-1.93,0,2.22), (1.22,2.35,.7), 'armor', .1)
        b.box('隔离弹药舱顶', (-1.93,0,2.66), (1.14,2.21,.09), 'light', .02)
        for side in [-1,1]: b.box('储物篮', (-2.23,side*1.18,2.38), (.84,.22,.44), 'dark', .03)
    elif faction == 'asia':
        b.box('低轮廓尾舱', (-1.72,0,2.2), (1.08,1.85,.55), 'armor', .08)
        for side in [-1,1]:
            b.box('主动防护雷达', (.5,side*1.14,2.58), (.32,.13,.31), 'dark', .02)
            b.beam('防护系统天线', (-1.6,side*.8,2.45), (-1.6,side*.8,3.06), .015, 'light')
    else:
        for side in [-1,1]:
            b.shape('楔形模块炮塔', [(-1.9,side*.55),(.5,side*.8),(1.4,side*1.2),(-1.8,side*1.3)], 1.75, 2.67, 'armor', .06)
            b.box('主动防护阵面', (-.3,side*1.38,2.32), (.45,.13,.32), 'dark', .035)
        b.box('前置动力舱', (1.75,0,1.66), (1.2,1.8,.13), 'dark', .03)
    for side in [-1,1]:
        b.box('侧向战术识别', (-.5,side*1.76,1.39), (1.32,.02,.13), 'team', .004)


def rocket_variant(faction):
    b.root('rocket_' + faction); b.chassis(wheeled=True)
    b.box('装甲驾驶舱', (1.9,0,2.0), (1.65,2.5,1.2), 'armor', .12)
    b.box('驾驶舱风挡', (2.76,0,2.14), (.04,1.93,.57), 'glass', .01)
    b.box('发射平台', (-.72,0,1.76), (3.65,2.35,.24), 'dark')
    if faction in ['china','russia']:
        for y in [-.81,-.27,.27,.81]:
            for z in [2.13,2.65,3.17]:
                b.beam('圆筒火箭发射管', (-2.42,y,z), (.93,y,z+.44), .21, 'armor')
                b.cylinder('发射筒开口', (.94,y,z+.44), .15,.04, 'dark', 16, (0,math.pi/2,0))
    else:
        for y in ([-.6,.6] if faction != 'nato' else [0]):
            b.box('模块化发射舱', (-.63,y,2.58), (3.25,1.0 if faction!='nato' else 1.75,1.24), 'armor', .045, (0,-.14,0))
            for dy in [-.28,.28]:
                for dz in [-.30,.04,.38]: b.cylinder('模块发射筒口', (1.02,y+dy,2.78+dz), .115,.05,'dark',16,(0,math.pi/2,0))
    for side in [-1,1]:
        b.beam('展开支撑架', (-2.25,side*1.26,1.55), (-2.25,side*1.87,.18), .065, 'light')
        b.box('支撑脚', (-2.25,side*1.87,.11), (.6,.45,.13), 'dark', .018)
        b.box('火箭炮识别带', (-.65,side*1.22,1.8), (1.8,.045,.12), 'team', .008)


def future_building(name):
    b.root('future_' + name); b.pad(7.2,6.4)
    b.shape('斜面复合建筑', [(-2.8,-2), (2.4,-2),(3,0),(2.4,2),(-2.8,2)], .25, 2.5, 'panel', .15)
    b.box('穹顶装甲', (-.2,0,2.63), (5.2,3.6,.24), 'light', .12)
    for side in [-1,1]:
        b.box('分段识别灯', (-.2,side*2.03,1.86), (4.2,.045,.10), 'team', .007)
        b.box('设备散热廊', (-2.82,side*1.15,1.1), (.24,1.2,1.0), 'dark', .03)
    b.box('气闸入口', (2.75,0,1.05), (.25,1.5,1.85), 'dark', .06)
    for x in [-2.25,-1.3,-.35,.6,1.55]:
        for side in [-1,1]:
            b.box('外墙接缝',(x,side*2.015,1.03),(.022,.022,1.5),'dark',.002)
            b.box('观察窗',(x,side*2.03,1.43),(.68,.045,.32),'glass',.018)
            b.box('窗口遮阳板',(x,side*2.11,1.66),(.77,.28,.055),'light',.015)
            b.cylinder('检修螺栓',(x,side*1.73,2.79),.027,.04,'dark',12)
    for side in [-1,1]:
        b.railing(-2.6,2.2,side*2.62,.26)
        b.beam('冷却回流管',(-2.9,side*1.65,.65),(-2.9,side*1.65,2.85),.085,'light')
        b.beam('屋面管线',(-2.9,side*1.65,2.85),(1.75,side*1.65,2.85),.075,'light')
        b.vent((-1.65,side*1.0,2.83),.75,.82)
        for x in [-3.2,3.2]: b.box('平台警示标',(x,side*2.9,.255),(.12,.38,.025),'amber',.004)
    if name in ['hq','radar']:
        b.beam('通信塔', (-1.8,0,2.7),(-1.8,0,5),.12,'dark'); b.dish((-1.8,0,4.8),1.15)
        for x in [-.6,.2,1.0]: b.box('相控阵模块',(x,0,3.05),(.55,1.3,.28),'dark',.04)
    elif name in ['power','super','lab']:
        b.cylinder('密封反应堆', (0,0,3.6),1.05,1.8,'dark',32)
        for z in [2.9,3.4,3.9,4.3]: b.cylinder('反应堆冷却环',(0,0,z),1.18,.13,'team',32)
        for x in [-1.7,1.7]: b.box('散热塔',(x,0,3.23),(.54,2.1,1.2),'light',.06)
    elif name == 'refinery':
        for x in [-1.6,0,1.6]: b.cylinder('矿物处理罐',(x,0,3.4),.56,1.7,'light',24)
    elif name in ['factory','armory','airfield']:
        b.shape('机库拱面',[(-1.4,-1.2),(1.4,-1.2),(1.7,0),(1.4,1.2),(-1.4,1.2),(-1.7,0)],2.76,3.55,'roof',.12)
        for x in [-1.3,-.75,-.2,.35,.9,1.4]: b.box('机库加强肋',(x,0,3.6),(.06,2.36,.12),'light',.012)
        for side in [-1,1]: b.box('密封导轨',(2.82,side*.91,1.23),(.18,.1,1.65),'light',.015)
        if name == 'armory':
            for x in [-1.8,-.6,.6]: b.cylinder('电容单元',(x,0,3.85),.29,.48,'dark',20)
        elif name == 'airfield':
            b.beam('导航塔',(1.85,1.0,2.7),(1.85,1.0,4.2),.065,'dark')
            b.box('导航塔灯',(1.85,1.0,4.24),(.28,.28,.18),'lamp',.025)
    elif name == 'turret':
        b.cylinder('炮座',(0,0,3.02),1.08,.5,'dark',32)
        b.box('防御炮塔',(0,0,3.49),(2,1.6,.68),'light',.14)
        for side in [-1,1]: b.beam('防御炮管',(1.0,side*.33,3.46),(3.3,side*.33,3.46),.075,'dark')
    elif name in ['beacon','oil']:
        b.beam('测控桅杆',(0,0,2.7),(0,0,5.1),.11,'light'); b.dish((0,0,4.85),1.0)
        for side in [-1,1]:
            b.box('太阳能板',(-.8,side*1.1,3.06),(2.2,.95,.065),'glass',.025)
            for x in [-1.7,-1.3,-.9,-.5,-.1]: b.box('光伏栅线',(x,side*1.1,3.10),(.02,.91,.02),'light',.002)
    else:
        b.box('生活保障舱',(-.7,0,3.17),(2.8,2.7,.8),'roof',.09)
        for side in [-1,1]: b.box('顶层视窗',(-.7,side*1.36,3.17),(2.1,.035,.35),'glass',.01)


for faction in ['china','russia','nato','asia','middleeast']:
    tank_variant(faction); rocket_variant(faction)
b.M['panel'] = b.material('航天复合外墙',(.59,.66,.69),.38,.54)
b.M['light'] = b.material('航天浅色合金',(.7,.74,.76),.65,.42)
b.M['roof'] = b.material('热防护屋面',(.27,.32,.36),.4,.64)
b.M['glass'] = b.material('测控视窗',(.09,.24,.3),.52,.23)
for name in ['hq','power','refinery','barracks','factory','armory','radar','airfield','turret','lab','super','oil','beacon']:
    future_building(name)

b.root('railgun'); b.chassis(heavy=True)
b.box('电磁加速器炮塔', (0,0,2.18),(2.7,2.1,.88),'light',.14)
for side in [-1,1]:
    b.box('双轨加速器', (3.4,side*.25,2.35),(4.7,.18,.24),'dark',.04)
    for x in [1.5,2.2,2.9,3.6,4.3]: b.box('线圈冷却肋',(x,side*.28,2.36),(.12,.34,.35),'team',.01)
b.box('电容阵列',(-1.6,0,2.31),(.9,1.75,.78),'dark',.05)

b.root('relay'); b.chassis(wheeled=True)
b.box('中继运控舱',(-.4,0,2.07),(3.5,2.2,1.07),'light',.10)
b.beam('折叠桅杆',(-.9,0,2.65),(-.9,0,4.7),.11,'dark'); b.dish((-.9,0,4.5),1.35)
for side in [-1,1]: b.box('通信阵面',(.7,side*.7,3),(.75,.14,1.1),'dark',.04)
b.box('中继车识别',(-.5,-1.13,2.26),(2.4,.04,.12),'team',.006)

b.aircraft('aegis')
b.box('无人航电脊',(.9,0,1.17),(1.1,.37,.24),'dark',.08)
for side in [-1,1]:
    b.beam('翼尖离子导流件',(-1.3,side*3.1,.54),(-2.6,side*3.1,.54),.05,'team')

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(b.OUT,'equipment-library.glb'),export_format='GLB',use_selection=True,export_apply=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(b.OUT,'equipment-library.blend'))
print('已生成五阵营坦克与火箭炮、科幻基地、三种原创未来装备')
