// Trash page — soft-deleted people, events, and media with restore / purge.
// Linked from Settings and a small sidebar footer icon (not in main nav).

import { api } from './api.js';
import { esc, timeAgo, fmtDateTime } from './utils.js';
import { icon } from './icons.js';
import { emptyState, confirmModal, toast } from './components.js';
import { pageRenderers } from './pages.js';

const TYPE_LABEL = { contact: 'person', event: 'event', media: 'media item' };

function rowHtml(type, id, iconName, title, sub, deletedAt) {
  return `
  <div class="feed-item">
    <div class="feed-icon">${icon(iconName)}</div>
    <div class="feed-body">
      <div class="feed-title">${esc(title)}</div>
      ${sub ? `<div class="feed-desc">${esc(sub)}</div>` : ''}
      <div class="feed-meta">Deleted ${esc(timeAgo(deletedAt))}</div>
    </div>
    <div class="feed-actions">
      <button class="btn btn-secondary btn-sm" data-restore="${esc(type)}" data-id="${esc(String(id))}">${icon('rotate-ccw')} Restore</button>
      <button class="btn btn-danger btn-sm" data-purge="${esc(type)}" data-id="${esc(String(id))}" data-title="${esc(title)}">${icon('trash')} Delete forever</button>
    </div>
  </div>`;
}

function sectionHtml(title, rows) {
  return `
  <div class="card mb-4" style="padding:4px 16px">
    <div class="card-header" style="margin:12px 0 0"><span class="card-title">${esc(title)}</span></div>
    ${rows.join('')}
  </div>`;
}

async function renderTrashPage(el) {
  el.innerHTML = `
  <div class="page-inner" style="max-width:720px">
    <div class="page-header">
      <div>
        <h1 class="page-title">Trash</h1>
        <div class="page-subtitle">Deleted items can be restored or removed for good</div>
      </div>
    </div>
    <div id="trash-body">${emptyState('clock', 'Loading…', 'Fetching deleted items.')}</div>
  </div>`;

  const body = el.querySelector('#trash-body');
  let data;
  try {
    data = await api.get('/api/trash');
  } catch (err) {
    body.innerHTML = emptyState('alert-circle', "Couldn't load trash", err?.message || 'Try again shortly.');
    return;
  }

  const contacts = data.contacts || [];
  const events = data.events || [];
  const media = data.media || [];

  if (!contacts.length && !events.length && !media.length) {
    body.innerHTML = emptyState('trash', 'Trash is empty', 'Deleted people, events, and media land here.');
    return;
  }

  let html = '';
  if (contacts.length) {
    html += sectionHtml('People', contacts.map((c) =>
      rowHtml('contact', c.id, 'user', c.display_name, '', c.deleted_at)));
  }
  if (events.length) {
    html += sectionHtml('Events', events.map((e) =>
      rowHtml('event', e.id, 'calendar', e.title, e.starts_at ? fmtDateTime(e.starts_at) : '', e.deleted_at)));
  }
  if (media.length) {
    html += sectionHtml('Media', media.map((m) =>
      rowHtml('media', m.id, m.type === 'video' ? 'video' : 'image', m.caption || `Untitled ${m.type || 'media'}`, '', m.deleted_at)));
  }
  body.innerHTML = html;

  body.querySelectorAll('[data-restore]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await api.post('/api/trash/restore', { type: btn.dataset.restore, id: btn.dataset.id });
        toast('Restored.');
        renderTrashPage(el);
      } catch (err) {
        btn.disabled = false;
        toast(err.message || "Couldn't restore.", 'error');
      }
    }));

  body.querySelectorAll('[data-purge]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const label = TYPE_LABEL[btn.dataset.purge] || 'item';
      const ok = await confirmModal(
        'Delete forever?',
        `"${btn.dataset.title}" will be permanently deleted. This ${label} cannot be recovered.`,
        { confirmLabel: 'Delete forever' }
      );
      if (!ok) return;
      btn.disabled = true;
      try {
        await api.del('/api/trash/purge', { type: btn.dataset.purge, id: btn.dataset.id });
        toast('Deleted forever.');
        renderTrashPage(el);
      } catch (err) {
        btn.disabled = false;
        toast(err.message || "Couldn't delete.", 'error');
      }
    }));
}

pageRenderers.trash = renderTrashPage;
