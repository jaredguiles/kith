// Kith — main app logic: state, routing, shell, spicy mode, command palette.

import { api, qs, setToken } from './api.js';
import { esc, initials, debounce, fmtDateTime } from './utils.js';
import { icon } from './icons.js';
import { toast, openModal, modalShell, toggleSwitch, emptyState, confirmModal, logoMark, recNo } from './components.js';
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
const ROUTES = ['home', 'contacts', 'events', 'calendar', 'map', 'journal', 'notifications', 'settings', 'review', 'groups', 'trash'];

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

// ----------------------------------------------------------------- theme
const THEME_PREFS = ['dark', 'light', 'system'];
let systemThemeMedia = null;

export function getThemePref() {
  const p = state.preferences?.theme;
  return THEME_PREFS.includes(p) ? p : 'dark';
}

function themeIcon(pref) {
  return pref === 'light' ? 'sun' : pref === 'system' ? 'monitor' : 'moon';
}

/** Apply a theme preference ('dark'|'light'|'system'). System live-updates. */
export function applyTheme(pref) {
  if (!THEME_PREFS.includes(pref)) pref = 'dark';
  if (!systemThemeMedia) {
    systemThemeMedia = matchMedia('(prefers-color-scheme: light)');
    systemThemeMedia.addEventListener('change', () => {
      if (getThemePref() === 'system') applyTheme('system');
    });
  }
  const resolved = pref === 'system' ? (systemThemeMedia.matches ? 'light' : 'dark') : pref;
  document.documentElement.setAttribute('data-theme', resolved);
  document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', resolved);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'light' ? '#f2eee4' : '#15130d');
  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.innerHTML = icon(themeIcon(pref));
    btn.title = `Theme: ${pref}`;
  }
}

/** Persist + apply a theme preference. Settings/profile controls call this. */
export async function setThemePref(pref) {
  if (!THEME_PREFS.includes(pref)) return;
  const prev = state.preferences.theme;
  state.preferences.theme = pref;
  applyTheme(pref);
  try {
    await api.put('/api/preferences/theme', { value: pref, type: 'string' });
  } catch (err) {
    state.preferences.theme = prev;
    applyTheme(getThemePref());
    toast(err.message || "Couldn't save the theme.", 'error');
  }
}

// ---------------------------------------------------------------- shell
function logoHtml() {
  const custom = state.settings.app_logo;
  if (custom) return `<img src="${esc(custom)}" alt="">`;
  // Inline SVG (not <img>) so currentColor follows the theme — an <img>
  // rendered the mark black, invisible in dark mode.
  return logoMark();
}

function shellHtml() {
  const u = state.user;
  const isAdmin = u.role === 'main_admin' || u.role === 'admin';
  const roleLabel = u.role === 'user' ? 'Member' : 'Keeper';
  // The Record numbered index nav — labels changed (People/Notices), hashes unchanged.
  const navItem = (num, page, label) => `
        <a class="nav-item" data-nav="${page}" href="#/${page}"><span class="nav-num">${num}</span><span class="nav-label">${esc(label)}</span><span class="nav-marker"></span></a>`;
  return `
  <div id="app">
    <div class="sidebar-backdrop hidden" id="sidebar-backdrop"></div>
    <aside class="sidebar" id="sidebar" aria-label="Main navigation">
      <div class="sidebar-header">
        <a href="#/home" class="sidebar-logo">
          <span class="wordmark">${esc(state.settings.app_name || 'Kith')}</span>
          <span class="sidebar-tag">Personal record</span>
        </a>
      </div>
      <div class="sidebar-search">
        <div class="search-input-wrap">
          ${icon('search')}
          <input class="form-input" id="sidebar-search" placeholder="Search records" autocomplete="off">
          <span class="kbd">⌘K</span>
        </div>
      </div>
      <div class="sidebar-new">
        <button class="btn" data-action="new-contact"><span>New record</span><span class="plus">+</span></button>
      </div>
      <nav class="sidebar-nav" aria-label="Pages">
        ${navItem('01', 'home', 'Home')}
        ${navItem('02', 'contacts', 'People')}
        ${navItem('03', 'calendar', 'Calendar')}
        ${navItem('04', 'map', 'Map')}
        ${navItem('05', 'events', 'Events')}
        <a class="nav-item" data-nav="notifications" href="#/notifications"><span class="nav-num">06</span><span class="nav-label">Notices</span><span class="nav-count" id="notif-count"></span></a>
        ${isAdmin ? navItem('07', 'settings', 'Settings') : ''}
        ${navItem(isAdmin ? '08' : '07', 'journal', 'Journal')}
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
      <div class="sidebar-bottom">
        <div class="sidebar-quiet-row">
          ${state.spicyEnabled ? `<button class="btn-flame btn-flame-icon ${state.spicyActive ? 'active' : ''}" id="flame-toggle" title="Confidential layer" aria-label="Toggle confidential layer" aria-pressed="${state.spicyActive}">${icon('lock')}<span class="conf-dot"></span></button>` : ''}
          <span class="flex-1"></span>
          <button class="btn btn-icon" id="theme-toggle" aria-label="Switch theme" title="Theme">${icon(themeIcon(getThemePref()))}</button>
          <a class="btn btn-icon" href="#/trash" aria-label="Trash" title="Trash">${icon('trash')}</a>
        </div>
        <div class="sidebar-footer">
          <span class="popover-wrap" id="user-menu-wrap" style="flex:1;min-width:0;display:flex">
            <button class="sidebar-user-chip" id="user-chip" aria-haspopup="true" aria-expanded="false" title="Account menu">
              <span class="av sm">${esc(initials(u.display_name || u.username))}</span>
              <div class="user-meta">
                <div class="user-name" id="sidebar-user-name">${esc(u.display_name || u.username)}</div>
                <div class="user-role">${esc(roleLabel)}</div>
              </div>
            </button>
          </span>
          <button class="btn btn-icon" data-action="logout" aria-label="Log out">${icon('log-out')}</button>
        </div>
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
          <span class="fav-num">${esc(recNo(c.id))}</span>
          <span class="fav-name truncate">${esc(c.display_name)}</span>
        </a>`).join('')
      : `<div class="sidebar-mini-item" style="cursor:default;color:var(--text-muted)">No favorites yet</div>`;
  }
  if (grpEl) {
    grpEl.innerHTML = state.groups.map((g) => `
      <a class="sidebar-mini-item" href="#/contacts?group=${g.id}">
        <span class="truncate">${esc(g.name)}</span>
        <span class="leader-dots"></span>
        <span class="mini-count">${esc(String(Number(g.member_count) || 0).padStart(2, '0'))}</span>
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

/** Re-fetch the session user (e.g. after linking a self-contact or editing
 * the account) and refresh the sidebar display name. */
export async function refreshUser() {
  try {
    const data = await api.get('/api/auth/me');
    state.user = data.user;
  } catch { return; }
  const nameEl = document.getElementById('sidebar-user-name');
  if (nameEl) nameEl.textContent = state.user.display_name || state.user.username;
}

/** "My profile": open the linked self-contact, or offer to create one. */
export async function openMyProfile() {
  if (state.user?.self_contact_id) {
    navigate(`/contacts/${state.user.self_contact_id}`);
    return;
  }
  const ok = await confirmModal(
    'Create your profile?',
    'Kith will add you as a contact so you can record your own details and link family relationships.',
    { confirmLabel: 'Create profile', danger: false }
  );
  if (!ok) return;
  try {
    const res = await api.post('/api/users/me/self-contact');
    await refreshUser();
    refreshSidebarLists();
    toast(res.created ? 'Your profile contact is ready.' : 'Linked to your existing profile.');
    navigate(`/contacts/${res.contact_id}`);
  } catch (err) {
    toast(err.message || "Couldn't create your profile.", 'error');
  }
}

function bindShell() {
  // flame toggle
  document.getElementById('flame-toggle')?.addEventListener('click', () => {
    setSpicyActive(!state.spicyActive);
  });

  // user chip → account menu (My profile / Account & security)
  const userWrap = document.getElementById('user-menu-wrap');
  const userChip = document.getElementById('user-chip');
  userChip?.addEventListener('click', () => {
    const existing = userWrap.querySelector('.popover');
    if (existing) {
      existing.remove();
      userChip.setAttribute('aria-expanded', 'false');
      return;
    }
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.innerHTML = `
      <button class="popover-item" data-user-menu="profile">${icon('user')} My profile</button>
      <a class="popover-item" href="#/settings" data-user-menu="account">${icon('shield')} Account &amp; security</a>`;
    userWrap.appendChild(pop);
    userChip.setAttribute('aria-expanded', 'true');
    const closePop = (e) => {
      if (!userWrap.contains(e.target)) {
        pop.remove();
        userChip.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', closePop);
      }
    };
    setTimeout(() => document.addEventListener('click', closePop), 0);
    pop.querySelector('[data-user-menu="profile"]').addEventListener('click', () => {
      pop.remove();
      userChip.setAttribute('aria-expanded', 'false');
      openMyProfile();
    });
    pop.querySelector('[data-user-menu="account"]').addEventListener('click', () => {
      pop.remove();
      userChip.setAttribute('aria-expanded', 'false');
    });
  });

  // theme toggle: cycles dark → light → system
  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    const next = THEME_PREFS[(THEME_PREFS.indexOf(getThemePref()) + 1) % THEME_PREFS.length];
    setThemePref(next);
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
      <input class="cmdk-input" placeholder="Search people, events, notes, groups…" autocomplete="off">
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
    { label: 'Go to calendar', icon: 'calendar', run: () => navigate('/calendar') },
    { label: 'Go to map', icon: 'map', run: () => navigate('/map') },
    { label: 'Go to journal', icon: 'book-open', run: () => navigate('/journal') },
    { label: 'Go to notifications', icon: 'bell', run: () => navigate('/notifications') },
    { label: 'Go to trash', icon: 'trash', run: () => navigate('/trash') },
    ...(state.user && (state.user.role !== 'user')
      ? [{ label: 'Go to settings', icon: 'settings', run: () => navigate('/settings') }] : []),
    ...(state.spicyEnabled
      ? [{ label: state.spicyActive ? 'Conceal confidential layer' : 'Reveal confidential layer', icon: 'lock', run: () => setSpicyActive(!state.spicyActive) }] : []),
  ];

  const close = () => {
    overlay.remove();
    cmdkOpen = false;
    document.removeEventListener('keydown', keyHandler);
  };

  // Sectioned results from /api/search: People / Events / Notes / Groups / Actions.
  const renderResults = (res, q) => {
    const matchedActions = actions.filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase()));
    const people = res?.contacts || [];
    const events = res?.events || [];
    const notes = res?.notes || [];
    const groups = res?.groups || [];

    items = [];
    const sections = [];
    const pushSection = (title, list, mapFn) => {
      if (!list.length) return;
      const start = items.length;
      const mapped = list.map(mapFn);
      items.push(...mapped);
      sections.push({ title, start, mapped });
    };

    pushSection('People', people, (c) => ({
      icon: 'user', label: c.display_name, hint: c.subtitle || '',
      avatar: c, run: () => navigate(`/contacts/${c.id}`),
    }));
    pushSection('Events', events, (e) => ({
      icon: 'calendar', label: e.title, hint: fmtDateTime(e.starts_at),
      run: () => navigate('/events'),
    }));
    pushSection('Notes', notes, (n) => ({
      icon: 'sticky-note', label: n.snippet || 'Note', hint: n.contact_name || '',
      run: () => navigate(`/contacts/${n.contact_id}`),
    }));
    pushSection('Groups', groups, (g) => ({
      icon: 'users', label: g.name, hint: '',
      run: () => navigate(`/contacts?group=${g.id}`),
    }));
    pushSection('Actions', matchedActions, (a) => ({
      icon: a.icon, label: a.label, hint: '', run: a.run,
    }));

    selected = 0;
    results.innerHTML = sections.map((s) => `
      <div class="cmdk-section">${esc(s.title)}</div>
      ${s.mapped.map((it, i) => {
        const idx = s.start + i;
        return `
        <button class="cmdk-item ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
          ${it.avatar
            ? `<span class="av sm" style="width:20px;height:20px;font-size:9px">${esc(initials(it.avatar.display_name))}${it.avatar.photo_url ? `<img src="${esc(it.avatar.photo_url)}" alt="">` : ''}</span>`
            : icon(it.icon)}
          <span class="truncate">${esc(it.label)}</span>
          ${it.hint ? `<span class="cmdk-hint">${esc(it.hint)}</span>` : ''}
        </button>`;
      }).join('')}`).join('')
      + (!items.length ? `<div class="cmdk-section">No results</div>` : '');
    results.querySelectorAll('.cmdk-item').forEach((el) => {
      el.addEventListener('click', () => { close(); items[Number(el.dataset.idx)]?.run(); });
    });
  };

  const doSearch = debounce(async (q) => {
    let res = null;
    if (q && q.length >= 1) {
      try {
        res = await api.get('/api/search' + qs({ q }));
      } catch { /* not logged in or error */ }
    }
    renderResults(res, q);
  }, 200);

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
  renderResults(null, '');
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
        <span class="logo-mark">${logoMark()}</span>
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
      if (data.totp_required) {
        renderTotpStep(data.pending_token);
        return;
      }
      setToken(data.token);
      state.user = data.user;
      await start();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
    }
  });
}

// Second login step: 6-digit TOTP code (paste-friendly numeric input).
function renderTotpStep(pendingToken) {
  root.innerHTML = `
  <div class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <span class="logo-mark">${logoMark()}</span>
        <span class="wordmark">Kith</span>
      </div>
      <h2 class="section-heading text-center">Two-factor code</h2>
      <p class="text-sm text-secondary text-center mb-4">Enter the 6-digit code from your authenticator app.</p>
      <form id="totp-form">
        <div class="form-group">
          <label class="form-label" for="totp-code">Code</label>
          <input class="form-input totp-input" id="totp-code" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="••••••" required>
        </div>
        <div class="form-error hidden" id="totp-error"></div>
        <button class="btn btn-primary btn-block mt-3" type="submit">Verify</button>
      </form>
      <div class="text-center mt-3"><a href="#" id="totp-back" class="text-sm">Back to login</a></div>
    </div>
  </div>`;

  const input = document.getElementById('totp-code');
  input.focus();
  // keep it digits-only (paste-friendly: strip everything else)
  input.addEventListener('input', () => {
    const v = input.value.replace(/\D/g, '').slice(0, 6);
    if (v !== input.value) input.value = v;
    if (v.length === 6) document.getElementById('totp-form').requestSubmit();
  });

  document.getElementById('totp-back').addEventListener('click', (e) => {
    e.preventDefault();
    renderLogin();
  });

  document.getElementById('totp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('totp-error');
    errEl.classList.add('hidden');
    const code = input.value.replace(/\D/g, '');
    if (code.length !== 6) {
      errEl.textContent = 'Enter the 6-digit code.';
      errEl.classList.remove('hidden');
      return;
    }
    try {
      const data = await api.post('/api/auth/login/totp', { pending_token: pendingToken, code });
      setToken(data.token);
      state.user = data.user;
      await start();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.classList.remove('hidden');
      input.select();
    }
  });
}

function renderForcedPasswordChange() {
  root.innerHTML = `
  <div class="login-screen">
    <div class="login-card">
      <div class="login-logo">
        <span class="logo-mark">${logoMark()}</span>
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
  applyTheme(getThemePref());
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
  // PWA service worker — HTTPS only (plain-HTTP dev skips it to avoid cache
  // hell) and never allowed to break the app.
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    try {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    } catch { /* never fatal */ }
  }
  try {
    const data = await api.get('/api/auth/me');
    state.user = data.user;
    await start();
  } catch {
    renderLogin();
  }
}

boot();
