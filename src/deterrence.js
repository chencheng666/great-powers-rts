import { UNITS } from './data.js';
import { DETERRENCE as R } from './deterrence-rules.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const deterrenceCombat={
  nuclearReady(side) {
    const p=this.players[side];
    return !!(this.nuclearEnabled&&p&&!p.eliminated&&!p.nuclearSpent&&!p.nuclearPending&&p.nuclearCharge>=R.charge&&p.credits>=R.cost&&this.hasPower(side)&&this.hasBuilding(side,'nuclearSilo')&&this.hasBuilding(side,'radar')&&this.hasBuilding(side,'lab')&&!this.isControlLocked(side));
  },
  launchNuclear(x,y,side=0) {
    if(!this.running||this.paused||!Number.isFinite(x)||!Number.isFinite(y)||x<0||y<0||x>this.world.width||y>this.world.height||!this.nuclearReady(side)||!this.isVisibleFor(side,x,y))return false;
    const p=this.players[side],source=this.ownedBuildings(side,'nuclearSilo')[0];
    p.credits-=R.cost;p.nuclearCharge=0;p.nuclearPending={sourceId:source.id,x,y,launchAt:this.time+R.prepare};
    this.pendingNuclear=false;this.pendingAbility=false;
    this.events.notice?.('核威慑预警：8 秒准备、20 秒飞行。落区已公开，立即疏散；摧毁发射井或切断电网可中止准备。');
    this.events.voice?.('nuclearWarning');return true;
  },
  nuclearWarnings() {
    if(this.online)return this.publicNuclearWarnings||[];
    if(!this.nuclearEnabled)return [];
    const warnings=this.players.filter(p=>p.nuclearPending).map(p=>({owner:p.side,x:p.nuclearPending.x,y:p.nuclearPending.y,remaining:p.nuclearPending.launchAt-this.time+R.flight,phase:'preparing'}));
    for(const p of this.projectiles)if(p.kind==='nuclear'&&!p.finished&&p.hp>0)warnings.push({owner:p.owner,x:p.toX,y:p.toY,remaining:Math.max(0,R.flight-p.age),phase:'flight'});
    return warnings;
  },
  updateDeterrence(dt) {
    if(!this.nuclearEnabled)return;
    for(const p of this.players) {
      const source=this.ownedBuildings(p.side,'nuclearSilo')[0],network=this.hasPower(p.side)&&this.hasBuilding(p.side,'radar')&&this.hasBuilding(p.side,'lab');
      if(!source||p.eliminated)p.nuclearCharge=0;
      else if(network&&!p.nuclearSpent&&!p.nuclearPending)p.nuclearCharge=Math.min(R.charge,(p.nuclearCharge||0)+dt);
      if(p.nuclearPending) {
        const pending=p.nuclearPending,silo=this.getEntity(pending.sourceId);
        if(!network||!silo||silo.hp<=0||silo.owner!==p.side||p.eliminated) {
          p.nuclearPending=null;
          this.events.notice?.('核威慑准备中断：发射设施或支援网络离线，已投入资金不退还，需重新准备。');
          this.events.voice?.('nuclearCancelled');
        } else if(this.time>=pending.launchAt) {
          this.projectiles.push({id:this.nextProjectileId++,kind:'nuclear',owner:p.side,sourceId:silo.id,targetId:null,targetType:'nuclearSilo',x:silo.x,y:silo.y,startX:silo.x,startY:silo.y,toX:pending.x,toY:pending.y,angle:Math.atan2(pending.y-silo.y,pending.x-silo.x),age:0,jam:0,amount:R.damage,hp:R.projectileHP,speed:Math.max(1,distance(silo,pending)/R.flight),returning:false,flightRole:'surface'});
          p.nuclearSpent=true;p.nuclearPending=null;
          this.effects.push({type:'explosion',style:'strategicLaunch',x:silo.x,y:silo.y,size:42,age:0,duration:1,owner:p.side});
        }
      }
    }
    const warnings=this.nuclearWarnings();
    for(const side of this.sides().filter(side=>this.isAI(side))) {
      if(this.isControlLocked(side))continue;
      for(const u of this.activeUnits(side)) {
        if(['rearm','restock','board'].includes(u.order?.type)||UNITS[u.type].tags.includes('logistics'))continue;
        const warning=warnings.find(w=>distance(u,w)<R.radius+80);
        if(!warning||u.nuclearEvadeUntil>this.time)continue;
        const a=distance(u,warning)<1?u.id*2.399:Math.atan2(u.y-warning.y,u.x-warning.x);
        u.order={type:'move',...this.resolveMoveGoal(u,Math.max(30,Math.min(this.world.width-30,warning.x+Math.cos(a)*(R.radius+180))),Math.max(30,Math.min(this.world.height-30,warning.y+Math.sin(a)*(R.radius+180))))};
        u.path=[];u.pathTimer=0;u.nuclearEvadeUntil=this.time+3;
      }
      if(this.nuclearReady(side)) {
        const known=[...this.enemyUnits(side),...this.enemyBuildings(side)].filter(e=>this.canSeeEntity(side,e));
        const target=known.map(e=>({e,score:known.filter(v=>distance(e,v)<R.radius*.7).length})).sort((a,b)=>b.score-a.score)[0];
        if(target?.score>=4&&!this.activeUnits(side).some(u=>distance(u,target.e)<R.radius))this.launchNuclear(target.e.x,target.e.y,side);
      }
    }
  },
  updateNuclearProjectile(p,dt) {
    if(p.hp<=0) {
      p.finished=true;
      this.effects.push({type:'explosion',style:'nuclearIntercept',x:p.x,y:p.y,size:75,age:0,duration:1.4,owner:p.owner,height:160});
      this.events.notice?.('战略弹头拦截成功，落区威胁解除。');this.events.voice?.('nuclearIntercepted');return;
    }
    p.age+=dt;
    const t=Math.min(1,p.age/R.flight);p.x=p.startX+(p.toX-p.startX)*t;p.y=p.startY+(p.toY-p.startY)*t;
    if(t<1)return;
    p.finished=true;
    for(const e of [...this.units,...this.buildings]) {
      if(e.hp<=0||e.embarkedIn)continue;
      const gap=distance(e,{x:p.toX,y:p.toY});if(gap>R.radius)continue;
      let amount=R.damage*(1-gap/R.radius)**.7;
      if(e.kind==='building')amount=Math.min(amount,e.maxHp*(e.type==='hq'?.45:.65));
      const hit={target:e,amount,side:p.owner,stun:0};
      if(this.collectingHits)this.pendingHits.push(hit);else this.applyHit(hit);
    }
    this.effects.push({type:'nuclearBlast',x:p.toX,y:p.toY,size:R.radius,age:0,duration:7,owner:p.owner});
    this.events.shot?.('bomber',p.owner);
    this.events.notice?.('核威慑打击落地：区域内敌我均可能受损，无永久污染区。');
    this.events.voice?.('nuclearImpact');
  }
};
