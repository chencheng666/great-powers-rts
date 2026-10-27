// 统计默认为关闭，仅在玩家明确选择后启用；无法保存选择时继续保持关闭。
export const PRIVACY_KEY = 'great-powers-telemetry-choice-v1';
export function telemetryConsent(storage) {
  try { const value = storage.getItem(PRIVACY_KEY); return value === 'allow' || value === 'deny' ? value : null; }
  catch { return null; }
}
export function setupPrivacySettings({ storage, document, location, onChoice = () => {} }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'online-dialog privacy-dialog';
  dialog.setAttribute('aria-labelledby', 'privacy-title');
  dialog.innerHTML = `<div class="online-kicker">玩家隐私</div><h2 id="privacy-title">隐私与统计设置</h2>
    <p>单机可离线游玩。是否允许在联网时收集可关联的游玩统计？不允许不影响单机游玩。</p>
    <details><summary>查看隐私说明</summary><div class="privacy-copy">
    <p>处理者：陈成；联系邮箱：15542389060@163.com。统计经同意后收集昵称、会话或访客标识、浏览器与设备信息、客户端版本、玩法、地图、游玩时长和故障类别，用于改进游戏。统计原始记录最长保存 12 个月；备份、战绩及法律另有要求的记录另按适用规则处理。</p>
    <p>联机时为创建房间和同步战局需处理昵称、会话、对局操作及战绩；单机存档、荣誉和设置保存在本机。访问服务器可能产生必要的网络日志。你可通过邮箱申请查询、更正、删除或撤回同意；停止统计不会自动删除此前记录。</p>
    <p>源码：github.com/chencheng666/great-powers-rts；公众号：数字机器莱西奥。打开外部网站时请参阅其隐私规则。未成年人请与监护人共同阅读。</p>
    </div></details><p id="privacy-error" role="alert"></p>
    <div class="privacy-actions"><button type="button" class="secondary-btn" data-privacy="deny">不允许统计</button><button type="button" class="primary-btn" data-privacy="allow">同意统计</button></div>`;
  document.body.append(dialog);
  dialog.addEventListener('click', event => {
    const choice = event.target.closest('[data-privacy]')?.dataset.privacy;
    if (choice !== 'allow' && choice !== 'deny') return;
    try { storage.setItem(PRIVACY_KEY, choice); }
    catch { dialog.querySelector('#privacy-error').textContent = '无法保存选择；统计仍保持关闭，请检查本地存储设置。'; return; }
    onChoice(choice); dialog.close(); location.reload();
  });
  document.querySelector('#privacy-settings-btn').addEventListener('click', () => { if (!dialog.open) dialog.showModal(); });
  if (!telemetryConsent(storage)) dialog.showModal();
  return dialog;
}
