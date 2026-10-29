export const TUTORIAL_STEPS = [
  ['选择部队','点击己方坦克，或拖动框选。手机端可轻点单位。'],
  ['下达移动','选中部队后右键点击地面；手机端点“移动”再轻点目的地。'],
  ['扩建供电','在建筑栏建造电力站，完成后选择基地附近空地部署。'],
  ['补充兵力','在部队栏生产一个可用单位，等待它出现在基地。']
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
