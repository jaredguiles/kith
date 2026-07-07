// Page-level render functions. renderPage(el, route) dispatches per route.

import { api, qs } from './api.js';
import { esc } from './utils.js';
import { icon } from './icons.js';
import { emptyState } from './components.js';

export const pageTitles = {
  home: 'Home',
  contacts: 'Contacts',
  events: 'Events',
  calendar: 'Calendar',
  map: 'Map',
  journal: 'Journal',
  notifications: 'Notifications',
  settings: 'Settings',
  review: 'Data review',
  groups: 'Groups',
  trash: 'Trash',
};

// Page modules register themselves here (filled in over Phases 4–9).
export const pageRenderers = {};

export async function renderPage(el, route) {
  const renderer = pageRenderers[route.page];
  if (renderer) {
    await renderer(el, route.params);
    return;
  }
  // Placeholder for pages not yet implemented in the current phase.
  el.innerHTML = `
    <div class="page-inner">
      <div class="page-header"><div><h1 class="page-title">${esc(pageTitles[route.page] || 'Kith')}</h1></div></div>
      ${emptyState('clock', 'Coming soon', 'This page arrives in a later build phase.')}
    </div>`;
}
