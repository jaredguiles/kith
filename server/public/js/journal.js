// Journal page — the user's personal diary. GET/POST/PUT/DELETE /api/journal.
// Entries are the user's own (not per-contact): free-form entries,
// reflections, travels (pinned on the Timeline map), dreams and memories,
// optionally linked to an event.

import { api, qs } from './api.js';
import { esc, parseDate, timeAgo, toLocalInput, fromLocalInput } from './utils.js';
import { icon } from './icons.js';
import {
  emptyState, modalShell, formGroup, textInput, textarea, selectInput,
  toast, openModal, confirmModal, filterPills,
} from './components.js';
import { pageRenderers } from './pages.js';
import { isSpicyOn } from './app.js';

const LIMIT = 30;

export const JOURNAL_KIND_META = {
  entry: { icon: 'book-open', label: 'Entry' },
  reflection: { icon: 'moon', label: 'Reflection' },
  travel: { icon: 'plane', label: 'Travel' },
  dream: { icon: 'moon', label: 'Dream' },
  memory: { icon: 'history', label: 'Memory' },
};

const KIND_FILTERS = [
  { value: '', label: 'All' },
  { value: 'entry', label: 'Entries' },
  { value: 'reflection', label: 'Reflections' },
  { value: 'travel', label: 'Travel' },
  { value: 'dream', label: 'Dreams' },
  { value: 'memory', label: 'Memories' },
];

export function dayLabel(dstr) {
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

export function timeOfDay(dstr) {
  const d = parseDate(dstr);
  return d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : timeAgo(dstr);
}

function entryHtml(e) {
  const meta = JOURNAL_KIND_META[e.kind] || JOURNAL_KIND_META.entry;
  const spicy = e.is_spicy && isSpicyOn();
  const text = e.content || '';
  const snippet = text.length > 280 ? `${text.slice(0, 280)}…` : text;
  return `
  <div class="rec-log-row journal-entry ${spicy ? 'has-spicy-data' : ''}" data-entry-id="${Number(e.id)}">
    <span class="rec-log-when" title="${esc(timeAgo(e.occurred_at))}">${esc(timeOfDay(e.occurred_at))}</span>
    <span class="rec-log-body">
      <span class="jt-kind-chip jt-kind-${esc(e.kind)}">${icon(meta.icon)}${esc(meta.label)}${spicy ? ' · private' : ''}</span>
      ${e.title ? `<div class="rec-log-entry">${esc(e.title)}</div>` : ''}
      ${snippet ? `<div class="rec-log-what">${esc(snippet)}</div>` : ''}
      <div class="jt-meta-row">
        ${e.location ? `<span class="jt-meta">${icon('map-pin')}${esc(e.location)}</span>` : ''}
        ${e.event ? `<span class="jt-meta">${icon('calendar')}${esc(e.event.title)}</span>` : ''}
      </div>
    </span>
    <span class="jt-row-actions">
      <button class="rec-act" data-action="edit-entry" data-id="${Number(e.id)}">Edit</button>
      <button class="rec-act rec-act-danger" data-action="delete-entry" data-id="${Number(e.id)}">Delete</button>
    </span>
  </div>`;
}

function groupedHtml(entries) {
  let out = '';
  let lastLabel = null;
  for (const e of entries) {
    const label = dayLabel(e.occurred_at);
    if (label !== lastLabel) {
      out += `<div class="rec-section-head rec-journal-day"><span class="rec-label journal-day-label">${esc(label)}</span><span class="rec-fill"></span></div>`;
      lastLabel = label;
    }
    out += entryHtml(e);
  }
  return out;
}

// -------------------------------------------------------- new/edit modal
// The events list endpoint has no search/limit params, so we load the
// user's events once and offer the 10 most recent in a plain <select>.
async function recentEventOptions(currentEvent) {
  let events = [];
  try {
    events = (await api.get('/api/events')).events || [];
  } catch { /* events are optional decoration — the select just stays short */ }
  events.sort((a, b) => String(b.starts_at || '').localeCompare(String(a.starts_at || '')));
  let recent = events.slice(0, 10);
  if (currentEvent && !recent.some((ev) => ev.id === currentEvent.id)) {
    recent = [{ id: currentEvent.id, title: currentEvent.title, starts_at: null }, ...recent];
  }
  return [
    { value: '', label: '— None —' },
    ...recent.map((ev) => ({
      value: String(ev.id),
      label: `${ev.title}${ev.starts_at ? ` (${String(ev.starts_at).slice(0, 10)})` : ''}`,
    })),
  ];
}

// `entry` = existing entry for edit mode, or null for a fresh one.
export function openJournalEntryModal(entry, onSaved) {
  const isEdit = Boolean(entry?.id);
  const kindOptions = Object.entries(JOURNAL_KIND_META).map(([value, m]) => ({ value, label: m.label }));
  const occurred = entry?.occurred_at ? parseDate(entry.occurred_at) : new Date();

  const content = `
    ${formGroup('Kind', selectInput('kind', kindOptions, entry?.kind || 'entry'))}
    ${formGroup('Title (optional)', textInput('title', entry?.title || '', 'placeholder="A few words to remember it by"'))}
    ${formGroup('What happened?', textarea('content', entry?.content || '', 'placeholder="Write it down while it\u2019s fresh." style="min-height:110px"'))}
    ${formGroup('Location (optional)', textInput('location', entry?.location || '', 'placeholder="City, State" autocomplete="off"'),
      'City, State — travels get pinned on your Timeline map')}
    ${formGroup('Link an event (optional)', `<select class="form-select" name="event_id"><option value="">— None —</option></select>`)}
    ${formGroup('When', `<input class="form-input" name="occurred_at" type="datetime-local" value="${esc(toLocalInput(occurred || new Date()))}">`)}
    ${isSpicyOn() ? `
    <div class="toggle-row">
      <div><div class="toggle-label">Spicy entry</div><div class="toggle-desc">Only visible while spicy mode is on.</div></div>
      <button type="button" role="switch" aria-checked="${entry?.is_spicy ? 'true' : 'false'}" class="toggle-switch ${entry?.is_spicy ? 'on' : ''}" data-toggle="is_spicy"></button>
    </div>` : ''}`;

  openModal(modalShell('journal-entry', isEdit ? 'Edit entry' : 'New journal entry', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">${isEdit ? 'Save' : 'Add entry'}</button>`), {
    onMount: (overlay, close) => {
      // populate the event select asynchronously
      const eventSelect = overlay.querySelector('[name="event_id"]');
      recentEventOptions(entry?.event || null).then((opts) => {
        if (!eventSelect.isConnected) return;
        eventSelect.innerHTML = opts
          .map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(entry?.event_id ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`)
          .join('');
      });

      const spicyToggle = overlay.querySelector('[data-toggle="is_spicy"]');
      spicyToggle?.addEventListener('click', () => {
        spicyToggle.classList.toggle('on');
        spicyToggle.setAttribute('aria-checked', spicyToggle.classList.contains('on') ? 'true' : 'false');
      });

      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const kind = overlay.querySelector('[name="kind"]').value;
        const contentVal = overlay.querySelector('[name="content"]').value.trim();
        const locationVal = overlay.querySelector('[name="location"]').value.trim();
        if (!contentVal && !(kind === 'travel' && locationVal)) {
          toast(kind === 'travel' ? 'Write something or add a location.' : 'Write something first.', 'error');
          return;
        }
        const saveBtn = overlay.querySelector('[data-action="save"]');
        saveBtn.disabled = true;
        const body = {
          kind,
          title: overlay.querySelector('[name="title"]').value.trim() || null,
          content: contentVal || null,
          location: locationVal || null,
          event_id: eventSelect.value ? Number(eventSelect.value) : null,
          occurred_at: fromLocalInput(overlay.querySelector('[name="occurred_at"]').value),
          is_spicy: Boolean(spicyToggle?.classList.contains('on')),
        };
        try {
          if (isEdit) await api.put(`/api/journal/${encodeURIComponent(entry.id)}`, body);
          else await api.post('/api/journal', body);
          toast(isEdit ? 'Entry saved.' : 'Entry added.');
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

// ------------------------------------------------------------------ page
async function renderJournalPage(el) {
  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Journal</span></span>
      <span class="rec-actions">
        <button class="rec-act rec-act-primary" data-action="new-entry">+ New entry</button>
      </span>
    </div>
    <div class="rec-rule-strong"></div>
    <div class="rec-count-serif">Your private diary — entries, reflections, travels.</div>
    <div class="jt-filters">${filterPills(KIND_FILTERS, '', 'kind')}</div>
    <div id="journal-feed">${emptyState('book-open', 'Loading…', 'Fetching your journal.')}</div>
    <div id="journal-footer" class="text-center mt-3"></div>
  </div>`;

  const feed = el.querySelector('#journal-feed');
  const footer = el.querySelector('#journal-footer');
  let page = 1;
  let total = 0;
  let kind = '';
  let all = [];
  const byId = new Map();

  const reload = () => {
    page = 1; total = 0; all = []; byId.clear();
    feed.innerHTML = emptyState('book-open', 'Loading…', 'Fetching your journal.');
    loadPage().catch((err) => {
      feed.innerHTML = emptyState('alert-circle', "Couldn't load the journal", err?.message || 'Try again shortly.');
      footer.innerHTML = '';
    });
  };

  el.querySelector('[data-action="new-entry"]').addEventListener('click', () => openJournalEntryModal(null, reload));

  el.querySelectorAll('[data-kind]').forEach((pill) =>
    pill.addEventListener('click', () => {
      kind = pill.dataset.kind;
      el.querySelectorAll('[data-kind]').forEach((p) => p.classList.toggle('active', p === pill));
      reload();
    }));

  const wireRows = () => {
    feed.querySelectorAll('[data-action="edit-entry"]').forEach((b) =>
      b.addEventListener('click', () => {
        const entry = byId.get(Number(b.dataset.id));
        if (entry) openJournalEntryModal(entry, reload);
      }));
    feed.querySelectorAll('[data-action="delete-entry"]').forEach((b) =>
      b.addEventListener('click', async () => {
        const ok = await confirmModal('Delete entry?', 'This journal entry will be removed from your diary.');
        if (!ok) return;
        try {
          await api.del(`/api/journal/${encodeURIComponent(b.dataset.id)}`);
          toast('Entry deleted.');
          reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      }));
  };

  const loadPage = async () => {
    const data = await api.get('/api/journal' + qs({ page, limit: LIMIT, kind }));
    total = Number(data.total) || 0;
    const entries = data.entries || [];
    for (const e of entries) byId.set(Number(e.id), e);
    all.push(...entries);
    if (all.length) {
      feed.innerHTML = groupedHtml(all);
      wireRows();
    } else {
      feed.innerHTML = emptyState('book-open', kind ? 'Nothing here yet' : 'Your journal is empty',
        kind ? 'No entries of this kind yet — write one now.'
             : 'Write your first entry — a thought, a trip, a dream worth keeping.',
        `<button class="btn btn-primary" data-action="empty-new-entry">${icon('plus')} New entry</button>`);
      feed.querySelector('[data-action="empty-new-entry"]')?.addEventListener('click', () => openJournalEntryModal(null, reload));
    }
    footer.innerHTML = all.length < total && entries.length
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
