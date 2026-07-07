// Contacts page: list (table w/ sort/filter/search/pagination), profile drawer,
// create/edit modal. Registered into pageRenderers.

import { api, qs } from './api.js';
import {
  esc, escUrl, fmtDate, timeAgo, initials, prideFlagGradient,
  ageFromBirthday, zodiacFromBirthday, debounce, parseDate, loadLeaflet,
} from './utils.js';
import { createMap } from './map.js';
import { icon } from './icons.js';
import {
  avatar, tagPill, groupBadge, starRating, emptyState, modalShell, formGroup,
  textInput, selectInput, textarea, toast, openModal, confirmModal, readForm,
  filterPills, feedItem,
} from './components.js';
import { pageRenderers } from './pages.js';
import { state, navigate, refreshSidebarLists, isSpicyOn } from './app.js';

const SEX_OPTIONS = ['', 'Male', 'Female', 'Intersex', 'Non-binary', 'Other', 'Prefer not to say'];
const PRONOUN_OPTIONS = ['', 'he/him', 'she/her', 'they/them', 'he/they', 'she/they', 'other'];
const ORIENTATION_OPTIONS = ['', 'Straight', 'Gay', 'Lesbian', 'Bisexual', 'Pansexual', 'Queer', 'Asexual', 'Transgender', 'Non-binary', 'Other'];
const REL_STATUS_OPTIONS = ['', 'Single', 'In a relationship', 'Married', 'Engaged', 'Divorced', 'Widowed', 'Separated', "It's complicated", 'Open relationship', 'Domestic partnership'];
const SOCIAL_PLATFORMS = ['Instagram', 'Twitter/X', 'LinkedIn', 'Facebook', 'TikTok', 'Snapchat', 'YouTube', 'GitHub', 'Sniffies', 'Grindr', 'Scruff', 'Feeld', 'Hinge', 'Tinder', 'Bumble', 'Website', 'Other'];

const listState = {
  search: '', tag: '', group: '', sort: 'name', sortDir: 'asc',
  favorites: false, outOfTouch: false, page: 1, limit: 50,
  selectMode: false, selected: new Map(), // id → display_name
};

const RELATION_TYPES = [
  { value: 'spouse', label: 'Spouse' }, { value: 'partner', label: 'Partner' },
  { value: 'parent', label: 'Parent' }, { value: 'child', label: 'Child' },
  { value: 'sibling', label: 'Sibling' }, { value: 'friend', label: 'Friend' },
  { value: 'colleague', label: 'Colleague' }, { value: 'introduced_by', label: 'Introduced by' },
  { value: 'ex', label: 'Ex' }, { value: 'family', label: 'Family' }, { value: 'other', label: 'Other' },
];

const GIFT_STATUSES = [
  { value: 'idea', label: 'Idea' }, { value: 'purchased', label: 'Purchased' }, { value: 'given', label: 'Given' },
];

/** Cookie-auth file download: navigate a temp anchor (cookie rides along). */
function triggerDownload(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ------------------------------------------------------------- list page
async function renderContacts(el, params) {
  if (params.id) return renderContactDetail(el, params.id);
  // Filters derive strictly from the route params: plain #/contacts clears
  // them, and group/tag are mutually exclusive (never silently ANDed).
  const nextGroup = params.group || '';
  const nextTag = params.tag || '';
  if (nextGroup !== listState.group || nextTag !== listState.tag) listState.page = 1;
  listState.group = nextGroup;
  listState.tag = nextTag;
  if (!nextGroup && !nextTag && listState.search) { listState.search = ''; listState.page = 1; }
  // fresh page render always starts outside select mode
  listState.selectMode = false;
  listState.selected.clear();

  el.innerHTML = `
  <div class="page-inner">
    <div class="page-header">
      <div>
        <h1 class="page-title">Contacts</h1>
        <div class="page-subtitle" id="contacts-count"></div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="toggle-select">${icon('check')} Select</button>
        <span class="popover-wrap" id="contacts-overflow-wrap">
          <button class="btn btn-icon lg" data-action="contacts-overflow" aria-label="More actions">${icon('more-horizontal')}</button>
        </span>
        <button class="btn btn-primary" data-action="new-contact-page">${icon('plus')} New person</button>
      </div>
    </div>
    <div class="toolbar">
      <div class="search-input-wrap" style="width:260px">
        ${icon('search')}
        <input class="form-input" id="contacts-search" placeholder="Search contacts" value="${esc(listState.search)}" autocomplete="off">
      </div>
      <span id="contacts-filter-pills"></span>
      <span class="popover-wrap" id="tag-filter-wrap"></span>
      <span class="spacer"></span>
    </div>
    <div class="card" style="padding:0;overflow-x:auto">
      <div id="contacts-table"></div>
    </div>
    <div class="flex-between mt-3" id="contacts-pager"></div>
    <div id="bulk-bar-host"></div>
  </div>`;

  el.querySelector('[data-action="new-contact-page"]').addEventListener('click', () => openContactForm());
  const selectBtn = el.querySelector('[data-action="toggle-select"]');
  selectBtn.addEventListener('click', () => {
    listState.selectMode = !listState.selectMode;
    listState.selected.clear();
    selectBtn.innerHTML = listState.selectMode ? `${icon('x')} Done` : `${icon('check')} Select`;
    loadTable(el);
  });
  bindContactsOverflow(el);
  const searchInput = el.querySelector('#contacts-search');
  searchInput.addEventListener('input', debounce(() => {
    listState.search = searchInput.value.trim();
    listState.page = 1;
    loadTable(el);
  }, 250));

  renderFilterControls(el);
  await loadTable(el);
}

function bindContactsOverflow(el) {
  const wrap = el.querySelector('#contacts-overflow-wrap');
  wrap.querySelector('[data-action="contacts-overflow"]').addEventListener('click', () => {
    const existing = wrap.querySelector('.popover');
    if (existing) { existing.remove(); return; }
    const pop = document.createElement('div');
    pop.className = 'popover right';
    pop.innerHTML = `
      <button class="popover-item" data-overflow="dedupe">${icon('merge')} Find duplicates</button>
      <div class="popover-divider"></div>
      <button class="popover-item" data-overflow="export-vcf">${icon('download')} Export all (vCard)</button>
      <button class="popover-item" data-overflow="export-csv">${icon('download')} Export all (CSV)</button>`;
    wrap.appendChild(pop);
    const closePop = (e) => { if (!wrap.contains(e.target)) { pop.remove(); document.removeEventListener('click', closePop); } };
    setTimeout(() => document.addEventListener('click', closePop), 0);
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-overflow]');
      if (!b) return;
      pop.remove();
      if (b.dataset.overflow === 'dedupe') openDuplicatesModal(() => loadTable(el));
      else if (b.dataset.overflow === 'export-vcf') triggerDownload('/api/export/vcf?all=1');
      else if (b.dataset.overflow === 'export-csv') triggerDownload('/api/export/csv?all=1');
    });
  });
}

function renderFilterControls(el) {
  const pillsEl = el.querySelector('#contacts-filter-pills');
  pillsEl.innerHTML = filterPills(
    [{ value: '', label: 'All' }, { value: 'fav', label: 'Favorites' }, { value: 'oot', label: 'Out of touch' }],
    listState.favorites ? 'fav' : listState.outOfTouch ? 'oot' : ''
  );
  pillsEl.querySelectorAll('.filter-pill').forEach((p) =>
    p.addEventListener('click', () => {
      listState.favorites = p.dataset.filter === 'fav';
      listState.outOfTouch = p.dataset.filter === 'oot';
      listState.page = 1;
      renderFilterControls(el);
      loadTable(el);
    })
  );

  // tag/group filter popover
  const wrap = el.querySelector('#tag-filter-wrap');
  const activeTag = state.tags?.find?.((t) => String(t.id) === String(listState.tag));
  const activeGroup = state.groups?.find?.((g) => String(g.id) === String(listState.group));
  const label = activeTag ? `Tag: ${activeTag.name}` : activeGroup ? `Group: ${activeGroup.name}` : 'Filter';
  wrap.innerHTML = `<button class="btn btn-secondary btn-sm" id="filter-btn">${icon('tag')} ${esc(label)} ${icon('chevron-down')}</button>`;
  wrap.querySelector('#filter-btn').addEventListener('click', async () => {
    const existing = wrap.querySelector('.popover');
    if (existing) { existing.remove(); return; }
    let tags = [];
    try { tags = (await api.get('/api/tags')).tags || []; state.tags = tags; } catch { /* phase 5 */ }
    const groups = state.groups || [];
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.innerHTML = `
      <button class="popover-item ${!listState.tag && !listState.group ? 'selected' : ''}" data-clear>${icon('x')} Clear filter</button>
      ${tags.length ? '<div class="popover-label">Tags</div>' : ''}
      ${tags.map((t) => `<button class="popover-item ${String(t.id) === String(listState.tag) ? 'selected' : ''}" data-tag="${t.id}"><span class="dot" style="width:8px;height:8px;border-radius:50%;background:${esc(t.color || '#7c5bf5')}"></span>${esc(t.name)}</button>`).join('')}
      ${groups.length ? '<div class="popover-label">Groups</div>' : ''}
      ${groups.map((g) => `<button class="popover-item ${String(g.id) === String(listState.group) ? 'selected' : ''}" data-group="${g.id}">${icon(g.icon || 'users')}${esc(g.name)}</button>`).join('')}`;
    wrap.appendChild(pop);
    const closePop = (e) => { if (!wrap.contains(e.target)) { pop.remove(); document.removeEventListener('click', closePop); } };
    setTimeout(() => document.addEventListener('click', closePop), 0);
    pop.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tag], [data-group], [data-clear]');
      if (!t) return;
      pop.remove();
      // Keep the URL authoritative: renderContacts derives filters from params.
      const target = t.dataset.group ? `/contacts?group=${encodeURIComponent(t.dataset.group)}`
        : t.dataset.tag ? `/contacts?tag=${encodeURIComponent(t.dataset.tag)}`
        : '/contacts';
      if (location.hash.replace(/^#/, '') === target) {
        // hash unchanged → no hashchange event; refresh in place
        listState.tag = t.dataset.tag || '';
        listState.group = t.dataset.group || '';
        listState.page = 1;
        renderFilterControls(el);
        loadTable(el);
      } else {
        navigate(target);
      }
    });
  });
}

async function loadTable(el) {
  const tableEl = el.querySelector('#contacts-table');
  const countEl = el.querySelector('#contacts-count');
  const pagerEl = el.querySelector('#contacts-pager');
  if (!tableEl) return;

  let data;
  try {
    data = await api.get('/api/contacts' + qs({
      search: listState.search || undefined,
      tag: listState.tag || undefined,
      group: listState.group || undefined,
      favorites: listState.favorites ? 1 : undefined,
      filter: listState.outOfTouch ? 'out_of_touch' : undefined,
      sort: listState.sort, sortDir: listState.sortDir,
      page: listState.page, limit: listState.limit,
    }));
  } catch (err) {
    countEl.textContent = '';
    pagerEl.innerHTML = '';
    tableEl.innerHTML = emptyState('alert-circle', "Couldn't load contacts", err?.message || 'Check your connection and try again.');
    return;
  }

  countEl.textContent = `${data.total} ${data.total === 1 ? 'person' : 'people'}`;

  if (!data.contacts.length) {
    tableEl.innerHTML = emptyState('users', 'No contacts yet', 'Add someone you care about.',
      `<button class="btn btn-primary" data-action="empty-new">${icon('plus')} New person</button>`);
    tableEl.querySelector('[data-action="empty-new"]')?.addEventListener('click', () => openContactForm());
    pagerEl.innerHTML = '';
    renderBulkBar(el);
    return;
  }

  const sortArrow = (col) => listState.sort === col ? `<span class="sort-arrow">${listState.sortDir === 'asc' ? '↑' : '↓'}</span>` : '';
  const sel = listState.selected;
  const selectable = data.contacts.filter((c) => !c.is_shared_in);
  const allPageSelected = selectable.length > 0 && selectable.every((c) => sel.has(c.id));
  tableEl.innerHTML = `
  <table class="data-table">
    <thead><tr>
      ${listState.selectMode ? `<th style="width:34px"><input type="checkbox" class="bulk-check" data-select-page ${allPageSelected ? 'checked' : ''} aria-label="Select page"></th>` : ''}
      <th class="sortable" data-sort="name">Name ${sortArrow('name')}</th>
      <th>Tags</th>
      <th class="sortable" data-sort="location">Location ${sortArrow('location')}</th>
      <th class="sortable" data-sort="rating">Rating ${sortArrow('rating')}</th>
      <th class="sortable" data-sort="last_contacted_at">Last contact ${sortArrow('last_contacted_at')}</th>
      <th class="sortable" data-sort="updated">Updated ${sortArrow('updated')}</th>
      <th></th>
    </tr></thead>
    <tbody>
      ${data.contacts.map((c) => `
      <tr data-contact-id="${c.id}" class="contact-row ${c.is_spicy ? 'has-spicy-data' : ''}">
        ${listState.selectMode ? `<td>${c.is_shared_in ? '' : `<input type="checkbox" class="bulk-check" data-select-row="${c.id}" data-select-name="${esc(c.display_name)}" ${sel.has(c.id) ? 'checked' : ''} aria-label="Select ${esc(c.display_name)}">`}</td>` : ''}
        <td>
          <div class="flex items-center gap-3">
            ${avatar(c, 'sm')}
            <div>
              <div class="font-medium">${esc(c.display_name)} ${c.is_shared_in ? '<span class="badge neutral">Shared</span>' : ''} ${c.out_of_touch ? '<span class="badge amber">Out of touch</span>' : ''}</div>
              ${c.email ? `<div class="td-muted">${esc(c.email)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><div class="flex gap-1 flex-wrap">${(c.tags || []).slice(0, 3).map((t) => tagPill(t)).join('')}</div></td>
        <td class="td-secondary">${esc(c.location || '')}</td>
        <td>${c.rating ? starRating(c.rating) : '<span class="td-muted">—</span>'}</td>
        <td class="td-muted">${c.last_contacted_at ? esc(timeAgo(c.last_contacted_at)) : '—'}</td>
        <td class="td-muted">${timeAgo(c.updated_at)}</td>
        <td>
          ${c.is_shared_in ? '' : `
          <button class="btn btn-icon" data-fav="${c.id}" aria-label="${c.is_favorite ? 'Unfavorite' : 'Favorite'}">
            <span class="star-rating ${c.is_favorite ? '' : 'readonly'}"><span class="star ${c.is_favorite ? 'filled' : ''}">${icon('star')}</span></span>
          </button>`}
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;

  tableEl.querySelectorAll('th.sortable').forEach((th) =>
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (listState.sort === col) listState.sortDir = listState.sortDir === 'asc' ? 'desc' : 'asc';
      else { listState.sort = col; listState.sortDir = 'asc'; }
      loadTable(el);
    })
  );

  tableEl.querySelectorAll('tbody tr').forEach((tr) =>
    tr.addEventListener('click', (e) => {
      if (e.target.closest('[data-fav]')) return;
      if (listState.selectMode) {
        if (e.target.closest('[data-select-row]')) return; // checkbox handles itself
        const cb = tr.querySelector('[data-select-row]');
        if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
        return;
      }
      navigate(`/contacts/${tr.dataset.contactId}`);
    })
  );

  // ---- select mode wiring
  tableEl.querySelectorAll('[data-select-row]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const id = Number(cb.dataset.selectRow);
      if (cb.checked) listState.selected.set(id, cb.dataset.selectName);
      else listState.selected.delete(id);
      renderBulkBar(el);
    })
  );
  tableEl.querySelector('[data-select-page]')?.addEventListener('change', (e) => {
    const on = e.target.checked;
    tableEl.querySelectorAll('[data-select-row]').forEach((cb) => {
      cb.checked = on;
      const id = Number(cb.dataset.selectRow);
      if (on) listState.selected.set(id, cb.dataset.selectName);
      else listState.selected.delete(id);
    });
    renderBulkBar(el);
  });
  renderBulkBar(el);

  tableEl.querySelectorAll('[data-fav]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        await api.put(`/api/contacts/${btn.dataset.fav}/favorite`);
        loadTable(el);
        refreshSidebarLists();
      } catch (err) { toast(err.message, 'error'); }
    })
  );

  const pages = Math.max(1, Math.ceil(data.total / listState.limit));
  pagerEl.innerHTML = pages > 1 ? `
    <span class="text-sm text-muted">Page ${listState.page} of ${pages}</span>
    <div class="flex gap-2">
      <button class="btn btn-secondary btn-sm" data-page="prev" ${listState.page <= 1 ? 'disabled' : ''}>${icon('chevron-left')} Prev</button>
      <button class="btn btn-secondary btn-sm" data-page="next" ${listState.page >= pages ? 'disabled' : ''}>Next ${icon('chevron-right')}</button>
    </div>` : '';
  pagerEl.querySelectorAll('[data-page]').forEach((b) =>
    b.addEventListener('click', () => {
      listState.page += b.dataset.page === 'next' ? 1 : -1;
      loadTable(el);
    })
  );
}

// ----------------------------------------------------------- bulk actions
function renderBulkBar(el) {
  const host = el.querySelector('#bulk-bar-host');
  if (!host) return;
  const n = listState.selected.size;
  if (!listState.selectMode || n === 0) { host.innerHTML = ''; return; }
  host.innerHTML = `
  <div class="bulk-bar" role="toolbar" aria-label="Bulk actions">
    <span class="text-sm font-medium">${n} selected</span>
    <button class="btn btn-secondary btn-sm" data-bulk="add_tag">${icon('tag')} Add tag</button>
    <button class="btn btn-secondary btn-sm" data-bulk="remove_tag">${icon('tag')} Remove tag</button>
    <button class="btn btn-secondary btn-sm" data-bulk="add_group">${icon('users')} Add to group</button>
    <button class="btn btn-secondary btn-sm" data-bulk="remove_group">${icon('users')} Remove from group</button>
    <button class="btn btn-secondary btn-sm" data-bulk="favorite">${icon('star')} Favorite</button>
    <button class="btn btn-secondary btn-sm" data-bulk="unfavorite">${icon('star')} Unfavorite</button>
    <button class="btn btn-secondary btn-sm" data-bulk-export="vcf">${icon('download')} vCard</button>
    <button class="btn btn-secondary btn-sm" data-bulk-export="csv">${icon('download')} CSV</button>
    <button class="btn btn-danger btn-sm" data-bulk="delete">${icon('trash')} Delete</button>
    <button class="btn btn-ghost btn-sm" data-bulk-cancel>${icon('x')} Cancel</button>
  </div>`;
  host.querySelectorAll('[data-bulk]').forEach((b) =>
    b.addEventListener('click', () => runBulkAction(el, b.dataset.bulk)));
  host.querySelectorAll('[data-bulk-export]').forEach((b) =>
    b.addEventListener('click', () => {
      const ids = [...listState.selected.keys()].join(',');
      triggerDownload(`/api/export/${b.dataset.bulkExport}?ids=${encodeURIComponent(ids)}`);
    }));
  host.querySelector('[data-bulk-cancel]').addEventListener('click', () => {
    listState.selectMode = false;
    listState.selected.clear();
    loadTable(el);
  });
}

async function runBulkAction(el, action) {
  const ids = [...listState.selected.keys()];
  if (!ids.length) return;
  if (ids.length > 200) { toast('Select at most 200 people at once.', 'error'); return; }

  const payload = { ids, action };
  if (action === 'add_tag' || action === 'remove_tag') {
    const tagId = await pickBulkTarget('tag', action === 'add_tag' ? 'Add tag' : 'Remove tag');
    if (!tagId) return;
    payload.tag_id = tagId;
  } else if (action === 'add_group' || action === 'remove_group') {
    const groupId = await pickBulkTarget('group', action === 'add_group' ? 'Add to group' : 'Remove from group');
    if (!groupId) return;
    payload.group_id = groupId;
  } else if (action === 'delete') {
    const ok = await confirmModal('Delete contacts',
      `This moves ${ids.length} ${ids.length === 1 ? 'person' : 'people'} to the trash (restorable for 30 days).`,
      { confirmLabel: `Delete ${ids.length}` });
    if (!ok) return;
  }

  try {
    const res = await api.post('/api/contacts/bulk', payload);
    toast(`Done: ${res.done}${res.skipped ? ` · skipped: ${res.skipped}` : ''}`);
    listState.selectMode = false;
    listState.selected.clear();
    loadTable(el);
    refreshSidebarLists();
  } catch (err) { toast(err.message, 'error'); }
}

/** Small tag/group picker modal → resolves the picked id or null. */
async function pickBulkTarget(kind, title) {
  let items = [];
  try {
    if (kind === 'tag') items = (await api.get('/api/tags')).tags || [];
    else items = (await api.get('/api/groups')).groups || [];
  } catch (err) { toast(err.message, 'error'); return null; }
  if (!items.length) { toast(`No ${kind}s exist yet.`, 'error'); return null; }

  return new Promise((resolve) => {
    let picked = false;
    const content = `<div class="flex-col" style="display:flex;gap:2px">
      ${items.map((it) => `
        <button class="popover-item w-full" data-pick-target="${it.id}">
          ${kind === 'tag'
            ? `<span class="dot" style="width:8px;height:8px;border-radius:50%;background:${esc(it.color || '#7c5bf5')}"></span>`
            : icon(it.icon || 'users')}
          ${esc(it.name)}
        </button>`).join('')}
    </div>`;
    openModal(modalShell('bulk-pick', title, content,
      `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>`), {
      onMount: (overlay, closeFn) => {
        overlay.querySelectorAll('[data-pick-target]').forEach((b) =>
          b.addEventListener('click', () => {
            picked = true;
            closeFn();
            resolve(Number(b.dataset.pickTarget));
          }));
      },
      onClose: () => { if (!picked) resolve(null); },
    });
  });
}

// ------------------------------------------------------------- duplicates
async function openDuplicatesModal(refresh) {
  let data;
  try {
    data = await api.get('/api/contacts/duplicates');
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  const pairs = data.pairs || [];

  const pairRow = (p, i) => `
    <div class="flex-between dedupe-row" data-pair="${i}" style="padding:10px 0;border-bottom:1px solid var(--border);gap:12px">
      <div class="flex-1">
        <div class="text-sm font-medium">${esc(p.a.display_name)} <span class="text-muted">↔</span> ${esc(p.b.display_name)}</div>
        <div class="text-xs text-muted">${esc([p.a.email, p.b.email].filter(Boolean).join(' · '))}</div>
        <div class="text-xs text-secondary mt-1"><span class="badge">${Math.round(p.score * 100)}%</span> ${esc(p.reason)}</div>
      </div>
      <div class="flex gap-1">
        <button class="btn btn-secondary btn-sm" data-merge-pair="${i}">${icon('merge')} Merge…</button>
        <button class="btn btn-ghost btn-sm" data-dismiss-pair="${i}">Dismiss</button>
      </div>
    </div>`;

  const content = pairs.length
    ? `<p class="text-sm text-secondary mb-2">${pairs.length} likely duplicate ${pairs.length === 1 ? 'pair' : 'pairs'} found.</p>
       <div id="dedupe-list">${pairs.map(pairRow).join('')}</div>`
    : emptyState('check-circle', 'No likely duplicates found.', 'Your contacts look clean.');

  openModal(modalShell('dedupe', 'Find duplicates', content, '', { size: 'modal-lg' }), {
    onMount: (overlay, close) => {
      overlay.querySelectorAll('[data-dismiss-pair]').forEach((b) =>
        b.addEventListener('click', () => {
          overlay.querySelector(`[data-pair="${b.dataset.dismissPair}"]`)?.remove();
          if (!overlay.querySelector('.dedupe-row')) {
            overlay.querySelector('#dedupe-list').innerHTML = '<div class="text-sm text-muted" style="padding:8px 0">All pairs handled.</div>';
          }
        }));
      overlay.querySelectorAll('[data-merge-pair]').forEach((b) =>
        b.addEventListener('click', () => {
          const p = pairs[Number(b.dataset.mergePair)];
          close();
          window.dispatchEvent(new CustomEvent('kith:merge-contacts-pair', {
            detail: { keepId: p.a.id, otherId: p.b.id, refresh },
          }));
        }));
    },
  });
}

// --------------------------------------------------------- detail page
export async function renderContactDetail(el, id) {
  let data;
  try {
    data = await api.get(`/api/contacts/${id}`);
  } catch (err) {
    el.innerHTML = `<div class="page-inner">${emptyState('alert-circle', 'Not found', 'This contact does not exist or you do not have access.')}</div>`;
    return;
  }
  const { contact: c, emails, phones, addresses, socials, tags, groups, access, permissions, share_scope } = data;
  const canEdit = access !== 'shared' || permissions === 'edit';
  const isBasic = share_scope === 'basic';
  const flag = prideFlagGradient(c.orientation);
  const age = c.age ?? ageFromBirthday(c.birthday);

  // detail route returns raw columns — compute out-of-touch client-side
  const lastContacted = parseDate(c.last_contacted_at);
  const isOutOfTouch = Boolean(c.keep_in_touch_days) &&
    (!lastContacted || (Date.now() - lastContacted.getTime()) > Number(c.keep_in_touch_days) * 86400000);
  const kitBadge = isOutOfTouch
    ? `<span class="badge amber">${icon('clock')} Out of touch${lastContacted ? ` · last contact ${esc(timeAgo(c.last_contacted_at))}` : ' · no contact recorded'}</span>`
    : c.keep_in_touch_days
      ? `<span class="text-xs text-muted">Last contact: ${lastContacted ? esc(timeAgo(c.last_contacted_at)) : 'never'}</span>`
      : '';

  const infoRow = (label, value) => value
    ? `<div class="flex-between" style="padding:6px 0"><span class="text-sm text-secondary">${esc(label)}</span><span class="text-sm" style="text-align:right">${esc(value)}</span></div>`
    : '';

  el.innerHTML = `
  <div class="page-inner" style="max-width:860px">
    <div class="mb-3"><a class="btn btn-ghost btn-sm" href="#/contacts">${icon('arrow-left')} Contacts</a></div>
    <div class="card shine mb-4 ${c.is_spicy ? 'contact-row has-spicy-data' : ''}">
      <div class="flex items-center gap-4">
        ${avatar(c, 'lg')}
        <div class="flex-1">
          <div class="flex items-center gap-2">
            <h1 class="page-title">${esc(c.display_name)}</h1>
            ${c.is_shared_in || access === 'shared' ? '<span class="badge neutral">Shared</span>' : ''}
            ${c.relationship_type ? `<span class="badge">${esc(c.relationship_type)}</span>` : ''}
            ${isSpicyOn() && c.is_spicy ? `<span class="badge">${icon('flame')}</span>` : ''}
          </div>
          <div class="text-sm text-secondary mt-1">
            ${[c.location, c.occupation && c.company ? `${c.occupation} at ${c.company}` : c.occupation || c.company].filter(Boolean).map(esc).join(' · ')}
          </div>
          ${kitBadge ? `<div class="mt-1">${kitBadge}</div>` : ''}
        </div>
        <div class="flex gap-1">
          ${access !== 'shared' ? `
          <button class="btn btn-icon lg" data-action="fav" aria-label="Toggle favorite">
            <span class="star-rating"><span class="star ${c.is_favorite ? 'filled' : ''}">${icon('star')}</span></span>
          </button>` : ''}
          ${canEdit ? `<button class="btn btn-icon lg" data-action="edit" aria-label="Edit">${icon('edit')}</button>` : ''}
          ${access !== 'shared' ? `<button class="btn btn-icon lg" data-action="merge" aria-label="Merge">${icon('merge')}</button>` : ''}
          ${access !== 'shared' ? `<button class="btn btn-icon lg" data-action="share" aria-label="Share">${icon('share')}</button>` : ''}
          ${access !== 'shared' ? `<button class="btn btn-icon lg" data-action="delete" aria-label="Delete">${icon('trash')}</button>` : ''}
        </div>
      </div>
      ${c.rating ? `<div class="mt-3">${starRating(c.rating)}</div>` : ''}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">Info</span></div>
        ${infoRow('Full name', [c.first_name, c.last_name].filter(Boolean).join(' '))}
        ${infoRow('Nickname', c.nickname)}
        ${infoRow('Birthday', c.birthday ? `${fmtDate(c.birthday)}${age != null ? ` (${age})` : ''}` : null)}
        ${infoRow('Pronouns', c.pronouns)}
        ${infoRow('Sex', c.sex)}
        ${infoRow('Orientation', c.orientation)}
        ${infoRow('Relationship status', c.relationship_status)}
        ${infoRow('Occupation', c.occupation)}
        ${infoRow('Company', c.company)}
        ${c.website ? `<div class="flex-between" style="padding:6px 0"><span class="text-sm text-secondary">Website</span><a class="text-sm" href="${escUrl(c.website)}" target="_blank" rel="noopener noreferrer">${esc(c.website)}</a></div>` : ''}
        ${infoRow('Languages', c.languages)}
        ${infoRow('Ethnicity', c.ethnicity)}
        ${infoRow('Zodiac', c.zodiac_sign || zodiacFromBirthday(c.birthday))}
        ${infoRow('How we met', c.how_we_met)}
        ${infoRow('Met', c.met_date ? fmtDate(c.met_date) : null)}
        ${c.bio ? `<div class="mt-2"><div class="uppercase-label mb-1">Bio</div><div class="text-sm">${esc(c.bio)}</div></div>` : ''}
        ${c.notes_text ? `<div class="mt-2"><div class="uppercase-label mb-1">Notes</div><div class="text-sm">${esc(c.notes_text)}</div></div>` : ''}
      </div>

      <div class="flex-col gap-4" style="display:flex">
        <div class="card">
          <div class="card-header"><span class="card-title">Contact</span>
            ${canEdit && !isBasic ? `<button class="btn btn-ghost btn-sm" data-action="add-contact-method">${icon('plus')} Add</button>` : ''}
          </div>
          <div id="contact-methods">
            ${c.email && !emails.some((e) => e.email === c.email) ? `
              <div class="flex-between" style="padding:5px 0">
                <span class="flex items-center gap-2 text-sm">${icon('mail')} ${esc(c.email)} <span class="dot" style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block"></span></span>
                <span class="text-micro text-muted">primary</span>
              </div>` : ''}
            ${c.phone && !phones.some((p) => p.phone === c.phone) ? `
              <div class="flex-between" style="padding:5px 0">
                <span class="flex items-center gap-2 text-sm">${icon('phone')} ${esc(c.phone)} <span class="dot" style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block"></span></span>
                <span class="text-micro text-muted">primary</span>
              </div>` : ''}
            ${emails.map((e) => `
              <div class="flex-between" style="padding:5px 0" data-sat="emails" data-sat-id="${e.id}">
                <span class="flex items-center gap-2 text-sm">${icon('mail')} ${esc(e.email)} ${e.is_primary ? '<span class="dot" style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block"></span>' : ''}</span>
                <span class="flex items-center gap-2"><span class="text-micro text-muted">${esc(e.label || '')}</span>
                ${canEdit && !isBasic ? `<button class="btn btn-icon" data-del-sat aria-label="Remove">${icon('x')}</button>` : ''}</span>
              </div>`).join('')}
            ${phones.map((p) => `
              <div class="flex-between" style="padding:5px 0" data-sat="phones" data-sat-id="${p.id}">
                <span class="flex items-center gap-2 text-sm">${icon('phone')} ${esc(p.phone)} ${p.is_primary ? '<span class="dot" style="width:6px;height:6px;border-radius:50%;background:var(--accent);display:inline-block"></span>' : ''}</span>
                <span class="flex items-center gap-2"><span class="text-micro text-muted">${esc(p.label || '')}</span>
                ${canEdit && !isBasic ? `<button class="btn btn-icon" data-del-sat aria-label="Remove">${icon('x')}</button>` : ''}</span>
              </div>`).join('')}
            ${(addresses || []).map((a) => `
              <div class="flex-between" style="padding:5px 0" data-sat="addresses" data-sat-id="${a.id}">
                <span class="flex items-center gap-2 text-sm">${icon('map-pin')} ${esc([a.street, a.city, a.state, a.zip, a.country].filter(Boolean).join(', '))}</span>
                <span class="flex items-center gap-2"><span class="text-micro text-muted">${esc(a.label || '')}</span>
                ${canEdit && !isBasic ? `<button class="btn btn-icon" data-locate-addr="${a.id}" aria-label="Locate on map" title="Locate on map">${icon('map-pin')}</button>` : ''}
                ${canEdit && !isBasic ? `<button class="btn btn-icon" data-del-sat aria-label="Remove">${icon('x')}</button>` : ''}</span>
              </div>`).join('')}
            ${!c.email && !c.phone && !emails.length && !phones.length && !(addresses || []).length ? '<div class="text-sm text-muted" style="padding:6px 0">No contact details yet.</div>' : ''}
          </div>
          <div id="contact-minimap-host"></div>
        </div>

        ${!isBasic ? `
        <div class="card">
          <div class="card-header"><span class="card-title">Social links</span>
            ${canEdit ? `<button class="btn btn-ghost btn-sm" data-action="add-social">${icon('plus')} Add</button>` : ''}
          </div>
          ${(socials || []).length ? (socials || []).map((s) => `
            <div class="flex-between" style="padding:5px 0" data-sat="socials" data-sat-id="${s.id}">
              <span class="flex items-center gap-2 text-sm">${icon('link')}
                <span class="font-medium">${esc(s.platform || '')}</span>
                ${s.username ? `<span class="text-secondary">@${esc(s.username)}</span>` : ''}
                ${s.url ? `<a href="${escUrl(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open link">${icon('external-link')}</a>` : ''}
              </span>
              ${canEdit ? `<button class="btn btn-icon" data-del-sat aria-label="Remove">${icon('x')}</button>` : ''}
            </div>`).join('') : '<div class="text-sm text-muted" style="padding:6px 0">No social links yet.</div>'}
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Tags & groups</span></div>
          <div class="flex gap-1 flex-wrap" id="detail-tags">
            ${(tags || []).map((t) => tagPill(t, { removable: canEdit })).join('') || '<span class="text-sm text-muted">No tags.</span>'}
            ${canEdit ? `<button class="btn btn-ghost btn-sm" data-action="add-tag">${icon('plus')} Tag</button>` : ''}
          </div>
          <div class="flex gap-1 flex-wrap mt-2" id="detail-groups">
            ${(groups || []).map((g) => groupBadge(g)).join('') || '<span class="text-sm text-muted">No groups.</span>'}
          </div>
        </div>` : ''}
      </div>
    </div>

    ${!isBasic ? `
    <div class="card mt-4" id="relationships-card">
      <div class="card-header"><span class="card-title">Relationships</span>
        ${canEdit ? `<button class="btn btn-ghost btn-sm" data-action="add-relationship">${icon('plus')} Add</button>` : ''}
      </div>
      <div id="contact-relationships"><div class="text-sm text-muted">Loading…</div></div>
    </div>
    <div class="grid-2 mt-4">
      <div class="card" id="dates-card">
        <div class="card-header"><span class="card-title">Important dates</span>
          ${canEdit ? `<button class="btn btn-ghost btn-sm" data-action="add-date">${icon('plus')} Add</button>` : ''}
        </div>
        <div id="contact-dates"><div class="text-sm text-muted">Loading…</div></div>
      </div>
      <div class="card" id="gifts-card">
        <div class="card-header"><span class="card-title">Gift ideas</span>
          ${canEdit ? `<button class="btn btn-ghost btn-sm" data-action="add-gift">${icon('plus')} Add</button>` : ''}
        </div>
        <div id="contact-gifts"><div class="text-sm text-muted">Loading…</div></div>
      </div>
    </div>
    <div class="card mt-4" id="timeline-card">
      <div class="card-header"><span class="card-title">Timeline</span></div>
      <div id="contact-timeline"><div class="text-sm text-muted">Timeline arrives in Phase 6.</div></div>
    </div>
    <div class="card mt-4" id="media-card">
      <div class="card-header"><span class="card-title">Media</span></div>
      <div id="contact-media"><div class="text-sm text-muted">Media gallery arrives in Phase 7.</div></div>
    </div>
    <div class="mt-4 mb-6 flex gap-3">
      <button class="btn btn-ghost btn-sm" data-action="view-history">${icon('history')} View history</button>
      <button class="btn btn-ghost btn-sm" data-action="view-changelog">${icon('file-text')} Change log</button>
    </div>` : ''}
  </div>`;

  // ---- bindings
  el.querySelector('[data-action="fav"]')?.addEventListener('click', async () => {
    try {
      await api.put(`/api/contacts/${c.id}/favorite`);
      refreshSidebarLists();
      renderContactDetail(el, id);
    } catch (err) { toast(err.message, 'error'); }
  });

  el.querySelector('[data-action="edit"]')?.addEventListener('click', () => openContactForm(c, () => renderContactDetail(el, id)));

  el.querySelector('[data-action="delete"]')?.addEventListener('click', async () => {
    const ok = await confirmModal('Delete contact', `Delete ${c.display_name}? This can't be undone.`);
    if (!ok) return;
    try {
      await api.del(`/api/contacts/${c.id}`);
      toast('Contact deleted.');
      navigate('/contacts');
      refreshSidebarLists();
    } catch (err) { toast(err.message, 'error'); }
  });

  // satellite removal
  el.querySelectorAll('[data-del-sat]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-sat]');
      try {
        await api.del(`/api/${row.dataset.sat}/${row.dataset.satId}`);
        renderContactDetail(el, id);
      } catch (err) { toast(err.message, 'error'); }
    })
  );

  // address geocode ("locate")
  el.querySelectorAll('[data-locate-addr]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.post(`/api/addresses/${btn.dataset.locateAddr}/geocode`);
        toast('Address located.');
        renderContactDetail(el, id);
      } catch (err) {
        btn.disabled = false;
        toast(err.message, 'error');
      }
    })
  );

  // new feature cards (skip for basic shares — the cards don't render there)
  if (!isBasic) {
    const relEl = el.querySelector('#contact-relationships');
    if (relEl) loadRelationships(relEl, c, canEdit, () => renderContactDetail(el, id));
    el.querySelector('[data-action="add-relationship"]')?.addEventListener('click', () =>
      openRelationshipModal(c, () => renderContactDetail(el, id)));

    const datesEl = el.querySelector('#contact-dates');
    if (datesEl) loadImportantDates(datesEl, c, canEdit, () => renderContactDetail(el, id));
    el.querySelector('[data-action="add-date"]')?.addEventListener('click', () =>
      openDateModal(c, null, () => renderContactDetail(el, id)));

    const giftsEl = el.querySelector('#contact-gifts');
    if (giftsEl) loadGifts(giftsEl, c, canEdit, () => renderContactDetail(el, id));
    el.querySelector('[data-action="add-gift"]')?.addEventListener('click', () =>
      openGiftModal(c, () => renderContactDetail(el, id)));

    renderAddressMiniMap(el, addresses || []);
  }

  el.querySelector('[data-action="add-contact-method"]')?.addEventListener('click', () => openContactMethodModal(c.id, () => renderContactDetail(el, id)));
  el.querySelector('[data-action="add-social"]')?.addEventListener('click', () => openSocialModal(c.id, () => renderContactDetail(el, id)));

  // tag add/remove — Phase 5 wires fully; basic support now
  el.querySelector('[data-action="add-tag"]')?.addEventListener('click', async () => {
    window.dispatchEvent(new CustomEvent('kith:add-tag', { detail: { contactId: c.id, refresh: () => renderContactDetail(el, id) } }));
  });
  el.querySelectorAll('[data-action="remove-tag"]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      try {
        await api.del(`/api/contacts/${c.id}/tags/${btn.dataset.tagId}`);
        renderContactDetail(el, id);
      } catch (err) { toast(err.message, 'error'); }
    })
  );

  // history / changelog
  el.querySelector('[data-action="view-history"]')?.addEventListener('click', () => openAuditModal(c));
  el.querySelector('[data-action="view-changelog"]')?.addEventListener('click', () => openChangelogModal(c));

  // merge & share — Phase 8
  el.querySelector('[data-action="merge"]')?.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('kith:merge-contact', { detail: { contact: c, refresh: () => renderContactDetail(el, id) } })));
  el.querySelector('[data-action="share"]')?.addEventListener('click', () =>
    window.dispatchEvent(new CustomEvent('kith:share-contact', { detail: { contact: c, refresh: () => renderContactDetail(el, id) } })));

  // let later phases enrich the page (timeline/media/spicy)
  window.dispatchEvent(new CustomEvent('kith:contact-detail-rendered', { detail: { el, contact: c, canEdit, share_scope, refresh: () => renderContactDetail(el, id) } }));
}

// ------------------------------------------------------ relationships card
async function loadRelationships(container, contact, canEdit, refresh) {
  let rels = [];
  try {
    rels = (await api.get(`/api/contacts/${contact.id}/relationships`)).relationships || [];
  } catch (err) {
    container.innerHTML = `<div class="text-sm text-muted">${esc(err?.message || "Couldn't load relationships.")}</div>`;
    return;
  }
  if (!rels.length) {
    container.innerHTML = `<div class="text-sm text-muted" style="padding:4px 0">No relationships yet.${canEdit ? ' Link the people in their life.' : ''}</div>`;
    return;
  }
  const label = (t) => (RELATION_TYPES.find((r) => r.value === t)?.label || t || '').toLowerCase();
  container.innerHTML = rels.map((r) => `
    <div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border)" data-rel-id="${r.id}">
      <a class="flex items-center gap-2" href="#/contacts/${encodeURIComponent(r.other.id)}" style="text-decoration:none;color:inherit;min-width:0">
        ${avatar(r.other, 'sm')}
        <span class="min-w-0">
          <span class="text-sm font-medium">${esc(r.other.display_name)}</span>
          <span class="text-sm ${r.inverse ? 'text-muted' : 'text-secondary'}"> · ${esc(label(r.display_label))}${r.inverse ? ' (inverse)' : ''}</span>
          ${r.notes ? `<span class="text-xs text-muted truncate" style="display:block">${esc(r.notes)}</span>` : ''}
        </span>
      </a>
      ${canEdit ? `<button class="btn btn-icon" data-del-rel="${r.id}" aria-label="Remove relationship">${icon('x')}</button>` : ''}
    </div>`).join('');

  container.querySelectorAll('[data-del-rel]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Remove relationship', 'Remove this relationship? The other person is not affected.', { confirmLabel: 'Remove' });
      if (!ok) return;
      try {
        await api.del(`/api/relationships/${btn.dataset.delRel}`);
        toast('Relationship removed.');
        refresh?.();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

function openRelationshipModal(contact, onSaved) {
  const content = `
    <div class="form-group">
      <label class="form-label">Person</label>
      <div class="flex gap-1 flex-wrap mb-1" id="rel-picked"></div>
      <div class="search-input-wrap">${icon('search')}<input class="form-input" id="rel-search" placeholder="Type to find a person" autocomplete="off"></div>
      <div id="rel-results"></div>
    </div>
    ${formGroup('Relation', selectInput('relation_type', RELATION_TYPES, 'friend'))}
    ${formGroup('Note (optional)', textInput('notes', '', 'placeholder="e.g. met through work"'))}`;

  openModal(modalShell('rel-form', `Add relationship — ${contact.display_name}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Add</button>`), {
    onMount: (overlay, close) => {
      let picked = null; // { id, name }
      const pickedEl = overlay.querySelector('#rel-picked');
      const renderPicked = () => {
        pickedEl.innerHTML = picked
          ? `<span class="tag-pill">${esc(picked.name)}<button class="tag-x" data-unpick aria-label="Remove">${icon('x')}</button></span>`
          : '';
        pickedEl.querySelector('[data-unpick]')?.addEventListener('click', () => { picked = null; renderPicked(); });
      };
      const searchInput = overlay.querySelector('#rel-search');
      const resultsEl = overlay.querySelector('#rel-results');
      searchInput.addEventListener('input', debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { resultsEl.innerHTML = ''; return; }
        let found;
        try { found = await api.get('/api/contacts' + qs({ search: q, limit: 6 })); } catch { return; }
        resultsEl.innerHTML = (found.contacts || [])
          .filter((c) => c.id !== contact.id)
          .map((c) => `<button class="popover-item w-full" data-pick="${c.id}" data-name="${esc(c.display_name)}"><span class="av sm" style="width:22px;height:22px;font-size:9px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}</button>`)
          .join('') || '<div class="text-sm text-muted p-2">No matches.</div>';
        resultsEl.querySelectorAll('[data-pick]').forEach((b) =>
          b.addEventListener('click', () => {
            picked = { id: Number(b.dataset.pick), name: b.dataset.name };
            searchInput.value = '';
            resultsEl.innerHTML = '';
            renderPicked();
          }));
      }, 250));

      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        if (!picked) { toast('Pick a person first.', 'error'); return; }
        try {
          await api.post(`/api/contacts/${contact.id}/relationships`, {
            related_contact_id: picked.id,
            relation_type: overlay.querySelector('[name="relation_type"]').value,
            notes: overlay.querySelector('[name="notes"]').value || null,
          });
          toast('Relationship added.');
          close();
          onSaved?.();
        } catch (err) {
          toast(err.status === 409 ? 'Relationship already exists' : err.message, 'error');
        }
      });
    },
  });
}

// ---------------------------------------------------- important dates card
async function loadImportantDates(container, contact, canEdit, refresh) {
  let dates = [];
  try {
    dates = (await api.get(`/api/contacts/${contact.id}/dates`)).dates || [];
  } catch (err) {
    container.innerHTML = `<div class="text-sm text-muted">${esc(err?.message || "Couldn't load dates.")}</div>`;
    return;
  }
  if (!dates.length) {
    container.innerHTML = `<div class="text-sm text-muted" style="padding:4px 0">No dates yet.${canEdit ? ' Anniversaries, first met…' : ''}</div>`;
    return;
  }
  container.innerHTML = dates.map((d) => `
    <div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border)" data-date-id="${d.id}">
      <span class="flex items-center gap-2 text-sm min-w-0">
        ${icon('calendar')}
        <span class="font-medium truncate">${esc(d.label)}</span>
        <span class="text-secondary">${esc(fmtDate(d.date))}</span>
        ${d.recurring ? '<span class="badge neutral">yearly</span>' : ''}
      </span>
      ${canEdit ? `
      <span class="flex gap-1">
        <button class="btn btn-icon" data-edit-date="${d.id}" aria-label="Edit date">${icon('edit')}</button>
        <button class="btn btn-icon" data-del-date="${d.id}" aria-label="Delete date">${icon('x')}</button>
      </span>` : ''}
    </div>`).join('');

  container.querySelectorAll('[data-edit-date]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const d = dates.find((x) => String(x.id) === btn.dataset.editDate);
      openDateModal(contact, d, refresh);
    }));
  container.querySelectorAll('[data-del-date]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete date', 'Delete this important date?');
      if (!ok) return;
      try {
        await api.del(`/api/dates/${btn.dataset.delDate}`);
        toast('Date deleted.');
        refresh?.();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

function openDateModal(contact, existing, onSaved) {
  const d = existing || {};
  const recurring = existing ? Boolean(d.recurring) : true;
  const content = `
    ${formGroup('Label', textInput('label', d.label, 'placeholder="Anniversary, first met…"'))}
    ${formGroup('Date', textInput('date', (d.date || '').slice(0, 10), 'type="date"'))}
    <div class="toggle-row">
      <div><div class="toggle-label">Repeats yearly</div><div class="toggle-desc">Shows up every year on the dashboard and calendar.</div></div>
      <button type="button" role="switch" aria-checked="${recurring ? 'true' : 'false'}" class="toggle-switch ${recurring ? 'on' : ''}" data-toggle="recurring"></button>
    </div>`;
  openModal(modalShell('date-form', existing ? 'Edit important date' : 'Add important date', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">${existing ? 'Save' : 'Add'}</button>`), {
    onMount: (overlay, close) => {
      const tgl = overlay.querySelector('[data-toggle="recurring"]');
      tgl.addEventListener('click', () => {
        tgl.classList.toggle('on');
        tgl.setAttribute('aria-checked', tgl.classList.contains('on') ? 'true' : 'false');
      });
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const payload = {
          label: overlay.querySelector('[name="label"]').value.trim(),
          date: overlay.querySelector('[name="date"]').value,
          recurring: tgl.classList.contains('on'),
        };
        if (!payload.label) { toast('Label is required', 'error'); return; }
        if (!payload.date) { toast('Date is required', 'error'); return; }
        try {
          if (existing) await api.put(`/api/dates/${d.id}`, payload);
          else await api.post(`/api/contacts/${contact.id}/dates`, payload);
          toast(existing ? 'Date saved.' : 'Date added.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ------------------------------------------------------------- gifts card
const GIFT_BADGE = { idea: 'neutral', purchased: 'blue', given: 'green' };

async function loadGifts(container, contact, canEdit, refresh) {
  let gifts = [];
  try {
    gifts = (await api.get(`/api/contacts/${contact.id}/gifts`)).gifts || [];
  } catch (err) {
    container.innerHTML = `<div class="text-sm text-muted">${esc(err?.message || "Couldn't load gift ideas.")}</div>`;
    return;
  }
  if (!gifts.length) {
    container.innerHTML = `<div class="text-sm text-muted" style="padding:4px 0">No gift ideas yet.${canEdit ? ' Jot one down before you forget.' : ''}</div>`;
    return;
  }
  container.innerHTML = gifts.map((g) => `
    <div style="padding:6px 0;border-bottom:1px solid var(--border)" data-gift-id="${g.id}">
      <div class="flex-between gap-2">
        <span class="flex items-center gap-2 text-sm min-w-0">
          ${icon('gift')}
          <span class="font-medium truncate" ${g.notes ? `title="${esc(g.notes)}"` : ''}>${esc(g.title)}</span>
          ${g.occasion ? `<span class="badge">${esc(g.occasion)}</span>` : ''}
          ${g.url ? `<a href="${escUrl(g.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open link">${icon('external-link')}</a>` : ''}
        </span>
        <span class="flex items-center gap-1">
          ${canEdit
            ? `<select class="form-select gift-status ${esc(GIFT_BADGE[g.status] || 'neutral')}" data-gift-status="${g.id}" aria-label="Gift status">
                ${GIFT_STATUSES.map((s) => `<option value="${s.value}" ${s.value === g.status ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>`
            : `<span class="badge ${esc(GIFT_BADGE[g.status] || 'neutral')}">${esc(g.status)}</span>`}
          ${canEdit ? `<button class="btn btn-icon" data-del-gift="${g.id}" aria-label="Delete gift idea">${icon('x')}</button>` : ''}
        </span>
      </div>
      ${g.notes ? `<div class="text-xs text-muted mt-1" style="padding-left:24px">${esc(g.notes)}</div>` : ''}
    </div>`).join('');

  container.querySelectorAll('[data-gift-status]').forEach((sel) =>
    sel.addEventListener('change', async () => {
      try {
        await api.put(`/api/gifts/${sel.dataset.giftStatus}`, { status: sel.value });
        toast('Gift updated.');
        refresh?.();
      } catch (err) { toast(err.message, 'error'); }
    }));
  container.querySelectorAll('[data-del-gift]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete gift idea', 'Delete this gift idea?');
      if (!ok) return;
      try {
        await api.del(`/api/gifts/${btn.dataset.delGift}`);
        toast('Gift idea deleted.');
        refresh?.();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

function openGiftModal(contact, onSaved) {
  const content = `
    ${formGroup('Idea', textInput('title', '', 'placeholder="What would they love?"'))}
    <div class="form-row">
      ${formGroup('Occasion (optional)', textInput('occasion', '', 'placeholder="Birthday, Christmas…"'))}
      ${formGroup('Link (optional)', textInput('url', '', 'type="url" placeholder="https://"'))}
    </div>
    ${formGroup('Notes (optional)', textarea('notes', '', 'style="min-height:56px"'))}`;
  openModal(modalShell('gift-form', `Gift idea — ${contact.display_name}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Add</button>`), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const values = readForm(overlay.querySelector('.modal-content'));
        if (!values.title) { toast('A gift idea needs a title.', 'error'); return; }
        try {
          await api.post(`/api/contacts/${contact.id}/gifts`, values);
          toast('Gift idea added.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// -------------------------------------------------------- address mini-map
async function renderAddressMiniMap(el, addresses) {
  const host = el.querySelector('#contact-minimap-host');
  if (!host) return;
  const geocoded = addresses.filter((a) =>
    Number.isFinite(Number(a.latitude)) && Number.isFinite(Number(a.longitude)) &&
    a.latitude !== null && a.longitude !== null);
  if (!geocoded.length) { host.innerHTML = ''; return; }

  host.innerHTML = `<div class="mini-map mt-2" id="contact-minimap" aria-label="Address map"></div>`;
  let L;
  try { L = await loadLeaflet(); } catch { host.innerHTML = ''; return; }
  const mapEl = host.querySelector('#contact-minimap');
  if (!mapEl) return; // navigated away mid-load

  const pts = geocoded.map((a) => [Number(a.latitude), Number(a.longitude)]);
  const map = createMap(mapEl, { center: pts[0], zoom: 13, zoomControl: false, attributionControl: false });
  for (const a of geocoded) {
    const label = [a.label, [a.street, a.city].filter(Boolean).join(', ')].filter(Boolean).join(' — ');
    L.marker([Number(a.latitude), Number(a.longitude)], { title: label || 'Address' }).addTo(map);
  }
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 13 });
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 300);
}

// ------------------------------------------------------ audit & changelog
async function openAuditModal(contact) {
  let rows = [];
  try {
    rows = (await api.get(`/api/audit-log?contact_id=${contact.id}`)).entries || [];
  } catch { /* endpoint in Phase 8; empty fallback */ }
  const content = rows.length ? rows.map((r) => feedItem(
    'history',
    `${esc(r.action)} ${esc(r.entity_type || '')}`,
    esc(r.description || ''),
    `${esc(r.user_username || 'system')} · ${esc(fmtDate(r.created_at))}`
  )).join('') : emptyState('history', 'No history yet', 'Actions on this contact will appear here.');
  openModal(modalShell('audit', `History — ${contact.display_name}`, content, '', { size: 'modal-lg' }));
}

async function openChangelogModal(contact) {
  let rows = [];
  try {
    rows = (await api.get(`/api/contacts/${contact.id}/changelog`)).changelog || [];
  } catch { /* ignore */ }
  const content = rows.length ? `
    <table class="data-table">
      <thead><tr><th>Field</th><th>Old</th><th>New</th><th>Source</th><th>When</th></tr></thead>
      <tbody>${rows.map((r) => `
        <tr style="cursor:default">
          <td class="font-medium">${esc(r.field_name)}</td>
          <td class="td-secondary">${esc(r.old_value ?? '—')}</td>
          <td class="td-secondary">${esc(r.new_value ?? '—')}</td>
          <td class="td-muted">${esc(r.source)}</td>
          <td class="td-muted">${esc(fmtDate(r.changed_at))}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : emptyState('file-text', 'No changes yet', 'Field-level edits will appear here.');
  openModal(modalShell('changelog', `Change log — ${contact.display_name}`, content, '', { size: 'modal-xl' }));
}

// ---------------------------------------------------------- contact form
export function openContactForm(existing = null, onSaved = null) {
  const c = existing || {};
  const relTypes = ['', ...(state.settings.relationship_types || ['Friend', 'Family', 'Coworker', 'Acquaintance', 'Neighbor', 'Other'])];
  const content = `
    <div class="form-row">
      ${formGroup('First name', textInput('first_name', c.first_name))}
      ${formGroup('Last name', textInput('last_name', c.last_name))}
    </div>
    <div class="form-row">
      ${formGroup('Display name', textInput('display_name', c.display_name, 'placeholder="Auto from first + last"'))}
      ${formGroup('Nickname', textInput('nickname', c.nickname))}
    </div>
    <div class="form-row">
      ${formGroup('Email', textInput('email', c.email, 'type="email"'))}
      ${formGroup('Phone', textInput('phone', c.phone, 'type="tel"'))}
    </div>
    <div class="form-row">
      ${formGroup('Birthday', textInput('birthday', (c.birthday || '').slice(0, 10), 'type="date"'))}
      ${formGroup('Relationship type', selectInput('relationship_type', relTypes, c.relationship_type))}
    </div>
    <div class="form-row">
      ${formGroup('Sex', selectInput('sex', SEX_OPTIONS, c.sex))}
      ${formGroup('Pronouns', selectInput('pronouns', PRONOUN_OPTIONS, c.pronouns))}
    </div>
    <div class="form-row">
      ${formGroup('Orientation', selectInput('orientation', ORIENTATION_OPTIONS, c.orientation))}
      ${formGroup('Relationship status', selectInput('relationship_status', REL_STATUS_OPTIONS, c.relationship_status))}
    </div>
    <div class="form-row">
      ${formGroup('Location', textInput('location', c.location))}
      ${formGroup('Website', textInput('website', c.website, 'type="url" placeholder="https://"'))}
    </div>
    <div class="form-row">
      ${formGroup('Occupation', textInput('occupation', c.occupation))}
      ${formGroup('Company', textInput('company', c.company))}
    </div>
    <div class="form-row">
      ${formGroup('Languages', textInput('languages', c.languages, 'placeholder="English, Spanish"'))}
      ${formGroup('Ethnicity', textInput('ethnicity', c.ethnicity))}
    </div>
    <div class="form-row">
      ${formGroup('How we met', textInput('how_we_met', c.how_we_met))}
      ${formGroup('Met date', textInput('met_date', (c.met_date || '').slice(0, 10), 'type="date"'))}
    </div>
    ${formGroup('Keep in touch every ___ days', textInput('keep_in_touch_days', c.keep_in_touch_days ?? '', 'type="number" min="1" step="1" placeholder="Leave empty to turn off"'), 'Kith flags them as out of touch when this many days pass without contact.')}
    ${formGroup('Bio', textarea('bio', c.bio))}
    ${formGroup('Notes', textarea('notes_text', c.notes_text))}
    <div class="form-group">
      <label class="form-label">Rating</label>
      ${starRating(c.rating || 0, { interactive: true, name: 'rating' })}
    </div>
    ${isSpicyOn() ? `
    <div class="toggle-row">
      <div><div class="toggle-label">Spicy contact</div><div class="toggle-desc">Marks this contact as having spicy content.</div></div>
      <button type="button" role="switch" aria-checked="${c.is_spicy ? 'true' : 'false'}" class="toggle-switch ${c.is_spicy ? 'on' : ''}" data-toggle="is_spicy"></button>
    </div>` : ''}`;

  const html = modalShell('contact-form', existing ? `Edit ${c.display_name}` : 'New person', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">${existing ? 'Save' : 'Create'}</button>`,
    { size: 'modal-lg' });

  openModal(html, {
    onMount: (overlay, close) => {
      let rating = c.rating || 0;
      overlay.querySelectorAll('.star-rating.interactive .star').forEach((s) =>
        s.addEventListener('click', () => {
          rating = Number(s.dataset.star) === rating ? 0 : Number(s.dataset.star);
          overlay.querySelectorAll('.star-rating.interactive .star').forEach((st) =>
            st.classList.toggle('filled', Number(st.dataset.star) <= rating));
        })
      );
      overlay.querySelectorAll('[data-toggle]').forEach((t) =>
        t.addEventListener('click', () => {
          t.classList.toggle('on');
          t.setAttribute('aria-checked', t.classList.contains('on') ? 'true' : 'false');
        })
      );
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const values = readForm(overlay.querySelector('.modal-content'));
        values.rating = rating;
        const spicyToggle = overlay.querySelector('[data-toggle="is_spicy"]');
        if (spicyToggle) values.is_spicy = spicyToggle.classList.contains('on');
        try {
          if (existing) {
            await api.put(`/api/contacts/${c.id}`, values);
            toast('Contact saved.');
          } else {
            const res = await api.post('/api/contacts', values);
            toast('Contact created.');
            navigate(`/contacts/${res.id}`);
          }
          close();
          onSaved?.();
          refreshSidebarLists();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ---------------------------------------------- add email/phone/address
function openContactMethodModal(contactId, onSaved) {
  const content = `
    ${formGroup('Type', selectInput('kind', [
      { value: 'emails', label: 'Email' }, { value: 'phones', label: 'Phone' }, { value: 'addresses', label: 'Address' },
    ], 'emails', 'id="method-kind"'))}
    <div id="method-fields"></div>
    <div class="toggle-row">
      <div class="toggle-label">Primary</div>
      <button type="button" role="switch" aria-checked="false" class="toggle-switch" data-toggle="is_primary"></button>
    </div>`;
  const html = modalShell('add-method', 'Add contact detail', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Add</button>`);
  openModal(html, {
    onMount: (overlay, close) => {
      const fieldsEl = overlay.querySelector('#method-fields');
      const renderFields = (kind) => {
        if (kind === 'emails') {
          fieldsEl.innerHTML = formGroup('Email', textInput('email', '', 'type="email"')) +
            formGroup('Label', selectInput('label', ['personal', 'work', 'school', 'other'], 'personal'));
        } else if (kind === 'phones') {
          fieldsEl.innerHTML = formGroup('Phone', textInput('phone', '', 'type="tel"')) +
            formGroup('Label', selectInput('label', ['mobile', 'home', 'work', 'other'], 'mobile'));
        } else {
          fieldsEl.innerHTML = formGroup('Street', textInput('street')) +
            `<div class="form-row">${formGroup('City', textInput('city'))}${formGroup('State', textInput('state'))}</div>` +
            `<div class="form-row">${formGroup('ZIP', textInput('zip'))}${formGroup('Country', textInput('country'))}</div>` +
            formGroup('Label', selectInput('label', ['home', 'work', 'vacation', 'other'], 'home'));
        }
      };
      renderFields('emails');
      overlay.querySelector('#method-kind').addEventListener('change', (e) => renderFields(e.target.value));
      overlay.querySelector('[data-toggle]').addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('on');
        e.currentTarget.setAttribute('aria-checked', e.currentTarget.classList.contains('on') ? 'true' : 'false');
      });
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const kind = overlay.querySelector('#method-kind').value;
        const values = readForm(fieldsEl);
        values.is_primary = overlay.querySelector('[data-toggle]').classList.contains('on');
        try {
          await api.post(`/api/contacts/${contactId}/${kind}`, values);
          toast('Added.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

function openSocialModal(contactId, onSaved) {
  const content = `
    ${formGroup('Platform', selectInput('platform', SOCIAL_PLATFORMS, 'Instagram'))}
    ${formGroup('Username', textInput('username', '', 'placeholder="username"'))}
    ${formGroup('URL', textInput('url', '', 'type="url" placeholder="https://"'))}`;
  const html = modalShell('add-social', 'Add social link', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Add</button>`);
  openModal(html, {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const values = readForm(overlay.querySelector('.modal-content'));
        try {
          await api.post(`/api/contacts/${contactId}/socials`, values);
          toast('Added.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// register
pageRenderers.contacts = renderContacts;
window.addEventListener('kith:new-contact', () => openContactForm());
