export const TUTORIAL_STEPS = [
  ['选择部队','点击己方坦克。手机上轻点即可。'],
  ['下达移动','点下方“移动”，再点地面。电脑也可以右键移动。'],
  ['扩建供电','在“建筑”选电力站，完成后点基地附近空地部署。'],
  ['补充兵力','在“部队”选一个可用单位，等它出现在基地。'],
  ['维修补给','受损陆军靠近补给车自动维修。飞机或舰艇按 R 返场整备；修复或补弹一次即可。'],
  ['接管据点','选择工程师，右键油井或雷达信标。手机可先点“移动”再点目标；护卫部队一起前往。']
];
export function createTutorial(game) {
  const metrics = game.battleStats?.sides?.[0] || {};
  return {
    done: TUTORIAL_STEPS.map(() => false),
    produced: metrics.unitsProduced || 0,
    repaired: metrics.repairHP || 0,
    resupplied: metrics.resupplies || 0,
    buildings: new Set(game.ownedBuildings(0).map(b => b.id)),
    sites: new Set([...(game.oil || []), ...(game.beacons || [])].filter(s => s.owner === 0).map(s => s.id))
  };
}
export function updateTutorial(progress,game) {
  if(!progress||!game.running||game.online)return progress;
  const units=game.ownedUnits(0);
  progress.done[0] ||= game.selected.some(id=>units.some(u=>u.id===id));
  progress.done[1] ||= units.some(u=>['move','attackMove','patrol'].includes(u.order?.type));
  progress.done[2] ||= game.ownedBuildings(0,'power').some(b=>!progress.buildings.has(b.id));
  progress.done[3] ||= (game.battleStats?.sides?.[0]?.unitsProduced||0)>progress.produced;
  const metrics = game.battleStats?.sides?.[0] || {};
  progress.done[4] ||= (metrics.repairHP || 0) > progress.repaired || (metrics.resupplies || 0) > progress.resupplied;
  progress.done[5] ||= [...(game.oil || []), ...(game.beacons || [])].some(s => s.owner === 0 && !progress.sites.has(s.id));
  return progress;
}
