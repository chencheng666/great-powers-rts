import { Game } from './game.js';
import { AI_DIFFICULTIES, BUILDINGS, UNITS, WORLD } from './data.js';
import { battlefieldMap } from './battlefield-expansion.js';
import { unpackFog } from './network-protocol.js';
import { snapshotMotion, interpolateMotion } from './unit-animation.js';

export class OnlineGame extends Game {
  constructor(payload, events, client) {
    // 客户端只持有视图，不生成基地、不运行本地战斗模拟。
    super(payload.view.players[0].faction, payload.view.players[1].faction, {}, { ...payload.config, multiplayer:true });
    this.online=true; this.client=client; this.events=events; this.seat=payload.seat;
    this.mapId=payload.config.mapId; this.map=battlefieldMap(this.mapId,1.5); this.world=this.map.world||WORLD;
    this.homeY=this.world.height/2; this.homeX=this.seat?this.world.width-470:470;
    this.battleId=payload.config.battleId; this.victoryMode=payload.config.victoryMode;
    this.difficulty=AI_DIFFICULTIES.standard; this.battlefieldScale=1.5;
    this.units=[];this.buildings=[];this.ore=[];this.oil=[];this.beacons=[];this.resourceSites=[];
    this.effects=[];this.seenEffects=new Set();this.attackAlerts=[];this.lastAttackVoiceAt=-20;
    this.apply(payload, true);
  }
  get paused() { return !!this._serverPaused; }
  set paused(value) { /* 联机弹窗不暂停服务器；仅快照可修改暂停状态。 */ }
  isControlLocked(side) { return side === 0 && !!this.players[0].controlLocked; }
  // 浮航是可见外观，依赖服务器判定，不从已隐藏的敌方指令推断。
  submarineSurfaced(unit) { return unit?.type === 'submarine' && unit.hp > 0 && !unit.embarkedIn && unit.surfaced === true; }
  canPlace(side,type,x,y) {
    if(type!=='dock')return super.canPlace(side,type,x,y);
    const size=BUILDINGS.dock.size;
    return x>=size&&y>=size&&x<=this.world.width-size&&y<=this.world.height-size&&this.hasBuilding(0,'factory')&&this.map.dockZones.some(z=>x>=z.x1&&x<=z.x2&&y>=z.y1&&y<=z.y2&&(this.seat===0?x<this.world.width/2:x>this.world.width/2))&&!this.buildings.some(b=>b.hp>0&&Math.hypot(b.x-x,b.y-y)<(b.size+size)*.63+20);
  }
  apply(payload, initial = false) {
    const pendingBefore=this.pendingBuilding;
    const v=payload.view, before=new Map([...this.units,...this.buildings].map(e=>[e.id,e]));
    const sync=(key, interpolate=false)=>{
      const old=new Map((this[key]||[]).map(e=>[e.id,e]));
      this[key]=v[key].map(next=>{
        const e=old.get(next.id)||{};
        const motion = interpolate && Number.isFinite(e.x) ? snapshotMotion(e, next, v.time - this.time) : null;
        if(e.owner===0&&next.hp<e.hp) {
          this.attackAlerts.push({ id:next.id,type:next.type,building:next.kind==='building',x:next.x,y:next.y,at:v.time });
          if(v.time-this.lastAttackVoiceAt>10){this.events.voice?.(next.kind==='building'?'underAttack':'unitUnderAttack');this.lastAttackVoiceAt=v.time;}
        }
        for(const key of Object.keys(e))if(key!=='_motion'&&!Object.hasOwn(next,key))delete e[key];
        Object.assign(e,next);
        if (motion) { e._motion = motion; e.x = motion.x; e.y = motion.y; e.angle = motion.angle; e.turretAngle = motion.turret; }
        else delete e._motion;
        return e;
      });
    };
    sync('units',true);sync('buildings');for(const key of ['ore','oil','beacons','resourceSites'])sync(key);
    this.players=v.players; this.time=v.time; this._serverPaused=v.paused;this.room=payload.room;
    this.battleReport = v.battleReport || null;
    this.fog=unpackFog(v.fog); this.fogs=[this.fog,{...this.fog,visible:Array(this.fog.visible.length).fill(false),explored:Array(this.fog.visible.length).fill(false)}];
    this.pendingBuilding=this.players[0].readyBuilding||null;if(!this.pendingBuilding)this.placingBuilding=false;
    if(!initial&&this.pendingBuilding&&pendingBefore!==this.pendingBuilding)this.events.voice?.('buildReady');
    if(!initial&&this.units.some(u=>u.owner===0&&!before.has(u.id)&&!UNITS[u.type].tags.includes('logistics')))this.events.voice?.('unitReady');
    this.projectiles=v.projectiles;
    for(const effect of v.effects)if(!this.seenEffects.has(effect.networkId)){
      this.seenEffects.add(effect.networkId);this.effects.push(effect);
      if(effect.type==='shot'||effect.type==='muzzle')this.events.shot?.(effect.style||'rifle',effect.owner);
    }
    if(this.seenEffects.size>2000)this.seenEffects=new Set(v.effects.map(e=>e.networkId));
    for(const e of before.values())if(e.owner===0&&e.kind==='unit'&&!this.units.some(u=>u.id===e.id)&&e.lastDamageAt>v.time-1)this.attackAlerts.push({id:e.id,type:e.type,building:false,x:e.x,y:e.y,at:v.time});
    const selected=this.selected.join(',');this.selected=this.selected.filter(id=>this.getEntity(id)?.owner===0&&!this.getEntity(id).embarkedIn);
    if(selected!==this.selected.join(','))this.events.selection?.();
    const ended=this.winner!==null;this.running=v.running;this.winner=v.winner;
    if(!v.running&&!ended&&!initial)this.events.end?.(v.winner);
  }
  update(dt) {
    if(!this.paused)for(const u of this.units)interpolateMotion(u,dt);
    this.effects.forEach(e=>e.age+=dt);this.effects=this.effects.filter(e=>e.age<e.duration);
    this.attackAlerts=this.attackAlerts.filter(e=>this.time-e.at<8).slice(-12);
  }
  issue(action, data={}) { if(!this.running||this.paused)return false;const {type:unitType,...args}=data;return this.client.send({type:'command',action,unitType,...args}); }
  batch(action,unit) {
    if(!this.running||this.paused||unit?.kind!=='unit'||unit.owner!==0)return false;
    this.batches??=new Map();let ids=this.batches.get(action);
    if(!ids){ids=new Set();this.batches.set(action,ids);queueMicrotask(()=>{this.batches.delete(action);this.issue(`group-${action}`,{selected:[...ids]});});}
    ids.add(unit.id);return true;
  }
  startBuild(side,type){return this.issue('build',{type});}
  cancelBuilding(){return this.issue('cancel-build');}
  placeBuilding(side,type,x,y){if(!this.canPlace(0,type,x,y))return false;this.placingBuilding=false;return this.issue('place',{type,x,y});}
  queueUnit(side,type){return this.issue('train',{type});}
  cancelUnitProduction(side,id){return this.issue('cancel-train',{id});}
  toggleRepair(side,id){return this.issue('repair',{id});}
  sellBuilding(side,id){return this.issue('sell',{id});}
  sellHarvester(side,id){return this.issue('sell',{id});}
  setRallyPoint(side,id,x,y){return this.issue('rally',{id,x,y});}
  command(x,y,attackMove=false){const mode=this.orderMode;this.orderMode=null;return this.issue('move',{x,y,attackMove,mode,selected:[...this.selected]});}
  stopSelected(){return this.issue('stop',{selected:[...this.selected]});}
  castAbility(x,y){this.pendingAbility=false;return this.issue('ability',{x,y});}
  activateSatellite(){return this.issue('satellite');}
  launchCyber(){return this.issue('cyber');}
  requestResupply(unit){return this.batch('resupply',unit);}
  unloadTransport(unit){return this.batch('unload',unit);}
  toggleAutoSupply(unit){return this.issue('auto-supply',{id:unit.id});}
  toSave(){throw new Error('联网战局由服务器维护，不能导出为单机存档');}
}
