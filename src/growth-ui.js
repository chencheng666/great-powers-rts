import { readGrowth, equipAppearance, growthAppearance, GROWTH_REWARDS, shareText } from './growth-rewards.js';
import { MAPS } from './data.js';
const dialog=document.querySelector('#growth-dialog'), content=document.querySelector('#growth-content'),status=document.querySelector('#growth-status');
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function render(){
  content.replaceChildren();status.textContent='';
  try {
    const p=readGrowth(localStorage),appearance=growthAppearance(localStorage);
    content.append(node('p',`${p.rank.name} · ${p.profile.points} 荣誉 · ${p.profile.wins} 胜 · ${p.profile.maps.length} 个战区`));
    content.append(node('h3','下一程 · 赢一局，也试试另一种战场'));
    const goals=[['首胜纪念',Math.min(1,p.profile.wins),1,'青铜涂装'],['挑战突破',Math.min(1,p.challengeWins),1,'挑战紫晶涂装'],['久经战阵',Math.min(3,p.profile.wins),3,'基地功勋标识'],['跨域远征',Math.min(2,p.profile.maps.length),2,'配合3胜解锁青玉涂装与先锋试炼']];
    for(const [title,value,total,reward] of goals){const row=node('div');row.className='growth-goal';row.append(node('strong',`${title} · ${value}/${total}`),node('small',reward));const bar=document.createElement('progress');bar.max=total;bar.value=value;row.append(bar);content.append(row);}
    const day=Math.floor((Date.now()+8*3600000)/86400000), pool=['valleyTraining','canyon','strait','archipelago','meridian'],id=p.profile.wins?pool[day%pool.length]:'valleyTraining';
    content.append(node('h3','今日推荐战区'));
    const recommend=node('button',`${MAPS[id].name} · 去选择`);recommend.type='button';recommend.className='secondary-btn';recommend.onclick=()=>chooseMap(id);content.append(recommend,node('p','首胜前推荐灰谷入门，之后每日轮换；不要求连续签到，没有游玩也不会扣积分或收回奖励。'));
    const challenge=node('button','前往战术挑战');challenge.type='button';challenge.className='secondary-btn';challenge.onclick=()=>{dialog.close();document.querySelector('#challenge-btn').click();};content.append(challenge);
    content.append(node('h3','外观与解锁条件'));
    for(const reward of GROWTH_REWARDS){const unlocked=p.unlocked.some(r=>r.id===reward.id),button=node('button',`${reward.name}${appearance.theme.id===reward.id?' · 已装备':unlocked?' · 装备':reward.challenges?' · 完成一次战术挑战解锁':` · ${reward.wins}胜 / ${reward.maps}战区获胜解锁`}`);button.type='button';button.className='secondary-btn';button.disabled=!unlocked;button.onclick=()=>{try{equipAppearance(localStorage,reward.id);render();status.textContent='已装备，下次进入普通单机战局生效。';}catch(e){status.textContent=e.message;}};content.append(button);}
    content.append(node('p',p.baseDecor?'基地功勋标识已解锁，普通单机指挥中心自动展示。':'基地功勋标识：累计3胜后自动展示。'));
    const trial=node('button',p.trial?'先锋试炼 · 已解锁，去选择':'先锋试炼 · 3胜且在2个战区获胜后解锁');trial.type='button';trial.className='secondary-btn';trial.disabled=!p.trial;trial.onclick=()=>chooseMap('commanderTrial');content.append(trial);
    content.append(node('h3','分享你的征途'));
    const preview=document.createElement('canvas');preview.width=900;preview.height=1200;preview.className='growth-card';preview.setAttribute('aria-label','战报分享卡预览');const cardReady=drawCard(preview,p,appearance.theme);content.append(preview);
    const save=node('button','保存战报图片');save.className='primary-btn';save.type='button';save.onclick=async()=>{await cardReady;preview.toBlob(blob=>{if(!blob){status.textContent='生成图片失败，请重试。';return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='大国崛起-我的征途.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status.textContent='已生成图片，可自行选择分享渠道。';},'image/png');};
    const copy=node('button','复制试玩邀请');copy.type='button';copy.className='secondary-btn';copy.onclick=async()=>{try{await navigator.clipboard.writeText(shareText(p));status.textContent='已复制，可粘贴分享。';}catch{const text=document.createElement('textarea');text.value=shareText(p);text.readOnly=true;content.append(text);text.select();status.textContent='请手动复制选中的邀请文字。';}};
    content.append(save,copy,node('p','公众号：数字机器莱西奥 · 本机成长记录，清理浏览器数据可能丢失。建议在荣誉档案中导出备份。涂装与标识仅改变普通单机外观，不加战力。'));
    refreshLocks(p);
  }catch(error){status.textContent=error.message;}
}
function drawCard(canvas,p,theme){const c=canvas.getContext('2d');c.fillStyle='#13262b';c.fillRect(0,0,900,1200);c.strokeStyle=theme.color;c.lineWidth=8;c.strokeRect(38,38,824,1124);c.fillStyle=theme.color;c.font='bold 74px sans-serif';c.fillText('大国崛起',80,170);c.fillStyle='#e5f0e8';c.font='28px sans-serif';c.fillText('海陆空即时战略 · 我的指挥官征途',80,235);c.font='bold 58px sans-serif';c.fillText(p.rank.name,80,410);c.font='38px sans-serif';c.fillText(`${p.profile.wins} 场胜利  /  ${p.profile.points} 荣誉`,80,510);c.fillText(`已在 ${p.profile.maps.length} 个战区获胜`,80,580);c.font='28px sans-serif';c.fillText('来灰谷入门，带领你的第一支装甲部队',80,740);c.fillText('试玩：www.daguojueqi.site',80,835);c.fillText('公众号：数字机器莱西奥',80,895);c.font='22px sans-serif';c.fillText('GitHub：chencheng666/great-powers-rts',80,950);c.fillStyle='#9bb0ad';c.fillText('本机单机荣誉 · 非联网排名',80,1080);return new Promise(resolve=>{const qr=new Image();qr.onload=()=>{c.drawImage(qr,640,950,170,170);c.fillStyle='#e5f0e8';c.font='22px sans-serif';c.fillText('扫码试玩',680,930);resolve();};qr.onerror=()=>resolve();qr.src=new URL('../assets/qr-play-warreport.png',import.meta.url).href;});}
function chooseMap(id){const select=document.querySelector('#map-select');select.value=id;select.dispatchEvent(new Event('change'));dialog.close();select.scrollIntoView({block:'center'});select.focus({preventScroll:true});}
export function refreshLocks(progress){const trial=document.querySelector('#map-select option[value="commanderTrial"]');if(trial){trial.disabled=!progress.trial;trial.textContent=progress.trial?'先锋试炼 · 已解锁':'先锋试炼 · 3胜且在2战区获胜解锁';}}
document.addEventListener('click',event=>{if(event.target.closest('#growth-open,[data-growth-open]')){render();dialog.showModal();}});document.querySelector('#growth-close').addEventListener('click',()=>dialog.close());
window.addEventListener('gp-honors-updated',()=>{try{refreshLocks(readGrowth(localStorage));}catch{}});
queueMicrotask(()=>{try{refreshLocks(readGrowth(localStorage));}catch{}});
