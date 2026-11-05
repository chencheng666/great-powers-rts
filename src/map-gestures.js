// 左键默认框选，中键、右键和显式拖图模式平移镜头。
export function shouldPanMap({button,alt=false,shift=false,panMode=false,targeting=false}) {
  return button===1||button===2||button===0&&!targeting&&(alt||panMode&&!shift);
}
export function touchTransform(previous,center,previousDistance,distance) {
  return {dx:previous?previous.x-center.x:0,dy:previous?previous.y-center.y:0,scale:previousDistance>4?Math.max(.5,Math.min(2,distance/previousDistance)):1};
}
