// Events page + timeline/notes/reminders UI. Enriches the contact detail page
// via the kith:contact-detail-rendered event.

import { api, qs } from './api.js';
import { esc, fmtDate, fmtDateTime, timeAgo, initials, parseDate, toLocalInput, fromLocalInput, debounce } from './utils.js';
import { icon } from './icons.js';
import {
  emptyState, modalShell, formGroup, textInput, selectInput, textarea, starRating,
  toast, openModal, confirmModal, readForm, filterPills, feedItem, avatar,
} from './components.js';
import { pageRenderers } from './pages.js';
import { state, isSpicyOn } from './app.js';

const EVENT_TYPES = ['meetup', 'date', 'hangout', 'hookup', 'party', 'trip', 'call', 'dinner', 'coffee', 'workout', 'other'];
const TYPE_ICONS = {
  meetup: 'users', date: 'heart', hangout: 'coffee', hookup: 'flame', party: 'party-popper',
  trip: 'plane', call: 'phone-call', dinner: 'utensils', coffee: 'coffee', workout: 'dumbbell', other: 'calendar',
};

const evState = { filter: 'upcoming', type: '' };

// -------------------------------------------------------------- events page
async function renderEvents(el) {
  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Events</span></span>
      <span class="rec-actions">
        <button class="rec-act rec-act-primary" data-action="new-event">+ New event</button>
      </span>
    </div>
    <div class="rec-rule-strong"></div>
    <div class="rec-count-serif" id="events-count"></div>
    <div class="toolbar">
      <span id="events-pills"></span>
      <span class="popover-wrap" id="type-filter-wrap"></span>
      <span class="spacer"></span>
    </div>
    <div id="events-list"></div>
  </div>`;

  el.querySelector('[data-action="new-event"]').addEventListener('click', () => openEventForm(null, () => renderEvents(el)));
  renderEventFilters(el);
  await loadEvents(el);
}

function renderEventFilters(el) {
  const pillsEl = el.querySelector('#events-pills');
  pillsEl.innerHTML = filterPills(
    [{ value: 'upcoming', label: 'Upcoming' }, { value: 'past', label: 'Past' }, { value: 'all', label: 'All' }],
    evState.filter
  );
  pillsEl.querySelectorAll('.filter-pill').forEach((p) =>
    p.addEventListener('click', () => { evState.filter = p.dataset.filter; renderEventFilters(el); loadEvents(el); })
  );

  const wrap = el.querySelector('#type-filter-wrap');
  wrap.innerHTML = `<button class="btn btn-secondary btn-sm" id="type-btn">${icon('tag')} ${evState.type ? `Type: ${esc(evState.type)}` : 'Type'} ${icon('chevron-down')}</button>`;
  wrap.querySelector('#type-btn').addEventListener('click', () => {
    const existing = wrap.querySelector('.popover');
    if (existing) { existing.remove(); return; }
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.innerHTML = `
      <button class="popover-item ${!evState.type ? 'selected' : ''}" data-type="">${icon('x')} All types</button>
      ${EVENT_TYPES.map((t) => `<button class="popover-item ${evState.type === t ? 'selected' : ''}" data-type="${t}">${icon(TYPE_ICONS[t])}<span class="capitalize">${esc(t)}</span></button>`).join('')}`;
    wrap.appendChild(pop);
    const closePop = (e) => { if (!wrap.contains(e.target)) { pop.remove(); document.removeEventListener('click', closePop); } };
    setTimeout(() => document.addEventListener('click', closePop), 0);
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-type]');
      if (!b) return;
      evState.type = b.dataset.type;
      pop.remove();
      renderEventFilters(el);
      loadEvents(el);
    });
  });
}

async function loadEvents(el) {
  const listEl = el.querySelector('#events-list');
  const params = { type: evState.type || undefined };
  if (evState.filter === 'upcoming') params.upcoming = 1;
  if (evState.filter === 'past') params.past = 1;
  let data;
  try {
    data = await api.get('/api/events' + qs(params));
  } catch (err) {
    el.querySelector('#events-count').textContent = '';
    listEl.innerHTML = emptyState('alert-circle', "Couldn't load events", err?.message || 'Check your connection and try again.');
    return;
  }
  const events = data.events || [];
  el.querySelector('#events-count').textContent = `${events.length} ${events.length === 1 ? 'event' : 'events'}`;

  if (!events.length) {
    listEl.innerHTML = emptyState('calendar', 'No events', 'Plan something with someone you like.',
      `<button class="btn btn-primary" data-action="empty-new">${icon('plus')} New event</button>`);
    listEl.querySelector('[data-action="empty-new"]')?.addEventListener('click', () => openEventForm(null, () => renderEvents(el)));
    return;
  }

  listEl.innerHTML = `<div class="rec-ev-list">${events.map((ev) => eventCard(ev)).join('')}</div>`;
  listEl.querySelectorAll('[data-event-id]').forEach((card) =>
    card.addEventListener('click', () => openEventDetail(Number(card.dataset.eventId), () => loadEvents(el)))
  );
}

function eventCard(ev) {
  const statusTag = ev.status === 'completed'
    ? '<span class="badge green">Completed</span>'
    : ev.status === 'cancelled'
      ? '<span class="badge neutral">Cancelled</span>'
      : '<span class="badge blue">Upcoming</span>';
  const d = parseDate(ev.starts_at);
  const day = d ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '';
  const year = d ? String(d.getFullYear()) : '';
  const hour = d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  return `
  <div class="rec-ev-row rec-ev-row-page clickable ${ev.is_spicy && isSpicyOn() ? 'contact-row has-spicy-data' : ''}" data-event-id="${ev.id}">
    <div class="rec-ev-when"><div class="rec-ev-day">${esc(day)} · ${esc(year)}</div><div class="rec-ev-hour">${esc(hour)}</div></div>
    <div class="rec-ev-body">
      <div class="rec-ev-title">${esc(ev.title)}</div>
      <div class="rec-ev-where">${esc(ev.type || 'event')}${ev.location ? ` · ${esc(ev.location)}` : ''}</div>
      ${(ev.contacts || []).length ? `<div class="rec-ev-with">${(ev.contacts || []).slice(0, 5).map((c) => esc(c.display_name)).join(' · ')}</div>` : ''}
    </div>
    <div class="rec-ev-side">
      ${statusTag}
      ${ev.rating ? `<span class="rec-squares">${starRating(ev.rating)}</span>` : ''}
    </div>
  </div>`;
}

// --------------------------------------------------------- event detail
async function openEventDetail(id, onChanged) {
  let data;
  try {
    data = await api.get(`/api/events/${id}`);
  } catch (err) {
    toast(err?.message || "Couldn't open this event.", 'error');
    return;
  }
  const ev = data.event;
  const contacts = data.contacts || [];

  const content = `
    <div class="flex items-center gap-3 mb-3">
      <span class="feed-icon">${icon(TYPE_ICONS[ev.type] || 'calendar')}</span>
      <div>
        <div class="text-sm text-secondary capitalize">${esc(ev.type || 'event')} · ${esc(ev.status)}</div>
        <div class="text-sm text-secondary">${esc(fmtDateTime(ev.starts_at))}${ev.ends_at ? ` → ${esc(fmtDateTime(ev.ends_at))}` : ''}</div>
        ${ev.location ? `<div class="text-sm text-secondary">${icon('map-pin')} ${esc(ev.location)}</div>` : ''}
      </div>
    </div>
    ${ev.description ? `<p class="text-sm mb-3">${esc(ev.description)}</p>` : ''}
    ${contacts.length ? `
      <div class="uppercase-label mb-1">With</div>
      <div class="flex gap-2 flex-wrap mb-3">
        ${contacts.map((c) => `<a class="group-badge" href="#/contacts/${c.id}" style="text-decoration:none">${esc(c.display_name)}</a>`).join('')}
      </div>` : ''}
    ${ev.status === 'completed' && (ev.followup_notes || ev.rating) ? `
      <div class="uppercase-label mb-1">Follow-up</div>
      ${ev.rating ? `<div class="mb-1">${starRating(ev.rating)}</div>` : ''}
      ${ev.followup_notes ? `<p class="text-sm">${esc(ev.followup_notes)}</p>` : ''}` : ''}`;

  const footer = `
    <button class="btn btn-danger" data-action="delete-event">Delete</button>
    <span style="flex:1"></span>
    ${ev.status === 'upcoming' ? `<button class="btn btn-secondary" data-action="complete-event">Complete</button>` : ''}
    <button class="btn btn-primary" data-action="edit-event">Edit</button>`;

  openModal(modalShell('event-detail', ev.title, content, footer, { size: 'modal-lg' }), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="delete-event"]').addEventListener('click', async () => {
        close();
        const ok = await confirmModal('Delete event', `Delete "${ev.title}"? This can't be undone.`);
        if (!ok) return;
        try {
          await api.del(`/api/events/${ev.id}`);
          toast('Event deleted.');
          onChanged?.();
        } catch (err) { toast(err.message, 'error'); }
      });
      overlay.querySelector('[data-action="edit-event"]').addEventListener('click', () => {
        close();
        openEventForm({ ...ev, contacts }, onChanged);
      });
      overlay.querySelector('[data-action="complete-event"]')?.addEventListener('click', () => {
        close();
        openCompleteForm(ev, onChanged);
      });
    },
  });
}

function openCompleteForm(ev, onChanged) {
  const content = `
    ${formGroup('How did it go?', textarea('followup_notes', ''))}
    <div class="form-group"><label class="form-label">Rating</label>${starRating(0, { interactive: true })}</div>`;
  openModal(modalShell('complete-event', `Complete — ${ev.title}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Save</button>`), {
    onMount: (overlay, close) => {
      let rating = 0;
      overlay.querySelectorAll('.star-rating.interactive .star').forEach((s) =>
        s.addEventListener('click', () => {
          rating = Number(s.dataset.star) === rating ? 0 : Number(s.dataset.star);
          overlay.querySelectorAll('.star-rating.interactive .star').forEach((st) =>
            st.classList.toggle('filled', Number(st.dataset.star) <= rating));
        }));
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        try {
          await api.post(`/api/events/${ev.id}/complete`, {
            followup_notes: overlay.querySelector('[name="followup_notes"]').value || null,
            rating: rating || null,
          });
          toast('Event completed.');
          close();
          onChanged?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ------------------------------------------------------------ event form
export function openEventForm(existing, onSaved, presetContact = null) {
  const ev = existing || {};
  const linked = new Map((ev.contacts || []).map((c) => [c.id, c.display_name]));
  if (presetContact) linked.set(presetContact.id, presetContact.display_name);

  const content = `
    ${formGroup('Title', textInput('title', ev.title))}
    <div class="form-row">
      ${formGroup('Type', selectInput('type', EVENT_TYPES, ev.type || 'meetup'))}
      ${formGroup('Status', selectInput('status', ['upcoming', 'completed', 'cancelled'], ev.status || 'upcoming'))}
    </div>
    <div class="form-row">
      ${formGroup('Starts', `<input class="form-input" name="starts_at" type="datetime-local" value="${esc(toLocalInput(ev.starts_at))}" required>`)}
      ${formGroup('Ends (optional)', `<input class="form-input" name="ends_at" type="datetime-local" value="${esc(toLocalInput(ev.ends_at))}">`)}
    </div>
    ${formGroup('Location', textInput('location', ev.location))}
    ${formGroup('Description', textarea('description', ev.description))}
    <div class="form-group">
      <label class="form-label">People</label>
      <div class="flex gap-1 flex-wrap mb-1" id="linked-contacts"></div>
      <div class="search-input-wrap">${icon('search')}<input class="form-input" id="contact-search" placeholder="Type to add people" autocomplete="off"></div>
      <div id="contact-results"></div>
    </div>
    ${isSpicyOn() ? `
    <div class="toggle-row">
      <div class="toggle-label">Spicy event</div>
      <button type="button" role="switch" aria-checked="${ev.is_spicy ? 'true' : 'false'}" class="toggle-switch ${ev.is_spicy ? 'on' : ''}" data-toggle="is_spicy"></button>
    </div>` : ''}`;

  openModal(modalShell('event-form', existing ? `Edit ${ev.title}` : 'New event', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">${existing ? 'Save' : 'Create'}</button>`,
    { size: 'modal-lg' }), {
    onMount: (overlay, close) => {
      const renderLinked = () => {
        overlay.querySelector('#linked-contacts').innerHTML = [...linked.entries()]
          .map(([id, name]) => `<span class="tag-pill">${esc(name)}<button class="tag-x" data-unlink="${id}" aria-label="Remove">${icon('x')}</button></span>`)
          .join('') || '<span class="text-sm text-muted">No one linked yet.</span>';
        overlay.querySelectorAll('[data-unlink]').forEach((b) =>
          b.addEventListener('click', () => { linked.delete(Number(b.dataset.unlink)); renderLinked(); }));
      };
      renderLinked();

      const searchInput = overlay.querySelector('#contact-search');
      const resultsEl = overlay.querySelector('#contact-results');
      searchInput.addEventListener('input', debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { resultsEl.innerHTML = ''; return; }
        const found = await api.get('/api/contacts' + qs({ search: q, limit: 6 }));
        resultsEl.innerHTML = (found.contacts || [])
          .filter((c) => !linked.has(c.id))
          .map((c) => `<button class="popover-item w-full" data-link="${c.id}" data-name="${esc(c.display_name)}"><span class="av sm" style="width:22px;height:22px;font-size:9px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}</button>`)
          .join('');
        resultsEl.querySelectorAll('[data-link]').forEach((b) =>
          b.addEventListener('click', () => {
            linked.set(Number(b.dataset.link), b.dataset.name);
            searchInput.value = '';
            resultsEl.innerHTML = '';
            renderLinked();
          }));
      }, 250));

      overlay.querySelectorAll('[data-toggle]').forEach((t) =>
        t.addEventListener('click', () => {
          t.classList.toggle('on');
          t.setAttribute('aria-checked', t.classList.contains('on') ? 'true' : 'false');
        }));

      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const values = readForm(overlay.querySelector('.modal-content'));
        delete values.undefined;
        const startsRaw = overlay.querySelector('[name="starts_at"]').value;
        if (!startsRaw) { toast('Start date is required', 'error'); return; }
        values.starts_at = fromLocalInput(startsRaw);
        values.ends_at = fromLocalInput(overlay.querySelector('[name="ends_at"]').value);
        values.contact_ids = [...linked.keys()];
        const spicyToggle = overlay.querySelector('[data-toggle="is_spicy"]');
        if (spicyToggle) values.is_spicy = spicyToggle.classList.contains('on');
        try {
          if (existing) await api.put(`/api/events/${ev.id}`, values);
          else await api.post('/api/events', values);
          toast(existing ? 'Event saved.' : 'Event created.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// -------------------------------------------- contact detail enrichment
const TL_ICONS = {
  note: 'sticky-note', event: 'calendar', message_batch: 'message-circle',
  import: 'import', call: 'phone-call', meetup: 'users', hangout: 'coffee',
  date: 'heart', hookup: 'flame',
};

async function renderContactTimeline(container, contact, canEdit, refresh) {
  let data;
  try {
    data = await api.get(`/api/timeline?contact_id=${contact.id}`);
  } catch {
    container.innerHTML = '<div class="text-sm text-muted">Timeline unavailable.</div>';
    return;
  }
  const items = data.timeline || [];

  container.innerHTML = `
    ${canEdit ? `
    <div class="flex gap-2 mb-3">
      <input class="form-input flex-1" id="quick-note" placeholder="Add a note" autocomplete="off">
      ${isSpicyOn() ? `<button type="button" class="btn-flame" id="note-spicy" aria-label="Spicy note" aria-pressed="false">${icon('lock')}<span class="conf-label">private</span></button>` : ''}
      <button class="btn btn-secondary" id="add-note">Add</button>
      <button class="btn btn-secondary" id="add-event-here">${icon('calendar')} Event</button>
    </div>` : ''}
    <div id="tl-items">
      ${items.length ? items.map((it) => {
        const kind = String(it.kind === 'timeline' ? (it.type || 'entry') : it.kind);
        return `
        <div class="rec-log-row">
          <span class="rec-log-when">${esc(fmtDate(it.at))}</span>
          <span class="rec-log-body">
            <span class="rec-log-kind">${esc(kind)}${it.is_spicy && isSpicyOn() ? ' · private' : ''}</span>
            <div class="rec-log-entry">${esc(it.title || (it.kind === 'note' ? 'Note' : it.type || 'Entry'))}</div>
            ${it.description ? `<div class="rec-log-what">${esc(it.description)}</div>` : ''}
          </span>
          ${(canEdit && (it.kind === 'timeline' || it.kind === 'note'))
            ? `<button class="btn btn-icon" data-del-tl="${esc(it.kind)}:${Number(it.id)}" aria-label="Delete">${icon('x')}</button>` : ''}
        </div>`;
      }).join('') : '<div class="text-sm text-muted">Nothing here yet. Notes and events will appear in time order.</div>'}
    </div>`;

  if (canEdit) {
    const noteInput = container.querySelector('#quick-note');
    const spicyBtn = container.querySelector('#note-spicy');
    let noteSpicy = false;
    spicyBtn?.addEventListener('click', () => {
      noteSpicy = !noteSpicy;
      spicyBtn.classList.toggle('active', noteSpicy);
      spicyBtn.setAttribute('aria-pressed', noteSpicy ? 'true' : 'false');
    });
    const addNote = async () => {
      const content = noteInput.value.trim();
      if (!content) return;
      try {
        await api.post('/api/notes', { contact_id: contact.id, content, is_spicy: noteSpicy });
        toast('Note added.');
        renderContactTimeline(container, contact, canEdit, refresh);
      } catch (err) { toast(err.message, 'error'); }
    };
    container.querySelector('#add-note')?.addEventListener('click', addNote);
    noteInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addNote(); });
    container.querySelector('#add-event-here')?.addEventListener('click', () =>
      openEventForm(null, () => renderContactTimeline(container, contact, canEdit, refresh), contact));

    container.querySelectorAll('[data-del-tl]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const [kind, id] = btn.dataset.delTl.split(':');
        try {
          await api.del(kind === 'note' ? `/api/notes/${id}` : `/api/timeline/${id}`);
          renderContactTimeline(container, contact, canEdit, refresh);
        } catch (err) { toast(err.message, 'error'); }
      }));
  }
}

window.addEventListener('kith:contact-detail-rendered', (e) => {
  const { el, contact, canEdit, share_scope } = e.detail;
  if (share_scope === 'basic') return;
  const tlEl = el.querySelector('#contact-timeline');
  if (tlEl) renderContactTimeline(tlEl, contact, canEdit, e.detail.refresh);
});

// ------------------------------------------------------------- reminders
const RECUR_OPTIONS = [
  { value: '', label: 'Never' }, { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

/** Small "repeats" badge for reminder rows (dashboard + lists). */
export function recurBadge(reminder) {
  if (!reminder?.recur_rule) return '';
  return `<span class="badge neutral" title="Repeats ${esc(reminder.recur_rule)}">${icon('refresh')} ${esc(reminder.recur_rule)}</span>`;
}

export function openReminderForm(presetContact = null, onSaved = null) {
  const content = `
    ${formGroup('Title', textInput('title'))}
    ${formGroup('Due', `<input class="form-input" name="due_at" type="datetime-local">`)}
    <div class="form-row">
      ${formGroup('Repeat', selectInput('recur_rule', RECUR_OPTIONS, '', 'id="reminder-recur"'))}
      <div class="form-group hidden" id="recur-until-group">
        <label class="form-label">Until (optional)</label>
        <input class="form-input" name="recur_until" type="date">
      </div>
    </div>
    ${formGroup('Details', textarea('description'))}
    ${presetContact ? `<div class="text-sm text-secondary">Linked to ${esc(presetContact.display_name)}</div>` : ''}`;
  openModal(modalShell('reminder-form', 'New reminder', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Create</button>`), {
    onMount: (overlay, close) => {
      const recurSel = overlay.querySelector('#reminder-recur');
      const untilGroup = overlay.querySelector('#recur-until-group');
      recurSel.addEventListener('change', () => {
        untilGroup.classList.toggle('hidden', !recurSel.value);
      });
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        try {
          await api.post('/api/reminders', {
            title: overlay.querySelector('[name="title"]').value,
            due_at: fromLocalInput(overlay.querySelector('[name="due_at"]').value),
            description: overlay.querySelector('[name="description"]').value || null,
            recur_rule: recurSel.value || null,
            recur_until: (recurSel.value && overlay.querySelector('[name="recur_until"]').value) || null,
            contact_id: presetContact?.id || null,
          });
          toast('Reminder created.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

pageRenderers.events = renderEvents;
