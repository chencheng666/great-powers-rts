import { THEATER_CHALLENGES, THEATER_RULES as R, ISLAND_AUXILIARY } from './theater-data.js';
import { UNITS } from './data.js';
import { battleMetric, recordBattleEvent } from './battle-report.js';

const gap = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const definitionFor = id => THEATER_CHALLENGES[id] || (id==='islandwatch'?ISLAND_AUXILIARY:null);
export const theaterDefinition = game => definitionFor(game.challenge?.id);
export const theaterFacility = (game,id) => game.challenge?.operation?.facilities.includes(id) || false;
export const protectedPassenger = unit => unit?.type === 'evacuee';
const contested = (game,point,radius=R.contestRadius) => game.units.some(u=>u.owner===1&&u.hp>0&&!u.embarkedIn&&UNITS[u.type].damage>0&&gap(u,point)<radius);
export function theaterFacilities(game) {
  const d=theaterDefinition(game),s=game.challenge?.operation;
  return s ? s.facilities.map((id,i)=>({definition:d.facilities[i],entity:game.getEntity(id),index:i})) : [];
}
const usable = (game,entry,health=R.functional) => entry?.entity?.owner===0 && entry.entity.hp>=entry.entity.maxHp*health && !contested(game,entry.entity);

export function initTheater(game,definition) {
  if (!definition.operation) return;
  const facilities=definition.facilities.map(n=>{const b=game.addBuilding(n.owner,n.type,n.x,n.y);b.hp=b.maxHp*n.health;return b.id;});
  game.challenge.operation={version:1,facilities,phase:0,hold:0,value:0,mined:0,energy:180,reinforced:false,produced:facilities.map(()=>0),evacuation:[]};
  if(definition.operation==='evacuation')for(let i=0;i<4;i++){
    const ids=Array.from({length:3},(_,j)=>game.addUnit(0,'evacuee',2240-(i%2)*55,1840+Math.floor(i/2)*70+j*16).id);
    game.challenge.operation.evacuation.push({ids,status:'waiting',shipId:null,progress:0});
  }
  game.recalculatePower();
}

export function theaterCaptureTarget(game,point,side) {
  if(side!==0)return null;
  return theaterFacilities(game).map(n=>n.entity).find(e=>e&&gap(e,point)<=e.size*.7&&game.hasExploredFor(side,e.x,e.y));
}

export function updateTheaterEngineer(game,unit,site,dt) {
  if(!site||!theaterFacility(game,site.id)||unit.owner!==0)return false;
  if(gap(unit,site)>site.size*.55+26){game.moveUnit(unit,site,dt,site.size*.55+20);return true;}
  if(contested(game,site)||game.time-(unit.lastDamageAt??-10)<1){unit.order.progress=0;return true;}
  const order=unit.order;
  if(site.owner!==0){
    order.progress=(order.progress||0)+dt;
    if(order.progress<R.capture)return true;
    site.owner=0;order.progress=0;site.queue=[];site.active=null;
    game.fogTimer=0;game.recalculatePower();
    recordBattleEvent(game,{kind:'facilityCaptured',owner:0,type:game.challenge.id,value:game.challenge.operation.facilities.indexOf(site.id)+1});
    game.events.notice?.('设施已接管，工程师继续修复；作业可取消。');
  }
  if(game.time-(site.lastDamageAt??-10)<3)return true;
  const before=site.hp,repair=Math.min(R.repairRate*dt,site.maxHp-site.hp,game.players[0].credits/R.repairCost);
  site.hp+=repair;game.players[0].credits=Math.max(0,game.players[0].credits-repair*R.repairCost);
  battleMetric(game,0,'repairHP',repair);
  if(before<site.maxHp*R.functional&&site.hp>=site.maxHp*R.functional){
    recordBattleEvent(game,{kind:'facilityRestored',owner:0,type:game.challenge.id,value:game.challenge.operation.facilities.indexOf(site.id)+1});
    game.recalculatePower();
  }
  if(repair>0&&game.time>=(unit.serviceFXAt||0)){
    unit.serviceFXAt=game.time+.7;
    game.effects.push({type:'shot',style:'repair',x:unit.x,y:unit.y,toX:site.x,toY:site.y,age:0,duration:.6,owner:0});
  }
  if(site.hp>=site.maxHp-.01)unit.order=null;
  return true;
}

export function theaterNetwork(game) {
  const d=theaterDefinition(game),nodes=theaterFacilities(game);
  if(!d?.operation)return {connected:[],powered:true};
  const powered=game.hasPower(0);
  if(d.operation!=='moon')return {connected:nodes.map(n=>usable(game,n)),powered};
  const home=game.ownedBuildings(0,'hq')[0],connected=nodes.map(()=>false),front=home?[home]:[];
  for(let p=0;p<front.length;p++)for(const n of nodes)if(!connected[n.index]&&usable(game,n)&&gap(n.entity,front[p])<=R.linkRange){connected[n.index]=true;front.push(n.entity);}
  return {connected,powered:powered&&game.challenge.operation.energy>0};
}

export function theaterFreightReady(game) {
  if(theaterDefinition(game)?.operation!=='seabreach')return true;
  return theaterFacilities(game).slice(0,2).every(n=>usable(game,n))&&game.hasPower(0);
}

export function theaterServiceSites(game,side) {
  if(side!==0)return [];
  const d=theaterDefinition(game);if(!d?.operation)return [];
  if(d.operation==='seabreach'&&(!theaterFreightReady(game)||!game.logistics[0].seaControl.receipts.length))return [];
  if(d.operation==='moon'&&game.challenge.operation.energy<=0)return [];
  return theaterFacilities(game).filter(n=>['factory','armory'].includes(n.entity?.type)&&usable(game,n)).map(n=>n.entity);
}

export function theaterServiceAllowed(game,site) {
  if(theaterFacility(game,site.id)&&site.type==='airfield')return usable(game,{entity:site})&&game.hasPower(site.owner);
  return !theaterFacility(game,site.id)||theaterServiceSites(game,site.owner).some(n=>n.id===site.id);
}

function updateEvacuation(game,d,s,dt) {
  for(const batch of s.evacuation){
    if(['saved','lost'].includes(batch.status))continue;
    const people=batch.ids.map(id=>game.getEntity(id));
    if(people.some(u=>!u||u.hp<=0)){batch.status='lost';batch.progress=0;continue;}
    const sameShip=people[0].embarkedIn&&people.every(u=>u.embarkedIn===people[0].embarkedIn);
    if(sameShip){batch.status='aboard';batch.shipId=people[0].embarkedIn;}
    else if(batch.status==='aboard') {batch.status='waiting';batch.shipId=null;batch.progress=0;}
    if(batch.status==='waiting'){
      const ship=game.activeUnits(0,'landing').find(u=>gap(u,d.collection)<=d.collection.radius&&!u.passengers.length&&!s.evacuation.some(b=>b!==batch&&['waiting','aboard'].includes(b.status)&&b.shipId===u.id)&&game.time-(u.lastMovedAt??-10)>.5);
      if(!ship||contested(game,d.collection,320)||people.some(u=>gap(u,d.collection)>d.collection.radius)){batch.progress=0;batch.shipId=null;continue;}
      if(batch.shipId!==ship.id){batch.progress=0;batch.shipId=ship.id;}
      batch.progress+=dt;
      if(batch.progress>=6){
        for(const u of people){ship.passengers.push(u.id);u.embarkedIn=ship.id;u.x=ship.x;u.y=ship.y;u.order=null;}
        batch.status='aboard';batch.progress=0;game.events.notice?.('一批人员已登舰，请护送前往安全出口。');
      }
    }else{
      const ship=game.getEntity(batch.shipId),exit=theaterFacilities(game)[0];
      const safe=ship&&gap(ship,d.objective)<=d.objective.radius&&game.time-(ship.lastMovedAt??-10)>.5&&usable(game,exit)&&game.hasPower(0)&&!contested(game,d.objective,320);
      batch.progress=safe?batch.progress+dt:0;
      if(batch.progress>=5){
        batch.status='saved';batch.progress=0;batch.shipId=null;
        ship.passengers=ship.passengers.filter(id=>!batch.ids.includes(id));
        for(const u of people){u.hp=0;u.embarkedIn=null;}
        battleMetric(game,0,'evacuated',people.length);
        recordBattleEvent(game,{kind:'evacuated',owner:0,type:game.challenge.id,value:people.length});
        game.events.notice?.('三名人员已安全撤离，运输舰可返回接应下一批。');
      }
    }
  }
  s.value=s.evacuation.filter(b=>b.status==='saved').length*3;
  return s.value>=9?{win:true,reason:'至少三批人员已安全撤离'}:s.evacuation.filter(b=>b.status==='lost').length>1?{win:false,reason:'保护目标损失过多，无法达到撤离人数'}:null;
}

export function updateTheater(game,dt) {
  const d=theaterDefinition(game),s=game.challenge?.operation;if(!d?.operation||!s)return null;
  const nodes=theaterFacilities(game),network=theaterNetwork(game),target=game.getEntity(game.challenge.targetId);
  if(d.reinforcement&&!s.reinforced&&game.time>=d.reinforcement.at){
    s.reinforced=true;d.reinforcement.units.forEach((type,i)=>game.addUnit(0,type,d.reinforcement.x+i*55,d.reinforcement.y));
    recordBattleEvent(game,{kind:'theaterReinforced',owner:0,type:game.challenge.id,value:d.reinforcement.units.length});
    game.events.notice?.('最后一批预定增援已抵达后方。');
  }
  const hold=condition=>{s.hold=condition?Math.min(30,s.hold+dt):0;};
  if(d.operation==='island-support'){
    if(usable(game,nodes[0])&&network.powered&&!s.produced[0]){
      s.produced[0]=1;
      const home=nodes[0].entity;game.addUnit(0,'fighter',home.x,home.y);
      recordBattleEvent(game,{kind:'theaterReinforced',owner:0,type:'islandwatch',value:1});
      game.events.notice?.('北岛机场已恢复，一架战斗机加入编队；机场可持续维修补弹。');
    }
  }else if(d.operation==='convoy'){
    hold(nodes.every(n=>usable(game,n,.75))&&gap(target,d.objective)<=d.objective.radius&&!contested(game,d.objective,280)&&game.time-(target.lastMovedAt??-10)>.5);
    if(s.hold>=15)return {win:true,reason:'运输车安全抵港，两个整备节点已恢复'};
  }else if(d.operation==='defense'){
    if(game.time>=220&&game.challenge.wave===d.waves.length&&!game.ownedUnits(1).length)return {win:true,reason:'通信枢纽存续，全部预警突击已解除'};
  }else if(d.operation==='industry'){
    if(network.powered&&network.connected[0]&&network.connected[1])for(const n of nodes.slice(2))if(usable(game,n)){
      const produced=Math.min(R.industryCap-s.produced[n.index],18*dt*n.entity.hp/n.entity.maxHp);
      s.produced[n.index]+=produced;s.value+=produced;game.players[0].credits+=produced;battleMetric(game,0,'industrialIncome',produced);
    }
    if(s.value>=R.industryGoal)return {win:true,reason:'电力、物流与加工链恢复，工业交付已达标'};
  }else if(d.operation==='sentinel'){
    if(network.powered&&network.connected.filter(Boolean).length>=2)s.value+=dt;
    if(s.value>=180&&game.time>=240&&game.challenge.wave===d.waves.length&&!game.ownedUnits(1).length)return {win:true,reason:'预警网络恢复，分散设施完成常规防卫'};
  }else if(d.operation==='seabreach'){
    const linked=theaterFreightReady(game),delivered=game.logistics[0].seaControl.receipts.length*900;
    const phase=linked?delivered>=1800?2:1:0;
    if(phase!==s.phase){s.phase=phase;s.hold=0;recordBattleEvent(game,{kind:'theaterStage',owner:0,type:game.challenge.id,value:phase});}
    hold(phase===2&&nodes.every(n=>usable(game,n))&&game.activeUnits(0).some(u=>UNITS[u.type].damage>0&&!UNITS[u.type].tags.some(t=>['air','ship'].includes(t))&&gap(u,d.objective)<=d.objective.radius));
    if(s.hold>=25)return {win:true,reason:'滩头、海运与纵深通信枢纽均已稳定'};
  }else if(d.operation==='moon'){
    const solar=nodes.filter(n=>n.entity.type==='power'&&network.connected[n.index]).length;
    const load=4+game.activeUnits(0).filter(u=>['rifle','engineer','scout'].includes(u.type)).length*.2;
    s.energy=Math.max(0,Math.min(R.storage,s.energy+dt*((network.powered?2:0)+solar*8-load)));
    hold(network.powered&&network.connected.every(Boolean)&&s.energy>=120&&s.mined>=1800);
    if(s.hold>=30)return {win:true,reason:'矿物交付、储能和月海通信网络全部达标'};
  }else if(d.operation==='evacuation')return updateEvacuation(game,d,s,dt);
  return null;
}

export function recordTheaterMining(game,value) {
  if(theaterDefinition(game)?.operation!=='moon'||value<=0)return;
  game.challenge.operation.mined+=value;battleMetric(game,0,'mineralDelivery',value);
}

export function validTheaterState(state,config,time,entities) {
  const d=definitionFor(state.id),s=state.operation;
  // 旧版列岛存档没有侧翼设施，沿用原任务而不擅自生成新单位。
  if(state.id==='islandwatch'&&s===undefined)return true;
  if(!d?.operation)return s===undefined;
  if(config.nuclearEnabled!==false||!s||s.version!==1||Object.keys(s).length!==10||!Array.isArray(s.facilities)||s.facilities.length!==d.facilities.length||new Set(s.facilities).size!==s.facilities.length)return false;
  if(s.facilities.some((id,i)=>{const n=d.facilities[i],e=entities.find(e=>e.id===id);return !Number.isSafeInteger(id)||!e||e.kind!=='building'||e.type!==n.type||e.x!==n.x||e.y!==n.y||e.hp<0||e.hp>e.maxHp;}))return false;
  if(![s.hold,s.value,s.mined,s.energy].every(Number.isFinite)||s.hold<0||s.hold>Math.min(time,30)+.001||s.value<0||s.value>10000||s.mined<0||s.mined>20000||s.energy<0||s.energy>R.storage||!Number.isInteger(s.phase)||s.phase<0||s.phase>2||typeof s.reinforced!=='boolean')return false;
  if(s.reinforced!==Boolean(d.reinforcement&&time>=d.reinforcement.at))return false;
  if(!Array.isArray(s.produced)||s.produced.length!==d.facilities.length||s.produced.some(v=>!Number.isFinite(v)||v<0||v>R.industryCap))return false;
  if(d.operation==='island-support'&&(![0,1].includes(s.produced[0])||s.produced[1]!==0))return false;
  if(d.operation==='industry'&&Math.abs(s.produced.reduce((a,b)=>a+b,0)-s.value)>.001)return false;
  if(!Array.isArray(s.evacuation)||s.evacuation.length!==(d.operation==='evacuation'?4:0))return false;
  const seen=new Set();
  for(const b of s.evacuation){
    if(!b||Object.keys(b).length!==4||!Array.isArray(b.ids)||b.ids.length!==3||b.ids.some(id=>!Number.isSafeInteger(id)||id<1||seen.has(id))||!['waiting','aboard','saved','lost'].includes(b.status)||!Number.isFinite(b.progress)||b.progress<0||b.progress>6||b.shipId!==null&&(!Number.isSafeInteger(b.shipId)||b.shipId<1))return false;
    b.ids.forEach(id=>seen.add(id));
    if(['waiting','aboard'].includes(b.status)&&b.ids.some(id=>{const u=entities.find(e=>e.id===id);return !u||u.type!=='evacuee'||u.owner!==0||u.hp<=0;}))return false;
    if(b.status==='aboard'&&b.ids.some(id=>entities.find(e=>e.id===id)?.embarkedIn!==b.shipId))return false;
    if(b.status==='saved'&&b.ids.some(id=>entities.find(e=>e.id===id)?.hp>0))return false;
  }
  return d.operation!=='evacuation'||s.value===s.evacuation.filter(b=>b.status==='saved').length*3;
}
