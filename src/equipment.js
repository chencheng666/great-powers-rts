import { FACTIONS, UNITS } from './data.js';

// 原型资料只影响名称、简介与外形，不能把现实宣传参数直接当作游戏战力。
export const EQUIPMENT_SYSTEMS = {
  china: { country: '中国装备', tank: ['99A 主战坦克', '数字化主战坦克原型；在游戏中负责装甲推进。', 'china-tank'], rocket: ['PHL-03 远程火箭炮', '多管远程火箭炮原型；侦察后展开射击，停驻补弹。', 'china-rocket'], fighter: ['歼-20 制空编组', '以歼-20为名称参考，游戏化拆分为制空任务。', 'china-air'], aa: ['红旗-17 防空车', '野战防空系统参考；护卫地面纵队，拦截空中目标。', 'china-aa'] },
  russia: { country: '俄系装备', tank: ['T-90MS 主战坦克', '公开出口型号参考，不代表俄军实际编制；强调装甲突击。', 'russia-tank'], rocket: ['BM-30 龙卷风', '多管火箭炮原型；展开时间与补给制约持续火力。', 'russia-rocket'], fighter: ['Su-35 制空编组', '多用途战斗机参考；本游戏按制空任务配置。', 'russia-air'], apc: ['BTR-82A 运输编组', '轮式装甲输送车参考；本游戏侧重运载，不模拟其机炮。', 'russia-tank'] },
  nato: { country: '北约／美系装备', tank: ['M1A2 艾布拉姆斯', '主战坦克原型；重装推进依赖防空与补给护卫。', 'nato-tank'], rocket: ['M142 HIMARS', '轮式模块化火箭炮参考；有限弹药，展开后远距打击。', 'nato-rocket'], fighter: ['F-22 制空编组', '制空战斗机参考；空中优势不能代替地面占领。', 'nato-air'], strike: ['F-35 对地编组', '多用途战斗机参考；游戏按对地载荷配置，不代表只能对地。', 'nato-strike'], apc: ['Stryker 运输编组', '轮式装甲车族参考；快速运输与部署步兵。', 'nato-tank'] },
  asia: { country: '韩国装备', tank: ['K2 黑豹主战坦克', '韩国主战坦克原型；机动、护卫与侧翼推进相配合。', 'asia-tank'], rocket: ['K239 天舞', '模块化多管火箭炮参考；需保护展开位置和补给线。', 'asia-rocket'], fighter: ['KF-16 制空编组', '韩国F-16体系参考；游戏中担任制空与空中护航。', 'asia-air'] },
  middleeast: { country: '以色列装备', tank: ['Merkava Mk.4 梅卡瓦', '以色列主战坦克参考；保留本阵营的游戏平衡弱点。', 'middleeast-tank'], rocket: ['PULS 火箭炮', '模块化火箭炮系统参考；共享侦察，消耗有限弹药。', 'middleeast-rocket'], fighter: ['F-16I 雷暴编组', '以色列F-16I参考；游戏化制空配置。', 'middleeast-air'], loiterer: ['HAROP 巡飞弹编组', '巡飞弹原型参考；一次性弹药，可被拦截与干扰。', 'middleeast-loiterer'] }
};

export const EQUIPMENT_SOURCES = {
  'china-tank': 'https://www.mod.gov.cn/gfbw/wzll/16144039.html',
  'china-rocket': 'https://eng.mod.gov.cn/xb/Home/Focus/4845434.html', 'china-air': 'https://www.81.cn/kt/10198589.html',
  'china-aa': 'https://tv.81.cn/zgjs/jskj/10183166.html',
  'russia-tank': 'https://roe.ru/upload/pdf/11402_post.pdf',
  'russia-rocket': 'https://roe.ru/pdfs/pdf_2699.pdf', 'russia-air': 'https://roe.ru/pdfs/pdf_2699.pdf',
  'nato-tank': 'https://www.gdls.com/', 'nato-rocket': 'https://www.lockheedmartin.com/en-us/products/himars/media-kit.html',
  'nato-air': 'https://www.lockheedmartin.com/en-us/products/f-22.html',
  'nato-strike': 'https://www.lockheedmartin.com/en-us/products/f-35/f-35-about.html',
  'asia-tank': 'https://www.hyundai-rotem.co.kr/en/business/defense/details.do?productCt03=defense0101',
  'asia-rocket': 'https://www.hanwhaaerospace.com/eng/whoweare/history.do',
  'asia-air': 'https://www.lockheedmartin.com/en-kr/index.html',
  'middleeast-tank': 'https://www.idf.il/en/mini-sites/our-units/armored-corps/armored-corps/',
  'middleeast-rocket': 'https://www.elbitsystems.com/product/puls/',
  'middleeast-air': 'https://www.lockheedmartin.com/en-il/index.html',
  'middleeast-loiterer': 'https://www.iai.co.il/product/harop/'
};

export function equipmentProfile(faction, type) {
  const system = EQUIPMENT_SYSTEMS[faction], entry = system?.[type], data = UNITS[type];
  if (!data) return null;
  if (entry) return { name: entry[0], description: entry[1], country: system.country, category: '现实原型', source: EQUIPMENT_SOURCES[entry[2]] };
  const concept = ['elite', 'ghost', 'drone', 'jammer', 'laser', 'railgun', 'aegis', 'relay'].includes(type);
  return { name: type === 'elite' ? FACTIONS[faction].elite : data.name, description: data.desc, country: system?.country || '通用体系', category: concept ? '原创／概念装备' : '通用战术单位', source: null };
}

export function equipmentModel(faction, type, future = false) {
  if (type === 'navalFighter') return 'fighter';
  if (type === 'navalStrike') return 'strike';
  if (type === 'refinery' && !future) return 'logistics_depot';
  if (type === 'destroyer' && faction === 'china') return 'destroyer_china';
  if (type === 'tank' || type === 'rocket') return `${type}_${faction}`;
  if (future && !UNITS[type]) return `future_${type}`;
  return type === 'elite' ? `elite_${faction}` : type;
}

EQUIPMENT_SYSTEMS.china.destroyer = ['052D 导弹驱逐舰', '052D 公开外观参考：相控阵雷达、垂发甲板与直升机平台；原创简化模型，战力仍遵循统一平衡。', 'china-destroyer'];
EQUIPMENT_SOURCES['china-destroyer'] = 'https://www.mod.gov.cn/djzx/4809824.html';
