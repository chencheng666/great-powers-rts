import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createChineseTank } from '../src/domestic-models.js';
import { createModernAircraft, createTandemTransport } from '../src/aircraft-models.js';
import { createStrategicModel } from '../src/strategic-models.js';
import { unitModelScale, flightScaleFactor, aircraftCruiseHeight, PERSONNEL_HEIGHT, CARRIER_MODEL_LENGTH } from '../src/model-scale.js';
import { createPersonnel } from '../src/personnel-models.js';
import { equipmentModel } from '../src/equipment.js';
import { aircraftGroundHeight, airfieldSurfaceHeight, fixedWingHeight } from '../src/airfield-presentation.js';
import { carrierAirGroupLabel } from '../src/carrier-airgroup.js';
import { Game } from '../src/game.js';

const size = model => new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-6,`${a} 与 ${b} 应一致`);

test('用真实模型校验陆地坦克、直升机、战斗机、轰炸机和运输机比例，起飞统一放大而舰载机独立',async()=>{
  const bytes=await readFile(new URL('../assets/models/battle-library.glb',import.meta.url));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  const models={tank:createChineseTank(),helicopter:createStrategicModel('helicopter'),fighter:createModernAircraft('fighter_china'),bomber:gltf.scene.getObjectByName('bomber').clone(),airlift:createModernAircraft('airlift')};
  const grounded={};
  for(const [type,model] of Object.entries(models)){
    const dimensions=size(model),scale=unitModelScale(type,dimensions,10);
    model.scale.setScalar(scale*(type==='tank'?1:flightScaleFactor(0,type)));
    grounded[type]=size(model).x;
    if(type!=='tank'){
      model.scale.setScalar(scale*flightScaleFactor(95,type));close(size(model).x/grounded[type],1.25);
    }
  }
  for(const [type,ratio] of Object.entries({helicopter:.6,fighter:1,bomber:1.5,airlift:2}))close(grounded[type]/grounded.tank,ratio/.5);
  close(flightScaleFactor(0,'navalFighter'),2/7);
  const carrier=gltf.scene.getObjectByName('carrier').clone(), dimensions=size(carrier);
  carrier.scale.setScalar(unitModelScale('carrier',dimensions,8));
  close(size(carrier).x,CARRIER_MODEL_LENGTH);
  assert.ok(size(carrier).x / (84 * flightScaleFactor(0,'navalFighter')) >= 12);
  close(unitModelScale('tank',size(models.tank),10,true),10);
  for(const type of ['fighter','bomber','airlift','helicopter'])for(let h=1;h<=100;h++)assert.ok(flightScaleFactor(h,type)>=flightScaleFactor(h-1,type));
});

test('100%镜头基准下人物约为参考坦克高度的73%，运输机空中长度有明确上限',()=>{
  const tank=createChineseTank(),person=createPersonnel('rifle'),transport=createModernAircraft('airlift');
  for(const [type,model]of [['tank',tank],['rifle',person],['airlift',transport]])model.scale.setScalar(unitModelScale(type,size(model),10));
  assert.ok(Math.abs(size(person).y/size(tank).y-1.75/2.4)<.002);
  close(size(person).y,PERSONNEL_HEIGHT);assert.ok(size(person).y>9);
  close(size(tank).x,36);assert.ok(size(transport).x<=180.001);
  for(const type of ['engineer','scout','evacuee']){const model=createPersonnel(type);close(unitModelScale(type,size(model),10)*size(model).y,PERSONNEL_HEIGHT);}
});

test('三层高度区分地面、低空旋翼和高空固定翼，运输机与补给机保持一致',()=>{
  const drone=aircraftCruiseHeight('drone',['drone','air']),rotor=aircraftCruiseHeight('helicopter',['rotorcraft','air']);
  assert.ok(drone>15&&drone<rotor);assert.ok(rotor<aircraftCruiseHeight('fighter',['jet','air']));
  assert.ok(aircraftCruiseHeight('fighter')<aircraftCruiseHeight('bomber'));assert.ok(aircraftCruiseHeight('bomber')<aircraftCruiseHeight('airlift'));
  close(aircraftCruiseHeight('airlift'),aircraftCruiseHeight('freightPlane'));
  const fighter = aircraftCruiseHeight('fighter',['jet','air']);
  assert.ok(aircraftCruiseHeight('freightPlane')-fighter >= 60);
  assert.ok(fighter-aircraftCruiseHeight('freightPlane',['jet','air'],false,true)>=30);
  close(aircraftCruiseHeight('airlift',['jet','air'],false,true),aircraftCruiseHeight('freightPlane',['jet','air'],false,true));
  assert.ok(aircraftCruiseHeight('freightPlane',['jet'],true)-aircraftCruiseHeight('fighter',['jet'],true)>=45);
  close(aircraftCruiseHeight('navalFighter'),95);close(aircraftCruiseHeight('fighter',['jet'],true),95);
});

test('五个阵营的货运机与运输机共用外观和空中尺度，月面保留独立造型',()=>{
  for(const faction of ['china','russia','nato','asia','middleeast']){
    const name=equipmentModel(faction,'airlift');assert.equal(equipmentModel(faction,'freightPlane'),name);
    const model=name==='nato_tandem'?createTandemTransport():createModernAircraft(name),dimensions=size(model);
    close(unitModelScale('airlift',dimensions,11),unitModelScale('freightPlane',dimensions,9));
  }
  assert.equal(equipmentModel('china','freightPlane',true),'space_freightPlane');
});

test('无专用起落架的飞机也在机场铺装上接地，队列离场后不会重新从地面起飞',()=>{
  const home={x:1000,y:900,size:128};
  const game={map:{},ownedBuildings:()=>[home],aircraftGrounded:()=>true};
  const entity={type:'fighter',x:1000,y:1040,owner:0};
  const entry={scale:9,groundClearance:0};
  close(aircraftGroundHeight(game,entity,entry,1),airfieldSurfaceHeight(game,entity,1)+.2);
  close(fixedWingHeight(game,entity,entry,1,95).height,airfieldSurfaceHeight(game,entity,1)+.2);
  for (const z of [2.1,3.25,3.7,4.2,7.05]) {
    entity.y=home.y+z*home.size/7.2;const height=airfieldSurfaceHeight(game,entity,1);assert.ok(height>1&&height<3,'铺装应贴近地面，不再抬高成悬浮平台');
  }
  game.aircraftGrounded=()=>false;entity.deployment={fromX:1000,fromY:1040};entity.x+=200;
  assert.equal(fixedWingHeight(game,entity,entry,1,95).height,95);
  const carrierJet={...entity,type:'navalFighter',deployment:{fromX:entity.x,fromY:entity.y}};
  assert.equal(fixedWingHeight(game,carrierJet,entry,1,95,18).height,18);
  carrierJet.x+=200;
  assert.equal(fixedWingHeight(game,carrierJet,entry,1,95,18).height,95);
  delete entity.deployment;assert.equal(fixedWingHeight(game,entity,entry,1,95),null);assert.equal(entry.takeoffOrigin,null);
});

test('直升机尾桨使用黑色低反光材质并保留独立旋转轴',()=>{
  const model=createStrategicModel('helicopter'),tail=model.getObjectByName('rotor_1_tail');
  assert.equal(tail.userData.rotationAxis,'z');let blades=0;
  tail.traverse(mesh=>{if(!mesh.isMesh)return;blades++;assert.ok(mesh.material.color.getHex()<0x303030);assert.ok(mesh.material.roughness>.9);assert.ok(mesh.material.metalness<.1);});
  assert.ok(blades>0);assert.ok(model.getObjectByName('rotor_0_main'));
});

test('航母按真实机体显示停放、出动和损失；抽象打击编组不冒充真实飞机',()=>{
  const game=new Game('china','nato',{}, {mapId:'ocean'});game.units=[];
  const carrier=game.addUnit(0,'carrier',1400,1000);
  assert.match(carrierAirGroupLabel(game,carrier),/^打击编组/);
  const deck=game.addUnit(0,'navalFighter',1400,1000),flight=game.addUnit(0,'navalStrike',1600,1000);
  deck.homeCarrierId=flight.homeCarrierId=carrier.id;deck.embarkedIn=carrier.id;
  assert.equal(carrierAirGroupLabel(game,carrier),'舰载机 2/24 · 甲板 1 · 在外 1/6 · 待飞 0');
  flight.hp=0;assert.equal(carrierAirGroupLabel(game,carrier),'舰载机 1/24 · 甲板 1 · 在外 0/6 · 待飞 0');
});
