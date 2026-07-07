// Spicy profile UI (contact detail section, spicy mode only) + share + merge
// modals. Registered via events from contacts.js.

import { api, qs } from './api.js';
import { esc, fmtDate, initials, debounce } from './utils.js';
import { icon } from './icons.js';
import {
  modalShell, formGroup, textInput, selectInput, textarea, starRating,
  toast, openModal, readForm,
} from './components.js';
import { state, isSpicyOn, navigate, refreshSidebarLists } from './app.js';

const SPICY_TYPES = ['', 'hookup', 'fwb', 'ltr', 'friend', 'ex', 'situationship', 'one-night', 'sugar', 'open', 'poly', 'other'];
const ROLE_PREFS = ['', 'Top', 'Bottom', 'Vers', 'Vers-top', 'Vers-bottom', 'Switch', 'Dom', 'Sub', 'Power-bottom', 'Service-top', 'Other'];
const PROTECTION = ['', 'Always', 'Sometimes', 'Never', 'Depends'];
const HIV_STATUS = ['', 'Negative', 'Positive-Undetectable', 'Positive', 'Unknown'];
const BODY_TYPES = ['', 'Slim', 'Average', 'Athletic', 'Muscular', 'Thick', 'Dad-bod', 'Bear', 'Other'];

// ------------------------------------------------- spicy profile section
async function renderSpicySection(el, contact, canEdit, refresh) {
  if (!isSpicyOn()) return;

  // insert the section before the history links
  let card = el.querySelector('#spicy-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card mt-4';
    card.id = 'spicy-card';
    const mediaCard = el.querySelector('#media-card');
    mediaCard?.after(card);
  }

  let profile = null;
  try {
    const data = await api.get(`/api/contacts/${contact.id}/spicy`);
    profile = data.spicy_profile;
  } catch (err) {
    if (err.status === 403) { card.remove(); return; }
  }

  const p = profile || {};
  const row = (label, value) => value
    ? `<div class="flex-between" style="padding:5px 0"><span class="text-sm text-secondary">${esc(label)}</span><span class="text-sm" style="text-align:right;max-width:60%">${esc(value)}</span></div>`
    : '';
  const kinks = Array.isArray(p.kinks) ? p.kinks : (p.kinks ? [p.kinks] : []);

  card.innerHTML = `
    <div class="card-header">
      <span class="card-title flex items-center gap-2">${icon('flame')} Spicy profile</span>
      ${canEdit ? `<button class="btn btn-ghost btn-sm" data-action="edit-spicy">${icon('edit')} ${profile ? 'Edit' : 'Add'}</button>` : ''}
    </div>
    ${profile ? `
    <div class="grid-2">
      <div>
        ${row('Type', p.spicy_type)}
        ${row('Role', p.role_preference)}
        ${row('Positions', p.positions)}
        ${kinks.length ? `<div style="padding:5px 0"><span class="text-sm text-secondary">Kinks</span><div class="flex gap-1 flex-wrap mt-1">${kinks.map((k) => `<span class="tag-pill">${esc(k)}</span>`).join('')}</div></div>` : ''}
        ${row('Turn-ons', p.turn_ons)}
        ${row('Turn-offs', p.turn_offs)}
        ${row('Boundaries', p.boundaries)}
        ${row('Safe word', p.safe_word)}
      </div>
      <div>
        ${row('Protection', p.protection_preference)}
        ${row('HIV status', p.hiv_status)}
        ${row('On PrEP', p.on_prep === '1' ? `Yes${p.prep_since ? ` (since ${fmtDate(p.prep_since)})` : ''}` : p.on_prep === '0' ? 'No' : null)}
        ${row('Last tested', p.last_tested_date ? fmtDate(p.last_tested_date) : null)}
        ${row('STI notes', p.sti_notes)}
        ${row('Body', [p.body_type, p.body_notes].filter(Boolean).join(' — '))}
        ${row('Endowment', p.endowment)}
        ${row('Grooming', p.grooming)}
        ${p.spicy_rating ? `<div class="flex-between" style="padding:5px 0"><span class="text-sm text-secondary">Spicy rating</span>${starRating(Number(p.spicy_rating))}</div>` : ''}
        ${p.chemistry_rating ? `<div class="flex-between" style="padding:5px 0"><span class="text-sm text-secondary">Chemistry</span>${starRating(Number(p.chemistry_rating))}</div>` : ''}
        ${row('Would repeat', p.would_repeat === '1' ? 'Yes' : p.would_repeat === '0' ? 'No' : null)}
        ${row('Last encounter', p.last_encounter ? fmtDate(p.last_encounter) : null)}
        ${row('Encounters', p.encounter_count)}
      </div>
    </div>
    ${p.spicy_notes ? `<div class="mt-2"><div class="uppercase-label mb-1">Notes</div><div class="text-sm">${esc(p.spicy_notes)}</div></div>` : ''}
    ` : `<div class="text-sm text-muted">No spicy profile yet.${canEdit ? ' Add one to keep the details here.' : ''}</div>`}`;

  card.querySelector('[data-action="edit-spicy"]')?.addEventListener('click', () =>
    openSpicyForm(contact, p, () => renderSpicySection(el, contact, canEdit, refresh)));
}

function openSpicyForm(contact, p, onSaved) {
  const kinks = Array.isArray(p.kinks) ? p.kinks.join(', ') : (p.kinks || '');
  const content = `
    <div class="form-row">
      ${formGroup('Type', selectInput('spicy_type', SPICY_TYPES, p.spicy_type))}
      ${formGroup('Role preference', selectInput('role_preference', ROLE_PREFS, p.role_preference))}
    </div>
    ${formGroup('Positions', textInput('positions', p.positions))}
    ${formGroup('Kinks (comma-separated)', textInput('kinks_raw', kinks))}
    <div class="form-row">
      ${formGroup('Turn-ons', textarea('turn_ons', p.turn_ons, 'style="min-height:56px"'))}
      ${formGroup('Turn-offs', textarea('turn_offs', p.turn_offs, 'style="min-height:56px"'))}
    </div>
    ${formGroup('Boundaries', textInput('boundaries', p.boundaries))}
    <div class="form-row">
      ${formGroup('Safe word', textInput('safe_word', p.safe_word))}
      ${formGroup('Protection', selectInput('protection_preference', PROTECTION, p.protection_preference))}
    </div>
    <div class="form-row">
      ${formGroup('HIV status', selectInput('hiv_status', HIV_STATUS, p.hiv_status))}
      ${formGroup('On PrEP', selectInput('on_prep', [{ value: '', label: 'Unknown' }, { value: '1', label: 'Yes' }, { value: '0', label: 'No' }], p.on_prep))}
    </div>
    <div class="form-row">
      ${formGroup('PrEP since', textInput('prep_since', (p.prep_since || '').slice(0, 10), 'type="date"'))}
      ${formGroup('Last tested', textInput('last_tested_date', (p.last_tested_date || '').slice(0, 10), 'type="date"'))}
    </div>
    ${formGroup('STI notes', textarea('sti_notes', p.sti_notes, 'style="min-height:56px"'))}
    <div class="form-row">
      ${formGroup('Body type', selectInput('body_type', BODY_TYPES, p.body_type))}
      ${formGroup('Endowment', textInput('endowment', p.endowment))}
    </div>
    <div class="form-row">
      ${formGroup('Body notes', textInput('body_notes', p.body_notes, 'placeholder="Tattoos, piercings…"'))}
      ${formGroup('Grooming', textInput('grooming', p.grooming))}
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Spicy rating</label>${starRating(Number(p.spicy_rating) || 0, { interactive: true, name: 'spicy_rating' })}</div>
      <div class="form-group"><label class="form-label">Chemistry</label>${starRating(Number(p.chemistry_rating) || 0, { interactive: true, name: 'chemistry_rating' })}</div>
    </div>
    <div class="form-row">
      ${formGroup('Would repeat', selectInput('would_repeat', [{ value: '', label: '—' }, { value: '1', label: 'Yes' }, { value: '0', label: 'No' }], p.would_repeat))}
      ${formGroup('Last encounter', textInput('last_encounter', (p.last_encounter || '').slice(0, 10), 'type="date"'))}
    </div>
    ${formGroup('Encounter count', textInput('encounter_count', p.encounter_count, 'type="number" min="0"'))}
    ${formGroup('Private notes', textarea('spicy_notes', p.spicy_notes))}`;

  openModal(modalShell('spicy-form', `Spicy profile — ${contact.display_name}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Save</button>`,
    { size: 'modal-lg' }), {
    onMount: (overlay, close) => {
      const ratings = { spicy_rating: Number(p.spicy_rating) || 0, chemistry_rating: Number(p.chemistry_rating) || 0 };
      overlay.querySelectorAll('.star-rating.interactive .star').forEach((s) =>
        s.addEventListener('click', () => {
          const name = s.dataset.ratingName;
          const v = Number(s.dataset.star);
          ratings[name] = ratings[name] === v ? 0 : v;
          s.closest('.star-rating').querySelectorAll('.star').forEach((st) =>
            st.classList.toggle('filled', Number(st.dataset.star) <= ratings[name]));
        }));
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const values = readForm(overlay.querySelector('.modal-content'));
        const kinksRaw = values.kinks_raw;
        delete values.kinks_raw;
        values.kinks = kinksRaw ? kinksRaw.split(',').map((k) => k.trim()).filter(Boolean) : null;
        values.spicy_rating = ratings.spicy_rating ? String(ratings.spicy_rating) : null;
        values.chemistry_rating = ratings.chemistry_rating ? String(ratings.chemistry_rating) : null;
        try {
          await api.put(`/api/contacts/${contact.id}/spicy`, values);
          toast('Spicy profile saved.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ------------------------------------------------------------ share modal
async function openShareModal(contact, refresh) {
  let users = [];
  let shares = [];
  try {
    // any user can share; needs the user list — served to all authed users? users route is admin-only.
    // Use a lightweight approach: admins get the list; non-admins type a username.
    const data = await api.get('/api/users');
    users = (data.users || []).filter((u) => u.id !== state.user.id && u.is_active);
  } catch { /* non-admin */ }
  try {
    shares = (await api.get(`/api/contacts/${contact.id}/share`)).shares || [];
  } catch { /* ignore */ }

  const content = `
    ${shares.length ? `
      <div class="uppercase-label mb-1">Currently shared with</div>
      ${shares.map((s) => `
        <div class="flex-between" style="padding:6px 0">
          <span class="text-sm">${esc(s.display_name || s.username)} <span class="text-muted">(${esc(s.share_scope)}, ${esc(s.permissions)})</span></span>
          <button class="btn btn-icon" data-unshare="${s.shared_with_user_id}" aria-label="Unshare">${icon('x')}</button>
        </div>`).join('')}
      <div class="divider"></div>` : ''}
    ${users.length
      ? formGroup('Share with', selectInput('share_user', users.map((u) => ({ value: u.id, label: u.display_name || u.username })), ''))
      : formGroup('Username', textInput('share_username', '', 'placeholder="Exact username"'))}
    <div class="form-row">
      ${formGroup('Permissions', selectInput('permissions', [{ value: 'read', label: 'Read only' }, { value: 'edit', label: 'Can edit' }], 'read'))}
      ${formGroup('Scope', selectInput('share_scope', [
        { value: 'basic', label: 'Basic — name, email, phone, photo' },
        { value: 'full', label: 'Full — all SFW data' },
        ...(isSpicyOn() ? [{ value: 'full_spicy', label: 'Full + spicy' }] : []),
      ], 'basic'))}
    </div>`;

  openModal(modalShell('share', `Share — ${contact.display_name}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="share-save">Share</button>`), {
    onMount: (overlay, close) => {
      overlay.querySelectorAll('[data-unshare]').forEach((b) =>
        b.addEventListener('click', async () => {
          try {
            await api.del(`/api/contacts/${contact.id}/share/${b.dataset.unshare}`);
            toast('Unshared.');
            close();
            refresh?.();
          } catch (err) { toast(err.message, 'error'); }
        }));
      overlay.querySelector('[data-action="share-save"]').addEventListener('click', async () => {
        try {
          let userId = overlay.querySelector('[name="share_user"]')?.value;
          if (!userId) {
            toast('Pick a user to share with.', 'error');
            return;
          }
          await api.post(`/api/contacts/${contact.id}/share`, {
            user_id: Number(userId),
            permissions: overlay.querySelector('[name="permissions"]').value,
            share_scope: overlay.querySelector('[name="share_scope"]').value,
          });
          toast('Contact shared.');
          close();
          refresh?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ------------------------------------------------------------ merge modal
async function openMergeModal(contact, refresh) {
  // step 1: pick the other contact
  const pickContent = `
    <div class="search-input-wrap">${icon('search')}<input class="form-input" id="merge-search" placeholder="Search for the duplicate contact" autocomplete="off"></div>
    <div id="merge-results" class="mt-2"></div>`;
  openModal(modalShell('merge-pick', `Merge — ${contact.display_name}`, pickContent, ''), {
    onMount: (overlay, close) => {
      const input = overlay.querySelector('#merge-search');
      const results = overlay.querySelector('#merge-results');
      input.addEventListener('input', debounce(async () => {
        const q = input.value.trim();
        if (!q) { results.innerHTML = ''; return; }
        const found = await api.get('/api/contacts' + qs({ search: q, limit: 8 }));
        results.innerHTML = (found.contacts || [])
          .filter((c) => c.id !== contact.id)
          .map((c) => `<button class="popover-item w-full" data-pick="${c.id}"><span class="av sm" style="width:24px;height:24px;font-size:10px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}${c.email ? `<span class="cmdk-hint">${esc(c.email)}</span>` : ''}</button>`)
          .join('') || '<div class="text-sm text-muted p-2">No matches.</div>';
        results.querySelectorAll('[data-pick]').forEach((b) =>
          b.addEventListener('click', async () => {
            close();
            const other = (await api.get(`/api/contacts/${b.dataset.pick}`)).contact;
            openMergeCompare(contact, other, refresh);
          }));
      }, 250));
    },
  });
}

const MERGE_FIELDS = [
  'display_name', 'first_name', 'last_name', 'nickname', 'email', 'phone', 'birthday',
  'sex', 'pronouns', 'orientation', 'relationship_status', 'location', 'bio',
  'occupation', 'company', 'website', 'languages', 'ethnicity', 'how_we_met',
  'met_date', 'relationship_type', 'notes_text',
];

function openMergeCompare(a, b, refresh) {
  const conflicting = MERGE_FIELDS.filter((f) => a[f] && b[f] && String(a[f]) !== String(b[f]));
  const bOnly = MERGE_FIELDS.filter((f) => !a[f] && b[f]);

  const content = `
    <p class="text-sm text-secondary mb-3">Keeping <strong>${esc(a.display_name)}</strong>; merging in <strong>${esc(b.display_name)}</strong>. ${esc(b.display_name)} will be archived. Tags, groups, notes, events, and media combine automatically.</p>
    ${conflicting.length ? `
    <div class="uppercase-label mb-2">Pick which value to keep</div>
    <table class="data-table mb-3">
      <thead><tr><th>Field</th><th>${esc(a.display_name)} (keep)</th><th>${esc(b.display_name)} (merge in)</th></tr></thead>
      <tbody>
        ${conflicting.map((f) => `
        <tr style="cursor:default" data-conflict="${f}">
          <td class="font-medium">${esc(f.replace(/_/g, ' '))}</td>
          <td><label class="flex items-center gap-2 clickable"><input type="radio" name="choice-${f}" value="a" checked> <span class="text-sm">${esc(a[f])}</span></label></td>
          <td><label class="flex items-center gap-2 clickable"><input type="radio" name="choice-${f}" value="b"> <span class="text-sm">${esc(b[f])}</span></label></td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="text-sm text-muted mb-3">No conflicting fields.</p>'}
    ${bOnly.length ? `<div class="text-sm text-secondary">Filled from ${esc(b.display_name)} automatically: ${bOnly.map((f) => esc(f.replace(/_/g, ' '))).join(', ')}.</div>` : ''}`;

  openModal(modalShell('merge-compare', 'Review merge', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="do-merge">Merge contacts</button>`,
    { size: 'modal-xl' }), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="do-merge"]').addEventListener('click', async () => {
        const field_choices = {};
        for (const f of conflicting) {
          field_choices[f] = overlay.querySelector(`input[name="choice-${f}"]:checked`)?.value || 'a';
        }
        try {
          await api.post(`/api/contacts/${a.id}/merge/${b.id}`, { field_choices });
          toast('Contacts merged.');
          close();
          refresh?.();
          refreshSidebarLists();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ---------------------------------------------------------------- wiring
window.addEventListener('kith:contact-detail-rendered', (e) => {
  const { el, contact, canEdit, share_scope } = e.detail;
  // spicy section: never for basic/full shares — only owner/admin or full_spicy
  if (share_scope && share_scope !== 'full_spicy') return;
  renderSpicySection(el, contact, canEdit, e.detail.refresh);
});

window.addEventListener('kith:share-contact', (e) => openShareModal(e.detail.contact, e.detail.refresh));
window.addEventListener('kith:merge-contact', (e) => openMergeModal(e.detail.contact, e.detail.refresh));
