export const validBattleId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{12,100}$/.test(value);

export function createBattleId() {
  return globalThis.crypto?.randomUUID?.() || `battle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export function legacyBattleId(save) {
  const text = JSON.stringify(save);
  let a = 2166136261, b = 3339675911;
  // 老存档没有战局编号，以文件内容生成稳定指纹；复制同一文件不重复结算。
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b ^ text.charCodeAt(i), 2246822519);
  }
  return `legacy-${text.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
