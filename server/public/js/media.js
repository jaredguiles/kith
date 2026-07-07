// Media gallery UI — enriches contact detail (#contact-media) and provides
// upload + lightbox + set-profile-photo.

import { api, qs } from './api.js';
import { esc, fmtDate } from './utils.js';
import { icon } from './icons.js';
import { emptyState, modalShell, formGroup, toast, openModal, confirmModal, filterPills } from './components.js';
import { isSpicyOn } from './app.js';

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

  container.innerHTML = `
    ${canEdit ? `
    <div class="flex gap-2 mb-3 flex-wrap">
      <input type="file" id="media-file" accept="${UPLOAD_ACCEPT}" multiple class="hidden">
      <button class="btn btn-secondary" id="upload-media">${icon('upload')} Upload</button>
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
        : `<img src="/api/media/${m.id}/${m.type === 'video' ? 'thumbnail' : 'file'}" alt="${esc(m.caption || '')}" loading="lazy">`}
      ${m.type === 'video' ? `<span class="media-type">${icon('video')}</span>` : ''}
      <span class="media-tile-cap">${esc(m.caption || `Plate ${String(Number(m.id) || 0).padStart(3, '0')}`)}</span>
    </button>`;
}

function openLightbox(m, contact, canEdit, reload, refreshDetail) {
  const body = `
    <div class="text-center mb-3 rec-lightbox-frame">
      ${m.type === 'video'
        ? `<video src="/api/media/${m.id}/file" controls style="max-width:100%;max-height:60vh"></video>`
        : `<img src="/api/media/${m.id}/file" alt="${esc(m.caption || '')}" style="max-width:100%;max-height:60vh">`}
    </div>
    ${canEdit ? formGroup('Caption', `<input class="form-input" name="caption" value="${esc(m.caption || '')}">`) : (m.caption ? `<p class="rec-serif" style="font-style:italic">${esc(m.caption)}</p>` : '')}
    <div class="rec-mono mt-1">${esc(m.type)} · ${esc(fmtDate(m.created_at))} ${m.is_spicy ? '· private' : ''}</div>`;

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

window.addEventListener('kith:contact-detail-rendered', (e) => {
  const { el, contact, canEdit, share_scope } = e.detail;
  if (share_scope === 'basic') return;
  const mediaEl = el.querySelector('#contact-media');
  if (mediaEl) renderContactMedia(mediaEl, contact, canEdit, e.detail.refresh);
});
