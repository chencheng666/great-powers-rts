const KEY = 'great-powers-battle-ui-v1';
export const defaultBattleUI = Object.freeze({ status: true, camera: true, scale: 100 });
export function readBattleUI(storage) {
  try {
    const value = JSON.parse(storage?.getItem(KEY) || 'null') || {};
    return { status: typeof value.status === 'boolean' ? value.status : true, camera: typeof value.camera === 'boolean' ? value.camera : true, scale: [80, 90, 100, 110, 120].includes(value.scale) ? value.scale : 100 };
  } catch { return { ...defaultBattleUI }; }
}
export function setupBattleUI() {
  const panel = document.querySelector('#battle-ui-panel'), trigger = document.querySelector('#battle-ui-btn');
  const status = document.querySelector('#battlefield > .battle-hud.top-left'), camera = document.querySelector('.camera-tools');
  const scale = document.querySelector('#battle-ui-scale'), statusInput = document.querySelector('#battle-ui-status'), cameraInput = document.querySelector('#battle-ui-camera');
  const narrow = matchMedia('(max-width:700px), (pointer:coarse) and (max-width:1000px)');
  let storage; try { storage = localStorage; } catch { /* 存储不可用时仍可调整本局界面。 */ }
  let settings = readBattleUI(storage);
  const position = () => {
    const field = document.querySelector('#battlefield').getBoundingClientRect();
    const visible = element => !element.hidden && getComputedStyle(element).display !== 'none';
    let bottom = narrow.matches ? 8 : 18;
    if (visible(status)) bottom = status.getBoundingClientRect().bottom - field.top + 8;
    camera.style.setProperty('top', `${bottom}px`, 'important');
    if (visible(camera)) bottom = camera.getBoundingClientRect().bottom - field.top + 8;
    document.querySelector('#battle-tutorial').style.top = `${bottom}px`;
  };
  function apply() {
    status.hidden = !settings.status; camera.hidden = !settings.camera;
    document.querySelector('#battlefield').style.setProperty('--battle-ui-scale', narrow.matches ? 1 : settings.scale / 100);
    statusInput.checked = settings.status; cameraInput.checked = settings.camera; scale.value = settings.scale;
    scale.disabled = narrow.matches; statusInput.disabled = narrow.matches;
    document.querySelector('#battle-ui-scale-value').textContent = `${settings.scale}%`;
    position();
  }
  const save = () => { try { storage?.setItem(KEY, JSON.stringify(settings)); } catch { /* 当前界面设置仍生效。 */ } apply(); };
  function close() { panel.hidden = true; trigger.setAttribute('aria-expanded', 'false'); }
  trigger.addEventListener('click', () => { panel.hidden = !panel.hidden; trigger.setAttribute('aria-expanded', String(!panel.hidden)); });
  document.querySelector('#battle-ui-close').addEventListener('click', close);
  statusInput.addEventListener('change', () => { settings.status = statusInput.checked; save(); });
  cameraInput.addEventListener('change', () => { settings.camera = cameraInput.checked; save(); });
  scale.addEventListener('input', () => { settings.scale = Number(scale.value); save(); });
  document.querySelector('#battle-ui-reset').addEventListener('click', () => { settings = { ...defaultBattleUI }; save(); });
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { close(); trigger.focus(); event.stopPropagation(); } });
  narrow.addEventListener('change', apply); window.addEventListener('resize', position);
  if (typeof ResizeObserver === 'function') new ResizeObserver(position).observe(status);
  apply();
}
