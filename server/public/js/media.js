// Media gallery UI — enriches contact detail (#contact-media) and provides
// upload + lightbox + set-profile-photo.

import { api, qs } from './api.js';
import { esc, fmtDate, debounce } from './utils.js';
import { icon } from './icons.js';
import { emptyState, modalShell, formGroup, toast, openModal, confirmModal, filterPills } from './components.js';
import { isSpicyOn } from './app.js';

// Immich instances — fetched once per session (also gates the picker button).
let immichInstancesCache = null;
async function getImmichInstances() {
  if (immichInstancesCache === null) {
    try {
      immichInstancesCache = (await api.get('/api/immich/instances')).instances || [];
    } catch {
      immichInstancesCache = [];
    }
  }
  return immichInstancesCache;
}

const UPLOAD_ACCEPT = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
  '.pdf', '.txt', '.md', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.zip',
].join(',');

const MEDIA_FILTERS = [
  { value: '', label: 'All' }, { value: 'photo', label: 'Photos' },
  { value: 'video', label: 'Videos' }, { value: 'document', label: 'Documents' },
];

async function renderContactMedia(container, contact, canEdit, refresh, typeFilter = '') {
  let data;
  try {
    data = await api.get('/api/media' + qs({ contact_id: contact.id, type: typeFilter || undefined }));
  } catch {
    container.innerHTML = '<div class="text-sm text-muted">Media unavailable.</div>';
    return;
  }
  const media = data.media || [];
  const immichInstances = canEdit ? await getImmichInstances() : [];

  container.innerHTML = `
    ${canEdit ? `
    <div class="flex gap-2 mb-3 flex-wrap">
      <input type="file" id="media-file" accept="${UPLOAD_ACCEPT}" multiple class="hidden">
      <button class="btn btn-secondary" id="upload-media">${icon('upload')} Upload</button>
      ${immichInstances.length ? `<button class="btn btn-secondary" id="immich-pick">${icon('image')} Immich</button>` : ''}
      ${isSpicyOn() ? `<button type="button" class="btn-flame" id="media-spicy" aria-label="Mark upload spicy" aria-pressed="false">${icon('lock')}<span class="conf-label">private</span></button>` : ''}
      <span class="text-xs text-muted flex items-center" id="upload-status"></span>
    </div>` : ''}
    <div class="mb-2" id="media-type-filter">${filterPills(MEDIA_FILTERS, typeFilter, 'media-type')}</div>
    ${media.length ? `
    <div class="media-grid">
      ${media.map((m) => mediaTileHtml(m)).join('')}
    </div>` : emptyState('image', typeFilter ? 'Nothing here' : 'No media yet', canEdit ? 'Upload photos, videos, or documents for this person.' : 'Nothing here.')}`;

  container.querySelectorAll('#media-type-filter .filter-pill').forEach((p) =>
    p.addEventListener('click', () =>
      renderContactMedia(container, contact, canEdit, refresh, p.dataset.mediaType)));

  if (canEdit) {
    const fileInput = container.querySelector('#media-file');
    const spicyBtn = container.querySelector('#media-spicy');
    let uploadSpicy = false;
    spicyBtn?.addEventListener('click', () => {
      uploadSpicy = !uploadSpicy;
      spicyBtn.classList.toggle('active', uploadSpicy);
      spicyBtn.setAttribute('aria-pressed', uploadSpicy ? 'true' : 'false');
    });
    container.querySelector('#upload-media')?.addEventListener('click', () => fileInput.click());
    container.querySelector('#immich-pick')?.addEventListener('click', () =>
      openImmichPicker({
        contactId: contact.id,
        onPicked: () => renderContactMedia(container, contact, canEdit, refresh, typeFilter),
      }));
    fileInput?.addEventListener('change', async () => {
      if (!fileInput.files.length) return;
      const statusEl = container.querySelector('#upload-status');
      statusEl.textContent = `Uploading ${fileInput.files.length} file${fileInput.files.length > 1 ? 's' : ''}…`;
      const form = new FormData();
      for (const f of fileInput.files) form.append('files', f);
      form.append('contact_id', contact.id);
      if (uploadSpicy) form.append('is_spicy', 'true');
      try {
        await api.post('/api/media', form);
        toast('Media uploaded.');
        renderContactMedia(container, contact, canEdit, refresh, typeFilter);
      } catch (err) {
        statusEl.textContent = '';
        toast(err.message, 'error');
      }
    });
  }

  container.querySelectorAll('[data-media-id]').forEach((tile) =>
    tile.addEventListener('click', () => {
      const m = media.find((x) => String(x.id) === tile.dataset.mediaId);
      if (!m) return;
      if (m.type === 'document') {
        // documents download (attachment disposition; cookie auth rides along)
        const a = document.createElement('a');
        a.href = `/api/media/${m.id}/file`;
        a.download = m.original_name || '';
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
      openLightbox(m, contact, canEdit, () => renderContactMedia(container, contact, canEdit, refresh, typeFilter), refresh);
    })
  );
}

function mediaTileHtml(m) {
  if (m.type === 'document') {
    return `
      <button class="media-tile media-doc-tile ${m.is_spicy ? 'is-spicy' : ''}" data-media-id="${m.id}" data-media-type="document" aria-label="Download ${esc(m.original_name || 'document')}">
        <span class="media-tile-placeholder media-doc-inner">
          ${icon('file-text')}
          <span class="media-doc-name">${esc(m.original_name || 'Document')}</span>
        </span>
      </button>`;
  }
  return `
    <button class="media-tile ${m.is_spicy ? 'is-spicy' : ''}" data-media-id="${m.id}" data-media-type="${esc(m.type)}" aria-label="View media">
      ${m.type === 'video' && !m.has_thumbnail
        ? `<span class="media-tile-placeholder">${icon('video')}</span>`
        : `<img src="/api/media/${m.id}/${m.type === 'video' || m.is_immich ? 'thumbnail' : 'file'}" alt="${esc(m.caption || '')}" loading="lazy">`}
      ${m.type === 'video' ? `<span class="media-type">${icon('video')}</span>` : ''}
      <span class="media-tile-cap">${esc(m.caption || `Plate ${String(Number(m.id) || 0).padStart(3, '0')}`)}</span>
    </button>`;
}

/** Lightbox modal for a photo/video media object. `contact`, `reload`,
 * `refreshDetail` optional; pass canEdit=false for a view-only lightbox
 * (event media tiles use it that way). */
export function openLightbox(m, contact, canEdit, reload, refreshDetail) {
  const body = `
    <div class="text-center mb-3 rec-lightbox-frame">
      ${m.type === 'video'
        ? `<video src="/api/media/${m.id}/file" controls style="max-width:100%;max-height:60vh"></video>`
        : `<img src="/api/media/${m.id}/file" alt="${esc(m.caption || '')}" style="max-width:100%;max-height:60vh">`}
    </div>
    ${canEdit ? formGroup('Caption', `<input class="form-input" name="caption" value="${esc(m.caption || '')}">`) : (m.caption ? `<p class="rec-serif" style="font-style:italic">${esc(m.caption)}</p>` : '')}
    <div class="rec-mono mt-1">${esc(m.type)}${m.created_at ? ` · ${esc(fmtDate(m.created_at))}` : ''} ${m.is_spicy ? '· private' : ''}</div>`;

  const footer = canEdit ? `
    <button class="btn btn-danger" data-action="delete-media">Delete</button>
    <span style="flex:1"></span>
    ${isSpicyOn() ? `<button class="btn btn-secondary" data-action="toggle-spicy">${m.is_spicy ? 'Unmark spicy' : 'Mark spicy'}</button>` : ''}
    ${m.type === 'photo' && m.is_profile_eligible ? `<button class="btn btn-secondary" data-action="set-profile">Set as profile photo</button>` : ''}
    <button class="btn btn-primary" data-action="save-caption">Save</button>` : '';

  openModal(modalShell('lightbox', contact ? `Media — ${contact.display_name}` : 'Media', body, footer, { size: 'modal-lg' }), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="delete-media"]')?.addEventListener('click', async () => {
        close();
        const ok = await confirmModal('Delete media', "Delete this file? This can't be undone.");
        if (!ok) return;
        try {
          await api.del(`/api/media/${m.id}`);
          toast('Media deleted.');
          reload?.();
        } catch (err) { toast(err.message, 'error'); }
      });
      overlay.querySelector('[data-action="toggle-spicy"]')?.addEventListener('click', async () => {
        try {
          await api.put(`/api/media/${m.id}`, { is_spicy: !m.is_spicy });
          toast(m.is_spicy ? 'Unmarked.' : 'Marked spicy.');
          close();
          reload?.();
        } catch (err) { toast(err.message, 'error'); }
      });
      overlay.querySelector('[data-action="set-profile"]')?.addEventListener('click', async () => {
        try {
          await api.put(`/api/contacts/${contact.id}/photo`, { media_id: m.id });
          toast('Profile photo set.');
          close();
          refreshDetail?.();
        } catch (err) { toast(err.message, 'error'); }
      });
      overlay.querySelector('[data-action="save-caption"]')?.addEventListener('click', async () => {
        try {
          await api.put(`/api/media/${m.id}`, { caption: overlay.querySelector('[name="caption"]').value || null });
          toast('Saved.');
          close();
          reload?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ---------------------------------------------------------------- Immich picker
// Modal photo picker for connected Immich libraries. Thumbnails proxy through
// the server (/api/immich/...), so cookie auth rides along — the browser
// never talks to Immich or sees an API key. Multi-pick: stays open, marks
// picked tiles.
//
// Browse modes: Search (default, semantic/recent) plus Albums / People /
// Tags / Folders — each shows a second-level list that drills into the same
// asset grid. Tabs whose upstream endpoint 404s (older Immich) hide
// themselves.

// Extra picker styles injected once (style.css is owned elsewhere). Blocky
// paper/ink rows per "The Record" — no border-radius anywhere.
function ensurePickerStyles() {
  if (document.getElementById('immich-picker-ext-css')) return;
  const style = document.createElement('style');
  style.id = 'immich-picker-ext-css';
  style.textContent = `
    #immich-mode-tabs .filter-pills { flex-wrap: wrap; border-radius: 0; }
    #immich-mode-tabs .filter-pill { border-radius: 0; }
    .immich-browse-list { border-top: 1px solid var(--rule); max-height: 48vh; overflow-y: auto; }
    .immich-browse-row {
      display: flex; align-items: center; gap: 10px;
      width: 100%; text-align: left; padding: 7px 6px;
      background: none; border: 0; border-bottom: 1px solid var(--rule);
      border-radius: 0; cursor: pointer; color: var(--ink); font: inherit;
    }
    .immich-browse-row:hover { background: var(--panel); }
    .immich-browse-thumb, .immich-browse-icon {
      width: 32px; height: 32px; flex: none;
      border: 1px solid var(--rule); border-radius: 0;
    }
    .immich-browse-thumb { object-fit: cover; display: block; }
    .immich-browse-icon {
      display: flex; align-items: center; justify-content: center;
      color: var(--muted); background: var(--panel);
    }
    .immich-browse-icon svg { width: 16px; height: 16px; }
    .immich-browse-label {
      flex: 1; min-width: 0; font-size: 13px;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .immich-browse-meta { flex: none; font-size: 11px; color: var(--muted); }
    #immich-subbar:empty { display: none; }
    #immich-drill-label {
      font-size: 12px; min-width: 0;
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }`;
  document.head.appendChild(style);
}

const IMMICH_MODES = [
  { value: 'search', label: 'Search' },
  { value: 'albums', label: 'Albums' },
  { value: 'people', label: 'People' },
  { value: 'tags', label: 'Tags' },
  { value: 'folders', label: 'Folders' },
];
const IMMICH_BROWSE_ICON = { album: 'image', person: 'user', tag: 'tag', folder: 'folder' };

export function openImmichPicker({ contactId = null, onPicked } = {}) {
  ensurePickerStyles();
  const body = `
    <div id="immich-picker-controls" class="flex gap-2 mb-2 flex-wrap">
      <select class="form-select" id="immich-instance" style="max-width:200px" aria-label="Library"></select>
      <div id="immich-mode-tabs" role="tablist" aria-label="Browse mode">${filterPills(IMMICH_MODES, 'search', 'immich-mode')}</div>
    </div>
    <div id="immich-subbar" class="flex gap-2 mb-2 items-center flex-wrap"></div>
    <div class="text-xs text-muted mb-2 hidden" id="immich-fallback-hint">Semantic search unavailable — showing recent photos</div>
    <div id="immich-grid-wrap"><div class="text-sm text-muted">Loading…</div></div>
    <div class="text-center mt-3 hidden" id="immich-more-wrap">
      <button class="btn btn-secondary btn-sm" id="immich-more">Load more</button>
    </div>`;

  openModal(modalShell('immich-picker', 'Attach from Immich', body, '', { size: 'modal-lg' }), {
    onMount: async (overlay) => {
      const instances = await getImmichInstances();
      const controls = overlay.querySelector('#immich-picker-controls');
      const tabsEl = overlay.querySelector('#immich-mode-tabs');
      const subbar = overlay.querySelector('#immich-subbar');
      const gridWrap = overlay.querySelector('#immich-grid-wrap');
      const moreWrap = overlay.querySelector('#immich-more-wrap');
      const hintEl = overlay.querySelector('#immich-fallback-hint');

      if (!instances.length) {
        controls.classList.add('hidden');
        gridWrap.innerHTML = emptyState('image', 'No Immich libraries', 'Add an Immich library in Settings to attach photos from your photo server.');
        return;
      }

      const instSel = overlay.querySelector('#immich-instance');
      instSel.innerHTML = instances
        .map((i) => `<option value="${esc(String(i.id))}">${esc(i.name)}${i.is_spicy ? ' 🔒' : ''}</option>`)
        .join('');

      // ----- state
      const picked = new Set();
      let mode = 'search';        // search | albums | people | tags | folders
      let drill = null;           // { type, id, label } — selected album/person/tag/folder
      let searchQuery = '';
      let items = [];
      let nextPage = null;
      let appending = false;
      const listCache = {};       // `${instanceId}:${mode}` → browse entries

      // Stale-response guard: every load bumps the token; responses that
      // come back after a newer load started are discarded (fast typing
      // must not let an older, slower search overwrite newer results).
      let reqToken = 0;

      // ----- asset grid
      const tileHtml = (a) => `
        <button class="immich-tile ${picked.has(a.id) ? 'picked' : ''}" data-asset-id="${esc(a.id)}" aria-label="Attach ${esc(a.originalFileName || 'photo')}" title="${esc(a.originalFileName || '')}">
          <img src="/api/immich/${esc(instSel.value)}/assets/${esc(a.id)}/thumbnail?size=thumbnail" alt="${esc(a.originalFileName || '')}" loading="lazy">
          ${a.type === 'VIDEO' ? `<span class="media-type">${icon('video')}</span>` : ''}
          <span class="immich-picked-check">${icon('check')}</span>
        </button>`;

      const bindTiles = () => {
        gridWrap.querySelectorAll('.immich-tile').forEach((tile) =>
          tile.addEventListener('click', async () => {
            const assetId = tile.dataset.assetId;
            if (picked.has(assetId) || tile.disabled) return;
            tile.disabled = true;
            try {
              const res = await api.post('/api/media/immich', {
                instance_id: Number(instSel.value),
                asset_id: assetId,
                contact_id: contactId || undefined,
              });
              picked.add(assetId);
              tile.classList.add('picked');
              toast('Photo attached.');
              onPicked?.(res.id);
            } catch (err) {
              toast(err.message, 'error');
            }
            tile.disabled = false;
          }));
      };

      const renderGrid = () => {
        gridWrap.innerHTML = items.length
          ? `<div class="immich-grid">${items.map(tileHtml).join('')}</div>`
          : emptyState('image', 'No photos found', mode === 'search' ? 'Try a different search.' : 'Nothing in here.');
        moreWrap.classList.toggle('hidden', nextPage === null);
        bindTiles();
      };

      const loadGrid = async (append = false) => {
        if (append && appending) return;
        const token = ++reqToken;
        if (append) appending = true;
        else {
          gridWrap.innerHTML = '<div class="text-sm text-muted">Loading…</div>';
          moreWrap.classList.add('hidden');
        }
        try {
          let res;
          if (mode === 'folders' && drill) {
            // folder view isn't paginated upstream
            res = await api.get(`/api/immich/${instSel.value}/folder` + qs({ path: drill.id }));
          } else {
            const bodyReq = { page: append && nextPage ? Number(nextPage) : 1, size: 40 };
            if (mode === 'search') bodyReq.query = searchQuery || undefined;
            else if (drill?.type === 'album') bodyReq.album_id = drill.id;
            else if (drill?.type === 'person') bodyReq.person_id = drill.id;
            else if (drill?.type === 'tag') bodyReq.tag_id = drill.id;
            res = await api.post(`/api/immich/${instSel.value}/search`, bodyReq);
          }
          if (token !== reqToken) return; // stale — a newer load superseded us
          items = append ? items.concat(res.items || []) : (res.items || []);
          nextPage = res.nextPage ?? null;
          hintEl.classList.toggle('hidden', !res.fallback);
          renderGrid();
        } catch (err) {
          if (token !== reqToken) return;
          gridWrap.innerHTML = emptyState('alert-circle', "Couldn't reach Immich", err?.message || 'Check the library connection in Settings.');
          moreWrap.classList.add('hidden');
        } finally {
          if (append) appending = false;
        }
      };

      // ----- second-level browse lists (albums / people / tags / folders)
      const rowHtml = (e, idx) => `
        <button class="immich-browse-row" data-idx="${idx}" title="${esc(e.label)}">
          ${e.thumb
            ? `<img class="immich-browse-thumb" src="${esc(e.thumb)}" alt="" loading="lazy">`
            : `<span class="immich-browse-icon">${icon(IMMICH_BROWSE_ICON[e.type] || 'image')}</span>`}
          <span class="immich-browse-label">${esc(e.label)}</span>
          ${e.meta ? `<span class="immich-browse-meta rec-mono">${esc(e.meta)}</span>` : ''}
        </button>`;

      const renderList = (entries, filterText = '') => {
        const ft = filterText.trim().toLowerCase();
        const shown = ft ? entries.filter((e) => e.label.toLowerCase().includes(ft)) : entries;
        gridWrap.innerHTML = shown.length
          ? `<div class="immich-browse-list">${shown.map((e) => rowHtml(e, entries.indexOf(e))).join('')}</div>`
          : emptyState(IMMICH_BROWSE_ICON[mode === 'people' ? 'person' : mode.replace(/s$/, '')] || 'image',
              `No ${mode} found`, ft ? 'No match for that filter.' : `This library has no ${mode === 'people' ? 'named people' : mode}.`);
        gridWrap.querySelectorAll('.immich-browse-row').forEach((row) => {
          row.addEventListener('click', () => {
            drill = entries[Number(row.dataset.idx)];
            update();
          });
          // person thumbnails can 404 (no face crop yet) → swap to icon
          const img = row.querySelector('.immich-browse-thumb');
          img?.addEventListener('error', () => {
            const span = document.createElement('span');
            span.className = 'immich-browse-icon';
            span.innerHTML = icon('user');
            img.replaceWith(span);
          });
        });
      };

      const fetchListEntries = async () => {
        if (mode === 'albums') {
          const res = await api.get(`/api/immich/${instSel.value}/albums`);
          return (res.albums || []).map((a) => ({
            type: 'album', id: a.id, label: a.name || 'Untitled', meta: String(Number(a.count) || 0),
          }));
        }
        if (mode === 'people') {
          // aggregate paginated named people (bounded at 5 pages ≈ 500)
          let people = [];
          let page = 1;
          let more = true;
          while (more && page <= 5) {
            const res = await api.get(`/api/immich/${instSel.value}/people` + qs({ page }));
            people = people.concat(res.people || []);
            more = Boolean(res.hasNextPage);
            page += 1;
          }
          return people.map((p) => ({
            type: 'person', id: p.id, label: p.name,
            thumb: `/api/immich/${instSel.value}/people/${p.id}/thumbnail`,
          }));
        }
        if (mode === 'tags') {
          const res = await api.get(`/api/immich/${instSel.value}/tags`);
          return (res.tags || []).map((t) => ({ type: 'tag', id: t.id, label: t.path || t.name }));
        }
        // folders
        const res = await api.get(`/api/immich/${instSel.value}/folders`);
        return (res.folders || []).map((p) => ({ type: 'folder', id: p, label: p }));
      };

      const loadList = async () => {
        const token = ++reqToken;
        hintEl.classList.add('hidden');
        moreWrap.classList.add('hidden');
        gridWrap.innerHTML = '<div class="text-sm text-muted">Loading…</div>';
        const cacheKey = `${instSel.value}:${mode}`;
        try {
          if (!listCache[cacheKey]) listCache[cacheKey] = await fetchListEntries();
          if (token !== reqToken) return; // stale
          const entries = listCache[cacheKey];
          renderList(entries);
          subbar.querySelector('#immich-list-filter')?.addEventListener('input', (e) => {
            if (token !== reqToken) return;
            renderList(entries, e.target.value);
          });
        } catch (err) {
          if (token !== reqToken) return;
          if (err.status === 404) {
            // this Immich version lacks the endpoint → hide the tab entirely
            tabsEl.querySelector(`[data-immich-mode="${mode}"]`)?.remove();
            toast(err.message || `${mode[0].toUpperCase()}${mode.slice(1)} not supported by this Immich server`, 'error');
            setMode('search');
            return;
          }
          gridWrap.innerHTML = emptyState('alert-circle', "Couldn't reach Immich", err?.message || 'Check the library connection in Settings.');
        }
      };

      // ----- subbar (mode-dependent second row)
      const renderSubbar = () => {
        if (mode === 'search') {
          subbar.innerHTML = `<div class="search-input-wrap flex-1" style="min-width:180px">${icon('search')}<input class="form-input" id="immich-search" placeholder="Search photos… (semantic)" autocomplete="off"></div>`;
          const input = subbar.querySelector('#immich-search');
          input.value = searchQuery;
          input.addEventListener('input', debounce(() => {
            searchQuery = input.value.trim();
            loadGrid();
          }, 350));
        } else if (drill) {
          subbar.innerHTML = `
            <button class="btn btn-secondary btn-sm" id="immich-back">${icon('chevron-left')} Back</button>
            <span class="rec-mono text-muted" id="immich-drill-label">${esc(drill.label)}</span>`;
          subbar.querySelector('#immich-back').addEventListener('click', () => {
            drill = null;
            update();
          });
        } else {
          subbar.innerHTML = `<div class="search-input-wrap flex-1" style="min-width:180px">${icon('search')}<input class="form-input" id="immich-list-filter" placeholder="Filter ${esc(mode)}…" autocomplete="off"></div>`;
          // (input listener bound in loadList once entries exist)
        }
      };

      const update = () => {
        renderSubbar();
        if (mode === 'search' || drill) loadGrid();
        else loadList();
      };

      const setMode = (m) => {
        mode = m;
        drill = null;
        tabsEl.querySelectorAll('.filter-pill').forEach((p) =>
          p.classList.toggle('active', p.dataset.immichMode === m));
        update();
      };

      // ----- wiring
      tabsEl.querySelectorAll('.filter-pill').forEach((pill) =>
        pill.addEventListener('click', () => setMode(pill.dataset.immichMode)));
      instSel.addEventListener('change', () => {
        drill = null; // browse lists are per-library
        update();
      });
      overlay.querySelector('#immich-more').addEventListener('click', () => loadGrid(true));

      update();
    },
  });
}

window.addEventListener('kith:contact-detail-rendered', (e) => {
  const { el, contact, canEdit, share_scope } = e.detail;
  if (share_scope === 'basic') return;
  const mediaEl = el.querySelector('#contact-media');
  if (mediaEl) renderContactMedia(mediaEl, contact, canEdit, e.detail.refresh);
});
