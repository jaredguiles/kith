// Map page — all contact pins on a Leaflet map (vendored, tiles proxied
// through /api/geo/tiles). Exports createMap() + avatarPin() for
// contact-detail mini-maps.

import { api, qs } from './api.js';
import { esc, initials, avatarColorIndex, loadLeaflet } from './utils.js';
import { icon } from './icons.js';
import { emptyState, toast } from './components.js';
import { pageRenderers } from './pages.js';
import { state } from './app.js';

// Whitelisted tile styles (mirrors server/routes/geo.js TILE_STYLES; the
// switcher itself renders from GET /api/geo/styles so labels stay in sync).
const VALID_STYLES = ['osm', 'light', 'dark', 'voyager', 'topo'];
const DEFAULT_ATTRIBUTION = '&copy; OpenStreetMap';

const tileUrl = (style) => `/api/geo/tiles/${encodeURIComponent(style)}/{z}/{x}/{y}.png`;

/** Resolve the effective tile style: explicit user preference, else follow
 * the app theme (dark → 'dark' tiles, light → 'voyager'). */
export function resolveMapStyle() {
  const saved = state.preferences?.map_style;
  if (VALID_STYLES.includes(saved)) return saved;
  const theme = document.documentElement.getAttribute('data-theme');
  return theme === 'light' ? 'voyager' : 'dark';
}

/**
 * Circular avatar pin (accent ring + tail) for contact markers. Replaces
 * L.Icon.Default, whose image path resolution breaks under the vendored
 * setup (renders as a missing-image placeholder). Initials render under the
 * photo <img>; the element keeps class 'av' so the document-level error
 * listener in app.js strips broken photos back to initials.
 */
export function avatarPin(L, contact) {
  const img = contact?.photo_url ? `<img src="${esc(contact.photo_url)}" alt="">` : '';
  return L.divIcon({
    className: 'map-avatar-pin',
    html: `<span class="av pin-av avc-${avatarColorIndex(contact?.display_name)}">${esc(initials(contact?.display_name))}${img}</span>`,
    iconSize: [36, 44],
    iconAnchor: [18, 44],
    popupAnchor: [0, -42],
  });
}

/**
 * Create a Leaflet map on `el` with the authenticated same-origin tile proxy.
 * Call after loadLeaflet() has resolved. Returns the L.Map instance.
 * opts: { center: [lat,lng], zoom, style, attribution, ...L.MapOptions }
 * style defaults to resolveMapStyle(); the active tile layer is kept on
 * map._kithTileLayer so callers can swap styles.
 */
export function createMap(el, opts = {}) {
  const L = window.L;
  const { center = [30, 0], zoom = 2, style, attribution, ...rest } = opts;
  const map = L.map(el, { center, zoom, worldCopyJump: true, ...rest });
  const resolved = VALID_STYLES.includes(style) ? style : resolveMapStyle();
  map._kithTileLayer = L.tileLayer(tileUrl(resolved), {
    maxZoom: 19,
    attribution: attribution || DEFAULT_ATTRIBUTION,
  }).addTo(map);
  map._kithStyle = resolved;
  return map;
}

/** Swap the map's tile layer to another whitelisted style. */
function setMapStyle(map, styleId, attribution) {
  const L = window.L;
  if (!VALID_STYLES.includes(styleId) || map._kithStyle === styleId) return;
  if (map._kithTileLayer) map.removeLayer(map._kithTileLayer);
  map._kithTileLayer = L.tileLayer(tileUrl(styleId), {
    maxZoom: 19,
    attribution: attribution || DEFAULT_ATTRIBUTION,
  }).addTo(map);
  map._kithStyle = styleId;
}

// Group pins whose cells (in degrees) collide at the given cell size.
function clusterPins(pins, cell = 0.02) {
  const buckets = new Map();
  for (const p of pins) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${Math.round(lat / cell)}:${Math.round(lng / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ ...p, lat, lng });
  }
  return [...buckets.values()].map(dedupeByContact);
}

// Zoom-adaptive cell size: pins closer than ~CLUSTER_PX pixels at the current
// zoom merge into one numbered cluster. Zooming in shrinks the cell, so
// clusters split apart and reveal individual people progressively.
const CLUSTER_PX = 56;
function cellForZoom(zoom) {
  // degrees of longitude per pixel at the equator × desired pixel separation
  return (360 / (256 * Math.pow(2, zoom))) * CLUSTER_PX;
}

// Group ONLY pins at the (near-)identical coordinate. Used even when broad
// clustering is off: two people at the exact same lat/lng would otherwise
// stack precisely on top of each other, leaving only the top marker
// clickable. Rounding to ~1m (5 decimals) folds duplicate geocodes together.
function groupExactPins(pins, precision = 5) {
  const buckets = new Map();
  for (const p of pins) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat.toFixed(precision)}:${lng.toFixed(precision)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ ...p, lat, lng });
  }
  return [...buckets.values()].map(dedupeByContact);
}

// Within a co-located group, never list the same person twice — a contact with
// two addresses that round to the same point, or an address + free-text
// location at the same spot, must appear once. Keeps the first occurrence.
function dedupeByContact(group) {
  const seen = new Set();
  const out = [];
  for (const p of group) {
    if (seen.has(p.contact_id)) continue;
    seen.add(p.contact_id);
    out.push(p);
  }
  return out;
}

function pinPopupHtml(p) {
  const img = p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : '';
  return `
  <div class="map-popup">
    <a class="map-popup-contact" href="#/contacts/${encodeURIComponent(p.contact_id)}">
      <span class="av sm avc-${avatarColorIndex(p.display_name)}">${esc(initials(p.display_name))}${img}</span>
      <span class="map-popup-name">${esc(p.display_name)}</span>
    </a>
    ${p.label ? `<div class="map-popup-label">${esc(p.label)}</div>` : ''}
  </div>`;
}

function clusterPopupHtml(group) {
  return `
  <div class="map-popup">
    <div class="map-popup-label" style="margin-bottom:6px">${group.length} people here</div>
    ${group.map((p) => `
      <a class="map-popup-contact" href="#/contacts/${encodeURIComponent(p.contact_id)}">
        <span class="av sm avc-${avatarColorIndex(p.display_name)}">${esc(initials(p.display_name))}${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : ''}</span>
        <span class="map-popup-name">${esc(p.display_name)}</span>
      </a>`).join('')}
  </div>`;
}

// ---------------------------------------------------------- style switcher
/** Compact pill control, top-right over the map. Persists the choice as the
 * per-user 'map_style' preference (arbitrary keys are accepted by
 * PUT /api/preferences/:key — only KNOWN_PREFS values are constrained). */
async function renderStyleSwitcher(el, map) {
  const wrap = el.querySelector('.map-canvas-wrap');
  if (!wrap) return;
  let styles = [];
  try {
    styles = (await api.get('/api/geo/styles')).styles || [];
  } catch { return; } // no switcher without the style list — map still works
  if (!styles.length || !el.isConnected) return;

  const host = document.createElement('div');
  host.className = 'map-style-switcher';
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', 'Map style');
  host.innerHTML = styles.map((s) => `
    <button class="map-style-pill ${s.id === map._kithStyle ? 'active' : ''}"
      data-style="${esc(s.id)}" data-attribution="${esc(s.attribution || '')}"
      aria-pressed="${s.id === map._kithStyle ? 'true' : 'false'}">${esc(s.label || s.id)}</button>`).join('');
  wrap.appendChild(host);

  host.querySelectorAll('[data-style]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const styleId = btn.dataset.style;
      if (styleId === map._kithStyle) return;
      setMapStyle(map, styleId, btn.dataset.attribution || undefined);
      host.querySelectorAll('[data-style]').forEach((b) => {
        const on = b.dataset.style === styleId;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      try {
        await api.put('/api/preferences/map_style', { value: styleId, type: 'string' });
        state.preferences.map_style = styleId;
      } catch (err) {
        toast(err.message || "Couldn't save the map style.", 'error');
      }
    }));
}

async function renderMapPage(el) {
  el.innerHTML = `
  <div class="map-page">
    <div class="map-toolbar">
      <span class="rec-crumb"><span>Map</span></span>
      <form class="search-input-wrap map-search" id="map-search-form">
        ${icon('search')}
        <input class="form-input" id="map-search-input" placeholder="Find a place…" autocomplete="off" aria-label="Search for a place">
      </form>
    </div>
    <div class="map-canvas-wrap" style="padding:0">
      <div id="map-canvas" class="map-canvas">
        <div class="empty-state">${icon('map')}<h3>Loading map…</h3><p>Fetching pins and tiles.</p></div>
      </div>
    </div>
  </div>`;

  let L, data;
  try {
    [L, data] = await Promise.all([loadLeaflet(), api.get('/api/geo/contacts')]);
  } catch (err) {
    const canvas = el.querySelector('#map-canvas');
    if (canvas) canvas.innerHTML = emptyState('alert-circle', "Couldn't load the map", err?.message || 'Try again shortly.');
    return;
  }

  const pins = (data.pins || []).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)));
  const canvas = el.querySelector('#map-canvas');
  if (!canvas) return; // user navigated away mid-load

  if (!pins.length) {
    canvas.innerHTML = emptyState('map-pin', 'No mapped contacts yet', 'Add addresses or locations to your people and they show up here.');
    return;
  }

  canvas.innerHTML = '';
  const map = createMap(canvas, { center: [20, 0], zoom: 2 });
  renderStyleSwitcher(el, map);

  // Zoom-adaptive clustering: nearby pins (e.g. two people in one city plus
  // one in the town next door) collapse into a numbered badge instead of
  // overlapping; zooming in re-buckets with a smaller cell so the badge
  // splits and individual avatar pins appear. Clicking a badge zooms in.
  const markerLayer = L.layerGroup().addTo(map);
  const renderMarkers = () => {
    markerLayer.clearLayers();
    const zoom = map.getZoom();
    // at street zoom stop broad clustering; only fold exact-coordinate stacks
    const groups = zoom >= 15 ? groupExactPins(pins) : clusterPins(pins, cellForZoom(zoom));
    for (const group of groups) {
      if (group.length === 1) {
        const p = group[0];
        L.marker([p.lat, p.lng], { title: p.display_name, icon: avatarPin(L, p) })
          .addTo(markerLayer)
          .bindPopup(pinPopupHtml(p), { maxWidth: 260 });
      } else {
        const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
        const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
        const badge = L.divIcon({
          className: 'map-cluster-icon',
          html: `<span class="map-cluster-badge">${group.length}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const m = L.marker([lat, lng], { icon: badge, title: `${group.length} people` }).addTo(markerLayer);
        if (map.getZoom() >= 15) {
          // exact-coordinate stack — can't be split by zooming; list the people
          m.bindPopup(clusterPopupHtml(group), { maxWidth: 260 });
        } else {
          // spread cluster — zoom toward it to reveal the individuals
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

  const allLatLngs = pins.map((p) => [Number(p.lat), Number(p.lng)]);
  if (allLatLngs.length === 1) map.setView(allLatLngs[0], 11);
  else map.fitBounds(L.latLngBounds(allLatLngs), { padding: [40, 40], maxZoom: 13 });

  // Container was just injected — sizes settle a tick later.
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 300);

  // Place search → flyTo
  const form = el.querySelector('#map-search-form');
  const input = el.querySelector('#map-search-input');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    input.disabled = true;
    try {
      const res = await api.get('/api/geo/search' + qs({ q }));
      if (res && Number.isFinite(Number(res.lat)) && Number.isFinite(Number(res.lng))) {
        map.flyTo([Number(res.lat), Number(res.lng)], 12, { duration: 1.2 });
        if (res.label) {
          L.popup({ maxWidth: 260 })
            .setLatLng([Number(res.lat), Number(res.lng)])
            .setContent(`<div class="map-popup"><div class="map-popup-label">${esc(res.label)}</div></div>`)
            .openOn(map);
        }
      }
    } catch (err) {
      // 404 → not found; anything else → generic
      const msg = err?.status === 404 ? 'No place found for that search.' : (err?.message || 'Search failed.');
      toast(msg, 'error');
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}

pageRenderers.map = renderMapPage;
