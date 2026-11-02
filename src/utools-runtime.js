const LINKS = Object.freeze({
  online: 'https://www.daguojueqi.site/play/?from=utools',
  website: 'https://www.daguojueqi.site/',
  github: 'https://github.com/chencheng666/great-powers-rts',
});

// 仅本地插件包带此标记；网站不能因此获得任何本地权限。
export function isUtools(environment = globalThis) {
  return environment.location?.protocol === 'file:'
    && environment.document?.querySelector?.('meta[name="great-powers-runtime"]')?.content === 'utools';
}

export async function openUtoolsLink(destination, environment = globalThis) {
  if (typeof destination !== 'string' || !Object.hasOwn(LINKS, destination)) throw new Error('不支持的外部链接');
  const url = LINKS[destination];
  if (!url) throw new Error('不支持的外部链接');
  if (typeof environment.utools?.shellOpenExternal !== 'function') {
    throw new Error('请回到 uTools 应用入口，点击“在线试玩”打开官网；本地单机仍可继续。');
  }
  await environment.utools.shellOpenExternal(url);
}

export function setupUtools(environment = globalThis) {
  if (!isUtools(environment)) return;
  const doc = environment.document;
  doc.querySelector('#desktop-download-link')?.setAttribute('hidden', '');
  const note = doc.querySelector('#offline-telemetry-note');
  if (note) {
    note.hidden = false;
    note.textContent = 'uTools 单机版 · 素材内置，离线可玩；不自动上传昵称、设备、时长或错误。意见反馈仅在主动提交时联网。';
  }
  const nicknameNote = doc.querySelector('#nickname-dialog .telemetry-note');
  if (nicknameNote) nicknameNote.textContent = '作战呼号与存档保存在本机。本插件不自动上传玩家统计；更新前建议导出存档备份。';
  const button = doc.querySelector('#online-btn');
  if (button) button.title = '在系统浏览器打开官网联网对战，单机存档不自动迁移';
}
