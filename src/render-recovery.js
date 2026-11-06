// 依据可确认的错误类别给出恢复步骤，硬件能力不足时避免反复触发同一重试。
export function renderRecovery(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/WebGL.*not supported|Error creating WebGL context/i.test(message)) {
    return {
      available: false,
      title: '浏览器未能启用 3D 加速',
      detail: '请在系统浏览器中打开游戏，检查浏览器的图形加速设置，关闭占用显存的页面后重启浏览器。若设备或远程桌面禁用了 WebGL，调低画质也无法创建 3D 画面。'
    };
  }
  return {
    available: true,
    title: '战场显示中断',
    detail: /context.?lost|图形设备连接中断/i.test(message)
      ? '图形连接已中断。可以尝试流畅画质恢复当前战局；若再次中断，先导出存档，再关闭其他占用显存的页面。'
      : '可以尝试流畅画质恢复当前战局。若启动素材尚未载入，请检查网络后重新部署。'
  };
}
