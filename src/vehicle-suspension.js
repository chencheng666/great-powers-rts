const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function criticalSpring(position,velocity,target,frequency,dt){
  if(dt<=0)return{position,velocity};
  const step=Math.min(dt,.05),offset=position-target,j=velocity+frequency*offset,decay=Math.exp(-frequency*step);
  return{position:target+(offset+j*step)*decay,velocity:(velocity-frequency*j*step)*decay};
}
export function vehicleSuspension(state,{x,z,heading,speed=0,dt,ground,halfLength=22,halfWidth=11}){
  state.suspension??={pitch:0,pitchVelocity:0,roll:0,rollVelocity:0,lift:0,liftVelocity:0,speed};const s=state.suspension;
  const dx=Math.cos(heading),dz=Math.sin(heading),front=ground(x+dx*halfLength,z+dz*halfLength),back=ground(x-dx*halfLength,z-dz*halfLength);
  const left=ground(x-dz*halfWidth,z+dx*halfWidth),right=ground(x+dz*halfWidth,z-dx*halfWidth),center=ground(x,z);
  const acceleration=dt>0?clamp((speed-s.speed)/Math.max(.008,dt),-15,15):0;
  const targetPitch=clamp(Math.atan2(front-back,halfLength*2)-acceleration*.004,-.32,.32),targetRoll=clamp(-Math.atan2(left-right,halfWidth*2),-.24,.24);
  const pitch=criticalSpring(s.pitch,s.pitchVelocity,targetPitch,12,dt),roll=criticalSpring(s.roll,s.rollVelocity,targetRoll,10,dt),lift=criticalSpring(s.lift,s.liftVelocity,clamp((front+back+left+right)/4-center,-2,2),13,dt);
  Object.assign(s,{pitch:pitch.position,pitchVelocity:pitch.velocity,roll:roll.position,rollVelocity:roll.velocity,lift:lift.position,liftVelocity:lift.velocity,speed});
  return{pitch:s.pitch,roll:s.roll,lift:s.lift};
}
