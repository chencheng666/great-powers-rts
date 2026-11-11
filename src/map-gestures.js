// 左键默认框选，中键、右键和显式拖图模式平移镜头。
export function shouldPanMap({button,alt=false,shift=false,panMode=false,targeting=false}) {
  return button===1||button===2||button===0&&!targeting&&(alt||panMode&&!shift);
}
// 拖图模式中的左键轻点仍可选人；只有真正拖动、中键和 Alt 手势消耗点击。
export function panConsumesClick(pan) {
  return pan.moved || pan.button === 1 || pan.alt === true;
}
export function touchTransform(previous,center,previousDistance,distance) {
  return {dx:previous?previous.x-center.x:0,dy:previous?previous.y-center.y:0,scale:previousDistance>4?Math.max(.5,Math.min(2,distance/previousDistance)):1};
}
// 定位建筑或指令时，手指拖动用于预览落点，不能同时把镜头拖走。
export function touchDragMode({ targeting = false, panning = false, distance = 0 } = {}) {
  return targeting ? 'target' : panning || distance > 8 ? 'pan' : 'tap';
}
