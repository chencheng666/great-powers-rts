// 帧耗时采用迟滞：连续过慢才降低，持续流畅才缓慢恢复；切出页面不计入。
export class AdaptiveRender {
  constructor(){this.scale=1;this.average=16.7;this.samples=0;this.slow=0;this.fast=0;this.previous=null;this.changedAt=0;}
  update(now,{hidden=false,paused=false}={}){
    const delta=this.previous===null?0:now-this.previous;this.previous=now;
    if(hidden||paused||delta<4||delta>150)return this.scale;
    this.average+=(delta-this.average)*.06;this.samples++;
    if(this.samples<45)return this.scale;
    this.slow=this.average>29?this.slow+delta:0;
    this.fast=this.average<19?this.fast+delta:0;
    if(this.slow>900&&now-this.changedAt>1200){this.scale=Math.max(.65,this.scale-.1);this.slow=0;this.fast=0;this.changedAt=now;}
    else if(this.fast>5500&&now-this.changedAt>5500){this.scale=Math.min(1,this.scale+.04);this.fast=0;this.changedAt=now;}
    return this.scale;
  }
  reset(){this.previous=null;this.slow=this.fast=0;}
}
