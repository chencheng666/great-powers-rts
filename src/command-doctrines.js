import { UNITS } from './data.js';

export const commandEnabled = game => game.commandVersion === 1 && !game.multiplayer && game.map?.snowToSea;
export const DOCTRINE_COST = 900;
export const DOCTRINE_TIME = 50;
// 每个方向都有代价；直接修正实际模拟，图鉴和界面读取同一套规则。
export const COMMAND_DOCTRINES = Object.freeze({
  china:[{id:'bastion',name:'阵地保障',description:'整备供油速度＋30%，载具速度－5%。',service:1.3,speed:.95},{id:'mobility',name:'机动防空',description:'载具速度＋10%，移动耗油＋12%。',speed:1.1,fuelUse:1.12}],
  russia:[{id:'siege',name:'阵地攻坚',description:'坦克与火箭炮伤害＋12%，全军载具速度－8%。',damage:1.12,types:['tank','rocket'],speed:.92},{id:'breakthrough',name:'快速突破',description:'载具速度＋12%，全军武器伤害－5%。',speed:1.12,damage:.95}],
  nato:[{id:'sustain',name:'重装维持',description:'移动耗油－20%，武器伤害－5%。',fuelUse:.8,damage:.95},{id:'escort',name:'空地护卫',description:'防空车与制空机伤害＋15%，其他武器伤害－4%。',damage:1.15,types:['aa','fighter','navalFighter'],otherDamage:.96}],
  asia:[{id:'recon',name:'侦察网络',description:'单位视野＋20%，武器伤害－5%。',sight:1.2,damage:.95},{id:'precision',name:'精确反甲',description:'坦克与火箭炮伤害＋12%，单位视野－6%。',damage:1.12,types:['tank','rocket'],sight:.94}],
  middleeast:[{id:'intel',name:'情报控制',description:'单位视野＋15%，整备供油速度－8%。',sight:1.15,service:.92},{id:'raid',name:'机动压制',description:'载具速度＋12%，移动耗油＋18%。',speed:1.12,fuelUse:1.18}]
});
export function doctrineFor(game,side){return commandEnabled(game)?COMMAND_DOCTRINES[game.players[side]?.faction]?.find(d=>d.id===game.players[side]?.doctrine?.id):null;}
export function doctrineFactor(game,unit,key){
  const d=doctrineFor(game,unit.owner);if(!d||UNITS[unit.type]?.tags.includes('logistics'))return 1;
  if(key==='speed'&&UNITS[unit.type]?.tags.includes('infantry'))return 1;
  if(key==='damage'&&d.types&&!d.types.includes(unit.type))return d.otherDamage||1;
  return d[key]||1;
}
export function validDoctrine(player,enabled,time){
  const d=player.doctrine,p=player.doctrinePending;
  if(!enabled)return d===undefined&&p===undefined;
  const known=id=>COMMAND_DOCTRINES[player.faction]?.some(d=>d.id===id);
  return (!d||known(d.id)&&typeof d.completedAt==='number'&&d.completedAt>=0&&d.completedAt<=time)&&(!p||!d&&known(p.id)&&Number.isFinite(p.progress)&&p.progress>=0&&p.progress<=DOCTRINE_TIME);
}
export const commandDoctrines={
  chooseDoctrine(side,id){
    const p=this.players[side];if(!commandEnabled(this)||!p||this.paused||!this.running||this.isControlLocked(side)||p.eliminated||p.doctrine||p.doctrinePending||!this.hasBuilding(side,'hq')||!this.hasPower(side)||p.credits<DOCTRINE_COST||!COMMAND_DOCTRINES[p.faction].some(d=>d.id===id))return false;
    p.credits-=DOCTRINE_COST;p.doctrinePending={id,progress:0};if(side===0)this.events.notice?.('作战方向已选定，指挥中心开始准备');return true;
  },
  updateDoctrines(dt){
    if(!commandEnabled(this))return;
    for(const p of this.players){
      if(p.eliminated)continue;
      if(p.doctrinePending&&this.hasBuilding(p.side,'hq')&&this.hasPower(p.side)&&!this.isControlLocked(p.side)){
        p.doctrinePending.progress+=dt;
        if(p.doctrinePending.progress>=DOCTRINE_TIME){p.doctrine={id:p.doctrinePending.id,completedAt:this.time};p.doctrinePending=null;if(p.side===0)this.events.notice?.(`作战方向就绪：${doctrineFor(this,0).name}`);}
      }
      if(this.isAI(p.side)&&this.time>130&&!p.doctrine&&!p.doctrinePending&&p.credits>2400)this.chooseDoctrine(p.side,COMMAND_DOCTRINES[p.faction][p.side%2].id);
    }
  }
};
