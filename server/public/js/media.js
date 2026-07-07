// Media gallery UI — enriches contact detail (#contact-media) and provides
// upload + lightbox + set-profile-photo.

import { api, qs } from './api.js';
import { esc, fmtDate } from './utils.js';
import { icon } from './icons.js';
import { emptyState, modalShell, formGroup, toast, openModal, confirmModal } from './components.js';
import { isSpicyOn } from './app.js';

async function renderContactMedia(container, contact, canEdit, refresh) {
  let data;
  try {
    data = await api.get('/api/media' + qs({ contact_id: contact.id }));
  } catch {
    container.innerHTML = '<div class="text-sm text-muted">Media unavailable.</div>';
    return;
  }
  const media = data.media || [];

  container.innerHTML = `
    ${canEdit ? `
    <div class="flex gap-2 mb-3">
      <input type="file" id="media-file" accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,video/webm,video/x-matroska" multiple class="hidden">
      <button class="btn btn-secondary" id="upload-media">${icon('upload')} Upload</button>
      ${isSpicyOn() ? `<button type="button" class="btn-flame" id="media-spicy" aria-label="Mark upload spicy" aria-pressed="false">${icon('flame')}</button>` : ''}
      <span class="text-xs text-muted flex items-center" id="upload-status"></span>
    </div>` : ''}
    ${media.length ? `
    <div class="media-grid">
      ${media.map((m) => `
        <button class="media-tile ${m.is_spicy ? 'is-spicy' : ''}" data-media-id="${m.id}" data-media-type="${esc(m.type)}" aria-label="View media">
          ${m.type === 'video' && !m.has_thumbnail
            ? `<span class="media-tile-placeholder">${icon('video')}</span>`
            : `<img src="/api/media/${m.id}/${m.type === 'video' ? 'thumbnail' : 'file'}" alt="${esc(m.caption || '')}" loading="lazy">`}
          ${m.type === 'video' ? `<span class="media-type">${icon('video')}</span>` : ''}
        </button>`).join('')}
    </div>` : emptyState('image', 'No media yet', canEdit ? 'Upload photos or videos of this person.' : 'Nothing here.')}`;

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
        renderContactMedia(container, contact, canEdit, refresh);
      } catch (err) {
        statusEl.textContent = '';
        toast(err.message, 'error');
      }
    });
  }

  container.querySelectorAll('[data-media-id]').forEach((tile) =>
    tile.addEventListener('click', () => {
      const m = media.find((x) => String(x.id) === tile.dataset.mediaId);
      openLightbox(m, contact, canEdit, () => renderContactMedia(container, contact, canEdit, refresh), refresh);
    })
  );
}

function openLightbox(m, contact, canEdit, reload, refreshDetail) {
  const body = `
    <div class="text-center mb-3">
      ${m.type === 'video'
        ? `<video src="/api/media/${m.id}/file" controls style="max-width:100%;max-height:60vh;border-radius:var(--radius-md)"></video>`
        : `<img src="/api/media/${m.id}/file" alt="${esc(m.caption || '')}" style="max-width:100%;max-height:60vh;border-radius:var(--radius-md)">`}
    </div>
    ${canEdit ? formGroup('Caption', `<input class="form-input" name="caption" value="${esc(m.caption || '')}">`) : (m.caption ? `<p class="text-sm">${esc(m.caption)}</p>` : '')}
    <div class="text-xs text-muted">${esc(m.type)} · ${esc(fmtDate(m.created_at))} ${m.is_spicy ? '· spicy' : ''}</div>`;

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
