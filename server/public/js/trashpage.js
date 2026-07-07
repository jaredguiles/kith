// Trash page — soft-deleted people, events, and media with restore / purge.
// Linked from Settings and a small sidebar footer icon (not in main nav).

import { api } from './api.js';
import { esc, timeAgo, fmtDateTime } from './utils.js';
import { emptyState, confirmModal, toast, sectionHeader } from './components.js';
import { pageRenderers } from './pages.js';

const TYPE_LABEL = { contact: 'person', event: 'event', media: 'media item' };

function rowHtml(type, id, title, sub, deletedAt) {
  return `
  <div class="rec-leader rec-trash-row">
    <span class="rec-leader-left">
      <span class="rec-serif">${esc(title)}</span>
      ${sub ? ` <span class="rec-mono">· ${esc(sub)}</span>` : ''}
    </span>
    <span class="rec-dots"></span>
    <span class="rec-leader-right">
      <span class="rec-mono">deleted ${esc(timeAgo(deletedAt))}</span>
      <button class="rec-act" data-restore="${esc(type)}" data-id="${esc(String(id))}">Restore</button>
      <button class="rec-act rec-act-danger" data-purge="${esc(type)}" data-id="${esc(String(id))}" data-title="${esc(title)}">Delete forever</button>
    </span>
  </div>`;
}

function sectionHtml(index, title, rows) {
  return `
  <div class="rec-section">
    ${sectionHeader(index, title)}
    ${rows.join('')}
  </div>`;
}

async function renderTrashPage(el) {
  el.innerHTML = `
  <div class="page-inner" style="max-width:720px">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Trash</span></span>
    </div>
    <div class="rec-rule-strong"></div>
    <div class="rec-count-serif">Deleted items can be restored or removed for good.</div>
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
    html += sectionHtml('01', 'People', contacts.map((c) =>
      rowHtml('contact', c.id, c.display_name, '', c.deleted_at)));
  }
  if (events.length) {
    html += sectionHtml('02', 'Events', events.map((e) =>
      rowHtml('event', e.id, e.title, e.starts_at ? fmtDateTime(e.starts_at) : '', e.deleted_at)));
  }
  if (media.length) {
    html += sectionHtml('03', 'Media', media.map((m) =>
      rowHtml('media', m.id, m.caption || `Untitled ${m.type || 'media'}`, '', m.deleted_at)));
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
