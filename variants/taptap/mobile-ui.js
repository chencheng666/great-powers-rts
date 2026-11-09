// 科幻版触屏界面沿用原指令按钮和事件，不另写一套战斗规则。
export function setupStarportMobileUI() {
  const $ = selector => document.querySelector(selector);
  const touch = matchMedia('(max-width:700px), (any-pointer:coarse) and (max-width:1400px)');
  const toolbar = $('#command-toolbar'), field = $('#battlefield'), sidebar = $('#command-sidebar');
  const selection = $('#selection-panel'), start = $('#start-screen');
  const button = (id, label, source) => {
    const node = document.createElement('button');
    node.type = 'button'; node.id = id; node.className = 'command-btn sp-mobile-control';
    node.setAttribute('aria-label', label);
    const svg = $(source)?.querySelector('svg'); if (svg) node.append(svg.cloneNode(true));
    const text = document.createElement('span'); text.textContent = label; node.append(text);
    return node;
  };
  const build = button('sp-build-btn', '建造', '#sidebar-btn');
  build.setAttribute('aria-controls', 'command-sidebar');
  const badge = document.createElement('small'); badge.id = 'sp-production-badge'; build.append(badge);
  const more = button('sp-orders-btn', '更多', '#mobile-more-btn');
  more.setAttribute('aria-controls', 'sp-order-tray'); more.setAttribute('aria-expanded', 'false');
  toolbar.append(build, more);
  const tray = document.createElement('div'); tray.id = 'sp-order-tray';
  tray.setAttribute('role', 'group'); tray.setAttribute('aria-label', '更多指令与设置');
  for (const id of ['patrol-btn', 'resupply-btn', 'unload-btn']) tray.append(document.getElementById(id));
  const utilities = document.createElement('div'); utilities.className = 'sp-system-actions';
  for (const [id, label, source] of [
    ['all', '全军', '#all-btn'], ['home', '基地', '#home-btn'], ['save', '保存', '#save-btn'],
    ['audio', '声音', '#sound-btn'], ['interface', '界面', '#battle-ui-btn'],
    ['catalog', '图鉴', '#catalog-btn'], ['help', '帮助', '#help-btn'], ['menu', '主界面', '#menu-btn']
  ]) {
    const node = button(`sp-system-${id}`, label, source);
    node.addEventListener('click', () => $(source).click()); utilities.append(node);
  }
  tray.append(utilities); toolbar.append(tray);
  const closeMore = () => { document.body.classList.remove('sp-orders-open'); more.setAttribute('aria-expanded', 'false'); };
  more.addEventListener('click', () => {
    const open = document.body.classList.toggle('sp-orders-open'); more.setAttribute('aria-expanded', String(open));
    if (open && !sidebar.hidden) $('#sidebar-btn').click();
  });
  tray.addEventListener('click', event => { if (event.target.closest('button')) closeMore(); });
  document.addEventListener('pointerdown', event => { if (!tray.contains(event.target) && !more.contains(event.target)) closeMore(); });
  document.addEventListener('keydown', event => {
    if (touch.matches && event.key === 'Escape' && document.body.classList.contains('sp-orders-open')) {
      closeMore(); more.focus(); event.preventDefault(); event.stopImmediatePropagation();
    }
  }, true);
  build.addEventListener('click', () => { closeMore(); $('#sidebar-btn').click(); });

  const shell = document.createElement('div'); shell.id = 'sp-selection-shell';
  selection.before(shell); shell.append(selection);
  const details = button('sp-selection-details', '详情', '#catalog-btn');
  details.setAttribute('aria-expanded', 'false'); shell.append(details);
  details.addEventListener('click', () => {
    const open = shell.classList.toggle('sp-details-open'); details.setAttribute('aria-expanded', String(open));
  });
  let lastSelection = '';
  const syncSelection = () => {
    const kind = selection.dataset.selectionKind || 'none';
    shell.hidden = touch.matches && kind === 'none'; document.body.classList.toggle('sp-has-units', kind === 'units');
    const title = selection.querySelector('strong')?.textContent || '';
    if (lastSelection !== title) { shell.classList.remove('sp-details-open'); details.setAttribute('aria-expanded', 'false'); lastSelection = title; }
  };
  new MutationObserver(syncSelection).observe(selection, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['data-selection-kind'] });
  const syncSidebar = () => { build.setAttribute('aria-expanded', String(!sidebar.hidden)); document.body.classList.toggle('sp-drawer-open', !sidebar.hidden); };
  new MutationObserver(syncSidebar).observe(sidebar, { attributes: true, attributeFilter: ['hidden'] });
  const syncTargeting = () => {
    const targeting = !$('#cancel-order-btn').hidden;
    document.body.classList.toggle('sp-targeting', targeting);
    if (touch.matches && targeting && !sidebar.hidden) $('#sidebar-btn').click();
  };
  new MutationObserver(syncTargeting).observe($('#cancel-order-btn'), { attributes: true, attributeFilter: ['hidden'] });
  const syncQueue = () => {
    const title = $('#queue-title').textContent, time = $('#queue-time').textContent;
    badge.textContent = time === '待命' ? '' : time;
    build.title = time === '待命' ? '打开建造与生产' : `${title} · ${time}`;
  };
  new MutationObserver(syncQueue).observe($('.sidebar-footer'), { subtree: true, characterData: true, childList: true });

  const dock = document.createElement('div'); dock.id = 'sp-start-dock';
  const summary = document.createElement('span');
  const play = document.createElement('button'); play.type = 'button'; play.className = 'primary-btn';
  play.id = 'sp-start-btn'; play.textContent = '开始演习'; dock.append(summary, play); document.body.append(dock);
  play.addEventListener('click', () => $('#start-btn').click());
  const syncMenu = () => {
    document.body.classList.toggle('sp-in-menu', start.style.display !== 'none');
    play.disabled = $('#start-btn').disabled;
    play.textContent = play.disabled ? '正在准备战场…' : '开始演习';
    summary.textContent = `${$('#map-select').selectedOptions[0]?.textContent.split(' · ')[0]} · ${$('#difficulty-select').selectedOptions[0]?.textContent.split(' · ')[0]}`;
  };
  new MutationObserver(syncMenu).observe(start, { attributes: true, attributeFilter: ['style'] });
  new MutationObserver(syncMenu).observe($('#start-btn'), { attributes: true, attributeFilter: ['disabled'] });
  $('#map-select').addEventListener('change', syncMenu); $('#difficulty-select').addEventListener('change', syncMenu);
  const apply = () => {
    document.body.classList.toggle('starport-touch', touch.matches);
    if (touch.matches && !sidebar.hidden) $('#sidebar-btn').click();
    closeMore(); syncSelection(); syncSidebar(); syncQueue(); syncMenu();
    requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  };
  document.addEventListener('gp-deploying', event => {
    if (!event.detail && touch.matches && !sidebar.hidden) $('#sidebar-btn').click();
    if (!event.detail && touch.matches && $('#tutorial-toggle').getAttribute('aria-expanded') === 'true') $('#tutorial-toggle').click();
  });
  touch.addEventListener('change', apply); apply();
}
