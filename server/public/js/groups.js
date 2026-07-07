// Groups page (2-col card grid, expandable member lists) + tag management
// wiring (add-tag modal used from contact detail).

import { api, qs } from './api.js';
import { esc, initials, debounce } from './utils.js';
import { icon } from './icons.js';
import {
  emptyState, modalShell, formGroup, textInput, selectInput, textarea,
  toast, openModal, confirmModal, readForm,
} from './components.js';
import { pageRenderers } from './pages.js';
import { state, navigate, refreshSidebarLists } from './app.js';

const GROUP_ICONS = ['users', 'star', 'home', 'link', 'heart', 'briefcase', 'coffee', 'zap', 'globe', 'handshake'];

// ------------------------------------------------------------ groups page
async function renderGroups(el) {
  const data = await api.get('/api/groups');
  const groups = data.groups || [];

  el.innerHTML = `
  <div class="page-inner">
    <div class="page-header">
      <div><h1 class="page-title">Groups</h1><div class="page-subtitle">${groups.length} groups</div></div>
      <div class="page-actions"><button class="btn btn-primary" data-action="new-group">${icon('plus')} New group</button></div>
    </div>
    <div class="grid-2" id="groups-grid">
      ${groups.map((g) => groupCard(g)).join('') || ''}
    </div>
    ${!groups.length ? emptyState('users', 'No groups yet', 'Create a group to organize your people.') : ''}
  </div>`;

  el.querySelector('[data-action="new-group"]').addEventListener('click', () => openGroupForm(null, () => renderGroups(el)));

  el.querySelectorAll('[data-group-card]').forEach((card) => bindGroupCard(card, el));
}

function groupCard(g) {
  return `
  <div class="card" data-group-card="${g.id}">
    <div class="card-header clickable" data-expand>
      <div class="flex items-center gap-3">
        <span class="feed-icon" style="color:${esc(g.color || 'var(--accent)')}">${icon(g.icon || 'users')}</span>
        <div>
          <div class="card-title">${esc(g.name)} ${g.is_system ? '<span class="badge neutral">System</span>' : ''}</div>
          ${g.description ? `<div class="text-sm text-muted">${esc(g.description)}</div>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted">${Number(g.member_count) || 0} members</span>
        <span class="av-stack" data-avatars></span>
        ${icon('chevron-down', 'chev')}
      </div>
    </div>
    <div class="group-members hidden" data-members>
      <div class="text-sm text-muted p-2">Loading…</div>
    </div>
    <div class="flex gap-2 mt-2">
      <button class="btn btn-ghost btn-sm" data-action="edit-group">${icon('edit')} Edit</button>
      ${!g.is_system ? `<button class="btn btn-ghost btn-sm" data-action="delete-group">${icon('trash')} Delete</button>` : ''}
    </div>
  </div>`;
}

function bindGroupCard(card, pageEl) {
  const groupId = card.dataset.groupCard;
  let loaded = false;

  const loadMembers = async () => {
    const membersEl = card.querySelector('[data-members]');
    const data = await api.get(`/api/groups/${groupId}/members`);
    const members = data.members || [];
    membersEl.innerHTML = `
      ${members.map((m) => `
        <div class="flex-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
          <a class="flex items-center gap-2 text-sm" href="#/contacts/${m.id}" style="color:inherit;text-decoration:none">
            <span class="av sm">${esc(initials(m.display_name))}</span>
            <span class="font-medium">${esc(m.display_name)}</span>
            ${m.location ? `<span class="text-muted text-xs">${esc(m.location)}</span>` : ''}
          </a>
          <button class="btn btn-icon" data-remove-member="${m.id}" aria-label="Remove from group">${icon('x')}</button>
        </div>`).join('') || '<div class="text-sm text-muted" style="padding:8px 0">No members yet.</div>'}
      <div class="mt-2">
        <div class="search-input-wrap">
          ${icon('search')}
          <input class="form-input" data-member-search placeholder="Add member — type to search" autocomplete="off">
        </div>
        <div data-member-results></div>
      </div>`;

    // avatar stack (first 5)
    const stack = card.querySelector('[data-avatars]');
    if (stack) stack.innerHTML = members.slice(0, 5).map((m) => `<span class="av sm">${esc(initials(m.display_name))}</span>`).join('');

    membersEl.querySelectorAll('[data-remove-member]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        try {
          await api.del(`/api/groups/${groupId}/members/${btn.dataset.removeMember}`);
          loadMembers();
          refreshSidebarLists();
        } catch (err) { toast(err.message, 'error'); }
      })
    );

    // search-as-you-type add
    const searchInput = membersEl.querySelector('[data-member-search]');
    const resultsEl = membersEl.querySelector('[data-member-results]');
    searchInput.addEventListener('input', debounce(async () => {
      const q = searchInput.value.trim();
      if (!q) { resultsEl.innerHTML = ''; return; }
      const found = await api.get('/api/contacts' + qs({ search: q, limit: 6 }));
      const existing = new Set(members.map((m) => m.id));
      resultsEl.innerHTML = (found.contacts || [])
        .filter((c) => !existing.has(c.id))
        .map((c) => `<button class="popover-item w-full" data-add-member="${c.id}"><span class="av sm" style="width:22px;height:22px;font-size:9px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}</button>`)
        .join('') || '<div class="text-sm text-muted p-2">No matches.</div>';
      resultsEl.querySelectorAll('[data-add-member]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          try {
            await api.post(`/api/groups/${groupId}/members/${btn.dataset.addMember}`);
            searchInput.value = '';
            loadMembers();
            refreshSidebarLists();
          } catch (err) { toast(err.message, 'error'); }
        })
      );
    }, 250));
  };

  card.querySelector('[data-expand]').addEventListener('click', async () => {
    const membersEl = card.querySelector('[data-members]');
    const isHidden = membersEl.classList.toggle('hidden');
    if (!isHidden && !loaded) { loaded = true; await loadMembers(); }
  });

  card.querySelector('[data-action="edit-group"]')?.addEventListener('click', async () => {
    const groups = (await api.get('/api/groups')).groups || [];
    const g = groups.find((x) => String(x.id) === String(groupId));
    openGroupForm(g, () => renderGroups(pageEl));
  });

  card.querySelector('[data-action="delete-group"]')?.addEventListener('click', async () => {
    const ok = await confirmModal('Delete group', 'Delete this group? Contacts are not deleted.');
    if (!ok) return;
    try {
      await api.del(`/api/groups/${groupId}`);
      toast('Group deleted.');
      renderGroups(pageEl);
      refreshSidebarLists();
    } catch (err) { toast(err.message, 'error'); }
  });
}

function openGroupForm(existing, onSaved) {
  const g = existing || {};
  const content = `
    ${formGroup('Name', textInput('name', g.name))}
    ${formGroup('Icon', selectInput('icon', GROUP_ICONS, g.icon || 'users'))}
    ${formGroup('Color', `<input class="form-input" name="color" type="color" value="${esc(g.color || '#7c5bf5')}" style="height:38px;padding:4px">`)}
    ${formGroup('Description', textarea('description', g.description))}`;
  const html = modalShell('group-form', existing ? `Edit ${g.name}` : 'New group', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">${existing ? 'Save' : 'Create'}</button>`);
  openModal(html, {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const values = readForm(overlay.querySelector('.modal-content'));
        try {
          if (existing) await api.put(`/api/groups/${g.id}`, values);
          else await api.post('/api/groups', values);
          toast(existing ? 'Group saved.' : 'Group created.');
          close();
          onSaved?.();
          refreshSidebarLists();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// -------------------------------------------------------------- tag modal
async function openTagPicker(contactId, refresh) {
  const [tagsData, detail] = await Promise.all([
    api.get('/api/tags'),
    api.get(`/api/contacts/${contactId}`),
  ]);
  const allTags = tagsData.tags || [];
  const current = new Set((detail.tags || []).map((t) => t.id));

  const content = `
    <div class="flex gap-1 flex-wrap mb-3" id="tag-list">
      ${allTags.map((t) => `
        <button class="tag-pill clickable" data-tag-toggle="${t.id}" style="${current.has(t.id) ? 'background:var(--accent-subtle);border-color:var(--accent-border)' : ''}">
          <span class="dot" style="background:${esc(t.color || '#7c5bf5')}"></span>${esc(t.name)}
          ${current.has(t.id) ? icon('check') : ''}
        </button>`).join('')}
    </div>
    <div class="divider"></div>
    <div class="flex gap-2">
      <input class="form-input" id="new-tag-name" placeholder="New tag name">
      <input class="form-input" id="new-tag-color" type="color" value="#7c5bf5" style="width:52px;height:38px;padding:4px">
      <button class="btn btn-secondary" id="create-tag">Add</button>
    </div>`;

  openModal(modalShell('tag-picker', 'Tags', content, `<button class="btn btn-primary" data-action="close-modal">Done</button>`), {
    onMount: (overlay) => {
      overlay.querySelectorAll('[data-tag-toggle]').forEach((btn) =>
        btn.addEventListener('click', async () => {
          const tagId = Number(btn.dataset.tagToggle);
          try {
            if (current.has(tagId)) {
              await api.del(`/api/contacts/${contactId}/tags/${tagId}`);
              current.delete(tagId);
              btn.style.background = '';
              btn.style.borderColor = '';
              btn.querySelector('svg:last-child')?.remove();
            } else {
              await api.post(`/api/contacts/${contactId}/tags/${tagId}`);
              current.add(tagId);
              btn.style.background = 'var(--accent-subtle)';
              btn.style.borderColor = 'var(--accent-border)';
              btn.insertAdjacentHTML('beforeend', icon('check'));
            }
            refresh?.();
          } catch (err) { toast(err.message, 'error'); }
        })
      );
      overlay.querySelector('#create-tag').addEventListener('click', async () => {
        const name = overlay.querySelector('#new-tag-name').value.trim();
        const color = overlay.querySelector('#new-tag-color').value;
        if (!name) return;
        try {
          const res = await api.post('/api/tags', { name, color });
          await api.post(`/api/contacts/${contactId}/tags/${res.id}`);
          toast('Tag created.');
          overlay.querySelector('[data-action="close-modal"]').click();
          openTagPicker(contactId, refresh);
          refresh?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

pageRenderers.groups = renderGroups;
window.addEventListener('kith:add-tag', (e) => openTagPicker(e.detail.contactId, e.detail.refresh));
