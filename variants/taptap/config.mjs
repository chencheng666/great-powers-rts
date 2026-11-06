export const SCIFI_TITLE = '大国崛起：星港演习';
export const SCIFI_BUILD = '20261106-scifi-r3';
export const FACTION_IDS = { china: 'aegis', russia: 'forge', nato: 'citadel', asia: 'swarm', middleeast: 'pulse' };
export const SCIFI_FACTIONS = [
  ['苍穹工程组', '苍穹', '防守与保障'], ['赤炉工程组', '赤炉', '结构拆解'],
  ['磐石工程组', '磐石', '重装机体'], ['流萤工程组', '流萤', '无人协同'], ['星脉工程组', '星脉', '信号干扰']
];
export const SCIFI_UNITS = {
  rifle: '月卫机器人', engineer: '天工工程机器人', scout: '巡星侦察机器人',
  tank: '磐石悬浮机甲', apc: '星舟地面运输舱', supply: '流动整备平台', harvester: '晶矿采集机',
  drone: '流萤无人机', ghost: '微光穿梭机', aa: '天幕拦截平台', loiterer: '巡弋脉冲无人机',
  jammer: '星脉干扰平台', laser: '光束防御平台', rocket: '星辉脉冲平台', elite: '模块化精英机甲',
  fighter: '云隼穿梭机', strike: '月弧穿梭机', bomber: '星环重型无人机', airlift: '星舟空运舱',
  freightPlane: '资源运输穿梭机', railgun: '磁轨机甲', aegis: '天穹拦截机', relay: '星链中继车', ewPlane: '信号支援穿梭机'
};
const BUILDING_NAMES = {
  hq: '星港指挥核心', power: '聚能电站', refinery: '晶矿精炼站', barracks: '机器人装配站',
  factory: '机甲装配厂', armory: '模组研发厂', radar: '信号观测站', airfield: '穿梭机停机坪',
  turret: '脉冲守卫塔', lab: '星港实验室', super: '协同指令节点'
};
const BUILDING_DESCRIPTIONS = {
  hq: '星港的建造核心。保护核心，才能持续扩建基地。',
  power: '为生产、整备和机器人充电供能；每座提供100电力。',
  refinery: '接收采集机运回的晶矿，精炼后转换为建设资金。',
  barracks: '装配月卫、天工与巡星机器人，提供供电、充电和机体维修。',
  factory: '装配悬浮机甲、运输舱、整备平台及晶矿采集机。',
  armory: '独立装配拦截、无人机、信号干扰与远程脉冲模组。',
  radar: '扩大观测视野，解锁特种机体与穿梭机停机坪。',
  airfield: '装配穿梭机，为返回基地的空中机体充能和维修。',
  turret: '自动拦截进入范围的地面机体；空中目标仍需专门防御。',
  lab: '研究工程组特色机体，为协同指令节点提供技术前置。',
  super: '积蓄能量，发动所属工程组的协同指令；依赖稳定供电。'
};

export function fictionText(text) {
  return String(text).replaceAll('great-powers-', 'great-powers-scifi-')
    .replace(/\b(china|russia|nato|asia|middleeast)\b/g, id => FACTION_IDS[id])
    .replaceAll('核威慑', '未开放规则').replaceAll('核武器', '未开放设施').replaceAll('核弹', '未开放装置')
    .replaceAll('国际歌', '星港启航').replaceAll('钢铁洪流', '星港启航').replaceAll('东风浩荡', '群星航迹')
    .replaceAll('现代即时战略', '科幻即时战术').replaceAll('现实原型', '原创科幻').replaceAll('国别', '工程组');
}

// 生成独立发行数据：只导出实际可玩的月表地图和原创机体，不携带现实装备资料。
export function makeScifiData(base) {
  const data = {};
  for (const name of ['WORLD', 'ORE_VALUES', 'VICTORY_MODES', 'AI_DIFFICULTIES', 'ORE_LAYOUT']) data[name] = structuredClone(base[name]);
  data.FACTIONS = Object.fromEntries(Object.entries(FACTION_IDS).map(([old, id], i) => {
    const f = structuredClone(base.FACTIONS[old]);
    const [name, short, role] = SCIFI_FACTIONS[i];
    return [id, { ...f, name, short, role, elite: `${short}模组机甲`, abilityDesc: '虚构星港演习中的协同能力，效果与数值仅用于游戏规则。' }];
  }));
  data.BUILDINGS = Object.fromEntries(Object.entries(base.BUILDINGS).filter(([type]) => type in BUILDING_NAMES).map(([type, value]) => {
    const b = structuredClone(value); delete b.map; delete b.nuclear;
    return [type, { ...b, name: BUILDING_NAMES[type], desc: BUILDING_DESCRIPTIONS[type] }];
  }));
  data.UNITS = Object.fromEntries(Object.entries(base.UNITS).filter(([type]) => type in SCIFI_UNITS).map(([type, value]) => {
    const unit = structuredClone(value); delete unit.map; delete unit.faction;
    return [type, { ...unit, name: SCIFI_UNITS[type], desc: '原创无人机体。生产、能量、视野和性能数值均为虚构演习规则，需要侦察、协同和整备保障。' }];
  }));
  data.BUILD_ORDER = base.BUILD_ORDER.filter(type => type in data.BUILDINGS);
  data.UNIT_ORDER = base.UNIT_ORDER.filter(type => type in data.UNITS);
  data.CORE_BUILDINGS = base.CORE_BUILDINGS.filter(type => type in data.BUILDINGS);
  data.PRODUCERS = base.PRODUCERS.filter(type => type in data.BUILDINGS);
  data.MAPS = Object.fromEntries(['meridian', 'moonsea'].map((id, i) => {
    const map = structuredClone(base.MAPS[id]);
    Object.assign(map, { name: i ? '月海晶矿区' : '子午星港', sector: i ? '星港 02 · 晶矿与环形山' : '星港 01 · 基地与信标', future: true, singleplayerOnly: true, missionOnly: false });
    delete map.progression;
    if (!i) map.training = true;
    return [id, map];
  }));
  return JSON.parse(fictionText(JSON.stringify(data)));
}

export function scifiDataSource(base) {
  const data = makeScifiData(base);
  return Object.entries(data).map(([key, value]) => `export const ${key}=${JSON.stringify(value)};`).join('\n') + `
export const supportsModernMap=()=>false;
export const supportsNuclearMap=()=>false;
export const supportsMap=(required,mapId)=>!!MAPS[mapId]&&(!required||required===mapId||required==='meridian');
`;
}
