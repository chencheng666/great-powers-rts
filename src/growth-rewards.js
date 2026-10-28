import { readChallengeProfile } from './challenge-profile.js';
import { readHonors, honorProgress } from './player-honors.js';
export const APPEARANCE_KEY = 'great-powers-appearance-v1';
export const SHARE_URL = 'https://www.daguojueqi.site/play/?from=warreport';
export const GROWTH_REWARDS = [
  {id:'standard',name:'原版涂装',wins:0,maps:0,color:'#86b7ad'},
  {id:'bronze',name:'初战青铜涂装',wins:1,maps:1,color:'#b69862'},
  {id:'jade',name:'远征青玉涂装',wins:3,maps:2,color:'#7bb7b5'},
  {id:'amethyst',name:'挑战紫晶涂装',wins:0,maps:0,challenges:1,color:'#ac8bba'}
];
export function growthProgress(profile, challengeWins = 0) {
  const maps = profile.maps.length;
  return {profile,challengeWins,rank:honorProgress(profile).rank,unlocked:GROWTH_REWARDS.filter(r=>profile.wins>=r.wins&&maps>=r.maps&&challengeWins>=(r.challenges||0)),baseDecor:profile.wins>=3,trial:profile.wins>=3&&maps>=2};
}
export function readGrowth(storage) { return growthProgress(readHonors(storage),readChallengeProfile(storage).results.filter(r=>r.winner===0).length); }
export function growthAppearance(storage) {
  try { const progress=readGrowth(storage),id=storage.getItem(APPEARANCE_KEY); return {theme:progress.unlocked.find(r=>r.id===id)||GROWTH_REWARDS[0],baseDecor:progress.baseDecor}; }
  catch { return {theme:GROWTH_REWARDS[0],baseDecor:false}; }
}
export function equipAppearance(storage,id) {
  if(!readGrowth(storage).unlocked.some(r=>r.id===id))throw new Error('尚未达到解锁条件');
  storage.setItem(APPEARANCE_KEY,id);
}
export function shareText(progress) {
  return `我在《大国崛起》已获得「${progress.rank.name}」，完成 ${progress.profile.wins} 场胜利，在 ${progress.profile.maps.length} 个战区获胜。来试试海陆空即时战略！\n试玩：${SHARE_URL}\n微信公众号：数字机器莱西奥\n开源项目：https://github.com/chencheng666/great-powers-rts\n本机单机荣誉，非联网排名。`;
}
// 只标记内容渠道，不放入玩家标识，避免把分享链接变成追踪个人的邀请链。
export function entrySource(location) {
  try { return ['warreport','wechat','github','xiaohongshu'].includes(new URLSearchParams(location.search).get('from')) ? new URLSearchParams(location.search).get('from') : 'direct'; } catch {return 'direct';}
}
