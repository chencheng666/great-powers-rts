import { GAME_VERSION, BUILD_ID } from './version.js';
const dialog = document.querySelector('#feedback-dialog');
const form = document.querySelector('#feedback-form');
const status = document.querySelector('#feedback-status');
document.querySelector('#feedback-open').addEventListener('click', () => { status.textContent = ''; dialog.showModal(); });
document.querySelector('#feedback-close').addEventListener('click', () => dialog.close());
form.addEventListener('submit', async event => {
  event.preventDefault(); const content = document.querySelector('#feedback-content').value.trim();
  const file = document.querySelector('#feedback-image').files[0];
  if (!content) { status.textContent = '请填写反馈内容。'; return; }
  if (file && (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 524288)) { status.textContent = '图片须为 PNG、JPG 或 WebP，且不超过 512 KB。'; return; }
  const button = form.querySelector('[type=submit]'); button.disabled = true; status.textContent = '正在提交…';
  try {
    const image = file ? await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }) : null;
    const external = location.protocol === 'file:' || location.protocol === 'tauri:' || location.hostname === 'tauri.localhost';
    const response = await fetch(external ? 'https://www.daguojueqi.site/api/feedback' : '/api/feedback', {method:'POST', headers:{'Content-Type': external ? 'text/plain' : 'application/json'}, body:JSON.stringify({content,image,version:`${GAME_VERSION}+${BUILD_ID}`}), signal:AbortSignal.timeout(20000)});
    if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error || '提交失败，请稍后重试。');
    form.reset(); status.textContent = '感谢反馈，我们已收到。';
  } catch (error) { status.textContent = error.message || '网络不可用，请联网后重试。'; } finally { button.disabled = false; }
});
