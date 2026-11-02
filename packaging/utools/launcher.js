(() => {
  let gameWindow = null;
  let opening = false;
  const status = document.querySelector('#status');
  const launchButton = document.querySelector('#launch');
  const api = window.utools;
  const links = Object.freeze({ online: 'https://www.daguojueqi.site/play/?from=utools', website: 'https://www.daguojueqi.site/', github: 'https://github.com/chencheng666/great-powers-rts' });
  async function external(name) {
    if (!api?.shellOpenExternal) { status.textContent = '请从 uTools 开发者工具或应用市场进入此应用。'; return; }
    try { await api.shellOpenExternal(links[name]); } catch { status.textContent = '系统浏览器未能打开，请稍后重试。'; }
  }
  function launch() {
    if (opening) return;
    if (!api?.createBrowserWindow) { status.textContent = '当前页面为入口预览，请在 uTools 内导入 plugin.json 后运行。'; return; }
    try {
      if (gameWindow && !gameWindow.isDestroyed()) {
        if (gameWindow.isMinimized()) gameWindow.restore();
        gameWindow.show(); gameWindow.focus(); return;
      }
    } catch { gameWindow = null; }
    opening = true; launchButton.disabled = true; status.textContent = '正在加载本地战场…';
    try {
      // 不向游戏窗口开放 Node.js 或任意本地文件能力，保留浏览器安全校验。
      gameWindow = api.createBrowserWindow('game.html', {
        show: true, title: '大国崛起 · 单机作战', width: 1366, height: 900,
        minWidth: 800, minHeight: 600, backgroundColor: '#0c1b1f',
        resizable: true, fullscreenable: true, autoHideMenuBar: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true },
      });
      gameWindow.show(); gameWindow.focus();
      status.textContent = '战场窗口已打开，首次会加载本地资源。再次点击可返回同一窗口。';
    } catch {
      gameWindow = null;
      status.textContent = '战场窗口未能打开，请检查 uTools Runtime 后重试。';
    } finally {
      opening = false; launchButton.disabled = false;
    }
  }
  launchButton.addEventListener('click', launch);
  for (const name of Object.keys(links)) document.querySelector(`#${name}`).addEventListener('click', () => external(name));
  document.querySelector('#privacy').addEventListener('click', () => {
    if (!api?.createBrowserWindow) { status.textContent = '应用目录内 privacy.html 可查看完整隐私说明。'; return; }
    api.createBrowserWindow('privacy.html', { width: 820, height: 760, title: '大国崛起 · 隐私说明', webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true } });
  });
  // 自定义窗口独立运行；不能在入口退到后台时关闭仍在作战的窗口。
  api?.onPluginEnter?.(() => { api.setExpandHeight?.(540); });
})();
