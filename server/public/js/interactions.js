// One-tap interaction logging + interaction log rows + the MESSAGES section.
// Enriches the contact detail page via the kith:contact-detail-rendered event
// (same pattern as events.js). No inline handlers; every value passes esc().

import { api } from './api.js';
import { esc, fmtDate, timeAgo, toLocalInput, fromLocalInput } from './utils.js';
import { icon } from './icons.js';
import {
  toast, openModal, modalShell, formGroup, textInput, selectInput, textarea, readForm,
  confirmModal,
} from './components.js';
import { isSpicyOn } from './app.js';

// ---------------------------------------------------------------- config
// Quick-log button bar: label + past-tense verb for the toast.
const QUICK_TYPES = [
  { type: 'call', label: 'Call', verb: 'called' },
  { type: 'text', label: 'Text', verb: 'texted' },
  { type: 'met', label: 'Met', verb: 'met with' },
  { type: 'email', label: 'Email', verb: 'emailed' },
  { type: 'video', label: 'Video', verb: 'had a video call with' },
  { type: 'gift', label: 'Gift', verb: 'gave a gift to' },
];
// Full type list (matches backend INTERACTION_TYPES) for the "more" modal.
const ALL_TYPES = [
  { value: 'call', label: 'Call' }, { value: 'text', label: 'Text' },
  { value: 'met', label: 'Met' }, { value: 'email', label: 'Email' },
  { value: 'video', label: 'Video' }, { value: 'gift', label: 'Gift' },
  { value: 'social', label: 'Social' }, { value: 'other', label: 'Other' },
];
const TYPE_VERB = Object.fromEntries(QUICK_TYPES.map((t) => [t.type, t.verb]));
const PLATFORMS = ['Instagram', 'Facebook', 'WhatsApp', 'iMessage', 'SMS', 'Signal', 'Telegram', 'Email', 'Other'];

const firstName = (contact) => (contact.display_name || '').trim().split(/\s+/)[0] || 'them';

// ------------------------------------------------ one-tap interaction bar
function renderQuickLogBar(container, contact, refresh) {
  container.innerHTML = `
    <span class="rec-quicklog-label">Log</span>
    ${QUICK_TYPES.map((t) =>
      `<button type="button" class="rec-quicklog-btn" data-log-type="${esc(t.type)}" aria-label="Log ${esc(t.label.toLowerCase())} with ${esc(contact.display_name)}">${esc(t.label)}</button>`
    ).join('')}
    <button type="button" class="rec-quicklog-btn rec-quicklog-more" data-log-more aria-label="Log interaction with a note or a past date">…</button>`;

  let logging = false; // in-flight guard: double-tap must not log twice
  const logType = async (type, btn) => {
    if (logging) return;
    logging = true;
    if (btn) btn.disabled = true;
    try {
      await api.post(`/api/contacts/${contact.id}/interactions`, { type });
      toast(`Logged: ${TYPE_VERB[type] || type} ${firstName(contact)}.`);
      refresh(); // re-renders detail → updates timeline + out-of-touch badge
    } catch (err) {
      toast(err.message, 'error');
      if (btn) btn.disabled = false;
    } finally {
      logging = false;
    }
  };

  container.querySelectorAll('[data-log-type]').forEach((btn) =>
    btn.addEventListener('click', () => logType(btn.dataset.logType, btn)));
  container.querySelector('[data-log-more]')?.addEventListener('click', () =>
    openInteractionModal(contact, refresh));
}

// "more" modal: type + optional note + backdate before saving.
function openInteractionModal(contact, onSaved) {
  const content = `
    ${formGroup('Type', selectInput('type', ALL_TYPES, 'call'))}
    ${formGroup('When', `<input class="form-input" name="occurred_at" type="datetime-local" value="${esc(toLocalInput(new Date().toISOString()))}">`, 'Backdate if you are logging an older touchpoint.')}
    ${formGroup('Note (optional)', textarea('note', '', 'maxlength="500" rows="3" placeholder="What happened?"'))}`;
  openModal(modalShell('interaction-form', `Log interaction — ${contact.display_name}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Log it</button>`), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const v = readForm(overlay);
        const btn = overlay.querySelector('[data-action="save"]');
        btn.disabled = true;
        try {
          await api.post(`/api/contacts/${contact.id}/interactions`, {
            type: v.type || 'other',
            note: v.note || undefined,
            occurred_at: v.occurred_at ? fromLocalInput(v.occurred_at) : undefined,
          });
          toast('Interaction logged.');
          close();
          onSaved?.();
        } catch (err) {
          btn.disabled = false;
          toast(err.message, 'error');
        }
      });
    },
  });
}

// ---------------------------------------------- interactions log (in TIMELINE)
async function renderInteractions(container, contact, canEdit, refresh) {
  let items = [];
  try {
    items = (await api.get(`/api/contacts/${contact.id}/interactions?limit=50`)).interactions || [];
  } catch {
    container.innerHTML = ''; // silent — timeline still renders below
    return;
  }
  if (!items.length) { container.innerHTML = ''; return; }

  container.innerHTML = items.map((it) => {
    const kind = String(it.type || 'other').toUpperCase();
    const when = it.occurred_at || it.created_at;
    return `
    <div class="rec-log-row">
      <span class="rec-log-when">${esc(fmtDate(when))}</span>
      <span class="rec-log-body">
        <span class="rec-log-kind">${esc(kind)}</span>
        <div class="rec-log-entry">${esc(labelFor(it.type))} ${esc(firstName(contact))}</div>
        ${it.note ? `<div class="rec-log-what">${esc(it.note)}</div>` : ''}
      </span>
      ${canEdit ? `<button class="btn btn-icon" data-del-interaction="${Number(it.id)}" aria-label="Delete interaction">${icon('x')}</button>` : ''}
    </div>`;
  }).join('');

  container.querySelectorAll('[data-del-interaction]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete interaction',
        "Delete this logged interaction? This can't be undone.");
      if (!ok) return;
      try {
        await api.del(`/api/interactions/${btn.dataset.delInteraction}`);
        toast('Interaction deleted.');
        refresh(); // refresh whole detail so last-contacted badge recomputes
      } catch (err) { toast(err.message, 'error'); }
    }));
}

function labelFor(type) {
  const m = { call: 'Called', text: 'Texted', met: 'Met with', email: 'Emailed', video: 'Video call with', gift: 'Gift for', social: 'Social with', other: 'Contacted' };
  return m[type] || 'Contacted';
}

// ---------------------------------------------------------- MESSAGES section
const PREVIEW_COUNT = 10;

async function renderMessages(section, contact, canEdit, refresh) {
  let msgs = [];
  try {
    msgs = (await api.get(`/api/messages?contact_id=${contact.id}`)).messages || [];
  } catch {
    // On error, only surface in edit mode (so view mode stays clean).
    if (!canEdit) { section.hidden = true; return; }
    msgs = [];
  }

  // View mode with zero messages → hide the whole section.
  if (!msgs.length && !canEdit) { section.hidden = true; return; }
  section.hidden = false;

  const total = msgs.length;
  const preview = msgs.slice(0, PREVIEW_COUNT); // API returns newest-first
  const addBtn = canEdit ? `<button class="rec-head-action" data-action="add-message">+ Log message</button>` : '';

  section.innerHTML = `
    <div class="rec-section-head"><span class="rec-idx">06</span><span class="rec-label">Messages</span><span class="rec-fill"></span>${addBtn}</div>
    ${total ? `<div class="msg-log" id="msg-log">${preview.map((m) => messageRow(m, canEdit)).join('')}</div>
      ${total > PREVIEW_COUNT ? `<button class="rec-act mt-2" data-action="view-all-messages">View all ${total} messages</button>` : ''}`
      : '<div class="text-sm text-muted" style="padding:6px 0">No messages yet. Imported DMs land here; log one manually with “+ Log message”.</div>'}`;

  bindMessageRows(section, contact, refresh);
  section.querySelector('[data-action="add-message"]')?.addEventListener('click', () =>
    openMessageModal(contact, refresh));
  section.querySelector('[data-action="view-all-messages"]')?.addEventListener('click', () =>
    openAllMessagesModal(contact, msgs, canEdit, refresh));
}

// Compact chat-log row: mono IN/OUT tag + mono platform + esc'd content + date.
function messageRow(m, canEdit) {
  const dir = m.direction === 'out' ? 'out' : 'in';
  const spicy = m.is_spicy && isSpicyOn();
  return `
  <div class="msg-row msg-${dir} ${m.is_spicy ? 'has-spicy-data' : ''}" data-msg-id="${Number(m.id)}">
    <div class="msg-head">
      <span class="msg-dir">${dir === 'out' ? 'OUT' : 'IN'}</span>
      ${m.platform ? `<span class="msg-platform">${esc(String(m.platform).toUpperCase())}</span>` : ''}
      ${spicy ? '<span class="msg-platform" style="color:var(--accent)">PRIVATE</span>' : ''}
      <span class="msg-when">${esc(m.sent_at ? timeAgo(m.sent_at) : fmtDate(m.created_at))}</span>
      ${canEdit ? `<button class="btn btn-icon msg-del" data-del-msg="${Number(m.id)}" aria-label="Delete message">${icon('x')}</button>` : ''}
    </div>
    <div class="msg-body">${esc(m.content || '')}</div>
  </div>`;
}

function bindMessageRows(scope, contact, refresh) {
  scope.querySelectorAll('[data-del-msg]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const ok = await confirmModal('Delete message',
        "Delete this message? This can't be undone.");
      if (!ok) return;
      try {
        await api.del(`/api/messages/${btn.dataset.delMsg}`);
        toast('Message deleted.');
        refresh();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

// Full-thread modal (imported threads can be hundreds — render oldest→newest).
function openAllMessagesModal(contact, msgs, canEdit, refresh) {
  const ordered = [...msgs].reverse(); // newest-first → chronological
  const body = `<div class="msg-log msg-log-full">${ordered.map((m) => messageRow(m, canEdit)).join('')}</div>`;
  const { overlay, close } = openModal(
    modalShell('all-messages', `Messages — ${contact.display_name}`, body,
      `<button class="btn btn-secondary" data-action="close-modal">Close</button>`, { size: 'modal-lg' }),
    {
      onMount: (ov) => {
        // deleting inside the modal closes it and refreshes the page
        ov.querySelectorAll('[data-del-msg]').forEach((btn) =>
          btn.addEventListener('click', async () => {
            const ok = await confirmModal('Delete message',
              "Delete this message? This can't be undone.");
            if (!ok) return;
            try {
              await api.del(`/api/messages/${btn.dataset.delMsg}`);
              toast('Message deleted.');
              close();
              refresh();
            } catch (err) { toast(err.message, 'error'); }
          }));
      },
    });
  return { overlay, close };
}

// Add-message modal (consistent with satellite/interaction modals).
function openMessageModal(contact, onSaved) {
  const spicyToggle = isSpicyOn()
    ? `<label class="flex items-center gap-2 text-sm mt-2"><input type="checkbox" name="is_spicy"> Mark private (confidential layer)</label>`
    : '';
  const content = `
    <div class="form-row">
      ${formGroup('Direction', selectInput('direction', [{ value: 'in', label: 'Incoming' }, { value: 'out', label: 'Outgoing' }], 'in'))}
      ${formGroup('Platform', selectInput('platform', PLATFORMS, 'Instagram'))}
    </div>
    ${formGroup('Message', textarea('content', '', 'rows="3" placeholder="What was said?"'))}
    ${formGroup('When', `<input class="form-input" name="sent_at" type="datetime-local" value="${esc(toLocalInput(new Date().toISOString()))}">`)}
    ${spicyToggle}`;
  openModal(modalShell('message-form', `Log message — ${contact.display_name}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Log message</button>`), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const v = readForm(overlay);
        if (!v.content || !String(v.content).trim()) { toast('Message content is required.', 'error'); return; }
        const btn = overlay.querySelector('[data-action="save"]');
        btn.disabled = true;
        try {
          await api.post('/api/messages', {
            contact_id: contact.id,
            direction: v.direction === 'out' ? 'out' : 'in',
            platform: v.platform || undefined,
            content: String(v.content),
            is_spicy: Boolean(v.is_spicy),
            sent_at: v.sent_at ? fromLocalInput(v.sent_at) : undefined,
          });
          toast('Message logged.');
          close();
          onSaved?.();
        } catch (err) {
          btn.disabled = false;
          toast(err.message, 'error');
        }
      });
    },
  });
}

// ---------------------------------------------------- detail-page enrichment
window.addEventListener('kith:contact-detail-rendered', (e) => {
  const { el, contact, canEdit, share_scope, refresh } = e.detail;
  if (share_scope === 'basic') return;

  const barEl = el.querySelector('#interaction-bar');
  if (barEl) renderQuickLogBar(barEl, contact, refresh);

  const intEl = el.querySelector('#contact-interactions');
  if (intEl) renderInteractions(intEl, contact, canEdit, refresh);

  const msgSection = el.querySelector('#messages-card');
  if (msgSection) renderMessages(msgSection, contact, canEdit, refresh);
});
