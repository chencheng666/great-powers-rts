export function orderRoutes(game) {
  const selected=new Set(game.selected),routes=[];
  for(const u of game.activeUnits(0)){
    if(!selected.has(u.id)||!u.order||!['move','attackMove','attack','capture','infiltrate','defuse','collect','board','rearm','restock'].includes(u.order.type))continue;
    const order=u.order,target=game.getEntity(order.targetId);
    const visibleTarget=target&&(target.owner===0||target.kind==='resource'||game.canSeeEntity(0,target));
    const destination=visibleTarget?{x:target.x,y:target.y}:Number.isFinite(order.x)&&Number.isFinite(order.y)?{x:order.x,y:order.y}:u.motionGoal;
    if(!destination)continue;
    const points=[{x:u.x,y:u.y},...(u.path||[]).slice(0,64),destination].filter((p,i,all)=>!i||Math.hypot(p.x-all[i-1].x,p.y-all[i-1].y)>3);
    if(points.length<2)continue;
    routes.push({id:u.id,points,destination,type:order.type,color:['attack','attackMove','infiltrate'].includes(order.type)?'#f1a291':['collect','capture','defuse'].includes(order.type)?'#efd58c':'#91dfdf'});
    if(routes.length>=24)break;
  }
  return routes;
}
