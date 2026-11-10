// 职责配色不替代敌我队色；近景与远景共用，避免切换细节后变成同一套人。
export const PERSONNEL_STYLES = Object.freeze({
  rifle: { mark: '兵', color: '#c7d8a1', fabric: '#a8b58a', material: '作战服', gear: '#b7ad8a' },
  engineer: { mark: '工', color: '#f1c66b', fabric: '#718da1', material: '工程作业服', gear: '#d0a552' },
  scout: { mark: '侦', color: '#a8c7eb', fabric: '#394c69', material: '侦察外套', gear: '#70849a' },
  evacuee: { mark: '援', color: '#eee0bd', fabric: '#d6a56c', material: '撤离人员外套', gear: '#b59d62' },
});

export function drawPersonnelBadge(ctx, x, y, type, teamColor) {
  const style = PERSONNEL_STYLES[type]; if (!style) return;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x - 11, y - 17, 22, 17, 8);
  ctx.fillStyle = 'rgba(12,25,31,.86)'; ctx.fill();
  ctx.strokeStyle = teamColor; ctx.lineWidth = .85; ctx.stroke();
  ctx.beginPath(); ctx.arc(x - 5.5, y - 8.5, 1.7, 0, Math.PI * 2);
  ctx.fillStyle = style.color; ctx.fill();
  ctx.font = '600 10.5px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f2f6ef';
  ctx.fillText(style.mark, x + 3, y - 8.2); ctx.restore();
}
