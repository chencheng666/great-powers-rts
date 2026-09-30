export const WORLD = { width: 2240, height: 1440, cell: 40, fog: 80 };
export const CORE_BUILDINGS = ['hq', 'refinery', 'barracks', 'factory', 'armory', 'airfield', 'dock'];
export const PRODUCERS = ['barracks', 'factory', 'armory', 'airfield', 'dock'];
export const ORE_VALUES = { gold: 1, gem: 2 };
export const VICTORY_MODES = {
  quick: { name: '快速对战', description: '摧毁敌方全部生产核心' },
  annihilation: { name: '全域歼灭', description: '清除敌方全部建筑与单位' }
};
export const AI_DIFFICULTIES = {
  recruit: { name: '新兵', waveStart: 125, waveInterval: 45, waveSize: 5, thinkInterval: 3.5, combatLimit: 22, engineerStart: 58 },
  standard: { name: '标准', waveStart: 92, waveInterval: 36, waveSize: 7, thinkInterval: 2, combatLimit: 28, engineerStart: 38 },
  veteran: { name: '专家', waveStart: 78, waveInterval: 30, waveSize: 9, thinkInterval: 1.5, combatLimit: 34, engineerStart: 32 }
};

export const FACTIONS = {
  china: { name: '华夏防卫', short: '华夏', color: '#57d7c2', accent: '#9bf4df', symbol: '盾', role: '防守反击', summary: '防空和阵地防御占优，推进速度偏慢。', perk: '防御建筑与防空单位生命 +15%', elite: '陆盾防空车', ability: '全域屏障', abilityDesc: '保护友军并削弱敌方远程攻击 12 秒。' },
  russia: { name: '北境联邦', short: '北境', color: '#e96558', accent: '#ffac8e', symbol: '焰', role: '攻坚突击', summary: '攻城火力强，但无人机与防空能力较弱。', perk: '对建筑伤害 +15%，防空伤害 -12%', elite: '破城火箭车', ability: '震荡轰击', abilityDesc: '轰击指定区域，重创建筑并压制步兵。' },
  nato: { name: '西陆同盟', short: '西陆', color: '#86a9ec', accent: '#c3d4ff', symbol: '钢', role: '重装推进', summary: '装甲正面强势，展开速度略慢。', perk: '坦克生命 +15%，重坦可压制无人机群', elite: '堡垒重坦', ability: '精确轰炸', abilityDesc: '快速轰炸指定区域，对轻甲尤其有效。' },
  asia: { name: '东亚科技体', short: '东亚', color: '#e8bc63', accent: '#ffe4a1', symbol: '蜂', role: '蜂群游击', summary: '无人机灵活廉价，无法承受持续火力。', perk: '无人机成本 -15%，生命 -15%', elite: '蜂群母机', ability: '蜂群突袭', abilityDesc: '向指定区域投放无人机群，持续袭扰。' },
  middleeast: { name: '新月能源体', short: '新月', color: '#bd9bdb', accent: '#e4cdf9', symbol: '磁', role: '电子压制', summary: '干扰敌方高科技单位，重装正面对抗较弱。', perk: '电子单位射程 +15%，坦克伤害 -10%', elite: '电磁干扰车', ability: '区域脉冲', abilityDesc: '使指定区域的敌军载具瘫痪 8 秒。' }
};

export const BUILDINGS = {
  hq: { name: '指挥中心', cost: 1500, time: 45, hp: 1350, power: 0, size: 92, icon: 'castle', desc: '生产核心，失去后将无法继续建造。' },
  power: { name: '电力站', cost: 350, time: 14, hp: 560, power: 100, size: 66, icon: 'zap', desc: '提供 100 电力，保障全军运行。' },
  refinery: { name: '精炼厂', cost: 650, time: 21, hp: 760, power: -20, size: 84, icon: 'factory', desc: '采矿车在此卸载矿石并兑换资金。' },
  barracks: { name: '兵营', cost: 450, time: 17, hp: 600, power: -15, size: 66, icon: 'users', desc: '训练步兵与工程师。' },
  factory: { name: '战车工厂', cost: 850, time: 27, hp: 850, power: -35, size: 88, icon: 'truck', desc: '生产坦克、运输车、维修补给车与采矿车，独立装甲生产线。', requires: 'refinery' },
  armory: { name: '兵工厂', cost: 780, time: 25, hp: 760, power: -25, size: 82, icon: 'warehouse', desc: '生产防空、无人机、电子战、远程火力与阵营装备，独立生产队列。', requires: 'factory' },
  dock: { name: '海军船坞', cost: 850, time: 27, hp: 800, power: -25, size: 92, icon: 'anchor', desc: '沿岸生产舰艇，有电时为舰艇补弹并补充舰载机。', requires: 'factory', naval: true },
  radar: { name: '雷达站', cost: 550, time: 22, hp: 580, power: -30, size: 68, icon: 'radar', desc: '扩大视野并解锁防空、特色单位。', requires: 'factory' },
  airfield: { name: '空军基地', cost: 980, time: 31, hp: 760, power: -45, size: 92, icon: 'plane', desc: '生产制空与对地战机；有电时可补充弹药。', requires: 'radar' },
  turret: { name: '防御炮塔', cost: 440, time: 16, hp: 600, power: -20, size: 56, icon: 'crosshair', desc: '自动攻击地面目标；高空战机需要防空车拦截。', requires: 'barracks' },
  lab: { name: '作战实验室', cost: 950, time: 33, hp: 680, power: -45, size: 70, icon: 'flask-conical', desc: '解锁阵营特色单位和终极技能。', requires: 'radar' },
  super: { name: '战略武器站', cost: 1200, time: 38, hp: 700, power: -70, size: 74, icon: 'orbit', desc: '蓄能后释放阵营终极技能。', requires: 'lab' }
};

export const UNITS = {
  rifle: { name: '突击兵', cost: 120, time: 8, hp: 110, speed: 82, range: 140, damage: 12, cooldown: 0.75, sight: 260, icon: 'user-round', producer: 'barracks', tags: ['infantry'], desc: '经济、可靠的基础作战单位。' },
  engineer: { name: '工程师', cost: 220, time: 12, hp: 80, speed: 76, range: 0, damage: 0, cooldown: 1, sight: 230, icon: 'wrench', producer: 'barracks', tags: ['infantry', 'engineer'], desc: '占领中立油井，为部队增加稳定收入。' },
  scout: { name: '侦察兵', cost: 160, time: 10, hp: 75, speed: 104, range: 0, damage: 0, cooldown: 1, sight: 480, icon: 'binoculars', producer: 'barracks', tags: ['infantry', 'scout'], desc: '无武装；开拓视野，并在 260 范围内识破隐形单位。' },
  tank: { name: '主战坦克', cost: 480, time: 20, hp: 380, speed: 62, range: 205, damage: 38, cooldown: 1.3, sight: 280, icon: 'shield', producer: 'factory', tags: ['armor'], desc: '重装核心，克制步兵和防空单位。' },
  drone: { name: '攻击无人机', cost: 260, time: 13, hp: 130, speed: 116, range: 180, damage: 20, cooldown: 0.85, sight: 330, icon: 'scan', producer: 'armory', tags: ['drone', 'air'], desc: '机动灵活，对装甲目标有额外伤害。' },
  ghost: { name: '隐形侦察无人机', cost: 340, time: 18, hp: 85, speed: 124, range: 0, damage: 0, cooldown: 1, sight: 450, icon: 'eye-off', producer: 'armory', requires: 'radar', faction: 'middleeast', tags: ['drone', 'air', 'scout', 'stealth'], desc: '新月专属；深入敌后提供视野，接近侦察兵、防空车或雷达信标会暴露。' },
  aa: { name: '防空车', cost: 360, time: 17, hp: 230, speed: 72, range: 250, damage: 22, cooldown: 0.8, sight: 320, icon: 'radar', producer: 'armory', requires: 'radar', tags: ['vehicle', 'anti-air'], desc: '压制无人机，也可支援地面战斗。' },
  fighter: { name: '制空战机', cost: 620, time: 24, hp: 215, speed: 210, range: 275, damage: 37, cooldown: 0.85, sight: 470, ammo: 9, rearmTime: 8, icon: 'plane', producer: 'airfield', tags: ['air', 'jet', 'anti-air'], desc: '只攻击空中目标；高速穿越地形，弹药耗尽后返场。' },
  strike: { name: '对地攻击机', cost: 760, time: 29, hp: 235, speed: 170, range: 245, damage: 62, cooldown: 1.55, sight: 420, ammo: 3, rearmTime: 10, icon: 'plane-takeoff', producer: 'airfield', tags: ['air', 'jet', 'bomber'], desc: '重创地面与建筑；无法空战，须返回空军基地补给。' },
  patrol: { name: '近海巡逻艇', cost: 380, time: 18, hp: 270, speed: 110, range: 235, damage: 26, cooldown: 0.9, sight: 355, sonar: 150, icon: 'ship', producer: 'dock', naval: true, tags: ['ship', 'naval', 'anti-sub'], desc: '高速夺取海面优势，近距声呐发现潜艇；对建筑伤害较低。' },
  frigate: { name: '防空护卫舰', cost: 760, time: 29, hp: 470, speed: 72, range: 335, damage: 38, cooldown: 1.55, sight: 435, sonar: 230, icon: 'sailboat', producer: 'dock', naval: true, tags: ['ship', 'naval', 'anti-air', 'anti-sub'], desc: '区域防空与反潜护航；可拦截巡飞弹和舰载机。' },
  harvester: { name: '采矿车', cost: 440, time: 19, hp: 350, speed: 59, range: 0, damage: 0, cooldown: 1, sight: 240, icon: 'pickaxe', producer: 'factory', tags: ['vehicle', 'harvester'], desc: '自动采集矿石，扩张经济。' },
  elite: { name: '阵营特色单位', cost: 650, time: 27, hp: 330, speed: 65, range: 230, damage: 35, cooldown: 1.25, sight: 320, icon: 'sparkles', producer: 'armory', requires: 'lab', tags: ['elite'], desc: '阵营专属战术单位。' },
  loiterer: { name: '巡飞弹发射车', cost: 620, time: 26, hp: 250, speed: 64, range: 520, minRange: 100, damage: 95, cooldown: 4.5, sight: 260, ammo: 4, rearmTime: 8, icon: 'send', producer: 'armory', requires: 'radar', tags: ['vehicle', 'artillery'], desc: '共享侦察视野发射追踪巡飞弹；可被激光、防空与电子干扰反制。' },
  jammer: { name: '电子干扰车', cost: 520, time: 23, hp: 240, speed: 70, range: 235, damage: 0, cooldown: 1, sight: 300, icon: 'radio-tower', producer: 'armory', requires: 'radar', tags: ['vehicle', 'support'], desc: '235 范围压制敌方无人机与导引弹药；不造成直接伤害，不能反制无制导火箭。' },
  laser: { name: '激光反无人机车', cost: 580, time: 25, hp: 220, speed: 67, range: 250, damage: 45, cooldown: .75, sight: 320, icon: 'focus', producer: 'armory', requires: 'radar', tags: ['vehicle', 'anti-drone'], desc: '拦截巡飞弹、击落无人机；连续射击会过热，不能攻击坦克或高空战机。' },
  rocket: { name: '远程火箭炮', cost: 880, time: 34, hp: 230, speed: 52, range: 680, minRange: 180, damage: 85, cooldown: 3.8, sight: 240, ammo: 6, rearmTime: 10, deployTime: 2, icon: 'rocket', producer: 'armory', requires: 'lab', tags: ['vehicle', 'artillery'], desc: '展开 2 秒后发射区域火箭；需要侦察，180 最小射程，有限弹药。' },
  apc: { name: '装甲运输车', cost: 420, time: 19, hp: 430, speed: 90, range: 0, damage: 0, cooldown: 1, sight: 280, capacity: 4, icon: 'bus-front', producer: 'factory', tags: ['vehicle', 'armor', 'transport'], desc: '运载 4 名步兵或工程师；车毁乘员受伤撤出，无法无敌穿越封锁线。' },
  supply: { name: '维修补给车', cost: 460, time: 21, hp: 230, speed: 64, range: 115, damage: 0, cooldown: 1, sight: 270, stock: 120, icon: 'wrench', producer: 'factory', tags: ['vehicle', 'support'], desc: '停驻后消耗库存与资金维修载具、补弹；库存用尽自动回战车工厂补货。' },
  destroyer: { name: '导弹驱逐舰', cost: 1150, time: 40, hp: 800, speed: 67, range: 470, damage: 72, cooldown: 2.6, sight: 440, sonar: 290, ammo: 8, rearmTime: 10, icon: 'ship', producer: 'dock', requires: 'radar', map: 'ocean', tags: ['ship', 'naval', 'anti-air', 'anti-sub', 'artillery'], desc: '远程对舰、防空与反潜；导弹有飞行时间，须靠船坞或补给车补弹。' },
  carrier: { name: '舰队航空母舰', cost: 1900, time: 58, hp: 1400, speed: 43, range: 720, damage: 95, cooldown: 4, sight: 420, ammo: 6, rearmTime: 14, wing: 3, icon: 'plane-takeoff', producer: 'dock', requires: 'lab', map: 'ocean', tags: ['ship', 'naval', 'artillery'], desc: '3 架可被击落的舰载机执行远程打击；飞机返舰，损失后在船坞付费补充，惧怕潜艇。' },
  submarine: { name: '攻击潜艇', cost: 920, time: 35, hp: 420, speed: 64, range: 340, damage: 110, cooldown: 3.5, sight: 360, sonar: 190, ammo: 5, rearmTime: 10, icon: 'waves', producer: 'dock', requires: 'radar', map: 'ocean', tags: ['ship', 'naval', 'submerged', 'stealth'], desc: '潜航伏击舰艇；声呐或发射后短暂暴露，可被反潜舰反制，不能攻击陆地。' }
};

export const BUILD_ORDER = ['power', 'refinery', 'barracks', 'factory', 'armory', 'dock', 'radar', 'airfield', 'turret', 'lab', 'super'];
export const UNIT_ORDER = ['rifle', 'engineer', 'scout', 'tank', 'apc', 'supply', 'harvester', 'drone', 'ghost', 'aa', 'loiterer', 'jammer', 'laser', 'rocket', 'elite', 'fighter', 'strike', 'patrol', 'frigate', 'destroyer', 'carrier', 'submarine'];

export const ORE_LAYOUT = [
  [330, 510, 2100, 'gold'], [330, 930, 2100, 'gold'],
  [760, 320, 1500, 'gem'], [760, 1120, 1500, 'gem'],
  [1110, 590, 2500, 'gold'], [1130, 850, 2500, 'gold'],
  [1480, 320, 1500, 'gem'], [1480, 1120, 1500, 'gem'],
  [1910, 510, 2100, 'gold'], [1910, 930, 2100, 'gold']
];

export const MAPS = {
  ocean: {
    name: '远洋战区', sector: '战区 04 · 大型海战', world: { width: 3520, height: 2240, cell: 40, fog: 80 },
    ore: [[330, 910, 3000, 'gold'], [330, 1330, 3000, 'gold'], [760, 400, 2200, 'gem'], [760, 1840, 2200, 'gem'], [780, 1120, 3200, 'gold'], [2740, 1120, 3200, 'gold'], [2760, 400, 2200, 'gem'], [2760, 1840, 2200, 'gem'], [3190, 910, 3000, 'gold'], [3190, 1330, 3000, 'gold']],
    oil: [{ id: 'oil-a', x: 890, y: 240 }, { id: 'oil-b', x: 2630, y: 2000 }],
    beacons: [{ id: 'beacon-north', x: 1760, y: 480 }, { id: 'beacon-south', x: 1760, y: 1760 }],
    barriers: [{ x1: 1040, y1: 0, x2: 2480, y2: 360 }, { x1: 1040, y1: 600, x2: 2480, y2: 1640 }, { x1: 1040, y1: 1880, x2: 2480, y2: 2240 }],
    noBuild: [{ x1: 1000, y1: 0, x2: 2520, y2: 2240 }],
    bridges: [{ y1: 360, y2: 600 }, { y1: 1640, y2: 1880 }],
    water: { x1: 1040, y1: 0, x2: 2480, y2: 2240 },
    dockZones: [{ x1: 900, y1: 970, x2: 1000, y2: 1270 }, { x1: 2520, y1: 970, x2: 2620, y2: 1270 }]
  },
  valley: {
    name: '灰谷地带', sector: '战区 01',
    ore: ORE_LAYOUT,
    oil: [{ id: 'oil-a', x: 1110, y: 210 }, { id: 'oil-b', x: 1130, y: 1230 }],
    beacons: [{ id: 'beacon-center', x: 1120, y: 720 }],
    barriers: [], noBuild: [], bridges: [], water: null, dockZones: []
  },
  canyon: {
    name: '双桥裂谷', sector: '战区 02',
    ore: [
      [330, 510, 2100, 'gold'], [330, 930, 2100, 'gold'],
      [760, 320, 1500, 'gem'], [760, 1120, 1500, 'gem'],
      [820, 700, 2500, 'gold'], [1420, 740, 2500, 'gold'],
      [1480, 320, 1500, 'gem'], [1480, 1120, 1500, 'gem'],
      [1910, 510, 2100, 'gold'], [1910, 930, 2100, 'gold']
    ],
    oil: [{ id: 'oil-a', x: 870, y: 225 }, { id: 'oil-b', x: 1370, y: 1215 }],
    beacons: [{ id: 'beacon-north', x: 1120, y: 410 }, { id: 'beacon-south', x: 1120, y: 1030 }],
    barriers: [
      { x1: 1040, y1: 0, x2: 1200, y2: 320 },
      { x1: 1040, y1: 500, x2: 1200, y2: 940 },
      { x1: 1040, y1: 1120, x2: 1200, y2: 1440 }
    ],
    noBuild: [{ x1: 1000, y1: 0, x2: 1240, y2: 1440 }],
    bridges: [{ y1: 320, y2: 500 }, { y1: 940, y2: 1120 }],
    water: null, dockZones: []
  },
  strait: {
    name: '海峡前线', sector: '战区 03',
    ore: [
      [330, 510, 2100, 'gold'], [330, 930, 2100, 'gold'],
      [760, 320, 1500, 'gem'], [760, 1120, 1500, 'gem'],
      [740, 700, 2500, 'gold'], [1500, 740, 2500, 'gold'],
      [1480, 320, 1500, 'gem'], [1480, 1120, 1500, 'gem'],
      [1910, 510, 2100, 'gold'], [1910, 930, 2100, 'gold']
    ],
    oil: [{ id: 'oil-a', x: 860, y: 220 }, { id: 'oil-b', x: 1380, y: 1220 }],
    beacons: [{ id: 'beacon-north', x: 1120, y: 420 }, { id: 'beacon-south', x: 1120, y: 1020 }],
    barriers: [
      { x1: 960, y1: 0, x2: 1280, y2: 340 },
      { x1: 960, y1: 500, x2: 1280, y2: 940 },
      { x1: 960, y1: 1100, x2: 1280, y2: 1440 }
    ],
    noBuild: [{ x1: 920, y1: 0, x2: 1320, y2: 1440 }],
    bridges: [{ y1: 340, y2: 500 }, { y1: 940, y2: 1100 }],
    water: { x1: 960, y1: 0, x2: 1280, y2: 1440 },
    dockZones: [{ x1: 800, y1: 590, x2: 900, y2: 850 }, { x1: 1340, y1: 590, x2: 1440, y2: 850 }]
  }
};
