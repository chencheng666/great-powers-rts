// 保留原画布及已绑定的输入事件，避免容器重排后每帧访问空节点。
export function ensureBattleCanvas(canvas, document) {
  if (canvas?.isConnected && canvas.parentElement) return canvas;
  const field = document.querySelector('#battlefield');
  if (!canvas || !field) throw new Error('战场容器暂不可用，请返回主界面重试');
  if (!field.contains(canvas)) field.prepend(canvas);
  return canvas;
}
