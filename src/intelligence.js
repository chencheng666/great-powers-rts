import { BUILDINGS, UNITS } from './data.js';
import { lunarBuildingProfile } from './lunar-robots.js';
import { RESOURCE_TYPES } from './battlefield-expansion.js';

export const INTELLIGENCE_RULES={bombDelay:45,defuseTime:3,cyberCharge:120,cyberWarning:12,cyberDuration:4,cyberCost:500};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const ground=u=>!UNITS[u.type].tags.some(t=>['air','ship','logistics'].includes(t));

export const intelligenceCombat={
  isControlLocked(side) {
    const p=this.players[side],source=this.getEntity(p.cyberSourceId);
    return p.cyberLockedUntil>this.time&&source?.kind==='building'&&source.owner===1-side&&source.type==='super'&&source.hp>0&&this.hasPower(source.owner);
  },
  launchCyber(side) {
    const p=this.players[side],source=this.ownedBuildings(side,'super')[0];
    if(this.isControlLocked(side)||!source||!this.hasPower(side)||p.cyberCharge<INTELLIGENCE_RULES.cyberCharge||p.credits<INTELLIGENCE_RULES.cyberCost||p.cyberPending)return false;
    p.credits-=INTELLIGENCE_RULES.cyberCost;p.cyberCharge=0;
    p.cyberPending={sourceId:source.id,executeAt:this.time+INTELLIGENCE_RULES.cyberWarning};
    this.events.notice?.(side===1?'敌方网络攻击预警：12 秒后指令链路将受干扰，摧毁源站或切断敌方供电可取消。':'网络攻击已排程，敌方收到 12 秒预警。');
    this.events.voice?.(side===1?'cyberWarning':'cyberLaunch');
    return true;
  },
  updateIntelligence(dt) {
    for(const b of this.buildings)if(b.hp>0&&b.sabotage&&b.sabotage.detonateAt<=this.time){
      const owner=b.sabotage.owner;delete b.sabotage;this.damage(b,b.maxHp,owner);this.events.notice?.(`${lunarBuildingProfile(this.map.future,b.type,BUILDINGS[b.type]).name}定时破坏已引爆`);
    }
    for(const p of this.players){
      const active=this.hasBuilding(p.side,'super')&&this.hasPower(p.side);
      p.cyberCharge=active&&!p.cyberPending?Math.min(INTELLIGENCE_RULES.cyberCharge,(p.cyberCharge||0)+dt):active?p.cyberCharge||0:0;
      if(p.cyberPending){
        const source=this.getEntity(p.cyberPending.sourceId);
        if(!active||source?.hp<=0||source?.type!=='super'||source?.owner!==p.side){p.cyberPending=null;this.events.notice?.('网络攻击源站离线，排程已取消。');}
        else if(p.cyberPending.executeAt<=this.time){
          const target=this.players[1-p.side];target.cyberSourceId=source.id;target.cyberLockedUntil=this.time+INTELLIGENCE_RULES.cyberDuration;p.cyberPending=null;
          if(target.side===0){this.placingBuilding=false;this.orderMode=null;this.pendingAbility=false;this.events.voice?.('cyberDisrupted');this.events.notice?.('指令链路受干扰 4 秒：不能下达新指令，部队仍自动还击；镜头、暂停与存档可用。');}
        }
      }
      if(p.cyberSourceId&&!this.isControlLocked(p.side)){p.cyberSourceId=null;p.cyberLockedUntil=0;if(p.side===0){this.events.voice?.('cyberRestored');this.events.notice?.('指令链路已恢复。');}}
    }
    for(const site of this.resourceSites||[])if(site.type==='depot'&&site.owner!==null&&site.amount>0&&this.hasPower(site.owner)){
      const gain=Math.min(site.amount,dt*8);site.amount-=gain;this.players[site.owner].credits+=gain;
    }
  },
  updateSpecialOrder(u,dt) {
    const order=u.order;if(!order||!['infiltrate','defuse','collect'].includes(order.type))return false;
    const target=this.getEntity(order.targetId);
    const valid=target&&(order.type==='infiltrate'?u.type==='scout'&&target.kind==='building'&&target.owner!==u.owner&&target.hp>0&&!target.sabotage&&this.canSeeEntity(u.owner,target):order.type==='defuse'?u.type==='engineer'&&target.kind==='building'&&target.owner===u.owner&&target.hp>0&&target.sabotage:target.kind==='resource'&&target.type!=='depot'&&target.amount>0&&ground(u)&&(target.type==='cache'||['engineer','harvester','supply'].includes(u.type)));
    if(!valid){u.order=null;u.path=[];return true;}
    const reach=target.kind==='building'?target.size*.48+16:34;
    if(distance(u,target)>reach){order.progress=0;this.moveUnit(u,target,dt,reach-4);return true;}
    if(this.time-(u.lastDamageAt??-10)<1)return true;
    if(order.type==='infiltrate'){
      target.sabotage={owner:u.owner,plantedAt:this.time,detonateAt:this.time+INTELLIGENCE_RULES.bombDelay};u.hp=0;u.order=null;
      if(target.owner===0){this.events.notice?.(`${lunarBuildingProfile(this.map.future,target.type,BUILDINGS[target.type]).name}被潜入：45 秒倒计时，请工程师右键该设施拆弹。`);this.events.voice?.(`spyInfiltrated_${target.type}`);}
      else{this.events.notice?.('潜入完成：一次性破坏者已驻留敌方设施，45 秒后引爆。');this.events.voice?.('spyPlanted');}
      this.events.selection?.();
    }else if(order.type==='defuse'){
      order.progress=(order.progress||0)+dt;
      if(order.progress>=INTELLIGENCE_RULES.defuseTime){delete target.sabotage;u.order=null;u.path=[];if(u.owner===0){this.events.notice?.(`${lunarBuildingProfile(this.map.future,target.type,BUILDINGS[target.type]).name}的定时破坏已解除，工程师继续待命。`);this.events.voice?.(`spyDefused_${target.type}`);}}
    }else{
      // 有敌方回收者同时抵达时停止交付，让玩家先取得现场控制权。
      if(this.activeUnits(1-u.owner).some(v=>v.order?.type==='collect'&&v.order.targetId===target.id&&distance(v,target)<=reach))return true;
      const rate=target.type==='cache'?75:45,gain=Math.min(target.amount,dt*rate);target.amount-=gain;this.players[u.owner].credits+=gain;
      order.progress=(order.progress||0)+dt;u.collectionFX=(u.collectionFX||0)+gain;
      if(u.collectionFX>=75||target.amount<=0){this.effects.push({type:'income',x:target.x,y:target.y,amount:Math.round(u.collectionFX),owner:u.owner,age:0,duration:1.5});u.collectionFX=0;}
      if(target.amount<=0){target.amount=0;u.order=null;u.path=[];if(u.owner===0){this.events.notice?.(`${RESOURCE_TYPES[target.type].name}已回收完毕。`);this.events.voice?.('resourceRecovered');}}
    }
    return true;
  },
  updateIntelligenceAI() {
    if(this.isControlLocked(1))return;
    const bombs=this.ownedBuildings(1).filter(b=>b.sabotage);
    if(bombs.length){
      for(const e of this.activeUnits(1,'engineer')){if(e.order?.type==='defuse')continue;const b=bombs.sort((a,b)=>distance(a,e)-distance(b,e))[0];e.order={type:'defuse',targetId:b.id,x:b.x,y:b.y,progress:0};e.path=[];}
      if(!this.ownedUnits(1,'engineer').length&&!this.ownedBuildings(1,'barracks').some(b=>b.active?.type==='engineer'||b.queue.includes('engineer')))this.queueUnit(1,'engineer');
    }
    for(const spy of this.activeUnits(1,'scout'))if(!['infiltrate','rearm'].includes(spy.order?.type)){
      const target=this.ownedBuildings(0).filter(b=>!b.sabotage&&this.canSeeEntity(1,b)&&distance(spy,b)<UNITS.scout.sight).sort((a,b)=>distance(a,spy)-distance(b,spy))[0];
      if(target){spy.order={type:'infiltrate',targetId:target.id,x:target.x,y:target.y};spy.path=[];}
    }
    for(const u of this.activeUnits(1).filter(u=>ground(u)&&!u.order)){
      const site=(this.resourceSites||[]).filter(s=>s.type!=='depot'&&s.amount>0&&this.hasExploredFor(1,s.x,s.y)&&(s.type==='cache'||['engineer','harvester','supply'].includes(u.type))&&distance(s,u)<380).sort((a,b)=>distance(a,u)-distance(b,u))[0];
      if(site)u.order={type:'collect',targetId:site.id,x:site.x,y:site.y,progress:0};
    }
    if(this.players[1].cyberCharge>=INTELLIGENCE_RULES.cyberCharge)this.launchCyber(1);
  }
};
