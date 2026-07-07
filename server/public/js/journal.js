// Journal page — reverse-chron feed of timeline items, notes, and events
// across all contacts. GET /api/journal?page=&limit=. "New entry" posts a
// manual timeline entry via POST /api/timeline.

import { api, qs } from './api.js';
import { esc, initials, parseDate, timeAgo, debounce, toLocalInput, fromLocalInput } from './utils.js';
import { icon } from './icons.js';
import { emptyState, modalShell, formGroup, textInput, textarea, toast, openModal } from './components.js';
import { pageRenderers } from './pages.js';
import { isSpicyOn } from './app.js';

const LIMIT = 30;

const KIND_META = {
  note: { icon: 'sticky-note', label: 'Note', badge: 'blue' },
  event: { icon: 'calendar', label: 'Event', badge: '' },
  timeline: { icon: 'clock', label: 'Timeline', badge: 'neutral' },
};

function dayLabel(dstr) {
  const d = parseDate(dstr);
  if (!d) return 'Undated';
  const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const opts = { month: 'long', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString(undefined, opts);
}

function entryHtml(e) {
  const meta = KIND_META[e.kind] || KIND_META.timeline;
  const c = e.contact || {};
  const spicy = e.is_spicy && isSpicyOn();
  const snippet = (e.content || '').length > 240 ? `${e.content.slice(0, 240)}…` : (e.content || '');
  return `
  <div class="card card-compact journal-entry mb-2 ${spicy ? 'contact-row has-spicy-data' : ''}">
    <div class="flex items-start gap-3">
      <span class="av sm">${esc(initials(c.display_name))}${c.photo_url ? `<img src="${esc(c.photo_url)}" alt="">` : ''}</span>
      <div class="flex-1">
        <div class="flex items-center gap-2 flex-wrap">
          ${c.id ? `<a class="text-sm font-medium" href="#/contacts/${encodeURIComponent(c.id)}">${esc(c.display_name)}</a>` : `<span class="text-sm font-medium">${esc(c.display_name || 'Someone')}</span>`}
          <span class="badge ${meta.badge}">${icon(meta.icon)}${esc(e.type || meta.label)}</span>
          ${spicy ? `<span class="badge">${icon('flame')}</span>` : ''}
          <span class="text-micro text-muted" style="margin-left:auto">${esc(timeAgo(e.occurred_at))}</span>
        </div>
        ${e.title ? `<div class="text-sm font-medium mt-1">${esc(e.title)}</div>` : ''}
        ${snippet ? `<div class="text-sm text-secondary mt-1" style="overflow-wrap:anywhere">${esc(snippet)}</div>` : ''}
      </div>
    </div>
  </div>`;
}

function groupedHtml(entries) {
  let out = '';
  let lastLabel = null;
  for (const e of entries) {
    const label = dayLabel(e.occurred_at);
    if (label !== lastLabel) {
      out += `<div class="journal-day-label uppercase-label" style="padding:14px 2px 8px">${esc(label)}</div>`;
      lastLabel = label;
    }
    out += entryHtml(e);
  }
  return out;
}

// ------------------------------------------------------------ new entry
// POST /api/timeline { contact_id, type, title, description, is_spicy,
// occurred_at } — type is free-form VARCHAR (defaults to 'note' server-side);
// we send 'entry' for manual journal entries.
function openJournalEntryModal(onSaved) {
  const content = `
    <div class="form-group">
      <label class="form-label">Person</label>
      <div class="flex gap-1 flex-wrap mb-1" id="je-picked"></div>
      <div class="search-input-wrap">${icon('search')}<input class="form-input" id="je-search" placeholder="Type to find a person" autocomplete="off"></div>
      <div id="je-results"></div>
    </div>
    ${formGroup('Title (optional)', textInput('title', '', 'placeholder="A few words to remember it by"'))}
    ${formGroup('What happened?', textarea('description', '', 'placeholder="Write it down while it\u2019s fresh." style="min-height:90px"'))}
    ${formGroup('When', `<input class="form-input" name="occurred_at" type="datetime-local" value="${esc(toLocalInput(new Date()))}">`)}
    ${isSpicyOn() ? `
    <div class="toggle-row">
      <div><div class="toggle-label">Spicy entry</div><div class="toggle-desc">Only visible while spicy mode is on.</div></div>
      <button type="button" role="switch" aria-checked="false" class="toggle-switch" data-toggle="is_spicy"></button>
    </div>` : ''}`;

  openModal(modalShell('journal-entry', 'New journal entry', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Add entry</button>`), {
    onMount: (overlay, close) => {
      let picked = null; // { id, name }
      const pickedEl = overlay.querySelector('#je-picked');
      const renderPicked = () => {
        pickedEl.innerHTML = picked
          ? `<span class="tag-pill">${esc(picked.name)}<button class="tag-x" data-unpick aria-label="Remove">${icon('x')}</button></span>`
          : '';
        pickedEl.querySelector('[data-unpick]')?.addEventListener('click', () => { picked = null; renderPicked(); });
      };
      const searchInput = overlay.querySelector('#je-search');
      const resultsEl = overlay.querySelector('#je-results');
      searchInput.addEventListener('input', debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { resultsEl.innerHTML = ''; return; }
        let found;
        try { found = await api.get('/api/contacts' + qs({ search: q, limit: 6 })); } catch { return; }
        resultsEl.innerHTML = (found.contacts || [])
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

      const spicyToggle = overlay.querySelector('[data-toggle="is_spicy"]');
      spicyToggle?.addEventListener('click', () => {
        spicyToggle.classList.toggle('on');
        spicyToggle.setAttribute('aria-checked', spicyToggle.classList.contains('on') ? 'true' : 'false');
      });

      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const description = overlay.querySelector('[name="description"]').value.trim();
        if (!picked) { toast('Pick a person first.', 'error'); return; }
        if (!description) { toast('Write what happened first.', 'error'); return; }
        const saveBtn = overlay.querySelector('[data-action="save"]');
        saveBtn.disabled = true;
        try {
          await api.post('/api/timeline', {
            contact_id: picked.id,
            type: 'entry',
            title: overlay.querySelector('[name="title"]').value.trim() || null,
            description,
            occurred_at: fromLocalInput(overlay.querySelector('[name="occurred_at"]').value),
            is_spicy: Boolean(spicyToggle?.classList.contains('on')),
          });
          toast('Entry added.');
          close();
          onSaved?.();
        } catch (err) {
          saveBtn.disabled = false;
          toast(err.message, 'error');
        }
      });
    },
  });
}

async function renderJournalPage(el) {
  el.innerHTML = `
  <div class="page-inner" style="max-width:720px">
    <div class="page-header">
      <div>
        <h1 class="page-title">Journal</h1>
        <div class="page-subtitle">Your relationship diary — notes, timeline moments and completed events across everyone, newest first.</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" data-action="new-entry">${icon('plus')} New entry</button>
      </div>
    </div>
    <div id="journal-feed">${emptyState('clock', 'Loading…', 'Fetching your journal.')}</div>
    <div id="journal-footer" class="text-center mt-3"></div>
  </div>`;

  const feed = el.querySelector('#journal-feed');
  const footer = el.querySelector('#journal-footer');
  let page = 1;
  let total = 0;
  let loaded = 0;
  let all = [];

  const reload = () => {
    page = 1; total = 0; loaded = 0; all = [];
    feed.innerHTML = emptyState('clock', 'Loading…', 'Fetching your journal.');
    loadPage().catch((err) => {
      feed.innerHTML = emptyState('alert-circle', "Couldn't load the journal", err?.message || 'Try again shortly.');
      footer.innerHTML = '';
    });
  };

  el.querySelector('[data-action="new-entry"]').addEventListener('click', () => openJournalEntryModal(reload));

  const loadPage = async () => {
    const data = await api.get('/api/journal' + qs({ page, limit: LIMIT }));
    total = Number(data.total) || 0;
    const entries = data.entries || [];
    loaded += entries.length;
    all.push(...entries);
    if (all.length) {
      feed.innerHTML = groupedHtml(all);
    } else {
      feed.innerHTML = emptyState('book-open', 'Your journal is empty',
        'Notes, timeline moments, and completed events land here automatically — or write your first entry now.',
        `<button class="btn btn-primary" data-action="empty-new-entry">${icon('plus')} New entry</button>`);
      feed.querySelector('[data-action="empty-new-entry"]')?.addEventListener('click', () => openJournalEntryModal(reload));
    }
    footer.innerHTML = loaded < total && entries.length
      ? `<button class="btn btn-secondary" id="journal-more">${icon('chevron-down')} Load more</button>`
      : '';
    footer.querySelector('#journal-more')?.addEventListener('click', async () => {
      page += 1;
      footer.innerHTML = '<span class="text-sm text-muted">Loading…</span>';
      try { await loadPage(); } catch (err) {
        footer.innerHTML = `<span class="form-error">${esc(err?.message || 'Failed to load more.')}</span>`;
      }
    });
  };

  try {
    await loadPage();
  } catch (err) {
    feed.innerHTML = emptyState('alert-circle', "Couldn't load the journal", err?.message || 'Try again shortly.');
    footer.innerHTML = '';
  }
}

pageRenderers.journal = renderJournalPage;
