// Journal page — reverse-chron feed of timeline items, notes, and events
// across all contacts. GET /api/journal?page=&limit=.

import { api, qs } from './api.js';
import { esc, initials, parseDate, timeAgo } from './utils.js';
import { icon } from './icons.js';
import { emptyState } from './components.js';
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

async function renderJournalPage(el) {
  el.innerHTML = `
  <div class="page-inner" style="max-width:720px">
    <div class="page-header">
      <div>
        <h1 class="page-title">Journal</h1>
        <div class="page-subtitle">Everything, in order</div>
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
  const all = [];

  const loadPage = async () => {
    const data = await api.get('/api/journal' + qs({ page, limit: LIMIT }));
    total = Number(data.total) || 0;
    const entries = data.entries || [];
    loaded += entries.length;
    all.push(...entries);
    feed.innerHTML = all.length
      ? groupedHtml(all)
      : emptyState('book-open', 'Nothing here yet', 'Notes, events, and timeline entries show up here as you add them.');
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
