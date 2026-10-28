import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { parseSave } from '../src/savegame.js';
import { damagePresentation } from '../src/damage-presentation.js';
import { impactProfile } from '../src/visual-detail.js';
test('灰谷入门赠送仅限单机新兵，联机和其他难度开局保持公平',()=>{
  const game=new Game('china','nato',{}, {mapId:'valleyTraining',difficulty:'recruit'});
  assert.equal(game.players[0].credits,5000);assert.equal(game.players[1].credits,1550);assert.equal(game.aiWaveTimer,180);
  assert.ok(game.ownedUnits(0,'supply').length);assert.ok(game.ownedUnits(0,'rocket').length);assert.ok(game.world.width>3360);
  const save=parseSave(JSON.stringify(game.toSave()));assert.equal(Game.fromSave(save).players[0].credits,5000);
  for (const opts of [{multiplayer:true,difficulty:'recruit'},{difficulty:'standard'}]) { const g=new Game('china','nato',{}, {mapId:'valleyTraining',...opts});assert.equal(g.players[0].credits,g.players[1].credits);assert.equal(g.ownedUnits(0).length,g.ownedUnits(1).length); }
  const classic=new Game('china','nato');assert.equal(classic.world.width,2240);assert.equal(classic.players[0].credits,1550);
});
test('轻伤载具和建筑冒烟、修复后恢复，步兵不冒烟，炮弹命中有界',()=>{
 for(const type of ['tank','fighter','hq']){const kind=type==='hq'?'building':'unit';assert.equal(damagePresentation({kind,type,hp:90,maxHp:100}).smoke,true);assert.equal(damagePresentation({kind,type,hp:100,maxHp:100}).smoke,false);}
 assert.equal(damagePresentation({kind:'unit',type:'rifle',hp:50,maxHp:100}).smoke,false);
 assert.ok(impactProfile({type:'hit',targetType:'tank'}).radius>=20);assert.ok(impactProfile({type:'explosion',size:10000}).radius<=170);
});
