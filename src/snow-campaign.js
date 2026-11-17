import { UNITS } from './data.js';
import { commandEnabled } from './command-doctrines.js';

export const CAMPAIGN_KEY='great-powers-snow-campaign-checkpoint-v1';
export const CAMPAIGN_FALLBACK_KEY='great-powers-snow-campaign-stage-v1';
export const CAMPAIGN_RECORD_KEY='great-powers-snow-campaign-record-v1';
export const SNOW_CHAPTERS=Object.freeze([
  {name:'雪岭开路',brief:'接管雪岭山口与至少一座油井，守住山口30秒，建立上游通道。',sites:['snow-pass'],oil:1,hold:30,delivered:0,sea:0},
  {name:'河谷接力',brief:'接管河谷枢纽与芦洲河口，控制至少两座油井；本阶段接收2160物资并守住45秒。',sites:['snow-valley','snow-marsh'],oil:2,hold:45,delivered:2160,sea:0},
  {name:'向海而生',brief:'登陆接管港岛航标，保有护航舰艇；本阶段接收1800海运物资并守住航标60秒。',sites:['snow-port'],oil:0,hold:60,delivered:0,sea:1800}
]);
export function campaignSummary(game){
 const c=game.campaign;if(!c)return null;const d=SNOW_CHAPTERS[c.chapter],route=game.logistics[0];
 return {name:d.name,brief:d.brief,chapter:c.chapter+1,status:c.status,hold:Math.floor(c.hold),holdGoal:d.hold,sites:d.sites.map(id=>({id,name:game.beacons.find(b=>b.id===id)?.name||id,owned:game.beacons.some(b=>b.id===id&&b.owner===0)})),oil:game.oil.filter(o=>o.owner===0).length,oilGoal:d.oil,delivered:Math.max(0,Math.floor(route.delivered-c.baseline)),deliveredGoal:d.delivered,sea:Math.max(0,Math.floor((route.seaDelivered||0)-c.seaBaseline)),seaGoal:d.sea,reason:c.reason||''};
}
export function validCampaign(c,enabled,time){
 if(c===undefined||c===null)return true;
 const finite=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 return enabled&&c.version===1&&Number.isInteger(c.chapter)&&c.chapter>=0&&c.chapter<3&&['active','intermission','failed','complete'].includes(c.status)&&[c.hold,c.startedAt,c.baseline,c.seaBaseline,c.retreats].every(finite)&&c.hold<=SNOW_CHAPTERS[c.chapter].hold+.1&&c.startedAt<=time&&typeof c.reason==='string'&&c.reason.length<200&&Array.isArray(c.completed)&&c.completed.length<=3&&c.completed.every((n,i)=>n===i)&&c.completed.length===c.chapter+(c.status==='complete'?1:0);
}
export const snowCampaign={
 initSnowCampaign(id){
  if(id!=='snowline'||!commandEnabled(this))return;
  this.campaign={version:1,chapter:0,status:'active',hold:0,startedAt:this.time,baseline:this.logistics[0].delivered,seaBaseline:this.logistics[0].seaDelivered||0,retreats:0,completed:[],reason:''};
  this.events.notice?.('雪岭开路：工程师先接管油井，侦察山口后带防空与补给推进');
 },
 updateSnowCampaign(dt){
  const c=this.campaign;if(!c||c.status!=='active')return;
  if(!this.ownedBuildings(0,'hq').length){c.status='failed';c.reason='指挥中心失守，可读取阶段检查点重组';this.endGame(1);return;}
  const d=SNOW_CHAPTERS[c.chapter],s=campaignSummary(this),fleet=this.ownedUnits(0).some(u=>u.hp>0&&!u.reinforcement&&['frigate','destroyer','patrol'].includes(u.type));
  const contested=d.sites.some(id=>{const b=this.beacons.find(b=>b.id===id);return this.enemyUnits(0).some(u=>UNITS[u.type].damage>0&&Math.hypot(u.x-b.x,u.y-b.y)<220&&this.canSeeEntity(0,u));});
  const held=!contested&&s.sites.every(s=>s.owned)&&s.oil>=d.oil&&(c.chapter!==2||fleet);
  c.hold=held?Math.min(d.hold,c.hold+dt):0;
  if(c.hold<d.hold-1e-8||s.delivered<d.delivered||s.sea<d.sea)return;
  c.completed.push(c.chapter);
  if(c.chapter===2){c.status='complete';c.reason='上游通道、河谷补给线与港岛航路全部贯通';this.endGame(0);return;}
  c.chapter++;c.status='intermission';c.hold=0;c.startedAt=this.time;c.baseline=this.logistics[0].delivered;c.seaBaseline=this.logistics[0].seaDelivered||0;c.reason='部队、损伤、库存与战场占领全部保留，请决定整备后何时继续';
  this.paused=true;this.events.campaign?.(true);
 },
 continueSnowCampaign(){
  const c=this.campaign;if(!c||c.status!=='intermission'||!this.running)return false;
  c.status='active';c.reason='';c.startedAt=this.time;this.paused=false;return true;
 },
 retreatSnowCampaign(){
  const c=this.campaign;if(!c||c.status!=='active'||!this.running)return false;
  c.retreats++;c.status='intermission';c.hold=0;c.reason='本阶段可重新组织，已付出的资源和部队损失保留';
  for(const u of this.activeUnits(0)){delete u.jointMission;if(!u.reinforcement)this.requestResupply(u);}
  this.paused=true;this.events.campaign?.(false);return true;
 }
};
