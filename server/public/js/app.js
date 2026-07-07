// Kith — main app logic: state, routing, shell, spicy mode, command palette.

import { api, qs, setToken } from './api.js';
import { esc, initials, debounce } from './utils.js';
import { icon } from './icons.js';
import { toast, openModal, modalShell, toggleSwitch, emptyState } from './components.js';
import { renderPage, pageTitles } from './pages.js';

// ---------------------------------------------------------------- state
export const state = {
  user: null,
  settings: {},         // app settings (public subset)
  preferences: {},      // per-user preferences
  spicyEnabled: false,  // global setting
  spicyActive: false,   // session state
  groups: [],
  favorites: [],
  tags: [],
  route: { page: 'home', params: {} },
  spicyTimer: null,
};

const root = document.getElementById('root');

// CSP ('script-src self', no unsafe-inline) makes inline onerror handlers dead.
// Avatars render initials UNDER the <img> (the photo covers them when loaded);
// on load failure remove the broken img so the initials show. Capture phase:
// 'error' on media elements does not bubble.
document.addEventListener('error', (e) => {
  const t = e.target;
  if (t && t.tagName === 'IMG' && t.closest?.('.av')) t.remove();
}, true);

// ---------------------------------------------------------------- router
const ROUTES = ['home', 'contacts', 'events', 'notifications', 'settings', 'review', 'groups'];

export function navigate(hash, { replace = false } = {}) {
  if (replace) location.replace(`#${hash}`);
  else location.hash = hash;
}

function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, query] = h.split('?');
  const segs = path.split('/').filter(Boolean);
  const page = ROUTES.includes(segs[0]) ? segs[0] : 'home';
  const params = Object.fromEntries(new URLSearchParams(query || ''));
  if (segs[1]) params.id = segs[1];
  return { page, params };
}

async function onRouteChange() {
  state.route = parseRoute();
  const render = () => renderCurrentPage();
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const t = document.startViewTransition(render);
    t.finished.catch(() => {}); // skipped transitions are fine
    t.ready.catch(() => {});
    t.updateCallbackDone.catch(() => {});
  } else {
    render();
  }
}

async function renderCurrentPage() {
  const pageEl = document.getElementById('page');
  if (!pageEl) return;
  // active nav state
  document.querySelectorAll('.nav-item[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === state.route.page);
  });
  try {
    await renderPage(pageEl, state.route);
  } catch (err) {
    pageEl.innerHTML = `<div class="page-inner">${emptyState('alert-circle', "Couldn't load this page", err?.message || 'Something went wrong. Try again.')}</div>`;
  }
  document.title = `${pageTitles[state.route.page] || 'Kith'} · ${state.settings.app_name || 'Kith'}`;
}

// ---------------------------------------------------------------- spicy
export function isSpicyOn() {
  return state.spicyEnabled && state.spicyActive;
}

export async function setSpicyActive(active, { skipPin = false } = {}) {
  if (!state.spicyEnabled) return;
  if (active && !skipPin && state.settings.spicy_require_pin && state.preferences.spicy_pin_set) {
    promptSpicyPin();
    return;
  }
  const prevActive = state.spicyActive;
  // optimistic UI: apply the class immediately…
  state.spicyActive = active;
  document.body.classList.add('accent-transition');
  document.body.classList.toggle('spicy-mode', active);
  document.getElementById('flame-toggle')?.classList.toggle('active', active);
  document.getElementById('flame-toggle')?.setAttribute('aria-pressed', active ? 'true' : 'false');
  setTimeout(() => document.body.classList.remove('accent-transition'), 700);

  // …but persist BEFORE re-rendering so pages never race the server state.
  try {
    await api.put('/api/preferences/spicy_visible', { value: active, type: 'boolean' });
    state.preferences.spicy_visible = active;
  } catch (err) {
    // revert the optimistic UI
    state.spicyActive = prevActive;
    document.body.classList.toggle('spicy-mode', prevActive);
    document.getElementById('flame-toggle')?.classList.toggle('active', prevActive);
    document.getElementById('flame-toggle')?.setAttribute('aria-pressed', prevActive ? 'true' : 'false');
    toast(err.message || "Couldn't switch spicy mode.", 'error');
    return;
  }

  clearTimeout(state.spicyTimer);
  const mins = Number(state.settings.spicy_auto_disable_minutes || 0);
  if (active && mins > 0) {
    state.spicyTimer = setTimeout(() => setSpicyActive(false), mins * 60 * 1000);
  }
  renderCurrentPage();
}

function promptSpicyPin() {
  const html = modalShell('spicy-pin', 'Enter PIN',
    `<div class="form-group"><label class="form-label">Spicy mode PIN</label>
     <input class="form-input" name="pin" type="password" inputmode="numeric" autocomplete="off"></div>
     <div class="form-error hidden" id="pin-error"></div>`,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="pin-submit">Unlock</button>`);
  openModal(html, {
    onMount: (overlay, close) => {
      const submit = async () => {
        const pin = overlay.querySelector('[name="pin"]').value;
        try {
          await api.post('/api/preferences/spicy-pin/verify', { pin });
          close();
          setSpicyActive(true, { skipPin: true });
        } catch (err) {
          const el = overlay.querySelector('#pin-error');
          el.textContent = err.message;
          el.classList.remove('hidden');
        }
      };
      overlay.querySelector('[data-action="pin-submit"]').addEventListener('click', submit);
      overlay.querySelector('[name="pin"]').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    },
  });
}

// ---------------------------------------------------------------- accent
function applyAccentSettings() {
  const rootStyle = document.documentElement.style;
  const accent = state.settings.accent_color;
  const spicy = state.settings.spicy_accent_color;
  if (accent && /^#[0-9a-fA-F]{6}$/.test(accent)) {
    rootStyle.setProperty('--accent', accent);
    rootStyle.setProperty('--accent-hover', shade(accent, -12));
    rootStyle.setProperty('--accent-subtle', hexToRgba(accent, 0.07));
    rootStyle.setProperty('--accent-border', hexToRgba(accent, 0.18));
    rootStyle.setProperty('--accent-glow', hexToRgba(accent, 0.10));
  }
  if (spicy && /^#[0-9a-fA-F]{6}$/.test(spicy)) {
    rootStyle.setProperty('--spicy-accent-color', spicy);
    rootStyle.setProperty('--spicy-accent-hover', shade(spicy, -12));
  }
}
function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function shade(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c * (1 + pct / 100))));
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------- shell
function logoHtml() {
  const custom = state.settings.app_logo;
  if (custom) return `<img src="${esc(custom)}" alt="">`;
  return `<img src="/assets/logo.svg" alt="" style="filter:none">`;
}

function shellHtml() {
  const u = state.user;
  const isAdmin = u.role === 'main_admin' || u.role === 'admin';
  return `
  <div id="app">
    <div class="sidebar-backdrop hidden" id="sidebar-backdrop"></div>
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-header">
        <a href="#/home" class="sidebar-logo" style="text-decoration:none">
          <span class="logo-mark">${logoHtml()}</span>
          <span class="wordmark">${esc(state.settings.app_name || 'Kith')}</span>
        </a>
        ${state.spicyEnabled ? `<button class="btn-flame ${state.spicyActive ? 'active' : ''}" id="flame-toggle" aria-label="Toggle spicy mode" aria-pressed="${state.spicyActive}">${icon('flame')}</button>` : ''}
      </div>
      <div class="sidebar-search">
        <div class="search-input-wrap">
          ${icon('search')}
          <input class="form-input" id="sidebar-search" placeholder="Search" autocomplete="off">
          <span class="kbd">⌘K</span>
        </div>
      </div>
      <div class="sidebar-new">
        <button class="btn btn-primary btn-block" data-action="new-contact">${icon('plus')} New person</button>
      </div>
      <nav class="sidebar-nav" aria-label="Pages">
        <a class="nav-item" data-nav="home" href="#/home">${icon('home')} Home</a>
        <a class="nav-item" data-nav="contacts" href="#/contacts">${icon('users')} Contacts</a>
        <a class="nav-item" data-nav="events" href="#/events">${icon('calendar')} Events</a>
        <a class="nav-item" data-nav="notifications" href="#/notifications">${icon('bell')} Notifications <span class="nav-count" id="notif-count"></span></a>
        ${isAdmin ? `<a class="nav-item" data-nav="settings" href="#/settings">${icon('settings')} Settings</a>` : ''}
      </nav>
      <div class="sidebar-scroll">
        <button class="sidebar-section-label" data-collapse="favorites" aria-expanded="true">
          ${icon('chevron-down', 'chev')} Favorites
        </button>
        <div id="sidebar-favorites"></div>
        <div class="sidebar-section-row">
          <button class="sidebar-section-label" data-collapse="groups" aria-expanded="true">
            ${icon('chevron-down', 'chev')} Groups
          </button>
          <a class="sidebar-section-action" href="#/groups" aria-label="Manage groups" title="Manage groups">${icon('settings')}</a>
        </div>
        <div id="sidebar-groups"></div>
      </div>
      <div class="sidebar-footer">
        <span class="av sm">${esc(initials(u.display_name || u.username))}</span>
        <div class="user-meta">
          <div class="user-name">${esc(u.display_name || u.username)}</div>
          <div class="user-role">${esc(u.role.replace('_', ' '))}</div>
        </div>
        <button class="btn btn-icon" data-action="logout" aria-label="Log out">${icon('log-out')}</button>
      </div>
    </aside>
    <main class="main">
      <div class="mob-header">
        <button class="btn btn-icon" id="mob-menu" aria-label="Open menu">${icon('menu')}</button>
        <span class="logo-mark" style="width:20px;height:20px;color:var(--accent)">${logoHtml()}</span>
        <span class="wordmark" style="font-weight:600">${esc(state.settings.app_name || 'Kith')}</span>
        <span class="flex-1"></span>
        <span class="av sm">${esc(initials(u.display_name || u.username))}</span>
      </div>
      <div class="page" id="page"></div>
    </main>
  </div>
  <div id="import-widget-host"></div>`;
}

export async function refreshSidebarLists() {
  try {
    const [favData, groupData] = await Promise.all([
      api.get('/api/contacts' + qs({ favorites: 1, limit: 20 })),
      api.get('/api/groups'),
    ]);
    state.favorites = favData.contacts || [];
    state.groups = groupData.groups || [];
  } catch { return; }

  const favEl = document.getElementById('sidebar-favorites');
  const grpEl = document.getElementById('sidebar-groups');
  if (favEl) {
    favEl.innerHTML = state.favorites.length
      ? state.favorites.map((c) => `
        <a class="sidebar-mini-item" href="#/contacts/${c.id}">
          <span class="av sm" style="width:20px;height:20px;font-size:9px">${esc(initials(c.display_name))}</span>
          <span class="truncate">${esc(c.display_name)}</span>
        </a>`).join('')
      : `<div class="sidebar-mini-item" style="cursor:default;color:var(--text-muted)">No favorites yet</div>`;
  }
  if (grpEl) {
    grpEl.innerHTML = state.groups.map((g) => `
      <a class="sidebar-mini-item" href="#/contacts?group=${g.id}">
        <span class="dot" style="background:${esc(g.color || '#7c5bf5')}"></span>
        <span class="truncate">${esc(g.name)}</span>
        <span class="mini-count">${Number(g.member_count) || 0}</span>
      </a>`).join('');
  }
}

export async function refreshNotifCount() {
  try {
    const data = await api.get('/api/notifications/count');
    const el = document.getElementById('notif-count');
    if (el) el.textContent = data.count > 0 ? String(data.count) : '';
  } catch { /* ignore */ }
}

function bindShell() {
  // flame toggle
  document.getElementById('flame-toggle')?.addEventListener('click', () => {
    setSpicyActive(!state.spicyActive);
  });

  // collapsible sections
  document.querySelectorAll('[data-collapse]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(`sidebar-${btn.dataset.collapse}`);
      const collapsed = btn.classList.toggle('collapsed');
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      target?.classList.toggle('hidden', collapsed);
    });
  });

  // logout
  document.querySelector('[data-action="logout"]')?.addEventListener('click', async () => {
    await api.post('/api/auth/logout').catch(() => {});
    setToken(null);
    location.hash = '';
    location.reload();
  });

  // new contact (delegated to pages module through a custom event)
  document.querySelectorAll('[data-action="new-contact"]').forEach((b) =>
    b.addEventListener('click', () => window.dispatchEvent(new CustomEvent('kith:new-contact')))
  );

  // sidebar quick search → command palette
  const search = document.getElementById('sidebar-search');
  search?.addEventListener('focus', () => { openCommandPalette(); search.blur(); });

  // mobile drawer
  const sidebar = document.getElementById('sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  document.getElementById('mob-menu')?.addEventListener('click', () => {
    sidebar.classList.add('open');
    backdrop.classList.remove('hidden');
  });
  backdrop?.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.add('hidden');
  });
  sidebar?.addEventListener('click', (e) => {
    if (e.target.closest('a') && matchMedia('(max-width: 768px)').matches) {
      sidebar.classList.remove('open');
      backdrop.classList.add('hidden');
    }
  });
}

// ------------------------------------------------------- command palette
let cmdkOpen = false;
export function openCommandPalette() {
  if (cmdkOpen) return;
  cmdkOpen = true;
  const overlay = document.createElement('div');
  overlay.className = 'cmdk-overlay';
  overlay.innerHTML = `
    <div class="cmdk" role="dialog" aria-label="Command palette">
      <input class="cmdk-input" placeholder="Search contacts or type a command" autocomplete="off">
      <div class="cmdk-results" id="cmdk-results"></div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('.cmdk-input');
  const results = overlay.querySelector('#cmdk-results');
  let selected = 0;
  let items = [];

  const actions = [
    { label: 'New contact', icon: 'plus', run: () => window.dispatchEvent(new CustomEvent('kith:new-contact')) },
    { label: 'Go to home', icon: 'home', run: () => navigate('/home') },
    { label: 'Go to contacts', icon: 'users', run: () => navigate('/contacts') },
    { label: 'Go to events', icon: 'calendar', run: () => navigate('/events') },
    { label: 'Go to notifications', icon: 'bell', run: () => navigate('/notifications') },
    ...(state.user && (state.user.role !== 'user')
      ? [{ label: 'Go to settings', icon: 'settings', run: () => navigate('/settings') }] : []),
    ...(state.spicyEnabled
      ? [{ label: state.spicyActive ? 'Turn spicy mode off' : 'Turn spicy mode on', icon: 'flame', run: () => setSpicyActive(!state.spicyActive) }] : []),
  ];

  const close = () => {
    overlay.remove();
    cmdkOpen = false;
    document.removeEventListener('keydown', keyHandler);
  };

  const renderResults = (contacts, q) => {
    const matchedActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase()));
    items = [
      ...contacts.map((c) => ({ label: c.display_name, sub: c.location, icon: 'user', run: () => navigate(`/contacts/${c.id}`) })),
      ...matchedActions,
    ];
    selected = 0;
    results.innerHTML = `
      ${contacts.length ? `<div class="cmdk-section">Contacts</div>` : ''}
      ${contacts.map((c, i) => `
        <button class="cmdk-item ${i === 0 ? 'selected' : ''}" data-idx="${i}">
          ${icon('user')}<span>${esc(c.display_name)}</span>
          ${c.location ? `<span class="cmdk-hint">${esc(c.location)}</span>` : ''}
        </button>`).join('')}
      ${matchedActions.length ? `<div class="cmdk-section">Actions</div>` : ''}
      ${matchedActions.map((a, i) => `
        <button class="cmdk-item ${!contacts.length && i === 0 ? 'selected' : ''}" data-idx="${contacts.length + i}">
          ${icon(a.icon)}<span>${esc(a.label)}</span>
        </button>`).join('')}
      ${!items.length ? `<div class="cmdk-section">No results</div>` : ''}`;
    results.querySelectorAll('.cmdk-item').forEach((el) => {
      el.addEventListener('click', () => { close(); items[Number(el.dataset.idx)]?.run(); });
    });
  };

  const doSearch = debounce(async (q) => {
    let contacts = [];
    if (q && q.length >= 1) {
      try {
        const data = await api.get('/api/contacts' + qs({ search: q, limit: 6 }));
        contacts = data.contacts || [];
      } catch { /* not logged in or error */ }
    }
    renderResults(contacts, q);
  }, 150);

  const keyHandler = (e) => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const els = results.querySelectorAll('.cmdk-item');
      if (!els.length) return;
      selected = (selected + (e.key === 'ArrowDown' ? 1 : els.length - 1)) % els.length;
      els.forEach((el, i) => el.classList.toggle('selected', i === selected));
      els[selected].scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter') {
      const el = results.querySelector('.cmdk-item.selected');
      if (el) { close(); items[Number(el.dataset.idx)]?.run(); }
    }
  };
  document.addEventListener('keydown', keyHandler);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  input.addEventListener('input', () => doSearch(input.value.trim()));
  input.focus();
  renderResults([], '');
}

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (state.user && !state.user.must_change_password) openCommandPalette();
  }
});

// ---------------------------------------------------------------- login
function renderLogin(message = '') {
  root.innerHTML = `
  <div class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <span class="logo-mark"><img src="/assets/logo.svg" alt=""></span>
        <span class="wordmark">Kith</span>
      </div>
      ${message ? `<div class="form-error mb-3 text-center">${esc(message)}</div>` : ''}
      <form id="login-form">
        <div class="form-group">
          <label class="form-label" for="login-username">Username or email</label>
          <input class="form-input" id="login-username" name="username" autocomplete="username" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Password</label>
          <input class="form-input" id="login-password" name="password" type="password" autocomplete="current-password" required>
        </div>
        <div class="form-error hidden" id="login-error"></div>
        <button class="btn btn-primary btn-block mt-3" type="submit">Sign in</button>
      </form>
    </div>
  </div>`;
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.classList.add('hidden');
    try {
      const data = await api.post('/api/auth/login', {
        username: document.getElementById('login-username').value.trim(),
        password: document.getElementById('login-password').value,
      });
      setToken(data.token);
      state.user = data.user;
      await start();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

function renderForcedPasswordChange() {
  root.innerHTML = `
  <div class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <span class="logo-mark"><img src="/assets/logo.svg" alt=""></span>
        <span class="wordmark">Kith</span>
      </div>
      <h2 class="section-heading text-center">Change your password</h2>
      <p class="text-sm text-secondary text-center mb-4">Set a new password before using Kith.</p>
      <form id="pw-form">
        <div class="form-group">
          <label class="form-label" for="pw-current">Current password</label>
          <input class="form-input" id="pw-current" type="password" autocomplete="current-password" required>
        </div>
        <div class="form-group">
          <label class="form-label" for="pw-new">New password</label>
          <input class="form-input" id="pw-new" type="password" autocomplete="new-password" required minlength="8">
          <div class="form-hint">At least 8 characters.</div>
        </div>
        <div class="form-error hidden" id="pw-error"></div>
        <button class="btn btn-primary btn-block mt-3" type="submit">Save and continue</button>
      </form>
    </div>
  </div>`;
  document.getElementById('pw-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('pw-error');
    errEl.classList.add('hidden');
    try {
      const res = await api.put('/api/auth/password', {
        current_password: document.getElementById('pw-current').value,
        new_password: document.getElementById('pw-new').value,
      });
      // Old tokens are invalidated server-side; adopt the fresh one.
      if (res?.token) setToken(res.token);
      state.user.must_change_password = false;
      toast('Password changed.');
      await start();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// ---------------------------------------------------------------- boot
async function loadContext() {
  const [settingsData, prefsData] = await Promise.all([
    api.get('/api/settings/public'),
    api.get('/api/preferences'),
  ]);
  state.settings = settingsData.settings || {};
  state.preferences = prefsData.preferences || {};
  state.spicyEnabled = Boolean(state.settings.spicy_enabled);
  // Session spicy state restores from preference only when no PIN is required.
  state.spicyActive = state.spicyEnabled && !state.settings.spicy_require_pin && Boolean(state.preferences.spicy_visible);
  // With a PIN required the flame starts OFF — but the server-side preference
  // may still be true from last session, which would leak spicy content in
  // server-filtered responses. Sync it back to false before rendering.
  if (state.settings.spicy_require_pin && !state.spicyActive && state.preferences.spicy_visible) {
    try {
      await api.put('/api/preferences/spicy_visible', { value: false, type: 'boolean' });
      state.preferences.spicy_visible = false;
    } catch { /* keep booting; toggle will re-sync on next use */ }
  }
}

async function start() {
  if (state.user?.must_change_password) {
    renderForcedPasswordChange();
    return;
  }
  await loadContext();
  applyAccentSettings();
  document.body.classList.toggle('spicy-mode', state.spicyActive);
  root.innerHTML = shellHtml();
  bindShell();
  refreshSidebarLists();
  refreshNotifCount();
  window.addEventListener('hashchange', onRouteChange);
  if (!location.hash) navigate('/home', { replace: true });
  await onRouteChange();
  window.dispatchEvent(new CustomEvent('kith:shell-ready'));
}

async function boot() {
  try {
    const data = await api.get('/api/auth/me');
    state.user = data.user;
    await start();
  } catch {
    renderLogin();
  }
}

boot();
