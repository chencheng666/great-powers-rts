import { CHALLENGES, challengeLosses } from './challenges.js';
import { validBattleId } from './battle-identity.js';

export const CHALLENGE_PROFILE_KEY = 'great-powers-challenge-profile-v1';
export const CHALLENGE_RESULT_LIMIT = 5000;
export const CHALLENGE_FILE_LIMIT = 2 * 1024 * 1024;
const fields = ['battleId','challengeId','winner','stars','time','health','losses','at'];
const integer = value => Number.isSafeInteger(value) && value >= 0;
const invalid = () => { throw new Error('挑战成绩内容不完整或已损坏，原有档案未被覆盖'); };

export const emptyChallengeProfile = () => ({ version: 1, results: [] });

function validateResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || Object.keys(result).some(key=>!fields.includes(key))) invalid();
  const d = Object.hasOwn(CHALLENGES,result.challengeId) && CHALLENGES[result.challengeId];
  if (!d || !validBattleId(result.battleId) || ![0,1].includes(result.winner) || !integer(result.stars) || !integer(result.losses) || result.losses > d.force.length + (d.freight ? 5 : 0) ||
    !Number.isFinite(result.health) || result.health < 0 || result.health > 1 || !Number.isFinite(result.time) || result.time < 0 || result.time > d.limit + .051 || !integer(result.at) || result.at > 8.64e15) invalid();
  const stars = result.winner === 0 ? 1 + Number(result.health >= .7) + Number(result.losses <= 1) : 0;
  const earliest = d.earliestWin ?? (result.challengeId === 'corridor' ? 45 : d.waves.at(-1).at);
  if (result.stars !== stars || result.winner === 0 && (result.health <= 0 || result.time < earliest || result.time >= d.limit)) invalid();
  return result;
}

export function validateChallengeProfile(profile) {
  if (!profile || profile.version !== 1 || Object.keys(profile).some(key=>!['version','results'].includes(key)) || !Array.isArray(profile.results) || profile.results.length > CHALLENGE_RESULT_LIMIT) invalid();
  const ids = new Set();
  for (const result of profile.results) { validateResult(result); if (ids.has(result.battleId)) invalid(); ids.add(result.battleId); }
  return profile;
}

export function challengeRecords(profile) {
  validateChallengeProfile(profile);
  return Object.fromEntries(Object.keys(CHALLENGES).map(id => {
    const attempts = profile.results.filter(r=>r.challengeId===id), wins = attempts.filter(r=>r.winner===0);
    return [id,{ attempts:attempts.length, wins:wins.length, bestStars:Math.max(0,...wins.map(r=>r.stars)), fastestTime:wins.length?Math.min(...wins.map(r=>r.time)):null }];
  }));
}

export function readChallengeProfile(storage) {
  let text;
  try { text=storage.getItem(CHALLENGE_PROFILE_KEY); } catch { throw new Error('无法读取挑战成绩，请检查浏览器存储权限'); }
  if (text === null) return emptyChallengeProfile();
  return parseProfile(text);
}

function parseProfile(text) {
  if (typeof text !== 'string' || text.length > CHALLENGE_FILE_LIMIT) invalid();
  let value; try { value=JSON.parse(text); } catch { invalid(); }
  return validateChallengeProfile(value);
}

export function writeChallengeProfile(storage,profile) {
  validateChallengeProfile(profile);
  try { storage.setItem(CHALLENGE_PROFILE_KEY,JSON.stringify(profile)); } catch { throw new Error('挑战成绩尚未保存：存储不可用或空间不足，可重试；已有最佳成绩保留'); }
}

export function completedChallengeResult(game,at=Date.now()) {
  const d = game?.challenge && Object.hasOwn(CHALLENGES,game.challenge.id) && CHALLENGES[game.challenge.id];
  if (!d || game.online || game.multiplayer || game.running || ![0,1].includes(game.winner)) throw new Error('只能记录已经结束的本地挑战');
  const target=game.getEntity(game.challenge.targetId),health=target?.hp>0?target.hp/target.maxHp:0;
  const result={ battleId:game.battleId,challengeId:game.challenge.id,winner:game.winner,stars:game.challenge.stars,time:game.time,health,losses:challengeLosses(game),at };
  return validateResult(result);
}

export function applyChallengeResult(original,result) {
  validateChallengeProfile(original); validateResult(result);
  if (original.results.some(r=>r.battleId===result.battleId)) return {status:'duplicate',profile:original,improved:[],previous:challengeRecords(original)[result.challengeId]};
  if (original.results.length >= CHALLENGE_RESULT_LIMIT) throw new Error('挑战成绩已达 5000 场上限，本局未写入；请先导出备份，已有成绩保留');
  const previous=challengeRecords(original)[result.challengeId],improved=[];
  if (result.winner===0) {
    if (result.stars>previous.bestStars) improved.push('stars');
    if (previous.fastestTime===null || result.time<previous.fastestTime-.001) improved.push('time');
  }
  const profile={version:1,results:[...original.results.map(r=>({...r})),{...result}]};
  return {status:'recorded',profile,improved,previous};
}

export function settleChallengeResult(storage,game,at=Date.now()) {
  if (game.sandbox) throw new Error('沙盘演练不计挑战成绩');
  const settlement=applyChallengeResult(readChallengeProfile(storage),completedChallengeResult(game,at));
  // 同一战局只写一次，先落盘再展示刷新纪录，失败可用原战局重试。
  if (settlement.status==='recorded') writeChallengeProfile(storage,settlement.profile);
  return settlement;
}

export function exportChallengeProfile(profile) {
  validateChallengeProfile(profile);
  return { format:'great-powers-challenge-profile', version:1, profile:JSON.parse(JSON.stringify(profile)) };
}

export function parseChallengeExport(text) {
  if (typeof text!=='string' || text.length>CHALLENGE_FILE_LIMIT) throw new Error('挑战成绩文件过大');
  let data; try { data=JSON.parse(text); } catch { throw new Error('无法读取挑战成绩：不是有效的 JSON 文件'); }
  if (data?.format!=='great-powers-challenge-profile' || data.version!==1) throw new Error('这不是挑战成绩备份，战局或荣誉请使用对应入口');
  return validateChallengeProfile(data.profile);
}

export function mergeChallengeProfiles(original,incoming) {
  validateChallengeProfile(original); validateChallengeProfile(incoming);
  const results=new Map(original.results.map(r=>[r.battleId,{...r}]));let added=0;
  for (const result of incoming.results) {
    const old=results.get(result.battleId);
    if (old) {
      if (fields.some(key=>key!=='at'&&old[key]!==result[key])) throw new Error('备份中同一场挑战的结算不一致，未合并，原档案保留');
      old.at=Math.min(old.at,result.at);
    } else { results.set(result.battleId,{...result}); added++; }
  }
  if (results.size>CHALLENGE_RESULT_LIMIT) throw new Error('合并后超过 5000 场上限，原档案未被覆盖');
  const profile={version:1,results:[...results.values()].sort((a,b)=>a.at-b.at||a.battleId.localeCompare(b.battleId))};
  validateChallengeProfile(profile);return {profile,added};
}
