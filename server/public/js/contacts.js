// Contacts page: list (table w/ sort/filter/search/pagination), profile drawer,
// create/edit modal. Registered into pageRenderers.

import { api, qs } from './api.js';
import {
  esc, escUrl, fmtDate, timeAgo, initials, prideFlagGradient,
  ageFromBirthday, zodiacFromBirthday, debounce,
} from './utils.js';
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
  favorites: false, page: 1, limit: 50,
};

// ------------------------------------------------------------- list page
async function renderContacts(el, params) {
  if (params.id) return renderContactDetail(el, params.id);
  if (params.group) listState.group = params.group;
  if (params.tag) listState.tag = params.tag;

  el.innerHTML = `
  <div class="page-inner">
    <div class="page-header">
      <div>
        <h1 class="page-title">Contacts</h1>
        <div class="page-subtitle" id="contacts-count"></div>
      </div>
      <div class="page-actions">
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
  </div>`;

  el.querySelector('[data-action="new-contact-page"]').addEventListener('click', () => openContactForm());
  const searchInput = el.querySelector('#contacts-search');
  searchInput.addEventListener('input', debounce(() => {
    listState.search = searchInput.value.trim();
    listState.page = 1;
    loadTable(el);
  }, 250));

  renderFilterControls(el);
  await loadTable(el);
}

function renderFilterControls(el) {
  const pillsEl = el.querySelector('#contacts-filter-pills');
  pillsEl.innerHTML = filterPills(
    [{ value: '', label: 'All' }, { value: 'fav', label: 'Favorites' }],
    listState.favorites ? 'fav' : ''
  );
  pillsEl.querySelectorAll('.filter-pill').forEach((p) =>
    p.addEventListener('click', () => {
      listState.favorites = p.dataset.filter === 'fav';
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
      listState.tag = t.dataset.tag || '';
      listState.group = t.dataset.group || '';
      listState.page = 1;
      pop.remove();
      renderFilterControls(el);
      loadTable(el);
    });
  });
}

async function loadTable(el) {
  const tableEl = el.querySelector('#contacts-table');
  const countEl = el.querySelector('#contacts-count');
  const pagerEl = el.querySelector('#contacts-pager');
  if (!tableEl) return;

  const data = await api.get('/api/contacts' + qs({
    search: listState.search || undefined,
    tag: listState.tag || undefined,
    group: listState.group || undefined,
    favorites: listState.favorites ? 1 : undefined,
    sort: listState.sort, sortDir: listState.sortDir,
    page: listState.page, limit: listState.limit,
  }));

  countEl.textContent = `${data.total} ${data.total === 1 ? 'person' : 'people'}`;

  if (!data.contacts.length) {
    tableEl.innerHTML = emptyState('users', 'No contacts yet', 'Add someone you care about.',
      `<button class="btn btn-primary" data-action="empty-new">${icon('plus')} New person</button>`);
    tableEl.querySelector('[data-action="empty-new"]')?.addEventListener('click', () => openContactForm());
    pagerEl.innerHTML = '';
    return;
  }

  const sortArrow = (col) => listState.sort === col ? `<span class="sort-arrow">${listState.sortDir === 'asc' ? '↑' : '↓'}</span>` : '';
  tableEl.innerHTML = `
  <table class="data-table">
    <thead><tr>
      <th class="sortable" data-sort="name">Name ${sortArrow('name')}</th>
      <th>Tags</th>
      <th class="sortable" data-sort="location">Location ${sortArrow('location')}</th>
      <th class="sortable" data-sort="rating">Rating ${sortArrow('rating')}</th>
      <th class="sortable" data-sort="updated">Updated ${sortArrow('updated')}</th>
      <th></th>
    </tr></thead>
    <tbody>
      ${data.contacts.map((c) => `
      <tr data-contact-id="${c.id}" class="contact-row ${c.is_spicy ? 'has-spicy-data' : ''}">
        <td>
          <div class="flex items-center gap-3">
            ${avatar(c, 'sm')}
            <div>
              <div class="font-medium">${esc(c.display_name)} ${c.is_shared_in ? '<span class="badge neutral">Shared</span>' : ''}</div>
              ${c.email ? `<div class="td-muted">${esc(c.email)}</div>` : ''}
            </div>
          </div>
        </td>
        <td><div class="flex gap-1 flex-wrap">${(c.tags || []).slice(0, 3).map((t) => tagPill(t)).join('')}</div></td>
        <td class="td-secondary">${esc(c.location || '')}</td>
        <td>${c.rating ? starRating(c.rating) : '<span class="td-muted">—</span>'}</td>
        <td class="td-muted">${timeAgo(c.updated_at)}</td>
        <td>
          <button class="btn btn-icon" data-fav="${c.id}" aria-label="${c.is_favorite ? 'Unfavorite' : 'Favorite'}">
            <span class="star-rating ${c.is_favorite ? '' : 'readonly'}"><span class="star ${c.is_favorite ? 'filled' : ''}">${icon('star')}</span></span>
          </button>
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
      navigate(`/contacts/${tr.dataset.contactId}`);
    })
  );

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
        </div>
        <div class="flex gap-1">
          <button class="btn btn-icon lg" data-action="fav" aria-label="Toggle favorite">
            <span class="star-rating"><span class="star ${c.is_favorite ? 'filled' : ''}">${icon('star')}</span></span>
          </button>
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
                ${canEdit && !isBasic ? `<button class="btn btn-icon" data-del-sat aria-label="Remove">${icon('x')}</button>` : ''}</span>
              </div>`).join('')}
            ${!emails.length && !phones.length && !(addresses || []).length ? '<div class="text-sm text-muted" style="padding:6px 0">No contact details yet.</div>' : ''}
          </div>
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
