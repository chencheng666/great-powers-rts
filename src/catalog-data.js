import { BUILDINGS, FACTIONS, MAPS, UNITS, supportsMap } from './data.js';
import { equipmentModel, equipmentProfile } from './equipment.js';
import { isLunarRobot, lunarBuildingProfile, ROBOT_ENERGY } from './lunar-robots.js';
import { productionDuration } from './battlefield-details.js';
import { unitCostFor, unitHealthFor } from './unit-specs.js';
import { SUPPLY_ROUTES } from './logistics-economy.js';

export const CATALOG_CATEGORIES = { all: '全部', infantry: '人物／机器人', ground: '地面装备', air: '空中装备', naval: '舰艇', building: '建筑' };
// 这里只补充战术说明；造价、生命、弹药、前置和地图限制读取实际规则。
const GUIDES = {
  rifle: ['前线步兵', '低成本守点，与装甲和防空混编；对装甲伤害降低。', '坦克克制步兵；不要让步兵单独追击装甲。'],
  engineer: ['占领与拆弹', '右键油井、信标或能源仓占领，成功后驻留；可回收物资，右键己方被潜入设施停驻 3 秒拆弹。', '无武装；拆弹不消耗工程师，占领会消耗。被攻击会暂时中断拆弹，需要护卫。'],
  scout: ['侦察与潜入', '480 视野、260 范围反隐；右键可见敌方建筑，一次性潜入并安装 45 秒定时破坏。', '无武装、不隐身；工程师右键本方被潜入设施，停驻 3 秒拆弹。月表保留机器人外形。'],
  tank: ['装甲推进', '优先压制步兵和防空车；配合侦察与补给，利用装甲朝向迎敌。', '空袭和远程火力需要护卫；主炮攻击装甲正面减伤、后部增伤。'],
  drone: ['机动反装甲', '低空跨海与越障，对装甲伤害提高；适合绕侧翼。', '防空、激光与干扰可反制；低空不等于隐身。'],
  ghost: ['隐形侦察', '提供敌后视野，不直接攻击；为远程装备提供目标。', '侦察兵、防空车和雷达信标会识破；新月专属。'],
  aa: ['野战防空', '攻击空中单位并拦截部分导引弹药，与纵队保持共同推进。', '不能对地，不能把它作为坦克；电子机可短时压制。'],
  fighter: ['制空护航', '打击飞行中的战机与无人机，保护轰炸机和运输机。', '不能对地；机场整备期间暴露于地面火力。'],
  strike: ['对地打击', '适合压制建筑、装甲和舰艇；与制空护航协同。', '无法空战，对步兵伤害降低；有限弹药限制持续输出。'],
  patrol: ['近海反潜', '机动巡海、发现潜艇；对舰输出优于攻城。', '不负责高空防空；重型舰艇和空袭需要队友应对。'],
  frigate: ['护航反潜', '保护运输与航母，区域防空、声呐反潜及导引弹药拦截。', '攻城效率较低；电子压制和远程集火可打破护航。'],
  harvester: ['月表经济', '自动采矿卸货，手动移动优先；可按剩余生命回收半价。', '只在采矿经济中使用；未卸载货物不重复计入退款。'],
  elite: ['阵营战术', '与本阵营强项配合，不是通用升级坦克。', '需要实验室；同名生产类别在各阵营有不同机体与职责。'],
  loiterer: ['追踪远程打击', '共享侦察目标，导引弹药飞行后命中；保持最小射程。', '可被防空、激光和干扰反制，近距突击会逼退发射车。'],
  jammer: ['无人机反制', '接近敌方无人机和导引弹药提供局部压制，与装甲协同。', '无直接伤害，不反制无制导火箭；不要单独暴露。'],
  laser: ['反无人机拦截', '攻击低空无人机，拦截部分导引弹药；承担短距保护。', '不能攻击坦克或高空战机，持续射击过热后必须冷却。'],
  rocket: ['区域远程火力', '共享侦察，停驻展开后区域打击；射击后可换阵地。', '有最小射程，近距单位与空袭可反制；无制导火箭不被普通拦截。'],
  apc: ['步兵运输', '右键友方装甲车装载步兵／工程师，停驻后卸载。', '仅能载步兵，没有直接火力；车毁后乘员受伤撤出。'],
  supply: ['机动保障', '默认自动寻找可达的受损／缺弹陆军；可切换驻点保障，缺货回厂。', '库存和维修资金有限，不能保障海上舰艇和飞行战机。'],
  destroyer: ['舰队多用途火力', '远程对舰、沿岸支援、防空和声呐反潜，导弹有飞行时间。', '有限弹药；需返有电港口整备，不能在远海无限回血。'],
  carrier: ['舰载航空', '右键停航航母装载兼容舰载机，起飞后用真实机体出击；最多三架。', '普通陆基战机不可登舰；真实编组与自带攻击组互斥，惧怕潜艇。'],
  submarine: ['水下伏击', '潜航伏击舰艇，发射后短暂暴露；用声呐搜索水下目标。', '不能攻击陆地，反潜舰和敌方声呐可反制；受击也会暴露。'],
  ewPlane: ['空中电子压制', '每 10 秒提供 2.5 秒近距防空压制窗口，配合轰炸与护航。', '无武装；制空机和范围外防空反制，机场停驻时不能展开。'],
  navalFighter: ['舰载制空', '可登己方停航航母，起飞护航，弹药耗尽返舰整备。', '仅制空；舰毁会失去整备平台，需要反潜护卫。'],
  navalStrike: ['舰载对地', '舰载机起飞后执行对地／对舰打击，再返舰付费整备。', '无法空战；同一航母容量与起降占用不能无限叠加。'],
  freightPlane: ['外部空运物资', '固定班次自动运抵后勤中心，卸货完成才到账。', '不能手动生产或下达作战命令；运输被击毁会损失未交付物资。'],
  containerShip: ['外部海运物资', '自动航运至港口卸货，资金到账前需要护航。', '不能载兵、手动生产或重复刷收入；港口被毁海运停止。'],
  landing: ['装甲跨海运输', '步兵 1 格、车辆 4 格；右键登舰，靠岸停驻后卸载。', '无武装，不能在深海卸载；运输单位不能互相嵌套装载。'],
  bomber: ['飞临投弹', '飞临目标 28 距离窗口垂直投弹，再自动返场；范围伤害友军免伤。', '炸弹不追踪移动目标；不能空战或反潜，不兼容航母。'],
  airlift: ['战术空运', '步兵 1 格、车辆 4 格，飞越海域，在安全陆地停驻装卸。', '无武装，不是经济援助航班；不能海上空投坦克。'],
  railgun: ['月表直射穿甲', '侦察后展开直射，选择能建立火线的阵地。', '受地形遮挡、有最小射程，不能防空，仍要补弹。'],
  aegis: ['月表制空', '仅攻击空中目标；离子扰动期间用中继或信标保护链路。', '不能占领地面目标；仍需返机场补弹维修。'],
  relay: ['月表链路支援', '260 范围保护友军空中链路与制导弹药，配合离子扰动周期。', '无武装，不能取代防空和常规补给，需要装甲护卫。']
};
const ELITE_GUIDES = {
  china: ['陆盾防空', '对空伤害提高，保护阵地与推进纵队。', '不能代替侦察、后勤和远程攻城火力。'],
  russia: ['攻坚火力', '对建筑伤害与射程提高，配合前沿侦察拆解阵地。', '防空车保护仍然必要，阵营防空伤害较弱。'],
  nato: ['重装与反蜂群', '高生命重坦压制步兵与无人机，命中无人机有近距溅射。', '生产略慢，不能防御高空战机。'],
  asia: ['蜂群战术装备', '对装甲伤害提高，配合廉价无人机提供组合火力。', '生命较低；当前母机按地面层移动，不等同于可跨海的普通无人机。'],
  middleeast: ['命中电子压制', '命中无人机／载具造成短时瘫痪，射程提高。', '不是全图网络攻击，需进入射程并建立目标视野。']
};
const BUILDING_GUIDES = {
  hq: ['基地建造核心', '保护指挥中心；失去它无法继续建造，后勤中心被毁时可接收低额应急空运。', '快速对战要求摧毁所有生产核心，并非只打指挥中心。'],
  power: ['电网保障', '为生产、维修、港口整备与机器人充电提供供电余量。', '断电拖慢生产和技能充能、停止整备；机器人充电额外占用电力。'],
  refinery: ['经济枢纽', '常规战区接收空运；子午战区精炼本地矿石。', '实际卸货才到账，建更多后勤中心不会无限叠加援助班次。'],
  barracks: ['步兵生产与治疗', '训练步兵、工程师和侦察兵，停驻脱战步兵可治疗补弹。', '设置集结点分散出口；月表改装配机器人，断电不能装配与充电。'],
  factory: ['装甲生产与维修', '生产坦克、运输、补给等载具；维修停驻的地面载具。', '与兵工厂是独立生产线；留出厂门、补给和集结空间。'],
  armory: ['专用装备生产', '生产防空、无人机、电子战和远程装备，独立于战车工厂队列。', '高级单位还需要雷达或实验室，不是建成就全部解锁。'],
  dock: ['舰艇生产与整备', '生产舰队、维修补弹，常规海图接收海运物资。', '须在海岸适建区建造，泊港停稳脱战后整备，运输线仍需护航。'],
  radar: ['空情与科技前置', '扩大基地视野，解锁空军基地和多类高科技装备。', '有电才能运行探测，小地图接入还可由占领信标提供。'],
  airfield: ['飞行器生产与整备', '生产战机，停驻返场付费补弹和维修。', '整备飞机可受地面攻击，制空与机场防守缺一不可。'],
  turret: ['固定阵地防御', '自动打击地面目标及部分低空目标，保护基地入口。', '不能对抗飞行中的高空战机；断电时停止射击。'],
  lab: ['高级科技', '解锁阵营特色单位、火箭炮、轰炸机与战略能力前置。', '科技必须配合经济和部队，实验室本身没有攻击火力。'],
  super: ['阵营战略与网络战', '提供本阵营战略技能；网络战单独充能 120 秒、消耗 500 资金，12 秒预警后干扰敌方新指令 4 秒。', '敌军仍自动还击；摧毁攻击源站或切断其供电立即解除。不属于真实网络入侵或多人联网功能。']
};

const buildingName = (type, future) => lunarBuildingProfile(future, type, BUILDINGS[type]).name;
export function catalogAvailability(kind, type, faction, mapId) {
  const map = MAPS[mapId], d = kind === 'unit' ? UNITS[type] : BUILDINGS[type];
  if (d.faction && d.faction !== faction) return { available: false, reason: `仅 ${FACTIONS[d.faction].name} 可生产` };
  if (type === 'harvester' && !map.future) return { available: false, reason: '新战局仅子午采矿经济使用；旧采矿存档例外' };
  if (d.tags?.includes('logistics')) return { available: false, reason: map.future ? '月表采用本地采矿，不启用外部运输班次' : type === 'containerShip' && !map.water ? '仅常规海图自动运行，不可手动生产' : '外部援助自动运行，不可手动生产' };
  if ((d.naval || d.tags?.includes('ship')) && !map.water) return { available: false, reason: '需要海域战区' };
  if (!supportsMap(d.map, mapId)) return { available: false, reason: `限定战区：${Object.entries(MAPS).filter(([id]) => supportsMap(d.map, id)).map(([, m]) => m.name).join('、')}` };
  return { available: true, reason: type === 'hq' ? '开局核心；存活的指挥中心是继续建造的前提' : '当前阵营与战区可用，仍需满足生产前置、资金与供电' };
}

export function catalogEntry(kind, type, faction = 'china', mapId = 'valley') {
  if (!FACTIONS[faction] || !MAPS[mapId] || !['unit', 'building'].includes(kind)) return null;
  const d = (kind === 'unit' ? UNITS : BUILDINGS)[type]; if (!d) return null;
  const future = !!MAPS[mapId].future, robot = kind === 'unit' && isLunarRobot(future, type);
  const profile = kind === 'unit' ? equipmentProfile(d.faction || faction, type, future) : { name: buildingName(type, future), description: lunarBuildingProfile(future, type, d).desc, category: future ? '原创／月表设施' : '基地设施', source: null };
  const guide = kind === 'building' ? BUILDING_GUIDES[type] : type === 'elite' ? ELITE_GUIDES[faction] : GUIDES[type];
  const category = kind === 'building' ? 'building' : d.tags.includes('infantry') ? 'infantry' : d.tags.includes('ship') ? 'naval' : d.tags.includes('air') ? 'air' : 'ground';
  const duration = kind === 'unit' && d.producer ? productionDuration({ players: [{ faction }], hasPower: () => true }, { owner: 0, type: d.producer }, type) : d.time;
  const stats = [ ['造价', d.tags?.includes('logistics') ? '自动援助' : `¤ ${kind === 'unit' ? unitCostFor(faction, type) : d.cost}`], ['生命', `${Math.round(kind === 'unit' ? unitHealthFor(faction, type) : d.hp)}`] ];
  if (kind === 'building' || d.producer) stats.push([kind === 'building' ? '建造时间' : '满电生产', `${Number(duration.toFixed(2))} 秒`]);
  if (kind === 'unit') {
    stats.push(['机动', `${d.speed}`], ['视野', `${d.sight}`]);
    if (d.damage) stats.push(['基础伤害', `${d.damage}`], [type === 'bomber' ? '投弹窗口' : '基础射程', `${type === 'bomber' ? 28 : d.range}`]);
    if (d.minRange) stats.push(['最小射程', `${d.minRange}`]);
    if (d.deployTime) stats.push(['展开', `${d.deployTime} 秒`]);
    if (robot) stats.push(['电池', `${ROBOT_ENERGY.capacity}%`], ['自动返充', `≤ ${ROBOT_ENERGY.returnAt}%`]);
    else if (d.ammo) stats.push(['弹药批次', `${d.ammo}`]);
    if (d.capacity) stats.push([type === 'carrier' ? '甲板机位' : '载重格数', `${d.capacity}`]);
    if (d.stock) stats.push(['库存', `${d.stock}`]);
    if (d.sonar) stats.push(['声呐', `${d.sonar}`]);
  } else stats.push(['电力', d.power >= 0 ? `+${d.power}` : `${d.power}`]);
  const attention = [guide[2]], tactics = [guide[1]], service = [];
  if (robot) {
    tactics.push('无需氧气、食物或常规弹药；电池驱动移动与脉冲攻击。');
    service.push(`低于 ${ROBOT_ENERGY.returnAt}% 自动返充；电站、装配站或补给车可充电，每机体占 ${ROBOT_ENERGY.chargeLoad} 电力，电量耗尽后需补给车救援。`);
  } else if (kind === 'unit' && !d.tags.includes('logistics') && !['harvester', 'supply'].includes(type)) {
    service.push(d.tags.includes('ship') ? '回己方港口，停稳脱战、供电且有资金时付费维修补弹。' : d.tags.includes('air') ? d.tags.includes('deck') ? '可返机场或所属航母付费整备；航母需停航、有电且脱战。' : '返回机场付费维修补弹；空中状态不能由地面补给车维修。' : d.tags.includes('infantry') ? '回兵营停驻脱战治疗；补给车也可医疗，补弹与维修消耗资金。' : '回战车工厂／兵工厂停驻维修补弹，或由补给车保障，消耗资金与库存。');
    if (d.ammo) attention.push('弹药是射击批次，不是真实逐发弹匣；耗尽自动返场，满弹掉血也可主动整备。');
  }
  const modifiers = { 'nato:tank': '生命 +15%', 'asia:drone': '造价与生命均 -15%', 'china:aa': '生命 +15%', 'russia:aa': '对空伤害 -12%', 'middleeast:tank': '伤害 -10%' };
  if (kind === 'unit' && modifiers[`${faction}:${type}`]) attention.push(`当前阵营修正：${modifiers[`${faction}:${type}`]}。面板生命与造价已计入；基础伤害不含目标克制与阵营倍率。`);
  if (kind === 'building' && type === 'turret' && faction === 'china') attention.push('华夏炮塔承受伤害乘 0.85；面板生命不增加。');
  if (kind === 'building' && type === 'dock' && future) attention.push('月表战区没有海域，展示常规港口模型；当前战区不可建造。');
  if (type === 'super') tactics.push(`${FACTIONS[faction].ability}：${FACTIONS[faction].abilityDesc}`);
  if (type === 'refinery') tactics.push(future ? '矿车实际卸载精炼，外部援助不启用。' : `空运每 ${SUPPLY_ROUTES.air.interval} 秒一班，后勤中心完整卸货 ${SUPPLY_ROUTES.air.value} 资金；同类设施不叠加班次。`);
  const related = [];
  const add = (k, t) => { if (!related.some(e => e.kind === k && e.type === t)) related.push({ kind: k, type: t, name: k === 'building' ? buildingName(t, future) : equipmentProfile(UNITS[t].faction || faction, t, future).name }); };
  if (d.producer) add('building', d.producer);
  if (d.requires) add('building', d.requires);
  if (kind === 'building') {
    for (const [t, u] of Object.entries(UNITS)) if (u.producer === type && (!u.faction || u.faction === faction)) add('unit', t);
    for (const [t, b] of Object.entries(BUILDINGS)) if (b.requires === type) add('building', t);
  }
  const model = equipmentModel(d.faction || faction, type, future && type !== 'dock');
  return { id: `${kind}:${type}`, kind, type, category, name: profile.name, description: profile.description, classification: profile.category, source: profile.source, model, icon: d.icon, role: guide[0], stats, tactics, attention, service, related, availability: catalogAvailability(kind, type, faction, mapId), searchText: [profile.name, d.name, type, guide.join(' '), profile.description, profile.country, profile.category].join(' ').toLowerCase() };
}

export function catalogEntries({ faction = 'china', mapId = 'valley', category = 'all', query = '', currentOnly = false } = {}) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return [...Object.keys(UNITS).map(t => catalogEntry('unit', t, faction, mapId)), ...Object.keys(BUILDINGS).map(t => catalogEntry('building', t, faction, mapId))].filter(e => e && (category === 'all' || e.category === category) && (!currentOnly || e.availability.available) && words.every(word => e.searchText.includes(word)));
}

export class CatalogSession {
  open(game) { this.game = game; this.wasPaused = game?.paused; if (game?.running) game.paused = true; }
  close(current, hidden = false) { if (current === this.game && current?.running && current.winner === null && !this.wasPaused && !hidden) current.paused = false; this.game = null; }
}
