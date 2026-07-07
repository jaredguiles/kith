// Map page — all contact pins on a Leaflet map (vendored, tiles proxied
// through /api/geo/tiles). Exports createMap() for contact-detail mini-maps.

import { api, qs } from './api.js';
import { esc, initials, loadLeaflet } from './utils.js';
import { icon } from './icons.js';
import { emptyState, toast } from './components.js';
import { pageRenderers } from './pages.js';

/**
 * Create a Leaflet map on `el` with the authenticated same-origin tile proxy.
 * Call after loadLeaflet() has resolved. Returns the L.Map instance.
 * opts: { center: [lat,lng], zoom, ...L.MapOptions }
 */
export function createMap(el, opts = {}) {
  const L = window.L;
  const { center = [30, 0], zoom = 2, ...rest } = opts;
  const map = L.map(el, { center, zoom, worldCopyJump: true, ...rest });
  L.tileLayer('/api/geo/tiles/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  return map;
}

// Group pins that sit within ~0.02° of each other (light clustering, no plugin).
function clusterPins(pins, cell = 0.02) {
  const buckets = new Map();
  for (const p of pins) {
    const lat = Number(p.lat), lng = Number(p.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${Math.round(lat / cell)}:${Math.round(lng / cell)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push({ ...p, lat, lng });
  }
  return [...buckets.values()];
}

function pinPopupHtml(p) {
  const img = p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : '';
  return `
  <div class="map-popup">
    <a class="map-popup-contact" href="#/contacts/${encodeURIComponent(p.contact_id)}">
      <span class="av sm">${esc(initials(p.display_name))}${img}</span>
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
        <span class="av sm">${esc(initials(p.display_name))}${p.photo_url ? `<img src="${esc(p.photo_url)}" alt="">` : ''}</span>
        <span class="map-popup-name">${esc(p.display_name)}</span>
      </a>`).join('')}
  </div>`;
}

async function renderMapPage(el) {
  el.innerHTML = `
  <div class="map-page">
    <div class="map-toolbar">
      <div>
        <h1 class="page-title">Map</h1>
      </div>
      <form class="search-input-wrap map-search" id="map-search-form">
        ${icon('search')}
        <input class="form-input" id="map-search-input" placeholder="Find a place…" autocomplete="off" aria-label="Search for a place">
      </form>
    </div>
    <div class="map-canvas-wrap card" style="padding:0">
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

  const useClusters = pins.length > 50;
  const groups = useClusters ? clusterPins(pins) : pins.map((p) => [{ ...p, lat: Number(p.lat), lng: Number(p.lng) }]);
  const allLatLngs = [];

  for (const group of groups) {
    if (group.length === 1) {
      const p = group[0];
      allLatLngs.push([p.lat, p.lng]);
      L.marker([p.lat, p.lng], { title: p.display_name })
        .addTo(map)
        .bindPopup(pinPopupHtml(p), { maxWidth: 260 });
    } else {
      const lat = group.reduce((s, p) => s + p.lat, 0) / group.length;
      const lng = group.reduce((s, p) => s + p.lng, 0) / group.length;
      allLatLngs.push([lat, lng]);
      const badge = L.divIcon({
        className: 'map-cluster-icon',
        html: `<span class="map-cluster-badge">${group.length}</span>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });
      L.marker([lat, lng], { icon: badge, title: `${group.length} people` })
        .addTo(map)
        .bindPopup(clusterPopupHtml(group), { maxWidth: 260 });
    }
  }

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
