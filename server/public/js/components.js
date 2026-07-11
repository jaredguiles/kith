// Reusable UI widget render functions. All return HTML strings; every
// interpolated value passes through esc() (§7.11).

import { esc, initials, prideFlagGradient, avatarColorIndex, debounce } from './utils.js';
import { api, qs } from './api.js';
import { icon } from './icons.js';

/** Avatar with optional photo, pride-flag overlay. size: sm|md|lg
 * Initials always render underneath the <img>; a loaded photo covers them and
 * a global capture 'error' listener (app.js) removes broken imgs (CSP forbids
 * inline onerror handlers). */
export function avatar(contact, size = 'md') {
  const name = contact?.display_name;
  const cls = `av ${size === 'md' ? '' : size} avc-${avatarColorIndex(name)}`.replace(/\s+/g, ' ').trim();
  const flag = prideFlagGradient(contact?.orientation);
  const flagHtml = flag ? `<span class="flag" style="background:${flag}"></span>` : '';
  const img = contact?.photo_url ? `<img src="${esc(contact.photo_url)}" alt="">` : '';
  return `<span class="${cls}">${esc(initials(name))}${img}${flagHtml}</span>`;
}

export function tagPill(tag, { removable = false } = {}) {
  const x = removable
    ? `<button class="tag-x" data-action="remove-tag" data-tag-id="${esc(tag.id)}" aria-label="Remove tag ${esc(tag.name)}">${icon('x')}</button>`
    : '';
  return `<span class="tag-pill"><span class="dot" style="background:${esc(tag.color || '#7c5bf5')}"></span>${esc(tag.name)}${x}</span>`;
}

export function groupBadge(group) {
  return `<span class="group-badge" style="color:${esc(group.color || 'inherit')}">${icon(group.icon || 'users')}${esc(group.name)}</span>`;
}

export function starRating(value, { interactive = false, name = 'rating', max = 5 } = {}) {
  const v = Number(value) || 0;
  let stars = '';
  for (let i = 1; i <= max; i++) {
    stars += `<button type="button" class="star ${i <= v ? 'filled' : ''}" data-star="${i}" data-rating-name="${esc(name)}" ${interactive ? '' : 'tabindex="-1"'} aria-label="${i} star${i > 1 ? 's' : ''}">${icon('star')}</button>`;
  }
  return `<span class="star-rating ${interactive ? 'interactive' : 'readonly'}" data-value="${v}">${stars}</span>`;
}

export function emptyState(iconName, title, desc, actionHtml = '') {
  return `<div class="empty-state">${icon(iconName)}<h3>${esc(title)}</h3><p>${esc(desc)}</p>${actionHtml}</div>`;
}

// ----------------------------------------------- The Record patterns
/** Indexed section header: mono accent index + mono uppercase label +
 * hairline fill. `index` like '01'. `actionsHtml` (optional, pre-escaped)
 * renders right-aligned after the fill (use .rec-head-action buttons). */
export function sectionHeader(index, label, actionsHtml = '') {
  return `<div class="rec-section-head"><span class="rec-idx">${esc(index)}</span><span class="rec-label">${esc(label)}</span><span class="rec-fill"></span>${actionsHtml}</div>`;
}

/** Dotted-leader row: left html … right html. Pass PRE-ESCAPED html.
 * `attrs` adds attributes to the row element (e.g. data-*), `tag` defaults
 * to div ('a' for links — include href in attrs). */
export function leaderRow(leftHtml, rightHtml, { tag = 'div', attrs = '', cls = '' } = {}) {
  return `<${tag} class="rec-leader ${cls}" ${attrs}><span class="rec-leader-left">${leftHtml}</span><span class="rec-dots"></span><span class="rec-leader-right">${rightHtml}</span></${tag}>`;
}

/** Zero-padded 4-digit record number, e.g. 247 → '0247'. */
export function recNo(id) {
  return String(Number(id) || 0).padStart(4, '0');
}

/** Inline Kith logo SVG (mirrors assets/logo.svg) so currentColor works — an
 * <img> can't inherit color, which rendered the mark black/invisible in dark
 * mode. Returns the bare <svg>; put it inside a .logo-mark span (which sizes
 * and colors it). `cls` adds a class to the svg when extra styling is needed. */
export function logoMark(cls = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" aria-hidden="true"${cls ? ` class="${esc(cls)}"` : ''}><rect x="5" y="3" width="9" height="26" fill="currentColor"/><path d="M18 12 L28 12 L14 26 L14 16 Z" fill="currentColor"/><path d="M13 20 L19.5 20 L28 29 L18 29 Z" fill="currentColor"/></svg>`;
}

/** Card with a title row, body HTML, and optional header actions. */
export function sectionCard(title, bodyHtml, actionsHtml = '') {
  return `
  <div class="card mb-4">
    <div class="card-header"><span class="card-title">${esc(title)}</span>${actionsHtml ? `<div class="flex items-center gap-2">${actionsHtml}</div>` : ''}</div>
    ${bodyHtml}
  </div>`;
}

/** Small color-coded chip (calendar/journal style). variant: event|birthday|date|reminder|'' */
export function chip(iconName, label, { variant = 'event', href = '', title = '' } = {}) {
  const cls = `cal-chip chip-${esc(variant)}`;
  const inner = `${icon(iconName)}<span class="truncate">${esc(label)}</span>`;
  return href
    ? `<a class="${cls}" href="${esc(href)}" title="${esc(title || label)}">${inner}</a>`
    : `<span class="${cls}" title="${esc(title || label)}">${inner}</span>`;
}

export function toggleSwitch(on, attrs = '') {
  return `<button type="button" role="switch" aria-checked="${on ? 'true' : 'false'}" class="toggle-switch ${on ? 'on' : ''}" ${attrs}></button>`;
}

export function modalShell(id, title, contentHtml, footerHtml, { size = '' } = {}) {
  return `
  <div class="modal-overlay" data-modal="${esc(id)}">
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-header">
        <h2>${esc(title)}</h2>
        <button class="btn btn-icon" data-action="close-modal" aria-label="Close">${icon('x')}</button>
      </div>
      <div class="modal-content">${contentHtml}</div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  </div>`;
}

export function formGroup(label, inputHtml, hint = '') {
  return `<div class="form-group"><label class="form-label">${esc(label)}</label>${inputHtml}${hint ? `<div class="form-hint">${esc(hint)}</div>` : ''}</div>`;
}

export function textInput(name, value = '', attrs = '') {
  return `<input class="form-input" name="${esc(name)}" value="${esc(value ?? '')}" ${attrs}>`;
}

export function selectInput(name, options, value = '', attrs = '') {
  const opts = options
    .map((o) => {
      const val = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? o : o.label;
      return `<option value="${esc(val)}" ${String(val) === String(value ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
    })
    .join('');
  return `<select class="form-select" name="${esc(name)}" ${attrs}>${opts}</select>`;
}

export function textarea(name, value = '', attrs = '') {
  return `<textarea class="form-textarea" name="${esc(name)}" ${attrs}>${esc(value ?? '')}</textarea>`;
}

export function feedItem(iconName, title, desc, meta, actionsHtml = '') {
  return `
  <div class="feed-item">
    <div class="feed-icon">${icon(iconName)}</div>
    <div class="feed-body">
      <div class="feed-title">${title}</div>
      ${desc ? `<div class="feed-desc">${desc}</div>` : ''}
      ${meta ? `<div class="feed-meta">${meta}</div>` : ''}
    </div>
    ${actionsHtml ? `<div class="feed-actions">${actionsHtml}</div>` : ''}
  </div>`;
}

export function filterPills(items, active, dataKey = 'filter') {
  return `<div class="filter-pills">${items
    .map((it) => {
      const val = typeof it === 'string' ? it : it.value;
      const label = typeof it === 'string' ? it : it.label;
      return `<button class="filter-pill ${String(val) === String(active) ? 'active' : ''}" data-${dataKey}="${esc(val)}">${esc(label)}</button>`;
    })
    .join('')}</div>`;
}

// -------------------------------------------------------------- toasts
let toastRegion = null;
export function toast(message, type = 'success') {
  if (!toastRegion) {
    toastRegion = document.createElement('div');
    toastRegion.className = 'toast-region';
    toastRegion.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRegion);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'error' ? 'alert-circle' : 'check-circle')}<span>${esc(message)}</span>`;
  toastRegion.appendChild(el);
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 250);
  }, 3200);
}

// -------------------------------------------------------------- modals
// Open modals, top of stack last. Each Escape handler checks it is topmost so
// one keypress never collapses a whole stack of modals.
const modalStack = [];

const FOCUSABLE_SEL =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function openModal(html, { onMount, onClose } = {}) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const overlay = host.firstElementChild;
  document.body.appendChild(overlay);
  modalStack.push(overlay);
  const opener = document.activeElement; // restore focus here on close

  // ---- dirty tracking: any input/change means the form has unsaved edits.
  // Typeahead search boxes (.search-input-wrap) don't count — typing a query
  // isn't form data the user would lose. Toggle switches / star ratings are
  // <button>s that only fire click, so catch those too.
  let dirty = false;
  let confirming = false;
  const markDirty = (e) => {
    if (e.target.closest?.('.search-input-wrap')) return;
    if (e.target.type === 'password') return; // PIN/password entry isn't precious form data
    dirty = true;
  };
  overlay.addEventListener('input', markDirty);
  overlay.addEventListener('change', markDirty);
  overlay.addEventListener('click', (e) => {
    if (e.target.closest?.('.toggle-switch, .star-rating.interactive, [data-toggle]')) dirty = true;
  });

  // Programmatic close (after a successful save) — never prompts.
  const close = () => {
    const i = modalStack.indexOf(overlay);
    if (i !== -1) modalStack.splice(i, 1);
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    if (opener && document.contains(opener) && typeof opener.focus === 'function') opener.focus();
    onClose?.();
  };

  // User-initiated close (Escape / overlay click / Cancel / X) — asks first
  // when the form is dirty so a stray click can't discard a long form.
  const requestClose = async () => {
    if (!dirty) { close(); return; }
    if (confirming) return;
    confirming = true;
    const ok = await confirmModal('Discard changes?',
      'You have unsaved changes. Discard them?', { confirmLabel: 'Discard' });
    confirming = false;
    if (ok) close();
  };

  const escHandler = (e) => {
    if (e.key !== 'Escape') return;
    if (modalStack[modalStack.length - 1] !== overlay) return; // topmost only
    requestClose();
  };
  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) requestClose();
  });

  // ---- focus trap: Tab cycles within the open modal.
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const els = [...overlay.querySelectorAll(FOCUSABLE_SEL)]
      .filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !overlay.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !overlay.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  });

  const focusable = overlay.querySelector('input, select, textarea, button:not([data-action="close-modal"])');
  focusable?.focus();
  onMount?.(overlay, close);
  return { overlay, close };
}

/** Confirmation modal → Promise<boolean>. Voice: direct, gives pause (BRANDING §11). */
export function confirmModal(title, message, { confirmLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    let confirmed = false;
    const html = modalShell(
      'confirm', title,
      `<p>${esc(message)}</p>`,
      `<button class="btn btn-secondary" data-action="cancel">Cancel</button>
       <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${esc(confirmLabel)}</button>`
    );
    const { overlay, close } = openModal(html, {
      onClose: () => resolve(confirmed),
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => { close(); });
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      confirmed = true;
      close();
    });
  });
}

/** Run an async action with the trigger disabled while it's in flight —
 * guards create/submit buttons against double-click duplicates. The button
 * is re-enabled afterwards (so failures allow a retry). Re-entrancy safe:
 * a second click while busy is ignored even if `disabled` was re-rendered. */
export function withBusy(btn, fn) {
  return async (...args) => {
    if (!btn || btn.dataset.busy === '1' || btn.disabled) return;
    btn.dataset.busy = '1';
    btn.disabled = true;
    try {
      return await fn(...args);
    } finally {
      delete btn.dataset.busy;
      btn.disabled = false;
    }
  };
}

/** Read all named fields of a form-like container into an object. */
export function readForm(container) {
  const out = {};
  for (const el of container.querySelectorAll('[name]')) {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else out[el.name] = el.value === '' ? null : el.value;
  }
  return out;
}

// ------------------------------------------- select + "Other…" free text
// Curated-list select that never loses arbitrary stored values: when the
// current value isn't in `options`, the select shows "Other…" and a free-text
// input (pre-filled with the stored value) appears under it. readForm() reads
// the real value from a hidden input named `name`, so callers need no changes.
//
// Usage: html = selectWithOtherHtml('ethnicity', ETHNICITY_OPTIONS, c.ethnicity)
//        then bindSelectWithOther(scope) once after inserting into the DOM.
export const OTHER_SENTINEL = '__other__';

export function selectWithOtherHtml(name, options, value = '', { attrs = '', label = '' } = {}) {
  const v = value ?? '';
  const inList = v === '' || options.some((o) => String(typeof o === 'string' ? o : o.value) === String(v));
  const isOther = !inList;
  const opts = [
    ...options.map((o) => {
      const val = typeof o === 'string' ? o : o.value;
      const lbl = typeof o === 'string' ? (o || '—') : o.label;
      return `<option value="${esc(val)}" ${!isOther && String(val) === String(v) ? 'selected' : ''}>${esc(lbl)}</option>`;
    }),
    `<option value="${OTHER_SENTINEL}" ${isOther ? 'selected' : ''}>Other…</option>`,
  ].join('');
  const aria = esc(label || name);
  return `<div class="select-other" data-select-other>
    <input type="hidden" name="${esc(name)}" value="${esc(v)}">
    <select class="form-select" data-so-select aria-label="${aria}" ${attrs}>${opts}</select>
    <input class="form-input mt-1 ${isOther ? '' : 'hidden'}" data-so-text value="${esc(isOther ? v : '')}"
      placeholder="Type your own…" aria-label="${aria} (custom value)" autocomplete="off">
  </div>`;
}

export function bindSelectWithOther(scope) {
  scope.querySelectorAll('[data-select-other]').forEach((wrap) => {
    if (wrap.dataset.soBound) return;
    wrap.dataset.soBound = '1';
    const hidden = wrap.querySelector('input[type="hidden"]');
    const select = wrap.querySelector('[data-so-select]');
    const text = wrap.querySelector('[data-so-text]');
    const sync = () => {
      const other = select.value === OTHER_SENTINEL;
      text.classList.toggle('hidden', !other);
      hidden.value = other ? text.value.trim() : select.value;
    };
    select.addEventListener('change', () => {
      sync();
      if (select.value === OTHER_SENTINEL) text.focus();
    });
    text.addEventListener('input', sync);
  });
}

// ------------------------------------------------- address autocomplete
// Typeahead over GET /api/geo/suggest (local geonames + self-hosted Photon).
// A value only counts as CONFIRMED when the user picks a candidate from the
// dropdown — free text is kept but flagged unverified (data-verified="0"),
// and the caller decides what to do with it (usually: store the raw text and
// let the server's geocoder try, but never silently trust a guess).
//
// Usage (any page — events/journal owners: import these two and you're done):
//   html   = addressAutocompleteHtml('location', currentValue, { placeholder })
//   picked = bindAddressAutocomplete(scope, { onPick(cand), onFreeText(text) })
// The wrapper keeps the visible input named `name` (readForm-compatible) and
// exposes the confirmed candidate on wrap._addressPick plus data- attributes:
//   data-verified  '1' after a pick, '0' once the user types again
//   data-lat / data-lng / data-city / data-state / data-country  (post-pick)
// Keyboard: ↓/↑ move, Enter picks, Esc closes; Tab closes and moves on.
// Re-verify affordance: the input pre-fills with the current stored text, so
// fixing legacy free-typed data is: focus, ↓, Enter.
export function addressAutocompleteHtml(name, value = '', { placeholder = 'Start typing a city…', attrs = '', inputClass = '' } = {}) {
  return `<div class="addr-ac" data-addr-ac>
    <input class="form-input ${esc(inputClass)}" name="${esc(name)}" value="${esc(value ?? '')}"
      placeholder="${esc(placeholder)}" autocomplete="off" role="combobox"
      aria-expanded="false" aria-autocomplete="list" ${attrs}>
    <span class="addr-ac-state" data-ac-state aria-hidden="true"></span>
    <div class="addr-ac-list hidden" role="listbox"></div>
  </div>`;
}

export function bindAddressAutocomplete(scope, { onPick = null, onFreeText = null, limit = 8 } = {}) {
  scope.querySelectorAll('[data-addr-ac]').forEach((wrap) => {
    if (wrap.dataset.acBound) return;
    wrap.dataset.acBound = '1';
    const input = wrap.querySelector('input[name]');
    const list = wrap.querySelector('.addr-ac-list');
    const stateEl = wrap.querySelector('[data-ac-state]');
    let candidates = [];
    let active = -1;
    let reqToken = 0;

    const setVerified = (v) => {
      wrap.dataset.verified = v ? '1' : '0';
      stateEl.innerHTML = v ? icon('check') : '';
      stateEl.title = v ? 'Confirmed place' : '';
    };
    setVerified(false);

    const closeList = () => {
      list.classList.add('hidden');
      list.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
      candidates = [];
      active = -1;
    };

    const renderList = () => {
      if (!candidates.length) { closeList(); return; }
      list.innerHTML = candidates.map((c, i) => `
        <button type="button" class="addr-ac-item ${i === active ? 'active' : ''}" role="option"
          aria-selected="${i === active}" data-ac-i="${i}" tabindex="-1">
          <span class="addr-ac-label">${esc(c.label)}</span>
          ${c.type ? `<span class="addr-ac-type">${esc(c.type)}</span>` : ''}
        </button>`).join('');
      list.classList.remove('hidden');
      input.setAttribute('aria-expanded', 'true');
      list.querySelector('.addr-ac-item.active')?.scrollIntoView({ block: 'nearest' });
    };

    const pick = (i) => {
      const c = candidates[i];
      if (!c) return;
      // store the normalized "City, State, Country" (the full label can carry
      // noise like the enclosing township); fall back to the label for POIs
      const short = [c.city || c.name, c.state, c.country]
        .filter((v, ix, a) => v && a.indexOf(v) === ix).join(', ');
      input.value = short || c.label;
      wrap._addressPick = c;
      wrap.dataset.lat = String(c.lat);
      wrap.dataset.lng = String(c.lng);
      wrap.dataset.city = c.city || '';
      wrap.dataset.state = c.state || '';
      wrap.dataset.country = c.country || '';
      setVerified(true);
      closeList();
      onPick?.(c, input);
      // a pick is form data — make sure modal dirty-tracking notices
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };

    const search = debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { closeList(); return; }
      const token = ++reqToken;
      let res;
      try { res = await api.get('/api/geo/suggest' + qs({ q, limit })); } catch { return; }
      if (token !== reqToken || document.activeElement !== input) return; // stale / blurred
      candidates = res.candidates || [];
      active = -1;
      renderList();
    }, 250);

    input.addEventListener('input', () => {
      delete wrap._addressPick;
      setVerified(false);
      onFreeText?.(input.value, input);
      search();
    });

    // Re-verify affordance: focusing a pre-filled (legacy free-typed) value
    // opens the suggestions immediately, so fixing old data is focus → Enter.
    input.addEventListener('focus', () => {
      if (wrap.dataset.verified !== '1' && input.value.trim().length >= 2) search();
    });

    input.addEventListener('keydown', (e) => {
      const open = !list.classList.contains('hidden');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open && input.value.trim().length >= 2) { search(); return; }
        active = Math.min(active + 1, candidates.length - 1);
        renderList();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(active - 1, 0);
        renderList();
      } else if (e.key === 'Enter' && open && active >= 0) {
        e.preventDefault();
        e.stopPropagation(); // don't let an outer Enter-to-save handler fire on a pick
        pick(active);
      } else if (e.key === 'Escape' && open) {
        e.stopPropagation(); // just close the list, not the whole modal/editor
        closeList();
      } else if (e.key === 'Tab') {
        closeList(); // free text stays, unverified — Tab moves on normally
      }
    });

    list.addEventListener('mousedown', (e) => e.preventDefault()); // keep input focus
    list.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ac-i]');
      if (b) pick(Number(b.dataset.acI));
    });
    input.addEventListener('blur', () => setTimeout(() => {
      if (!wrap.contains(document.activeElement)) closeList();
    }, 0));
  });
}

/** Post-bind read helper: confirmed candidate or unverified free text.
 * → { text, verified, candidate|null } for the wrap containing `name`. */
export function readAddressAutocomplete(scope, name) {
  const input = scope.querySelector(`[data-addr-ac] input[name="${name}"]`);
  if (!input) return null;
  const wrap = input.closest('[data-addr-ac]');
  return {
    text: input.value.trim(),
    verified: wrap.dataset.verified === '1',
    candidate: wrap._addressPick || null,
  };
}
