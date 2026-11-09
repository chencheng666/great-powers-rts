const names = new Set(['Error','TypeError','ReferenceError','RangeError','SyntaxError','AbortError','NetworkError','SecurityError','NotSupportedError','InvalidStateError']);
const fileName = value => typeof value === 'string' && /^[A-Za-z0-9_.-]{1,80}\.(?:js|mjs|css|html|glb|webp|png|jpe?g|mp4|wav|mp3|m4a)$/i.test(value) ? value : '';
function locationDetail(value, environment) {
  try {
    const url = new URL(value, environment.location.href), page = environment.location;
    if (url.origin !== page.origin || !['http:','https:','file:'].includes(url.protocol)) return '';
    if (url.protocol === 'file:' && url.pathname !== page.pathname) return '';
    return fileName(url.pathname.split('/').pop());
  } catch { return ''; }
}
// 只提取白名单标识和同源文件位置，不上报错误原文、完整堆栈、URL参数或玩家输入。
export function errorDetail(error, { environment = globalThis, stage = '', filename = '', line = 0, column = 0 } = {}) {
  const parts = [names.has(error?.name) ? error.name : 'Error'];
  if (['startup','frame','context','rejection'].includes(stage)) parts.push(`stage:${stage}`);
  const message = typeof error?.message === 'string' ? error.message : '';
  const code = /图形设备连接中断|context.?lost/i.test(message) ? 'webgl-context-lost'
    : /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message) ? 'module-load'
    : /WebGL.*not supported|Error creating WebGL context/i.test(message) ? 'webgl-unavailable'
    : /out of memory|allocation failed/i.test(message) ? 'memory'
    : /WebGLProgram|shader|VALIDATE_STATUS/i.test(message) ? 'shader'
    : /网络中断|Failed to fetch|NetworkError|Load failed/i.test(message) ? 'network' : '';
  if (code) parts.push(`code:${code}`);
  const file = locationDetail(filename, environment) || fileName(error?.assetFile);
  if (file) parts.push(file);
  if (Number.isSafeInteger(line) && line > 0) parts.push(`line:${line}`);
  if (Number.isSafeInteger(column) && column > 0) parts.push(`col:${column}`);
  if (!file && typeof error?.stack === 'string') {
    for (const match of error.stack.matchAll(/((?:https?:\/\/|file:\/\/\/)[^\s)]+?):(\d+):(\d+)/g)) {
      const local = locationDetail(match[1], environment);
      if (local) { parts.push(`${local}:${match[2]}:${match[3]}`); break; }
    }
  }
  if (!error && !file && !line) parts.push('code:opaque-script');
  return parts.join(' ').slice(0,160);
}
export function resourceDetail(target, environment = globalThis) {
  const video = target?.tagName === 'VIDEO';
  if (video && (!target.getAttribute('src') || target.dataset?.backgroundState === 'suspended' || target.error?.code === 1)) return null;
  const file = locationDetail(target?.currentSrc || target?.src || target?.href, environment);
  if (!file) return null;
  try {
    const path = new URL(target?.currentSrc || target?.src || target?.href, environment.location.href).pathname;
    if (['LINK', 'SCRIPT'].includes(target?.tagName) && !/(?:^|\/)(?:assets|src)\//.test(path)) return null;
  } catch { return null; }
  return [video ? 'MenuVideoError' : 'AssetError', file, ...(video && [2,3,4].includes(target.error?.code) ? [`media:${target.error.code}`] : [])].join(' ').slice(0,160);
}
