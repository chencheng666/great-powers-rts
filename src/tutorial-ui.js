import { createTutorial, updateTutorial, TUTORIAL_STEPS } from './tutorial.js';
export function setupTutorial({onAction=()=>{}}={}) {
  const panel=document.querySelector('#battle-tutorial'),steps=document.querySelector('#tutorial-steps'),count=document.querySelector('#tutorial-count');
  let current=null,progress=null,last='',collapsed=false;
  document.querySelector('#tutorial-toggle').addEventListener('click',()=>{collapsed=!collapsed;steps.hidden=collapsed;document.querySelector('#tutorial-toggle').textContent=collapsed?'展开':'收起';document.querySelector('#tutorial-toggle').setAttribute('aria-expanded',String(!collapsed));});
  return game=>{
    const enabled=game?.mapId==='valleyTraining'&&!game.online&&!game.challenge&&!game.sandbox&&document.querySelector('#tutorial-enabled').checked;
    panel.hidden=!enabled;if(!enabled)return;
    if(current!==game){current=game;progress=createTutorial(game);last='';collapsed=matchMedia('(max-width:700px), (pointer:coarse) and (max-width:1000px)').matches;steps.hidden=collapsed;document.querySelector('#tutorial-toggle').textContent=collapsed?'展开':'收起';document.querySelector('#tutorial-toggle').setAttribute('aria-expanded',String(!collapsed));}
    updateTutorial(progress,game);const signature=progress.done.join(',');if(signature===last)return;last=signature;
    count.textContent=`入门教学 ${progress.done.filter(Boolean).length}/4`;steps.replaceChildren();
    for(let i=0;i<TUTORIAL_STEPS.length;i++){const item=document.createElement('li');item.classList.toggle('complete',progress.done[i]);const strong=document.createElement('strong');strong.textContent=`${progress.done[i]?'✓':i+1} ${TUTORIAL_STEPS[i][0]}`;item.append(strong);if(i===progress.done.indexOf(false)){item.setAttribute('aria-current','step');const p=document.createElement('p');p.textContent=TUTORIAL_STEPS[i][1];item.append(p);const action=document.createElement('button');action.type='button';action.textContent=['找到我的坦克','准备移动','打开建筑栏','打开部队栏'][i];action.addEventListener('click',()=>onAction(i));item.append(action);}steps.append(item);}
    const note=document.createElement('p');note.className='tutorial-tip';note.textContent=progress.done.every(Boolean)?'完成了！让伤车靠近补给车维修，再试着进攻。':'按提示试一下，也可以按自己的顺序玩。';steps.append(note);
  };
}
