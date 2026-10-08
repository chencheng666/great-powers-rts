import { AI_DIFFICULTIES, FACTIONS, MAPS, VICTORY_MODES } from './data.js';
import { validBattleId } from './battle-identity.js';

export const HONOR_KEY = 'great-powers-player-honors-v1';
export const HONOR_RANKS = [
  { name:'预备指挥官', points:0, wins:0, motto:'你的第一场凯旋，正在前方。' },
  { name:'前线新锐', points:100, wins:1, motto:'第一场胜利，让战区记住了你的名字。' },
  { name:'装甲先锋', points:400, wins:3, motto:'敢于突破，也懂得保护身后的战友。' },
  { name:'战术专家', points:1000, wins:6, motto:'从临场应变，到掌握战场节奏。' },
  { name:'战区统帅', points:2000, wins:10, motto:'运筹一方，让每支部队各尽其能。' },
  { name:'王牌指挥官', points:3600, wins:18, motto:'每一次漂亮的判断，都在铸就你的王牌。' },
  { name:'战略大师', points:6000, wins:28, motto:'眼中不止一场交锋，更有整片战区。' },
  { name:'传奇元帅', points:9500, wins:45, motto:'你走过的征途，已经成为战区的传奇。' }
].map((rank, index) => ({...rank,index,level:index+1}));
export const DIFFICULTY_POINTS = { recruit:100, standard:160, veteran:240 };
export const MODE_POINTS = { quick:0, annihilation:20, control:30 };
export const MILESTONES = [
  { wins:5, points:100, id:'wins-5', name:'五战功勋' },
  { wins:10, points:150, id:'wins-10', name:'久经战阵' },
  { wins:25, points:250, id:'wins-25', name:'战区常胜' },
  { wins:50, points:400, id:'wins-50', name:'五十战荣' },
  { wins:100, points:600, id:'wins-100', name:'百胜传奇' }
];
export const HONOR_ACHIEVEMENTS = [
  {id:'first-win',name:'初战告捷',points:80},
  {id:'first-expert',name:'专家破局',points:60},
  {id:'first-sea',name:'海上制胜',points:40},
  {id:'first-moon',name:'月表凯旋',points:40},
  {id:'all-factions',name:'五阵营统筹',points:100},
  {id:'all-maps',name:'七域征服',points:150},
  ...MILESTONES
];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const known = (table, key) => typeof key === 'string' && Object.hasOwn(table,key);
const achievementIds = new Set(HONOR_ACHIEVEMENTS.map(a=>a.id));
const unique = values => new Set(values).size === values.length;

export function emptyHonors() {
  return {version:1,points:0,wins:0,victories:{recruit:0,standard:0,veteran:0},maps:[],factions:[],achievements:[],completedIds:[],recent:[]};
}

export function validateHonors(profile) {
  const invalid = () => { throw new Error('荣誉档案已损坏或版本不兼容；原有记录未被覆盖'); };
  if (!profile || profile.version!==1 || !integer(profile.points) || !integer(profile.wins) || !profile.victories) invalid();
  if (Object.keys(DIFFICULTY_POINTS).some(key=>!integer(profile.victories[key])) || Object.keys(DIFFICULTY_POINTS).reduce((sum,key)=>sum+profile.victories[key],0)!==profile.wins) invalid();
  for (const [key, predicate, limit] of [
    ['maps',v=>known(MAPS,v),Object.keys(MAPS).length],
    ['factions',v=>known(FACTIONS,v),Object.keys(FACTIONS).length],
    ['achievements',v=>achievementIds.has(v),achievementIds.size],
    ['completedIds',validBattleId,50000]
  ]) if(!Array.isArray(profile[key]) || profile[key].length>limit || !unique(profile[key]) || !profile[key].every(predicate)) invalid();
  if(profile.wins>profile.completedIds.length || !Array.isArray(profile.recent) || profile.recent.length>12 || !unique(profile.recent.map(r=>r?.battleId))) invalid();
  for (const result of profile.recent) {
    if(!result || !profile.completedIds.includes(result.battleId) || !known(MAPS,result.mapId) || !known(FACTIONS,result.faction) || !known(AI_DIFFICULTIES,result.difficulty) || !known(VICTORY_MODES,result.mode) || !integer(result.at) || !Number.isFinite(result.time) || result.time<0 || !integer(result.gained) || !Array.isArray(result.rewards) || result.rewards.length>15) invalid();
    if(result.rewards.some(r=>!r || typeof r.name!=='string' || r.name.length>50 || !integer(r.points)) || result.rewards.reduce((sum,r)=>sum+r.points,0)!==result.gained) invalid();
  }
  return profile;
}

export function readHonors(storage) {
  let text;
  try { text=storage.getItem(HONOR_KEY); } catch { throw new Error('无法读取本机荣誉档案，请检查浏览器存储权限'); }
  if(text===null)return emptyHonors();
  if(typeof text!=='string'||text.length>8*1024*1024)throw new Error('荣誉档案异常；原有记录未被覆盖');
  let value;
  try { value=JSON.parse(text); } catch { throw new Error('荣誉档案无法解析；原有记录未被覆盖'); }
  return validateHonors(value);
}

export function writeHonors(storage, profile) {
  validateHonors(profile);
  try { storage.setItem(HONOR_KEY,JSON.stringify(profile)); } catch { throw new Error('荣誉暂未保存：本机存储不可用或空间不足，可重试；原有积分未被覆盖'); }
}

export function exportHonors(profile, at = Date.now()) {
  validateHonors(profile);
  return {format:'great-powers-honors',version:1,exportedAt:at,profile:JSON.parse(JSON.stringify(profile))};
}

export function parseHonorExport(text) {
  if(typeof text!=='string'||text.length>8*1024*1024)throw new Error('荣誉档案文件过大');
  let data;
  try { data=JSON.parse(text); } catch { throw new Error('无法读取荣誉档案：不是有效的 JSON 文件'); }
  if(data?.format!=='great-powers-honors'||data.version!==1)throw new Error('这不是兼容的荣誉档案文件；战局存档请从主界面导入');
  return validateHonors(data.profile);
}

export function honorRank(profile) {
  return HONOR_RANKS.filter(rank=>profile.points>=rank.points&&profile.wins>=rank.wins).at(-1) || HONOR_RANKS[0];
}

export function honorProgress(profile) {
  const rank=honorRank(profile),next=HONOR_RANKS[rank.index+1];
  return {rank,next,pointsNeeded:next?Math.max(0,next.points-profile.points):0,winsNeeded:next?Math.max(0,next.wins-profile.wins):0,ratio:next?Math.min(1,profile.points/next.points,profile.wins/next.wins):1};
}

function checkResult(result) {
  if(!result || !validBattleId(result.battleId) || ![0,1,'draw'].includes(result.winner) || !known(AI_DIFFICULTIES,result.difficulty) || !known(VICTORY_MODES,result.mode) || !known(MAPS,result.mapId) || !known(FACTIONS,result.faction) || !Number.isFinite(result.time) || result.time<0) throw new Error('战局结算信息不完整，未发放荣誉积分');
}

export function applyHonorResult(original, result, at = Date.now()) {
  validateHonors(original); checkResult(result);
  if(!integer(at))throw new Error('结算时间无效');
  if(original.completedIds.includes(result.battleId))return {status:'duplicate',profile:original,rewards:[],gained:0,unlocked:[],fromRank:honorRank(original),toRank:honorRank(original)};
  const profile=JSON.parse(JSON.stringify(original)),fromRank=honorRank(original),rewards=[],unlocked=[];
  profile.completedIds.push(result.battleId);
  if(result.winner===0) {
    profile.wins++;profile.victories[result.difficulty]++;
    if(!profile.maps.includes(result.mapId))profile.maps.push(result.mapId);
    if(!profile.factions.includes(result.faction))profile.factions.push(result.faction);
    rewards.push({name:`${AI_DIFFICULTIES[result.difficulty].name}难度胜利`,points:DIFFICULTY_POINTS[result.difficulty]});
    if(MODE_POINTS[result.mode])rewards.push({name:`${VICTORY_MODES[result.mode].name}奖励`,points:MODE_POINTS[result.mode]});
    const grant=id=>{
      if(profile.achievements.includes(id))return;
      const achievement=HONOR_ACHIEVEMENTS.find(a=>a.id===id);
      profile.achievements.push(id);unlocked.push(achievement);rewards.push({name:achievement.name,points:achievement.points});
    };
    if(profile.wins===1)grant('first-win');
    if(result.difficulty==='veteran')grant('first-expert');
    if(MAPS[result.mapId].water)grant('first-sea');
    if(result.mapId==='meridian')grant('first-moon');
    if(profile.factions.length===Object.keys(FACTIONS).length)grant('all-factions');
    if(profile.maps.length===Object.keys(MAPS).length)grant('all-maps');
    for(const milestone of MILESTONES)if(profile.wins>=milestone.wins)grant(milestone.id);
  }
  const gained=rewards.reduce((sum,r)=>sum+r.points,0);
  profile.points+=gained;
  if(result.winner===0)profile.recent.unshift({battleId:result.battleId,mapId:result.mapId,faction:result.faction,difficulty:result.difficulty,mode:result.mode,time:result.time,at,gained,rewards});
  profile.recent=profile.recent.slice(0,12);validateHonors(profile);
  return {status:result.winner===0?'awarded':'no-award',profile,rewards,gained,unlocked,fromRank,toRank:honorRank(profile)};
}

export function settleHonors(storage, result, at = Date.now()) {
  const settlement=applyHonorResult(readHonors(storage),result,at);
  if(settlement.status==='duplicate')return settlement;
  // 先一次性保存积分、胜场与结算编号；成功后界面才展示已领取奖励。
  writeHonors(storage,settlement.profile);
  return settlement;
}

export function victoryPraise(settlement, mode) {
  if(settlement.toRank.index>settlement.fromRank.index)return `恭喜晋升为${settlement.toRank.name}！这枚徽章，是对你一次次漂亮指挥的认可。`;
  if(settlement.unlocked.some(a=>a.id==='first-expert'))return '专家战区被你攻克。指挥官，这场更有分量的胜利属于你。';
  if(settlement.unlocked.some(a=>a.id==='first-win'))return '第一场胜利，正式写入你的指挥履历。属于你的征程，从这里开始。';
  return {quick:'敌方生产核心已被摧毁。指挥官，这片战区记住了你的胜利。',annihilation:'你把战术执行到了最后。耐心与坚持，换来了这场完整的胜利。',control:'你把主动权握在了自己手里。占领与守护，同样是制胜的本领。'}[mode];
}
