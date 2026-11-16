import { MAPS, WORLD } from './data.js';
export const RECOMMENDED_MAPS = ['snowtosea'];
export const MAP_CATEGORIES = { recommended:'推荐战场', all:'全部', beginner:'入门陆战', land:'地面推进', sea:'海上与登陆', future:'月表科技', strategy:'战略与会战' };
export function mapCategory(id) {
  const m=MAPS[id];
  if(m?.training) return 'beginner';
  if(m?.future) return 'future';
  if(m?.combinedArms||m?.strategic||m?.maxPlayers===6) return 'strategy';
  return ['ocean','strait','archipelago'].includes(id)?'sea':'land';
}
export function discoverMaps(ids, category='all', query='') {
  const needle=query.trim().toLowerCase();
  return ids.filter(id=>MAPS[id]&&!MAPS[id].missionOnly&&(category==='all'||category==='recommended'&&RECOMMENDED_MAPS.includes(id)||mapCategory(id)===category)&&`${MAPS[id].name} ${MAPS[id].sector}`.toLowerCase().includes(needle));
}
export function mapBrief(id) {
  const m=MAPS[id]; if(!m)return null;
  const tips={beginner:'推荐新兵难度，先练习移动、建造与补给。',land:'关注通道与侧翼，保持生产与前线补给。',sea:'先发展船坞，安排运输与护航，留意可登陆岸线。',future:'月表使用独立装备体系，注意矿石精炼与环境扰动。',strategy:'战场较大，先稳住资源与侦察，再规划多线推进。'};
  const w=m.world||WORLD;
  if(m.snowToSea)return {category:'主战场',tip:'沿雪岭河谷推进，跨桥争夺资源，用舰队控制河口，再派运输机和登陆舰争夺港岛。',size:`${w.width} × ${w.height}`,special:'1位玩家＋5个电脑阵营 · 五处信标 · 三座跨河桥'};
  return {category:MAP_CATEGORIES[mapCategory(id)],tip:m.combinedArms?'北部山口、中部谷道、南部外海。守住船坞，派登陆舰争夺港岛。':tips[mapCategory(id)],size:`${w.width} × ${w.height}`,special:m.combinedArms?'三线推进 · 航空母舰与潜艇':m.progression?'成长解锁 · 普通单机':m.maxPlayers===6?'六方实验战场':m.training?'新兵：5000初始资金与支援':'可调整难度与胜利规则'};
}
// 只用地图定义绘制地形示意，不加载战斗模型，也不展示运行中的敌军信息。
export function mapSketch(id) {
  const m=MAPS[id],w=m.world||WORLD;
  const rect=(r,color)=>`<rect x="${r.x1}" y="${r.y1}" width="${r.x2-r.x1}" height="${r.y2-r.y1}" fill="${color}"/>`;
  const land = (m.islands || []).map(island => `<polygon points="${island.points.map(p => p.join(',')).join(' ')}" fill="#466257" stroke="#afad87" stroke-width="24"/>`).join('');
  const biomes=m.snowToSea?`<defs><linearGradient id="snow-map" x2="0" y2="1"><stop offset="0" stop-color="#d1e0df"/><stop offset=".28" stop-color="#61826b"/><stop offset=".6" stop-color="#7d955a"/><stop offset="1" stop-color="#526f5e"/></linearGradient><clipPath id="snow-land">${(m.islands||[]).map(i=>`<polygon points="${i.points.map(p=>p.join(',')).join(' ')}"/>`).join('')}</clipPath></defs><g clip-path="url(#snow-land)"><rect width="100%" height="100%" fill="url(#snow-map)"/><ellipse cx="6200" cy="1400" rx="1800" ry="1000" fill="#b3a076" opacity=".8"/></g>`:'';
  const roads = (m.roads || []).map(points => `<polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="#b8b396" stroke-width="28"/>`).join('');
  const beaches = (m.combinedArms ? m.beaches : []).map(r => rect(r, '#c5a567')).join('');
  return `<svg viewBox="0 0 ${w.width} ${w.height}" aria-hidden="true" preserveAspectRatio="xMidYMid meet"><rect width="100%" height="100%" fill="${m.future?'#32364e':'#263e37'}"/>${m.water?rect(m.water,'#27607c'):''}${land}${biomes}${(m.barriers||[]).map(r=>rect(r,'#778378')).join('')}${roads}${beaches}${(m.beacons||[]).map(b=>`<circle cx="${b.x}" cy="${b.y}" r="${w.width*.018}" fill="#efcb82"/>`).join('')}</svg>`;
}
