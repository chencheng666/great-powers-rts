import '../../src/main.js';
import './style.css';

// 本版始终是本地单机，不根据审核时间、平台账号或远程开关改变内容。
const note = document.querySelector('#offline-telemetry-note');
if (note) { note.hidden = false; note.textContent = 'TapTap 科幻战术试玩版 · 本地单机。呼号、战局和成绩保存在本机，不上传设备、姓名、时长或错误；清理数据、换设备或更新前请先导出。'; }
for (const id of ['online-btn', 'challenge-btn', 'sandbox-btn', 'growth-open', 'feedback-open']) {
  const button = document.getElementById(id); if (button) { button.hidden = true; button.disabled = true; }
}
const nuclear = document.querySelector('#nuclear-enabled');
if (nuclear) { nuclear.checked = false; nuclear.disabled = true; nuclear.closest('label')?.setAttribute('hidden', ''); }
const nicknameNote = document.querySelector('#nickname-dialog .telemetry-note');
if (nicknameNote) nicknameNote.textContent = '呼号只用于本机存档，不注册账号，也不上传玩家信息。';
