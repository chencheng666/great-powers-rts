import { createTutorial, updateTutorial, TUTORIAL_STEPS } from './tutorial.js';
export function setupTutorial({onAction=()=>{}}={}) {
  const panel=document.querySelector('#battle-tutorial'),steps=document.querySelector('#tutorial-steps'),count=document.querySelector('#tutorial-count');
  let current=null,progress=null,last='',collapsed=false;
  const narrow=matchMedia('(max-width:700px), (pointer:coarse) and (max-width:1000px)');
  narrow.addEventListener('change',()=>{if(!narrow.matches)return;collapsed=true;steps.hidden=true;document.querySelector('#tutorial-toggle').textContent='展开';document.querySelector('#tutorial-toggle').setAttribute('aria-expanded','false');});
  document.querySelector('#tutorial-toggle').addEventListener('click',()=>{collapsed=!collapsed;steps.hidden=collapsed;document.querySelector('#tutorial-toggle').textContent=collapsed?'展开':'收起';document.querySelector('#tutorial-toggle').setAttribute('aria-expanded',String(!collapsed));});
  return game=>{
    const enabled=game?.mapId==='valleyTraining'&&!game.online&&!game.challenge&&!game.sandbox&&document.querySelector('#tutorial-enabled').checked;
    panel.hidden=!enabled;if(!enabled)return;
    if(current!==game){current=game;progress=createTutorial(game);last='';collapsed=matchMedia('(max-width:700px), (pointer:coarse) and (max-width:1000px)').matches;steps.hidden=collapsed;document.querySelector('#tutorial-toggle').textContent=collapsed?'展开':'收起';document.querySelector('#tutorial-toggle').setAttribute('aria-expanded',String(!collapsed));}
    updateTutorial(progress,game);const signature=progress.done.join(',');if(signature===last)return;last=signature;
    count.textContent=`入门教学 ${progress.done.filter(Boolean).length}/${TUTORIAL_STEPS.length}`;steps.replaceChildren();
    // 每次只展示当前一步，避免完整清单持续遮住战场。
    const next=progress.done.indexOf(false);
    for(let i=0;i<TUTORIAL_STEPS.length;i++){if(i!==next)continue;const item=document.createElement('li');const strong=document.createElement('strong');strong.textContent=`${i+1} ${TUTORIAL_STEPS[i][0]}`;item.append(strong);item.setAttribute('aria-current','step');const p=document.createElement('p');p.textContent=TUTORIAL_STEPS[i][1];item.append(p);const action=document.createElement('button');action.type='button';action.textContent=['找到我的坦克','准备移动','打开建筑栏','打开部队栏','查看维修与补给','找到工程师和据点'][i];action.addEventListener('click',()=>onAction(i));item.append(action);steps.append(item);}
    const note=document.createElement('p');note.className='tutorial-tip';note.textContent=progress.done.every(Boolean)?'六项都完成了！接下来可以试试战术挑战中的作战路线。':progress.done.slice(0,4).every(Boolean)?'基础指挥已完成。维修与接管可在实战中尝试，没有伤车时继续正常作战即可。':'按提示试一下，也可以按自己的顺序玩。';steps.append(note);
  };
}
