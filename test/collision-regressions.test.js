import test from 'node:test';import assert from 'node:assert/strict';import {Game} from '../src/game.js';import {separateUnits} from '../src/unit-spacing.js';
const make=()=>{const g=new Game('china','nato',{}, {multiplayer:true});g.units=[];g.buildings=[];return g;};
const move=(g,units,goals,seconds)=>{for(let i=0;i<seconds*20;i++){g.time+=.05;for(let n=0;n<units.length;n++)g.moveUnitNow(units[n],goals[n],.05);separateUnits(g.units,.05,(u,p)=>g.canOccupyUnit(u,p),g.time);}};
test('重叠在建筑内的车辆可单调脱困，外部车辆不能穿入建筑',()=>{const g=make(),b=g.addBuilding(0,'factory',600,600),u=g.addUnit(0,'tank',600,600);move(g,[u],[{x:1000,y:600}],20);assert(Math.hypot(u.x-600,u.y-600)>300);const v=g.addUnit(0,'tank',700,600);assert.equal(g.canOccupyUnit(v,{x:600,y:600}),false);});
test('飞机与地面车辆重叠仍可起行，不受建筑或车辆碰撞半径拦截',()=>{for(const type of ['fighter','strike','bomber','airlift','freightPlane','drone']){const g=make();g.addBuilding(0,'factory',600,600);g.addUnit(0,'tank',600,600);const u=g.addUnit(0,type,600,600);move(g,[u],[{x:1000,y:600}],8);assert(Math.hypot(u.x-1000,u.y-600)<25,type);}});
test('相向车辆可错开行驶而不永久互锁',()=>{const g=make(),a=g.addUnit(0,'tank',500,600),b=g.addUnit(0,'tank',1000,600);move(g,[a,b],[{x:1100,y:600},{x:400,y:600}],30);assert(a.x>950&&b.x<550,JSON.stringify([a.x,b.x]));});
test('出口完全堵塞时没有穿模后备出生点',()=>{const g=make();g.addBuilding(0,'factory',600,600);for(let x=430;x<=770;x+=80)for(let y=430;y<=770;y+=80)g.addUnit(0,'tank',x,y);const p=g.findSpawn(600,600,'tank');if(p){assert(g.canOccupyUnit({type:'tank'},p));assert(g.units.every(u=>Math.hypot(u.x-p.x,u.y-p.y)>60));}else assert.equal(p,null);});

test('坦克、矿车与补给车绕开整排驻军，不在车阵边缘无限折返',()=>{
  for(const type of ['tank','harvester','supply']){
    const g=make();g.map.barriers=[];
    const parked=[];for(let y=350;y<=750;y+=65)parked.push(g.addUnit(0,'tank',800,y));
    const before=parked.map(u=>({x:u.x,y:u.y})),u=g.addUnit(0,type,520,550),goal={x:1150,y:550};
    let traveled=0;
    for(let i=0;i<900;i++){
      const previous={x:u.x,y:u.y};move(g,[u],[goal],.05);traveled+=Math.hypot(u.x-previous.x,u.y-previous.y);
      assert(parked.every(v=>Math.hypot(u.x-v.x,u.y-v.y)>=59),type+' 不应穿过驻军');
    }
    assert(Math.hypot(u.x-goal.x,u.y-goal.y)<12,type+' 应完成绕行');
    assert(traveled<1300,type+' 不应持续来回折返');
    assert(parked.every((v,i)=>Math.hypot(v.x-before[i].x,v.y-before[i].y)<1),'不应挤走整排驻军');
  }
});
