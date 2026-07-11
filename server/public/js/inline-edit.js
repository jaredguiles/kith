// Inline edit-in-place system + language multi-select picker.
//
// Usage (contacts.js detail page):
//   - render editable values with ieSpan(field, def, displayValue, editMode)
//   - call bindInlineEditor(container, { defs, save, onSaved }) once per render
//     (bind to a freshly-created container — NOT a persistent node — so
//     listeners don't stack across re-renders).
//
// A def: { type: 'text'|'date'|'number'|'textarea'|'select'|'select-other'|
//                'address'|'name'|'langs',
//          label, value, options?, values? (name only) }
//   - 'select-other': curated <select> + an "Other…" free-text reveal, so
//     arbitrary stored values are never lost (components.js selectWithOther).
//   - 'address': place typeahead against /api/geo/suggest — picking a
//     candidate commits immediately (components.js addressAutocomplete).
//
// Saves are per-field (sparse PUT): the binder builds { field: value } (or the
// first/middle/last trio for 'name'), shows a spinner while `save(payload)`
// runs, flashes a check, then calls onSaved(). Errors toast and revert.
//
// Keyboard flow: while an editor is open, Tab COMMITS the field and opens the
// editor for the next .ie-field in DOM order (Shift+Tab: previous); Enter
// commits and, after the re-render, restores focus to the same field so a
// following Tab lands on the next one. Multi-input editors (name) keep native
// Tab between their own inputs and only hand off from the edge input.
// CSP-safe: no inline handlers; esc() on every interpolated value.

import { esc } from './utils.js';
import { icon } from './icons.js';
import {
  toast, selectWithOtherHtml, bindSelectWithOther, OTHER_SENTINEL,
  addressAutocompleteHtml, bindAddressAutocomplete,
} from './components.js';

export const LANGUAGE_OPTIONS = [
  'English', 'Spanish', 'Mandarin', 'Hindi', 'French', 'Arabic', 'Portuguese',
  'Russian', 'Japanese', 'German', 'Korean', 'Italian', 'Vietnamese', 'Tagalog', 'ASL',
];

export const LANGUAGES_MAX = 255; // VARCHAR(255), comma-separated

// ------------------------------------------------------------ rendering
/** Editable value span. Empty values render as a muted '+ add …' prompt. */
export function ieSpan(field, def, displayValue, editMode) {
  const has = displayValue !== null && displayValue !== undefined && displayValue !== '';
  return `<span class="ie-field ${editMode ? 'ie-on' : ''} ${has ? '' : 'ie-empty'}" data-ie="${esc(field)}" role="button" tabindex="0" aria-label="Edit ${esc(def.label)}">${
    has
      ? `<span class="ie-val">${esc(displayValue)}</span>`
      : `<span class="ie-add">${icon('plus')}<span>add ${esc(def.label.toLowerCase())}</span></span>`
  }</span>`;
}

// ------------------------------------------------------------ the binder
// Cross-render handoff for the Tab-to-next-field flow: a save triggers a full
// re-render (onSaved), destroying the "next" element — so the field NAME to
// open (or just focus) is parked here and consumed by the next bind call.
let pendingOpenField = null;
let pendingFocusField = null;

export function bindInlineEditor(root, { defs, save, onSaved }) {
  // Visible editable fields in DOM order (top-to-bottom Tab order).
  const fields = () => [...root.querySelectorAll('.ie-field')]
    .filter((f) => f.offsetParent !== null);
  const sibling = (fieldEl, dir) => {
    const all = fields();
    const i = all.indexOf(fieldEl);
    return i === -1 ? null : (all[i + dir] || null);
  };
  const open = (fieldEl) => {
    if (!fieldEl || fieldEl.classList.contains('ie-editing') || fieldEl.classList.contains('ie-busy-state')) return;
    const def = defs[fieldEl.dataset.ie];
    if (!def) return;
    if (def.type === 'langs') openLangEditor(fieldEl, def, { save, onSaved });
    else openEditor(fieldEl, def, { save, onSaved }, nav);
  };
  const nav = {
    sibling,
    open,
    setPendingOpen: (f) => { pendingOpenField = f; },
    setPendingFocus: (f) => { pendingFocusField = f; },
  };
  root.addEventListener('click', (e) => {
    const f = e.target.closest('.ie-field');
    if (!f || !root.contains(f)) return;
    if (e.target.closest('.ie-editing') && !f.classList.contains('ie-editing')) return;
    open(f);
  });
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('ie-field') &&
        !e.target.classList.contains('ie-editing')) {
      e.preventDefault();
      open(e.target);
    }
  });

  // Consume a parked handoff from the previous render (Tab-commit → open
  // next; Enter-commit → refocus same field so the NEXT Tab moves on).
  if (pendingOpenField) {
    const name = pendingOpenField;
    pendingOpenField = null;
    const f = root.querySelector(`.ie-field[data-ie="${CSS.escape(name)}"]`);
    if (f) setTimeout(() => open(f), 0);
  } else if (pendingFocusField) {
    const name = pendingFocusField;
    pendingFocusField = null;
    const f = root.querySelector(`.ie-field[data-ie="${CSS.escape(name)}"]`);
    if (f) setTimeout(() => f.focus(), 0);
  }
}

function editorInputHtml(def) {
  if (def.type === 'name') {
    const v = def.values || {};
    return `<span class="ie-name-row">
      <input class="form-input ie-input" data-ie-part="first_name" value="${esc(v.first_name ?? '')}" placeholder="First" aria-label="First name" autocomplete="off">
      <input class="form-input ie-input" data-ie-part="middle_name" value="${esc(v.middle_name ?? '')}" placeholder="Middle" aria-label="Middle name" autocomplete="off">
      <input class="form-input ie-input" data-ie-part="last_name" value="${esc(v.last_name ?? '')}" placeholder="Last" aria-label="Last name" autocomplete="off">
    </span>`;
  }
  if (def.type === 'select') {
    const opts = (def.options || []).map((o) => {
      const val = typeof o === 'string' ? o : o.value;
      const label = typeof o === 'string' ? (o || '—') : o.label;
      return `<option value="${esc(val)}" ${String(val) === String(def.value ?? '') ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('');
    return `<select class="form-select ie-input" aria-label="${esc(def.label)}">${opts}</select>`;
  }
  if (def.type === 'select-other') {
    // curated list + "Other…" free text; hidden input carries the value
    return selectWithOtherHtml('__ie_so', def.options || [], def.value ?? '', { label: def.label });
  }
  if (def.type === 'address') {
    // place typeahead (city/state/country) — picking a candidate commits;
    // pre-filled with the current text so re-verifying is one interaction
    return addressAutocompleteHtml('__ie_addr', def.value ?? '', {
      placeholder: def.placeholder || 'Start typing a city…',
      inputClass: 'ie-input',
      attrs: `aria-label="${esc(def.label)}"`,
    });
  }
  if (def.type === 'textarea') {
    return `<textarea class="form-textarea ie-input" rows="3" aria-label="${esc(def.label)}" placeholder="${esc(def.label)} — Enter saves, Shift+Enter for a new line">${esc(def.value ?? '')}</textarea>`;
  }
  const type = def.type === 'date' ? 'date' : def.type === 'number' ? 'number' : 'text';
  const extra = def.type === 'number' ? 'min="0" step="1"' : '';
  return `<input class="form-input ie-input" type="${type}" ${extra} value="${esc(def.value ?? '')}" placeholder="${esc(def.placeholder || def.label)}" aria-label="${esc(def.label)}" autocomplete="off">`;
}

function openEditor(fieldEl, def, { save, onSaved }, nav = null) {
  const original = fieldEl.innerHTML;
  fieldEl.classList.add('ie-editing');
  fieldEl.innerHTML = editorInputHtml(def);
  if (def.type === 'select-other') bindSelectWithOther(fieldEl);
  if (def.type === 'address') bindAddressAutocomplete(fieldEl);
  const first = fieldEl.querySelector(def.type === 'select-other' ? 'select' : '.ie-input, select, input');
  first?.focus();
  if (first && first.select && !['select', 'select-other', 'date'].includes(def.type)) { try { first.select(); } catch { /* not selectable */ } }

  let done = false;
  const readPayload = () => {
    if (def.type === 'name') {
      const out = {};
      fieldEl.querySelectorAll('[data-ie-part]').forEach((i) => { out[i.dataset.iePart] = i.value.trim() || null; });
      return out;
    }
    if (def.type === 'select-other') {
      const v = fieldEl.querySelector('[data-select-other] input[type="hidden"]').value.trim();
      return { [fieldEl.dataset.ie]: v === '' ? null : v };
    }
    const v = fieldEl.querySelector('.ie-input').value;
    const t = typeof v === 'string' ? v.trim() : v;
    return { [fieldEl.dataset.ie]: t === '' ? null : t };
  };
  const changed = () => {
    if (def.type === 'name') {
      const p = readPayload();
      const v = def.values || {};
      return ['first_name', 'middle_name', 'last_name'].some((k) => String(p[k] ?? '') !== String(v[k] ?? '').trim());
    }
    const p = readPayload();
    return String(p[fieldEl.dataset.ie] ?? '') !== String(def.value ?? '');
  };
  const cancel = () => {
    if (done) return;
    done = true;
    fieldEl.classList.remove('ie-editing');
    fieldEl.innerHTML = original;
    fieldEl.focus();
  };
  // after: null = stay (refocus this field post-render), or the data-ie name
  // of a field to auto-open once the re-render lands
  const commit = (after = undefined) => {
    if (done) return;
    if (!changed()) {
      cancel();
      if (after && nav) { const n = fieldEl.ownerDocument.querySelector(`.ie-field[data-ie="${CSS.escape(after)}"]`); nav.open(n); }
      return;
    }
    done = true;
    if (nav) {
      if (after) nav.setPendingOpen(after);
      else if (after === null) nav.setPendingFocus(fieldEl.dataset.ie);
    }
    runSave(fieldEl, original, readPayload(), { save, onSaved });
  };

  fieldEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
    else if (e.key === 'Enter' && !(def.type === 'textarea' && e.shiftKey)) {
      e.preventDefault();
      commit(null); // save → refocus this field so the next Tab moves on
    } else if (e.key === 'Tab' && nav) {
      // Tab commits + opens the neighbor editor (Shift+Tab: previous).
      // The name row keeps native Tab between its three inputs and only
      // hands off at the edges. The select-other free-text reveal keeps
      // native Tab select → text.
      if (def.type === 'name') {
        const parts = [...fieldEl.querySelectorAll('[data-ie-part]')];
        const i = parts.indexOf(e.target);
        const atEdge = e.shiftKey ? i === 0 : i === parts.length - 1;
        if (!atEdge) return;
      }
      if (def.type === 'select-other') {
        if (!e.shiftKey && e.target.matches('[data-so-select]') && e.target.value === OTHER_SENTINEL) return;
        if (e.shiftKey && e.target.matches('[data-so-text]')) return; // back to its own select
      }
      e.preventDefault();
      const next = nav.sibling(fieldEl, e.shiftKey ? -1 : 1);
      if (next) commit(next.dataset.ie);
      else commit(null);
    }
  });
  if (def.type === 'select') {
    fieldEl.querySelector('select').addEventListener('change', () => commit(null));
  }
  if (def.type === 'select-other') {
    // curated pick commits immediately (matches plain selects); choosing
    // "Other…" instead reveals the free-text input and waits for Enter/blur
    fieldEl.querySelector('[data-so-select]').addEventListener('change', (e) => {
      if (e.target.value !== OTHER_SENTINEL) commit(null);
    });
  }
  if (def.type === 'address') {
    // picking a candidate is an explicit confirmation — commit right away
    fieldEl.querySelector('[data-addr-ac] input').addEventListener('change', () => {
      const wrap = fieldEl.querySelector('[data-addr-ac]');
      if (wrap?.dataset.verified === '1') commit(null);
    });
  }
  fieldEl.addEventListener('focusout', () => {
    // defer: focus may be moving between the editor's own inputs
    setTimeout(() => { if (!done && !fieldEl.contains(document.activeElement)) commit(); }, 0);
  });
}

/** Spinner → save → check → onSaved. Errors toast + revert. */
async function runSave(fieldEl, originalHtml, payload, { save, onSaved }) {
  fieldEl.classList.remove('ie-editing');
  fieldEl.classList.add('ie-busy-state');
  fieldEl.innerHTML = `<span class="ie-busy" aria-label="Saving">${icon('refresh')}</span>`;
  try {
    await save(payload);
    fieldEl.innerHTML = `<span class="ie-done">${icon('check')}</span>`;
    setTimeout(() => onSaved?.(), 250);
  } catch (err) {
    toast(err?.message || "Couldn't save.", 'error');
    fieldEl.classList.remove('ie-busy-state');
    fieldEl.innerHTML = originalHtml;
    // failed save → no re-render happens; don't leave a Tab-handoff parked
    // that would fire on some unrelated later render
    pendingOpenField = null;
    pendingFocusField = null;
  }
}

// --------------------------------------------------- language multi-select
export function parseLangs(value) {
  return String(value ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function serializeLangs(list) {
  return list.join(', ').slice(0, LANGUAGES_MAX);
}

function langChipsHtml(list) {
  if (!list.length) return `<span class="text-muted">Add languages…</span>`;
  return list.map((l) => `<span class="lang-chip">${esc(l)}</span>`).join('');
}

function langListHtml(selected) {
  const extras = selected.filter((s) => !LANGUAGE_OPTIONS.some((o) => o.toLowerCase() === s.toLowerCase()));
  const all = [...LANGUAGE_OPTIONS, ...extras];
  return `
    <div class="lang-list" role="group" aria-label="Languages">
      ${all.map((o) => `
      <label class="lang-opt">
        <input type="checkbox" value="${esc(o)}" ${selected.some((s) => s.toLowerCase() === o.toLowerCase()) ? 'checked' : ''}>
        <span>${esc(o)}</span>
      </label>`).join('')}
    </div>
    <div class="lang-add">
      <input class="form-input" placeholder="Add language…" data-lang-add aria-label="Add a language">
      <button type="button" class="btn btn-secondary btn-sm" data-lang-add-btn>Add</button>
    </div>
    <div class="lang-done"><button type="button" class="btn btn-primary btn-sm" data-lang-done>Done</button></div>`;
}

/**
 * Open the checkbox popover anchored inside `anchorEl` (which must be
 * position:relative — .ie-field and .lang-field both are).
 * onDone(list|null): list on close (even unchanged), null on Esc-cancel.
 * Returns close().
 */
export function openLangPopover(anchorEl, currentList, onDone) {
  const selected = [...currentList];
  const pop = document.createElement('div');
  pop.className = 'popover ie-lang-pop';
  pop.innerHTML = langListHtml(selected);
  anchorEl.appendChild(pop);

  const syncFromBoxes = () => {
    const checkedVals = [...pop.querySelectorAll('.lang-list input:checked')].map((c) => c.value);
    // preserve original order first, then newly-checked
    const next = selected.filter((s) => checkedVals.some((v) => v.toLowerCase() === s.toLowerCase()));
    for (const v of checkedVals) if (!next.some((s) => s.toLowerCase() === v.toLowerCase())) next.push(v);
    selected.length = 0;
    selected.push(...next);
  };

  let closed = false;
  const close = (cancelled = false) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('click', outside, true);
    pop.remove();
    onDone(cancelled ? null : selected);
  };
  const outside = (e) => { if (!pop.contains(e.target) && !anchorEl.contains(e.target)) close(false); };
  setTimeout(() => document.addEventListener('click', outside, true), 0);

  pop.addEventListener('click', (e) => e.stopPropagation());
  pop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(true); }
  });
  pop.addEventListener('change', (e) => {
    if (e.target.matches('.lang-list input')) {
      if (e.target.checked && [...selected, e.target.value].join(', ').length > LANGUAGES_MAX) {
        e.target.checked = false;
        toast('Language list is full (255 characters max).', 'error');
        return;
      }
      syncFromBoxes();
    }
  });

  const addInput = pop.querySelector('[data-lang-add]');
  const addLang = () => {
    const v = addInput.value.replace(/,/g, ' ').trim().slice(0, 60);
    if (!v) return;
    if ([...selected, v].join(', ').length > LANGUAGES_MAX) {
      toast('Language list is full (255 characters max).', 'error');
      return;
    }
    addInput.value = '';
    const existing = [...pop.querySelectorAll('.lang-list input')].find((c) => c.value.toLowerCase() === v.toLowerCase());
    if (existing) {
      existing.checked = true;
    } else {
      const label = document.createElement('label');
      label.className = 'lang-opt';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = v;
      cb.checked = true;
      const span = document.createElement('span');
      span.textContent = v;
      label.append(cb, span);
      pop.querySelector('.lang-list').appendChild(label);
    }
    syncFromBoxes();
  };
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addLang(); }
  });
  pop.querySelector('[data-lang-add-btn]').addEventListener('click', addLang);
  pop.querySelector('[data-lang-done]').addEventListener('click', () => close(false));
  pop.querySelector('.lang-list input')?.focus();
  return close;
}

/** Inline-edit flavor: opens the popover on the ie-field, saves on close. */
function openLangEditor(fieldEl, def, { save, onSaved }) {
  const original = fieldEl.innerHTML;
  fieldEl.classList.add('ie-editing');
  openLangPopover(fieldEl, parseLangs(def.value), (list) => {
    fieldEl.classList.remove('ie-editing');
    if (list === null) { fieldEl.focus(); return; } // Esc — cancelled
    const serialized = serializeLangs(list);
    if (serialized === String(def.value ?? '').trim()) { fieldEl.focus(); return; }
    runSave(fieldEl, original, { languages: serialized || null }, { save, onSaved });
  });
}

/** Form-field flavor for modals: chips button + hidden input (readForm-able). */
export function languageFieldHtml(name, value = '') {
  return `<div class="lang-field" data-lang-field>
    <input type="hidden" name="${esc(name)}" value="${esc(value ?? '')}">
    <button type="button" class="form-input lang-btn" aria-haspopup="true" aria-expanded="false" aria-label="Languages">${langChipsHtml(parseLangs(value))}</button>
  </div>`;
}

export function bindLanguageField(scope) {
  scope.querySelectorAll('[data-lang-field]').forEach((wrap) => {
    if (wrap.dataset.langBound) return;
    wrap.dataset.langBound = '1';
    const btn = wrap.querySelector('.lang-btn');
    const hidden = wrap.querySelector('input[type="hidden"]');
    btn.addEventListener('click', () => {
      if (wrap.querySelector('.popover')) return;
      btn.setAttribute('aria-expanded', 'true');
      openLangPopover(wrap, parseLangs(hidden.value), (list) => {
        btn.setAttribute('aria-expanded', 'false');
        if (list === null) { btn.focus(); return; }
        hidden.value = serializeLangs(list);
        btn.innerHTML = langChipsHtml(parseLangs(hidden.value));
        btn.focus();
      });
    });
  });
}
