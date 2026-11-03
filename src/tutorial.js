export const TUTORIAL_STEPS = [
  ['选择部队','点击己方坦克。手机上轻点即可。'],
  ['下达移动','点下方“移动”，再点地面。电脑也可以右键移动。'],
  ['扩建供电','在“建筑”选电力站，完成后点基地附近空地部署。'],
  ['补充兵力','在“部队”选一个可用单位，等它出现在基地。']
];
export function createTutorial(game) { return {done:[false,false,false,false],produced:game.battleStats?.sides?.[0]?.unitsProduced||0,buildings:new Set(game.ownedBuildings(0).map(b=>b.id))}; }
export function updateTutorial(progress,game) {
  if(!progress||!game.running||game.online)return progress;
  const units=game.ownedUnits(0);
  progress.done[0] ||= game.selected.some(id=>units.some(u=>u.id===id));
  progress.done[1] ||= units.some(u=>['move','attackMove','patrol'].includes(u.order?.type));
  progress.done[2] ||= game.ownedBuildings(0,'power').some(b=>!progress.buildings.has(b.id));
  progress.done[3] ||= (game.battleStats?.sides?.[0]?.unitsProduced||0)>progress.produced;
  return progress;
}
