// Reusable UI widget render functions. All return HTML strings; every
// interpolated value passes through esc() (§7.11).

import { esc, initials, prideFlagGradient } from './utils.js';
import { icon } from './icons.js';

/** Avatar with optional photo, pride-flag overlay. size: sm|md|lg
 * Initials always render underneath the <img>; a loaded photo covers them and
 * a global capture 'error' listener (app.js) removes broken imgs (CSP forbids
 * inline onerror handlers). */
export function avatar(contact, size = 'md') {
  const cls = size === 'md' ? 'av' : `av ${size}`;
  const flag = prideFlagGradient(contact?.orientation);
  const flagHtml = flag ? `<span class="flag" style="background:${flag}"></span>` : '';
  const img = contact?.photo_url ? `<img src="${esc(contact.photo_url)}" alt="">` : '';
  return `<span class="${cls}">${esc(initials(contact?.display_name))}${img}${flagHtml}</span>`;
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
export function openModal(html, { onMount, onClose } = {}) {
  const host = document.createElement('div');
  host.innerHTML = html;
  const overlay = host.firstElementChild;
  document.body.appendChild(overlay);
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', escHandler);
    onClose?.();
  };
  const escHandler = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', escHandler);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('[data-action="close-modal"]')) close();
  });
  const focusable = overlay.querySelector('input, select, textarea, button:not([data-action="close-modal"])');
  focusable?.focus();
  onMount?.(overlay, close);
  return { overlay, close };
}

/** Confirmation modal → Promise<boolean>. Voice: direct, gives pause (BRANDING §11). */
export function confirmModal(title, message, { confirmLabel = 'Delete', danger = true } = {}) {
  return new Promise((resolve) => {
    const html = modalShell(
      'confirm', title,
      `<p>${esc(message)}</p>`,
      `<button class="btn btn-secondary" data-action="cancel">Cancel</button>
       <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">${esc(confirmLabel)}</button>`
    );
    const { overlay, close } = openModal(html, {
      onClose: () => resolve(false),
    });
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => { close(); });
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
      overlay.remove();
      resolve(true);
    });
  });
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
