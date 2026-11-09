import { HONOR_KEY, readHonors, validateHonors, writeHonors } from './player-honors.js';

export function recoverRelatedHonors(storage, text) {
  if (typeof text !== 'string' || text.length > 8 * 1024 * 1024) return false;
  const remote = validateHonors(JSON.parse(text));
  const current = readHonors(storage);
  // 仅恢复完整包含本机记录的较新档案，分叉战绩需由玩家选择导入。
  const completed = new Set(remote.completedIds);
  if (remote.points < current.points || remote.wins < current.wins || current.completedIds.some(id => !completed.has(id))) return false;
  if (remote.completedIds.length <= current.completedIds.length && remote.points <= current.points) return false;
  writeHonors(storage, remote);
  return true;
}

export function restoreRelatedHonors({ environment = window, onRestored = () => {}, automatic = true } = {}) {
  const origins = ['https://www.daguojueqi.site', 'https://daguojueqi.site'];
  if (!origins.includes(environment.location.origin)) return Promise.resolve({ status: 'unavailable' });
  const origin = origins.find(value => value !== environment.location.origin);
  return new Promise(resolve => {
    const nonce = environment.crypto.randomUUID();
    const frame = environment.document.createElement('iframe');
    frame.hidden = true; frame.title = '检查本站旧地址的本机荣誉';
    frame.src = origin + '/official/profile-bridge/index.html';
    let finished = false;
    const cleanup = result => {
      if (finished) return;
      finished = true; environment.clearTimeout(timer);
      environment.removeEventListener('message', receive); frame.remove(); resolve(result);
    };
    const receive = event => {
      if (event.source !== frame.contentWindow || event.origin !== origin || event.data?.type !== 'gp-local-honors' || event.data.nonce !== nonce) return;
      try {
        const profile = validateHonors(JSON.parse(event.data.profile));
        if (automatic && recoverRelatedHonors(environment.localStorage, event.data.profile)) { onRestored(); cleanup({ status: 'restored', profile, origin }); }
        else cleanup({ status: 'candidate', profile, origin });
      } catch { cleanup({ status: 'none' }); }
    };
    environment.addEventListener('message', receive);
    frame.addEventListener('load', () => frame.contentWindow.postMessage({ type: 'gp-read-honors', nonce }, origin));
    const timer = environment.setTimeout(() => cleanup({ status: 'unavailable' }), 8000);
    environment.document.body.append(frame);
  });
}
