// 空白处直接拖图；Shift保留框选，定位指令期间不劫持左键。
export function shouldPanMap({button,shift=false,alt=false,panMode=false,targeting=false,hit=false}) {
  return button===1||button===2||button===0&&!targeting&&(alt||panMode||!shift&&!hit);
}
export function touchTransform(previous,center,previousDistance,distance) {
  return {dx:previous?previous.x-center.x:0,dy:previous?previous.y-center.y:0,scale:previousDistance>4?Math.max(.5,Math.min(2,distance/previousDistance)):1};
}
