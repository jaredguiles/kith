// Timeline page — the merged life feed: journal entries + events the user is
// part of, each appearing once (journal rows linked to an event collapse the
// bare event row). List view (day-grouped) and Map view (located moments,
// travel path polyline). GET /api/journal/timeline.

import { api, qs } from './api.js';
import { esc, fmtDate, parseDate, loadLeaflet } from './utils.js';
import { icon } from './icons.js';
import { emptyState, filterPills } from './components.js';
import { pageRenderers, pageTitles } from './pages.js';
import { createMap } from './map.js';
import { isSpicyOn } from './app.js';
import { JOURNAL_KIND_META, dayLabel, timeOfDay } from './journal.js';

const LIMIT = 100;

const VIEW_PILLS = [
  { value: 'list', label: 'List' },
  { value: 'map', label: 'Map' },
];
const TYPE_PILLS = [
  { value: '', label: 'All' },
  { value: 'journal', label: 'Journal' },
  { value: 'travel', label: 'Travel' },
  { value: 'event', label: 'Events' },
];

function rowMeta(e) {
  if (e.kind === 'event') return { icon: 'calendar', label: e.sub || 'Event' };
  const m = JOURNAL_KIND_META[e.sub] || JOURNAL_KIND_META.entry;
  return { icon: m.icon, label: m.label };
}

// Drop bare event rows already narrated by a journal entry linked to them.
function dedupe(entries) {
  const linked = new Set();
  for (const e of entries) {
    if (e.kind === 'journal' && e.event_id != null) linked.add(Number(e.event_id));
  }
  return entries.filter((e) => !(e.kind === 'event' && linked.has(Number(e.id))));
}

function withHtml(e) {
  if (e.kind !== 'event' || !e.with_names) return '';
  const names = String(e.with_names).split(', ');
  const ids = String(e.with_ids || '').split(',');
  const parts = names.map((name, i) => {
    const id = Number(ids[i]);
    return Number.isInteger(id) && id > 0
      ? `<a href="#/contacts/${encodeURIComponent(id)}">${esc(name)}</a>`
      : esc(name);
  });
  return `<span class="jt-meta jt-with">${icon('users')}with ${parts.join(', ')}</span>`;
}

function rowHtml(e) {
  const meta = rowMeta(e);
  const spicy = e.is_spicy && isSpicyOn();
  return `
  <div class="rec-log-row journal-entry ${spicy ? 'has-spicy-data' : ''}">
    <span class="rec-log-when">${esc(timeOfDay(e.occurred_at))}</span>
    <span class="rec-log-body">
      <span class="jt-kind-chip jt-kind-${esc(e.kind === 'event' ? 'event' : e.sub || 'entry')}">${icon(meta.icon)}${esc(meta.label)}${spicy ? ' · private' : ''}</span>
      ${e.title ? (e.kind === 'event'
        ? `<div class="rec-log-entry"><a href="#/events">${esc(e.title)}</a></div>`
        : `<div class="rec-log-entry">${esc(e.title)}</div>`) : ''}
      ${e.content ? `<div class="rec-log-what">${esc(e.content)}</div>` : ''}
      <div class="jt-meta-row">
        ${withHtml(e)}
        ${e.location ? `<span class="jt-meta">${icon('map-pin')}${esc(e.location)}</span>` : ''}
      </div>
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
    out += rowHtml(e);
  }
  return out;
}

// ------------------------------------------------------------------- map
function pinIcon(L, e) {
  const kindCls = e.kind === 'event' ? 'event' : (e.sub || 'entry');
  return L.divIcon({
    className: 'jt-map-pin-wrap',
    html: `<span class="jt-map-pin jt-pin-${esc(kindCls)}">${icon(e.kind === 'event' ? 'calendar' : (JOURNAL_KIND_META[e.sub]?.icon || 'book-open'))}</span>`,
    iconSize: [28, 34],
    iconAnchor: [14, 34],
    popupAnchor: [0, -32],
  });
}

function pinPopupHtml(e) {
  const meta = rowMeta(e);
  const titleHtml = e.kind === 'event'
    ? `<a href="#/events">${esc(e.title || 'Event')}</a>`
    : `<span>${esc(e.title || e.content || meta.label)}</span>`;
  return `
  <div class="map-popup">
    <div class="map-popup-label">${esc(fmtDate(e.occurred_at))} · ${esc(meta.label)}</div>
    <div class="jt-popup-title">${titleHtml}</div>
    ${e.location ? `<div class="map-popup-label">${esc(e.location)}</div>` : ''}
  </div>`;
}

async function renderMapView(container, entries) {
  const pins = entries.filter((e) =>
    Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude)) &&
    e.latitude !== null && e.longitude !== null);
  if (!pins.length) {
    container.innerHTML = emptyState('map-pin', 'Nothing located yet',
      'Add locations to travels, journal entries, or events and your movements show up here.');
    return;
  }

  let L;
  try {
    L = await loadLeaflet();
  } catch (err) {
    container.innerHTML = emptyState('alert-circle', "Couldn't load the map", err?.message || 'Try again shortly.');
    return;
  }
  if (!container.isConnected) return; // user navigated away mid-load

  container.innerHTML = '<div class="jt-map-canvas"></div>';
  const canvas = container.firstElementChild;
  const map = createMap(canvas, { center: [20, 0], zoom: 2 });

  for (const e of pins) {
    L.marker([Number(e.latitude), Number(e.longitude)], { icon: pinIcon(L, e) })
      .addTo(map)
      .bindPopup(pinPopupHtml(e), { maxWidth: 260 });
  }

  // travel path: chronological dashed polyline through travel pins
  const travels = pins
    .filter((e) => e.kind === 'journal' && e.sub === 'travel')
    .sort((a, b) => (parseDate(a.occurred_at)?.getTime() || 0) - (parseDate(b.occurred_at)?.getTime() || 0));
  if (travels.length >= 2) {
    // Leaflet writes the color as an SVG attribute — CSS vars don't resolve
    // there, so read the computed token value.
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2b5566';
    L.polyline(travels.map((e) => [Number(e.latitude), Number(e.longitude)]), {
      dashArray: '4 6', weight: 1.5, color: accent,
    }).addTo(map);
  }

  const latlngs = pins.map((e) => [Number(e.latitude), Number(e.longitude)]);
  if (latlngs.length === 1) map.setView(latlngs[0], 10);
  else map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 12 });

  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 300);
}

// ------------------------------------------------------------------ page
async function renderTimelinePage(el) {
  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Timeline</span></span>
      <span class="rec-actions" id="tl-view-pills">${filterPills(VIEW_PILLS, 'list', 'view')}</span>
    </div>
    <div class="rec-rule-strong"></div>
    <div class="rec-count-serif">Everything you were part of — moments, travels, and events in one feed.</div>
    <div class="jt-filters">${filterPills(TYPE_PILLS, '', 'type')}</div>
    <div id="tl-body">${emptyState('clock', 'Loading…', 'Fetching your timeline.')}</div>
    <div id="tl-footer" class="text-center mt-3"></div>
  </div>`;

  const body = el.querySelector('#tl-body');
  const footer = el.querySelector('#tl-footer');
  let view = 'list';
  let type = '';
  let page = 1;
  let total = 0;
  let all = [];

  const params = () => {
    const p = { page, limit: LIMIT };
    if (type === 'journal') p.kind = 'journal';
    else if (type === 'travel') { p.kind = 'journal'; p.sub = 'travel'; }
    else if (type === 'event') p.kind = 'event';
    if (view === 'map') p.located = 1;
    return p;
  };

  const fetchPage = async () => {
    const data = await api.get('/api/journal/timeline' + qs(params()));
    total = Number(data.total) || 0;
    all.push(...(data.entries || []));
    return (data.entries || []).length;
  };

  const renderList = () => {
    const entries = dedupe(all);
    if (!entries.length) {
      body.innerHTML = emptyState('clock', 'Nothing here yet',
        'Journal entries and events you take part in build your timeline.');
      footer.innerHTML = '';
      return;
    }
    body.innerHTML = groupedHtml(entries);
    footer.innerHTML = all.length < total
      ? `<button class="btn btn-secondary" id="tl-more">${icon('chevron-down')} Load more</button>`
      : '';
    footer.querySelector('#tl-more')?.addEventListener('click', async () => {
      page += 1;
      footer.innerHTML = '<span class="text-sm text-muted">Loading…</span>';
      try { await fetchPage(); renderList(); } catch (err) {
        footer.innerHTML = `<span class="form-error">${esc(err?.message || 'Failed to load more.')}</span>`;
      }
    });
  };

  const renderMap = async () => {
    footer.innerHTML = '';
    // pull every located page so the map shows the full picture
    while (all.length < total) {
      page += 1;
      const got = await fetchPage();
      if (!got) break;
    }
    await renderMapView(body, dedupe(all));
  };

  const reload = async () => {
    page = 1; total = 0; all = [];
    body.innerHTML = emptyState(view === 'map' ? 'map' : 'clock', 'Loading…', 'Fetching your timeline.');
    footer.innerHTML = '';
    try {
      await fetchPage();
      if (view === 'map') await renderMap();
      else renderList();
    } catch (err) {
      body.innerHTML = emptyState('alert-circle', "Couldn't load the timeline", err?.message || 'Try again shortly.');
      footer.innerHTML = '';
    }
  };

  el.querySelectorAll('[data-view]').forEach((pill) =>
    pill.addEventListener('click', () => {
      if (pill.dataset.view === view) return;
      view = pill.dataset.view;
      el.querySelectorAll('[data-view]').forEach((p) => p.classList.toggle('active', p === pill));
      reload();
    }));

  el.querySelectorAll('[data-type]').forEach((pill) =>
    pill.addEventListener('click', () => {
      if (pill.dataset.type === type) return;
      type = pill.dataset.type;
      el.querySelectorAll('[data-type]').forEach((p) => p.classList.toggle('active', p === pill));
      reload();
    }));

  await reload();
}

pageTitles.timeline = 'Timeline';
pageRenderers.timeline = renderTimelinePage;
