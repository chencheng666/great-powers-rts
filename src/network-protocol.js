export const PROTOCOL_VERSION = 1;
export function roomCode(value) {
  const code = typeof value === 'string' ? value.normalize('NFKC').replace(/\s/g, '') : '';
  if (!/^[0-9]{6}$/.test(code)) throw new Error('请输入六位数字房间码');
  return code;
}
export function nickname(value) {
  const name = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
  if (!name || [...name].length > 16 || /[\p{Cc}\p{Cf}<>]/u.test(name)) throw new Error('昵称请使用 1 到 16 个可显示字符');
  return name;
}
export function packFog(fog) {
  const bytes = new Uint8Array(Math.ceil(fog.visible.length / 4));
  for (let i = 0; i < fog.visible.length; i++) bytes[i >> 2] |= ((fog.visible[i] ? 2 : 0) | (fog.explored[i] ? 1 : 0)) << ((i % 4) * 2);
  return { cols: fog.cols, rows: fog.rows, bits: btoa(String.fromCharCode(...bytes)) };
}
export function unpackFog(fog) {
  const bytes = atob(fog.bits), size = fog.cols * fog.rows;
  return { cols: fog.cols, rows: fog.rows, visible: Array.from({ length: size }, (_, i) => !!(bytes.charCodeAt(i >> 2) & (2 << ((i % 4) * 2)))), explored: Array.from({ length: size }, (_, i) => !!(bytes.charCodeAt(i >> 2) & (1 << ((i % 4) * 2)))) };
}
