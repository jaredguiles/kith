// Timeline page — the merged life feed rebuilt as a tabbed record:
//   Timeline — a true vertical timeline (spine, sticky year markers, month
//              groups, dated entry cards) over GET /api/journal/timeline
//              (journal entries + events, deduped like before).
//   Map      — Leaflet map of every located moment: event locations from
//              GET /api/timeline/map (primary + event_locations stops,
//              roadtrip polylines) plus located journal entries. CARTO
//              light/dark tiles follow the app theme via the tile proxy.
//   Places   — visited US states + countries bucket list from
//              GET /api/timeline/places (derived from event locations,
//              manual marks toggled via POST/DELETE /api/timeline/places).
// An "+ Add" action creates events / journal entries / notes from here.

import { api, qs } from './api.js';
import { esc, fmtDate, parseDate, loadLeaflet, debounce, initials } from './utils.js';
import { icon } from './icons.js';
import {
  emptyState, filterPills, toast, openModal, modalShell, formGroup, textarea,
} from './components.js';
import { pageRenderers, pageTitles } from './pages.js';
import { createMap } from './map.js';
import { isSpicyOn } from './app.js';
import { JOURNAL_KIND_META, timeOfDay, openJournalEntryModal } from './journal.js';
import { openEventForm } from './events.js';
import { US_STATES, COUNTRIES, STATE_NAME_BY_CODE, COUNTRY_NAME_BY_CODE } from './geodata.js';

const LIMIT = 100;

const TABS = [
  { value: 'timeline', label: 'Timeline' },
  { value: 'map', label: 'Map' },
  { value: 'places', label: 'Places' },
];
const TYPE_PILLS = [
  { value: '', label: 'All' },
  { value: 'journal', label: 'Journal' },
  { value: 'travel', label: 'Travel' },
  { value: 'event', label: 'Events' },
];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

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

// ------------------------------------------------- vertical timeline view
function entryCardHtml(e) {
  const meta = rowMeta(e);
  const spicy = e.is_spicy && isSpicyOn();
  const d = parseDate(e.occurred_at);
  const dayLabel = d ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  return `
  <div class="vtl-entry ${spicy ? 'has-spicy-data' : ''}">
    <span class="vtl-date"><span class="vtl-day">${esc(dayLabel)}</span><span class="vtl-time">${esc(timeOfDay(e.occurred_at))}</span></span>
    <span class="vtl-node" aria-hidden="true"></span>
    <div class="vtl-card">
      <span class="jt-kind-chip jt-kind-${esc(e.kind === 'event' ? 'event' : e.sub || 'entry')}">${icon(meta.icon)}${esc(meta.label)}${spicy ? ' · private' : ''}</span>
      ${e.title ? (e.kind === 'event'
        ? `<div class="vtl-title"><a href="#/events">${esc(e.title)}</a></div>`
        : `<div class="vtl-title">${esc(e.title)}</div>`) : ''}
      ${e.content ? `<div class="vtl-body">${esc(e.content)}</div>` : ''}
      <div class="jt-meta-row">
        ${withHtml(e)}
        ${e.location ? `<span class="jt-meta">${icon('map-pin')}${esc(e.location)}</span>` : ''}
      </div>
    </div>
  </div>`;
}

/** Group entries (already sorted desc) by year → month and render the spine. */
function verticalTimelineHtml(entries) {
  let out = '<div class="vtl">';
  let lastYear = null;
  let lastMonth = null;
  let openYear = false;
  for (const e of entries) {
    const d = parseDate(e.occurred_at);
    const year = d ? d.getFullYear() : 0;
    const month = d ? d.getMonth() : -1;
    if (year !== lastYear) {
      if (openYear) out += '</div>'; // close .vtl-year-block
      out += `<div class="vtl-year-block">
        <div class="vtl-year">${year ? esc(String(year)) : 'Undated'}<span class="rec-fill"></span></div>`;
      openYear = true;
      lastYear = year;
      lastMonth = null;
    }
    if (month !== lastMonth) {
      out += `<div class="vtl-month">${month >= 0 ? esc(MONTH_NAMES[month]) : ''}</div>`;
      lastMonth = month;
    }
    out += entryCardHtml(e);
  }
  if (openYear) out += '</div>';
  out += '</div>';
  return out;
}

// ------------------------------------------------------------------- map
const EV_ICONS = {
  meetup: 'users', date: 'heart', hangout: 'coffee', hookup: 'flame', party: 'party-popper',
  trip: 'plane', call: 'phone-call', dinner: 'utensils', coffee: 'coffee', workout: 'dumbbell',
};

function pinIcon(L, kindCls, iconName) {
  return L.divIcon({
    className: 'jt-map-pin-wrap',
    html: `<span class="jt-map-pin jt-pin-${esc(kindCls)}">${icon(iconName)}</span>`,
    iconSize: [28, 34],
    iconAnchor: [14, 34],
    popupAnchor: [0, -32],
  });
}

function eventPinPopupHtml(p) {
  return `
  <div class="map-popup">
    <div class="map-popup-label">${esc(fmtDate(p.starts_at))} · ${esc(p.type || 'event')}</div>
    <div class="jt-popup-title"><a href="#/events">${esc(p.title || 'Event')}</a></div>
    ${p.label ? `<div class="map-popup-label">${esc(p.label)}</div>` : ''}
  </div>`;
}

function journalPinPopupHtml(e) {
  const meta = rowMeta(e);
  return `
  <div class="map-popup">
    <div class="map-popup-label">${esc(fmtDate(e.occurred_at))} · ${esc(meta.label)}</div>
    <div class="jt-popup-title">${esc(e.title || e.content || meta.label)}</div>
    ${e.location ? `<div class="map-popup-label">${esc(e.location)}</div>` : ''}
  </div>`;
}

function clusterPopupHtml(group) {
  return `
  <div class="map-popup">
    <div class="map-popup-label" style="margin-bottom:6px">${group.length} moments here</div>
    ${group.slice(0, 12).map((p) => `
      <div class="jt-popup-title">${p.event_id != null
        ? `<a href="#/events">${esc(p.title || 'Event')}</a>`
        : esc(p.title || p.label || 'Entry')} <span class="map-popup-label">${esc(fmtDate(p.starts_at || p.occurred_at))}</span></div>`).join('')}
    ${group.length > 12 ? `<div class="map-popup-label">…and ${group.length - 12} more</div>` : ''}
  </div>`;
}

// Cell clustering like map.js (zoom-adaptive; ~56px separation).
const CLUSTER_PX = 56;
const cellForZoom = (zoom) => (360 / (256 * Math.pow(2, zoom))) * CLUSTER_PX;
function clusterPins(pins, cell) {
  const buckets = new Map();
  for (const p of pins) {
    const key = `${Math.round(p.lat / cell)}:${Math.round(p.lng / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  return [...buckets.values()];
}

/** CARTO tile style per theme: light_all in light, dark_all in dark (served
 * through the authenticated /api/geo/tiles proxy — see routes/geo.js). */
function timelineMapStyle() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

async function renderMapTab(container, journalEntries) {
  let L, mapData;
  try {
    [L, mapData] = await Promise.all([loadLeaflet(), api.get('/api/timeline/map')]);
  } catch (err) {
    container.innerHTML = emptyState('alert-circle', "Couldn't load the map", err?.message || 'Try again shortly.');
    return;
  }
  if (!container.isConnected) return; // navigated away mid-load

  const eventPins = (mapData.pins || []).filter((p) =>
    Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)))
    .map((p) => ({ ...p, lat: Number(p.lat), lng: Number(p.lng) }));
  const journalPins = journalEntries
    .filter((e) => e.kind === 'journal' &&
      Number.isFinite(Number(e.latitude)) && Number.isFinite(Number(e.longitude)) &&
      e.latitude !== null && e.longitude !== null)
    .map((e) => ({ ...e, lat: Number(e.latitude), lng: Number(e.longitude) }));

  const allPins = [...eventPins, ...journalPins];
  if (!allPins.length) {
    container.innerHTML = emptyState('map-pin', 'Nothing located yet',
      'Add locations to events and journal entries and your movements show up here.');
    return;
  }

  container.innerHTML = '<div class="jt-map-canvas"></div>';
  const map = createMap(container.firstElementChild, {
    center: [20, 0], zoom: 2, style: timelineMapStyle(),
    attribution: '© OpenStreetMap © CARTO',
  });

  const markerLayer = L.layerGroup().addTo(map);
  const renderMarkers = () => {
    markerLayer.clearLayers();
    const groups = clusterPins(allPins, cellForZoom(map.getZoom()));
    for (const group of groups) {
      if (group.length === 1) {
        const p = group[0];
        const isEvent = p.event_id != null;
        const kindCls = isEvent ? 'event' : (p.sub || 'entry');
        const iconName = isEvent
          ? (EV_ICONS[p.type] || 'calendar')
          : (JOURNAL_KIND_META[p.sub]?.icon || 'book-open');
        L.marker([p.lat, p.lng], { icon: pinIcon(L, kindCls, iconName) })
          .addTo(markerLayer)
          .bindPopup(isEvent ? eventPinPopupHtml(p) : journalPinPopupHtml(p), { maxWidth: 260 });
      } else {
        const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
        const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
        const badge = L.divIcon({
          className: 'map-cluster-icon',
          html: `<span class="map-cluster-badge">${group.length}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const m = L.marker([lat, lng], { icon: badge, title: `${group.length} moments` }).addTo(markerLayer);
        if (map.getZoom() >= 15) {
          m.bindPopup(clusterPopupHtml(group), { maxWidth: 260 });
        } else {
          m.on('click', () => {
            const b = L.latLngBounds(group.map((p) => [p.lat, p.lng]));
            if (b.getNorthEast().equals(b.getSouthWest())) map.setView(b.getCenter(), Math.min(map.getZoom() + 3, 17));
            else map.flyToBounds(b, { padding: [60, 60], maxZoom: 16, duration: 0.6 });
          });
        }
      }
    }
  };
  map.on('zoomend', renderMarkers);
  renderMarkers();

  // Leaflet writes stroke colors as SVG attributes — resolve the CSS token.
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#2b5566';

  // roadtrip paths: dashed polyline through each multi-location event's stops
  const byEvent = new Map();
  for (const p of eventPins) {
    if (!byEvent.has(p.event_id)) byEvent.set(p.event_id, []);
    byEvent.get(p.event_id).push(p);
  }
  for (const stops of byEvent.values()) {
    if (stops.length < 2) continue;
    stops.sort((a, b) => (a.primary ? -1 : b.primary ? 1 : 0));
    L.polyline(stops.map((p) => [p.lat, p.lng]), { dashArray: '4 6', weight: 1.5, color: accent }).addTo(map);
  }

  // travel path: chronological dashed polyline through journal travel pins
  const travels = journalPins
    .filter((e) => e.sub === 'travel')
    .sort((a, b) => (parseDate(a.occurred_at)?.getTime() || 0) - (parseDate(b.occurred_at)?.getTime() || 0));
  if (travels.length >= 2) {
    L.polyline(travels.map((e) => [e.lat, e.lng]), { dashArray: '4 6', weight: 1.5, color: accent, opacity: 0.6 }).addTo(map);
  }

  const latlngs = allPins.map((p) => [p.lat, p.lng]);
  if (latlngs.length === 1) map.setView(latlngs[0], 10);
  else map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 12 });

  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 300);
}

// ---------------------------------------------------------------- places
function placeTileHtml(kind, code, name, mark) {
  const visited = Boolean(mark);
  const manual = mark?.source === 'manual' || mark?.source === 'both';
  const derived = mark?.source === 'derived' || mark?.source === 'both';
  return `
  <button class="place-tile ${visited ? 'visited' : ''} ${derived ? 'derived' : ''}"
    data-place-kind="${esc(kind)}" data-place-code="${esc(code)}" data-manual="${manual ? '1' : '0'}"
    ${derived && !manual ? 'title="Derived from your events"' : ''}
    aria-pressed="${visited ? 'true' : 'false'}">
    <span class="place-check">${visited ? icon('check') : ''}</span>
    <span class="place-code">${esc(code)}</span>
    <span class="place-name">${esc(name)}</span>
  </button>`;
}

async function renderPlacesTab(container) {
  container.innerHTML = emptyState('globe', 'Loading…', 'Counting the places you\u2019ve been.');
  let data;
  try {
    data = await api.get('/api/timeline/places');
  } catch (err) {
    container.innerHTML = emptyState('alert-circle', "Couldn't load places", err?.message || 'Try again shortly.');
    return;
  }
  if (!container.isConnected) return;

  const stateMarks = new Map((data.us_states || []).map((s) => [s.code, s]));
  const countryMarks = new Map((data.countries || []).map((c) => [c.code, c]));
  // Marks for countries not in the display list (e.g. exotic territory codes)
  // still count toward the stats.
  const knownCountry = new Set(COUNTRIES.map((c) => c.code));
  const extraCountries = [...countryMarks.keys()].filter((c) => !knownCountry.has(c));

  const stateCount = [...stateMarks.keys()].filter((c) => STATE_NAME_BY_CODE.has(c)).length;
  const countryCount = countryMarks.size;

  container.innerHTML = `
  <div class="places-wrap">
    <div class="places-stats">
      <div class="places-stat">
        <span class="places-stat-num">${stateCount}<span class="places-stat-of">/${US_STATES.length}</span></span>
        <span class="places-stat-label">US states</span>
      </div>
      <div class="places-stat">
        <span class="places-stat-num">${countryCount}<span class="places-stat-of">/${COUNTRIES.length}</span></span>
        <span class="places-stat-label">countries</span>
      </div>
      <div class="places-hint">Derived from your event locations — click a tile to mark places from before the record began.</div>
    </div>
    <div class="rec-section-head"><span class="rec-idx">01</span><span class="rec-label">States</span><span class="rec-fill"></span></div>
    <div class="place-grid">
      ${US_STATES.map((s) => placeTileHtml('us_state', s.code, s.name, stateMarks.get(s.code))).join('')}
    </div>
    <div class="rec-section-head"><span class="rec-idx">02</span><span class="rec-label">Countries</span><span class="rec-fill"></span></div>
    <div class="place-grid place-grid-countries">
      ${COUNTRIES.map((c) => placeTileHtml('country', c.code, c.name, countryMarks.get(c.code))).join('')}
      ${extraCountries.map((code) => placeTileHtml('country', code, COUNTRY_NAME_BY_CODE.get(code) || code, countryMarks.get(code))).join('')}
    </div>
  </div>`;

  container.querySelectorAll('[data-place-kind]').forEach((tile) =>
    tile.addEventListener('click', async () => {
      const kind = tile.dataset.placeKind;
      const code = tile.dataset.placeCode;
      const visited = tile.classList.contains('visited');
      const manual = tile.dataset.manual === '1';
      if (visited && !manual) {
        toast('This one comes from your events — it can\u2019t be unchecked.', 'error');
        return;
      }
      tile.disabled = true;
      try {
        if (visited) await api.del(`/api/timeline/places/${encodeURIComponent(kind)}/${encodeURIComponent(code)}`);
        else await api.post('/api/timeline/places', { kind, code });
        await renderPlacesTab(container); // re-derive stats + tiles
      } catch (err) {
        tile.disabled = false;
        toast(err.message || "Couldn't save that.", 'error');
      }
    }));
}

// ------------------------------------------------------------- add action
// Quick note: notes are per-contact, so the compact modal includes a
// contact search (same pattern as the event form's People field).
function openQuickNoteModal(onSaved) {
  const content = `
    <div class="form-group">
      <label class="form-label">Who is this about?</label>
      <div id="qn-picked" class="mb-1"></div>
      <div class="search-input-wrap">${icon('search')}<input class="form-input" id="qn-search" placeholder="Type a name" autocomplete="off"></div>
      <div id="qn-results"></div>
    </div>
    ${formGroup('Note', textarea('content', '', 'placeholder="Write it down while it\u2019s fresh." style="min-height:90px"'))}`;
  openModal(modalShell('quick-note', 'New note', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Add note</button>`), {
    onMount: (overlay, close) => {
      let picked = null;
      const pickedEl = overlay.querySelector('#qn-picked');
      const searchInput = overlay.querySelector('#qn-search');
      const resultsEl = overlay.querySelector('#qn-results');
      const renderPicked = () => {
        pickedEl.innerHTML = picked
          ? `<span class="tag-pill">${esc(picked.name)}<button class="tag-x" data-unpick aria-label="Remove">${icon('x')}</button></span>`
          : '<span class="text-sm text-muted">No one picked yet.</span>';
        pickedEl.querySelector('[data-unpick]')?.addEventListener('click', () => { picked = null; renderPicked(); });
      };
      renderPicked();
      searchInput.addEventListener('input', debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { resultsEl.innerHTML = ''; return; }
        let found;
        try { found = await api.get('/api/contacts' + qs({ search: q, limit: 6 })); } catch { return; }
        resultsEl.innerHTML = (found.contacts || [])
          .map((c) => `<button class="popover-item w-full" data-pick="${c.id}" data-name="${esc(c.display_name)}"><span class="av sm" style="width:22px;height:22px;font-size:9px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}</button>`)
          .join('');
        resultsEl.querySelectorAll('[data-pick]').forEach((b) =>
          b.addEventListener('click', () => {
            picked = { id: Number(b.dataset.pick), name: b.dataset.name };
            searchInput.value = '';
            resultsEl.innerHTML = '';
            renderPicked();
          }));
      }, 250));
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const content = overlay.querySelector('[name="content"]').value.trim();
        if (!picked) { toast('Pick who the note is about.', 'error'); return; }
        if (!content) { toast('Write something first.', 'error'); return; }
        try {
          await api.post('/api/notes', { contact_id: picked.id, content });
          toast('Note added.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

function wireAddMenu(el, reload) {
  const wrap = el.querySelector('#tl-add-wrap');
  const btn = el.querySelector('[data-action="tl-add"]');
  btn?.addEventListener('click', () => {
    const existing = wrap.querySelector('.popover');
    if (existing) { existing.remove(); return; }
    const pop = document.createElement('div');
    pop.className = 'popover';
    pop.innerHTML = `
      <button class="popover-item" data-add="event">${icon('calendar')} Event</button>
      <button class="popover-item" data-add="journal">${icon('book-open')} Journal entry</button>
      <button class="popover-item" data-add="note">${icon('sticky-note')} Note</button>`;
    wrap.appendChild(pop);
    const closePop = (e) => { if (!wrap.contains(e.target)) { pop.remove(); document.removeEventListener('click', closePop); } };
    setTimeout(() => document.addEventListener('click', closePop), 0);
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-add]');
      if (!b) return;
      pop.remove();
      if (b.dataset.add === 'event') openEventForm(null, reload);
      else if (b.dataset.add === 'journal') openJournalEntryModal(null, reload);
      else openQuickNoteModal(reload);
    });
  });
}

// ------------------------------------------------------------------ page
async function renderTimelinePage(el) {
  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Timeline</span></span>
      <span class="rec-actions">
        <span id="tl-tabs">${filterPills(TABS, 'timeline', 'tab')}</span>
        <span class="popover-wrap" id="tl-add-wrap">
          <button class="rec-act rec-act-primary" data-action="tl-add">+ Add</button>
        </span>
      </span>
    </div>
    <div class="rec-rule-strong"></div>
    <div class="rec-count-serif">Everything you were part of — moments, travels, and events in one record.</div>
    <div class="jt-filters" id="tl-type-filters">${filterPills(TYPE_PILLS, '', 'type')}</div>
    <div id="tl-body">${emptyState('clock', 'Loading…', 'Fetching your timeline.')}</div>
    <div id="tl-footer" class="text-center mt-3"></div>
  </div>`;

  const body = el.querySelector('#tl-body');
  const footer = el.querySelector('#tl-footer');
  const typeFilters = el.querySelector('#tl-type-filters');
  let tab = 'timeline';
  let type = '';
  let page = 1;
  let total = 0;
  let all = [];

  const params = () => {
    const p = { page, limit: LIMIT };
    if (type === 'journal') p.kind = 'journal';
    else if (type === 'travel') { p.kind = 'journal'; p.sub = 'travel'; }
    else if (type === 'event') p.kind = 'event';
    if (tab === 'map') { p.located = 1; p.kind = 'journal'; }
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
    body.innerHTML = verticalTimelineHtml(entries);
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
    // pull every located journal page so the map shows the full picture
    // (event pins come from /api/timeline/map inside renderMapTab)
    while (all.length < total) {
      page += 1;
      const got = await fetchPage();
      if (!got) break;
    }
    await renderMapTab(body, dedupe(all));
  };

  const reload = async () => {
    page = 1; total = 0; all = [];
    footer.innerHTML = '';
    typeFilters.classList.toggle('hidden', tab !== 'timeline');
    if (tab === 'places') {
      await renderPlacesTab(body);
      return;
    }
    body.innerHTML = emptyState(tab === 'map' ? 'map' : 'clock', 'Loading…', 'Fetching your timeline.');
    try {
      await fetchPage();
      if (tab === 'map') await renderMap();
      else renderList();
    } catch (err) {
      body.innerHTML = emptyState('alert-circle', "Couldn't load the timeline", err?.message || 'Try again shortly.');
      footer.innerHTML = '';
    }
  };

  el.querySelectorAll('[data-tab]').forEach((pill) =>
    pill.addEventListener('click', () => {
      if (pill.dataset.tab === tab) return;
      tab = pill.dataset.tab;
      el.querySelectorAll('[data-tab]').forEach((p) => p.classList.toggle('active', p === pill));
      reload();
    }));

  el.querySelectorAll('[data-type]').forEach((pill) =>
    pill.addEventListener('click', () => {
      if (pill.dataset.type === type) return;
      type = pill.dataset.type;
      el.querySelectorAll('[data-type]').forEach((p) => p.classList.toggle('active', p === pill));
      reload();
    }));

  wireAddMenu(el, reload);
  await reload();
}

pageTitles.timeline = 'Timeline';
pageRenderers.timeline = renderTimelinePage;
