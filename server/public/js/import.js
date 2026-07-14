// Import system UI: upload modal, progress widget, data review page.

import { api, qs } from './api.js';
import { esc, fmtDate, initials, debounce } from './utils.js';
import { icon } from './icons.js';
import {
  emptyState, modalShell, formGroup, selectInput, toast, openModal,
  confirmModal, withBusy,
} from './components.js';
import { pageRenderers } from './pages.js';
import { state, navigate, isSpicyOn, refreshSidebarLists, refreshNotifCount } from './app.js';

const PLATFORMS = [
  { value: 'vcard', label: 'vCard (.vcf)', hint: 'Standard contact cards — Apple, Google, Monica exports' },
  { value: 'gedcom', label: 'GEDCOM (.ged)', hint: 'Family tree files — Ancestry, MyHeritage, FamilySearch, Gramps. People AND their family links import together.' },
  { value: 'csv', label: 'CSV', hint: 'Spreadsheet with a header row; columns mapped before import' },
  { value: 'google_contacts', label: 'Google Contacts / Takeout', hint: '.vcf, .csv, or Takeout .zip' },
  { value: 'facebook', label: 'Facebook export', hint: '.zip from Download Your Information (JSON format)' },
  { value: 'instagram', label: 'Instagram export', hint: '.zip from Download Your Data (JSON format)' },
  { value: 'twitter', label: 'Twitter/X export', hint: '.zip archive from X data download' },
];

const PLATFORM_LABELS = {
  vcard: 'vCard', csv: 'CSV', google_contacts: 'Google Contacts',
  facebook: 'Facebook', instagram: 'Instagram', twitter: 'Twitter/X', gedcom: 'GEDCOM',
};

// ---------------------------------------------------------- upload helper
/** POST a FormData via XMLHttpRequest so upload progress is observable
 * (fetch can't report request-body progress). Auth rides on the httpOnly
 * session cookie (same-origin). Resolves parsed JSON, rejects Error with
 * .status like api.js. */
function uploadWithProgress(url, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded, e.total);
    });
    xhr.addEventListener('load', () => {
      const data = xhr.response;
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const err = new Error(data?.error || `Upload failed (${xhr.status})`);
        err.status = xhr.status;
        reject(err);
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Upload failed — check your connection.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));
    xhr.send(form);
  });
}

// ------------------------------------------------------------ upload modal
export function openImportModal(preselect = 'vcard') {
  const initial = PLATFORMS.find((p) => p.value === preselect) || PLATFORMS[0];
  const content = `
    ${formGroup('Source', selectInput('source_platform', PLATFORMS, initial.value, 'id="import-platform"'))}
    <div class="form-hint mb-3" id="platform-hint">${esc(initial.hint)}</div>
    <div class="form-group">
      <label class="form-label">Files</label>
      <input type="file" id="import-files" class="form-input" multiple accept=".zip,.vcf,.vcard,.csv,.json,.ged" style="padding:12px">
    </div>
    <div id="csv-mapping" class="hidden"></div>
    <div id="upload-progress" class="hidden" aria-live="polite">
      <div class="flex-between mb-1">
        <span class="uppercase-label">Uploading</span>
        <span class="rec-mono" id="upload-progress-pct">0%</span>
      </div>
      <div class="iw-bar"><div class="iw-bar-fill" id="upload-progress-fill" style="width:0%"></div></div>
    </div>
    ${isSpicyOn() ? `
    <div class="toggle-row">
      <div><div class="toggle-label">Treat this import as spicy</div><div class="toggle-desc">Imported contacts, messages, and media get the spicy flag.</div></div>
      <button type="button" role="switch" aria-checked="false" class="toggle-switch" data-toggle="is_spicy_source"></button>
    </div>` : ''}`;

  openModal(modalShell('import', 'Import contacts', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="start-import">Start import</button>`,
    { size: 'modal-lg' }), {
    onMount: (overlay, close) => {
      const platformSel = overlay.querySelector('#import-platform');
      const hintEl = overlay.querySelector('#platform-hint');
      const filesInput = overlay.querySelector('#import-files');
      const mappingEl = overlay.querySelector('#csv-mapping');
      let csvMapping = null;

      platformSel.addEventListener('change', () => {
        const p = PLATFORMS.find((x) => x.value === platformSel.value);
        hintEl.textContent = p?.hint || '';
        mappingEl.classList.add('hidden');
        csvMapping = null;
      });

      overlay.querySelector('[data-toggle]')?.addEventListener('click', (e) => {
        e.currentTarget.classList.toggle('on');
        e.currentTarget.setAttribute('aria-checked', e.currentTarget.classList.contains('on') ? 'true' : 'false');
      });

      // CSV: peek headers for a mapping step when a file is picked
      filesInput.addEventListener('change', async () => {
        if (platformSel.value !== 'csv' || !filesInput.files.length) return;
        const form = new FormData();
        form.append('files', filesInput.files[0]);
        form.append('peek', 'true');
        try {
          const data = await api.post('/api/import/csv', form);
          csvMapping = { ...data.auto_map };
          const FIELD_OPTIONS = ['', 'display_name', 'first_name', 'last_name', 'nickname', 'email', 'phone', 'birthday', 'location', 'bio', 'occupation', 'company', 'website'];
          mappingEl.classList.remove('hidden');
          mappingEl.innerHTML = `
            <div class="uppercase-label mb-2">Column mapping</div>
            ${data.headers.map((h) => `
              <div class="form-row" style="align-items:center;margin-bottom:6px">
                <span class="text-sm truncate" style="flex:1">${esc(h)}</span>
                <span style="flex:1">${selectInput(`map-${h}`, FIELD_OPTIONS.map((f) => ({ value: f, label: f ? f.replace(/_/g, ' ') : '— skip —' })), data.auto_map[h] || '', `data-map-header="${esc(h)}"`)}</span>
              </div>`).join('')}`;
          mappingEl.querySelectorAll('[data-map-header]').forEach((sel) =>
            sel.addEventListener('change', () => {
              if (sel.value) csvMapping[sel.dataset.mapHeader] = sel.value;
              else delete csvMapping[sel.dataset.mapHeader];
            }));
        } catch (err) { toast(err.message, 'error'); }
      });

      const startBtn = overlay.querySelector('[data-action="start-import"]');
      startBtn.addEventListener('click', withBusy(startBtn, async () => {
        if (!filesInput.files.length) { toast('Pick at least one file.', 'error'); return; }
        const form = new FormData();
        for (const f of filesInput.files) form.append('files', f);
        form.append('source_platform', platformSel.value);
        const spicyToggle = overlay.querySelector('[data-toggle="is_spicy_source"]');
        if (spicyToggle?.classList.contains('on')) form.append('is_spicy_source', 'true');
        if (platformSel.value === 'csv' && csvMapping) form.append('column_mapping', JSON.stringify(csvMapping));
        // XHR (not fetch) so a multi-GB zip shows real upload progress
        const progWrap = overlay.querySelector('#upload-progress');
        const progFill = overlay.querySelector('#upload-progress-fill');
        const progPct = overlay.querySelector('#upload-progress-pct');
        progWrap.classList.remove('hidden');
        try {
          await uploadWithProgress('/api/import/upload', form, (loaded, total) => {
            const pct = Math.min(100, Math.round((loaded / total) * 100));
            progFill.style.width = `${pct}%`;
            progPct.textContent = `${pct}%`;
          });
          toast('Import started. Processing in the background.');
          close();
          pollImportWidget(true);
        } catch (err) {
          progWrap.classList.add('hidden');
          progFill.style.width = '0%';
          progPct.textContent = '0%';
          toast(err.message, 'error');
        }
      }));
    },
  });
}

// --------------------------------------------------------- progress widget
let widgetTimer = null;

async function pollImportWidget(active = false) {
  clearTimeout(widgetTimer);
  const host = document.getElementById('import-widget-host');
  if (!host || !state.user) return;
  let jobs;
  try {
    jobs = (await api.get('/api/import/jobs')).jobs || [];
  } catch (err) {
    // transient failure — keep polling instead of silently going dormant,
    // but stop on auth loss (401 handling reloads to login anyway).
    if (err?.status !== 401) widgetTimer = setTimeout(() => pollImportWidget(active), 8000);
    return;
  }

  const live = jobs.filter((j) => ['queued', 'processing', 'awaiting_review'].includes(j.status));
  if (!live.length) {
    host.innerHTML = '';
    if (active) widgetTimer = setTimeout(() => pollImportWidget(false), 8000);
    return;
  }

  host.innerHTML = live.slice(0, 3).map((j) => {
    const pct = j.total_records ? Math.round((j.processed_records / j.total_records) * 100) : 0;
    const label = j.status === 'awaiting_review' ? 'Ready for review'
      : j.status === 'processing' ? `Processing… ${j.processed_records}/${j.total_records || '?'}`
      : 'Queued';
    return `
    <div class="import-widget" style="position:relative;right:auto;bottom:auto;margin-top:8px">
      <div class="iw-row">
        <span class="feed-icon" style="width:28px;height:28px">${icon('import')}</span>
        <div class="flex-1">
          <div class="iw-title">${esc(PLATFORM_LABELS[j.source_platform] || j.source_platform)} import</div>
          <div class="iw-status">${esc(label)}</div>
        </div>
      </div>
      ${j.status === 'processing' ? `<div class="iw-bar"><div class="iw-bar-fill" style="width:${pct}%"></div></div>` : ''}
      ${j.status === 'awaiting_review' ? `<button class="btn btn-primary btn-sm btn-block" data-review-job="${j.id}">Review now</button>` : ''}
    </div>`;
  }).join('');

  // pin the container
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:90;display:flex;flex-direction:column;';
  host.querySelectorAll('[data-review-job]').forEach((b) =>
    b.addEventListener('click', () => navigate(`/review?job_id=${b.dataset.reviewJob}`)));

  widgetTimer = setTimeout(() => pollImportWidget(true), live.some((j) => j.status !== 'awaiting_review') ? 3000 : 15000);
}

// ------------------------------------------------------------- review page
async function renderReview(el, params) {
  let records = [];
  let jobs = [];
  try {
    [records, jobs] = await Promise.all([
      api.get('/api/import/review' + qs({ job_id: params.job_id })).then((d) => d.records),
      api.get('/api/import/jobs').then((d) => d.jobs),
    ]);
  } catch (err) {
    el.innerHTML = `<div class="page-inner">${emptyState('import', "Couldn't load", err.message)}</div>`;
    return;
  }

  const byJob = new Map();
  for (const r of records) {
    if (!byJob.has(r.import_job_id)) byJob.set(r.import_job_id, []);
    byJob.get(r.import_job_id).push(r);
  }

  el.innerHTML = `
  <div class="page-inner" style="max-width:900px">
    <div class="rec-toolbar">
      <span class="rec-crumb"><span>Import review</span></span>
      <span class="rec-actions">
        <button class="rec-act rec-act-primary" data-action="new-import">+ New import</button>
      </span>
    </div>
    <div class="rec-rule-strong"></div>
    <div class="rec-count-serif">${records.filter((r) => r.review_status !== 'error').length} records pending</div>
    ${byJob.size === 0 ? emptyState('import', 'Nothing to review', 'Uploaded imports appear here once processed.',
      `<button class="btn btn-primary" data-action="empty-import">${icon('upload')} Import contacts</button>`) : ''}
    ${[...byJob.entries()].map(([jobId, rows]) => {
      const job = jobs.find((j) => j.id === jobId) || {};
      const errRows = rows.filter((r) => r.review_status === 'error');
      const dataRows = rows.filter((r) => r.review_status !== 'error');
      return `
      <div class="rec-section" data-job-block="${jobId}">
        <div class="rec-section-head">
          <span class="rec-label">${esc(PLATFORM_LABELS[job.source_platform] || 'Import')} · ${esc(fmtDate(job.created_at))}</span>
          <span class="rec-fill"></span>
          <button class="rec-head-action" data-bulk-approve="${jobId}">Approve suggested</button>
          <button class="rec-head-action" data-bulk-skip="${jobId}">Skip pending</button>
          <button class="rec-head-action rec-act-primary" data-finalize="${jobId}">Finalize</button>
        </div>
        <div class="rec-mono mb-2">${dataRows.length} profiles${job.is_spicy_source ? ' · private import' : ''}${errRows.length ? ` · ${errRows.length} file issues` : ''}</div>
        ${errRows.length ? `<div class="badge amber mb-2">${errRows.length} parse issue(s)</div>
          <div class="text-xs text-muted mb-3">${errRows.slice(0, 3).map((r) => esc(r.error_message || '')).join('<br>')}</div>` : ''}
        <div data-job-rows>
          ${dataRows.map((r) => reviewRow(r)).join('')}
        </div>
      </div>`;
    }).join('')}
  </div>`;

  el.querySelectorAll('[data-action="new-import"], [data-action="empty-import"]').forEach((b) =>
    b.addEventListener('click', () => openImportModal()));

  // per-row decision handling
  el.querySelectorAll('[data-staging-row]').forEach((row) => bindReviewRow(row, el, params));

  // bulk actions
  el.querySelectorAll('[data-bulk-approve]').forEach((b) =>
    b.addEventListener('click', async () => {
      const jobId = Number(b.dataset.bulkApprove);
      const rows = records.filter((r) => r.import_job_id === jobId && r.review_status === 'pending');
      let failed = 0;
      for (const r of rows) {
        const decision = r.suggested_match_contact_id && Number(r.match_confidence) >= 0.7 ? 'approved_merge' : 'approved_new';
        try {
          await api.put(`/api/import/review/${r.id}`, { review_status: decision });
        } catch (err) {
          if (err?.status === 401) return; // auth lost — abort (api.js reloads)
          failed++;
        }
      }
      if (failed) toast(`${failed} record${failed === 1 ? '' : 's'} failed to update.`, 'error');
      else toast('Suggestions applied. Finalize to commit.');
      renderReview(el, params);
    }));
  el.querySelectorAll('[data-bulk-skip]').forEach((b) =>
    b.addEventListener('click', async () => {
      const jobId = Number(b.dataset.bulkSkip);
      const rows = records.filter((r) => r.import_job_id === jobId && r.review_status === 'pending');
      let failed = 0;
      for (const r of rows) {
        try {
          await api.put(`/api/import/review/${r.id}`, { review_status: 'skipped' });
        } catch (err) {
          if (err?.status === 401) return; // auth lost — abort (api.js reloads)
          failed++;
        }
      }
      if (failed) toast(`${failed} record${failed === 1 ? '' : 's'} failed to skip.`, 'error');
      else toast('Remaining records skipped.');
      renderReview(el, params);
    }));

  // finalize
  el.querySelectorAll('[data-finalize]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmModal('Finalize import', 'Commit all decisions? New contacts are created and merges applied.', { confirmLabel: 'Finalize', danger: false });
      if (!ok) return;
      try {
        const res = await api.post(`/api/import/jobs/${b.dataset.finalize}/finalize`);
        toast(`Done — ${res.created} new, ${res.merged} merged, ${res.skipped} skipped.`);
        refreshSidebarLists();
        refreshNotifCount();
        renderReview(el, params);
        pollImportWidget();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

function reviewRow(r) {
  const d = r.normalized_data || {};
  const conf = r.match_confidence != null ? Math.round(Number(r.match_confidence) * 100) : null;
  const preselect = r.suggested_match_contact_id && conf >= 70;
  const decision = r.review_status !== 'pending' ? r.review_status : (preselect ? 'approved_merge' : null);

  return `
  <div class="feed-item rec-review-row" data-staging-row="${r.id}" data-suggested="${r.suggested_match_contact_id || ''}">
    <div class="feed-body">
      <div class="rec-serif-lg">${esc(d.display_name || 'Unnamed')}</div>
      <div class="rec-mono mt-1">
        ${[d.emails?.[0]?.email, d.phones?.[0]?.phone, d.location,
           d.social_links?.[0] ? `@${d.social_links[0].username || d.social_links[0].platform}` : null,
           d.messages?.length ? `${d.messages.length} messages` : null]
          .filter(Boolean).map(esc).join(' · ')}
      </div>
      <div class="flex gap-2 mt-2 flex-wrap items-center">
        <button class="btn btn-sm ${decision === 'approved_new' ? 'btn-primary' : 'btn-secondary'}" data-decide="approved_new">Create new</button>
        <button class="btn btn-sm ${decision === 'approved_merge' ? 'btn-primary' : 'btn-secondary'}" data-decide="approved_merge" ${!r.suggested_match_contact_id ? 'data-needs-target="1"' : ''}>
          ${r.match_name ? `Merge into ${esc(r.match_name)} (${conf}%)` : 'Merge into…'}
        </button>
        <button class="btn btn-sm ${decision === 'skipped' ? 'btn-primary' : 'btn-ghost'}" data-decide="skipped">Skip</button>
        ${r.suggested_match_contact_id && decision === 'approved_merge' ? `<button class="btn btn-ghost btn-sm" data-conflicts>Review field conflicts</button>` : ''}
        ${decision && r.review_status !== 'pending' ? `<span class="badge green">${esc(decision.replace('approved_', ''))}</span>` : ''}
      </div>
    </div>
  </div>`;
}

function bindReviewRow(row, pageEl, params) {
  const stagingId = Number(row.dataset.stagingRow);

  row.querySelectorAll('[data-decide]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const decision = btn.dataset.decide;
      if (decision === 'approved_merge' && btn.dataset.needsTarget) {
        openMergeTargetPicker(stagingId, () => renderReview(pageEl, params));
        return;
      }
      try {
        await api.put(`/api/import/review/${stagingId}`, { review_status: decision });
        renderReview(pageEl, params);
      } catch (err) { toast(err.message, 'error'); }
    }));

  row.querySelector('[data-conflicts]')?.addEventListener('click', async () => {
    const targetId = Number(row.dataset.suggested);
    openConflictResolution(stagingId, targetId, () => renderReview(pageEl, params));
  });
}

function openMergeTargetPicker(stagingId, onDone) {
  openModal(modalShell('merge-target', 'Pick a contact to merge into',
    `<div class="search-input-wrap">${icon('search')}<input class="form-input" id="mt-search" placeholder="Search your contacts" autocomplete="off"></div>
     <div id="mt-results" class="mt-2"></div>`, ''), {
    onMount: (overlay, close) => {
      const input = overlay.querySelector('#mt-search');
      const results = overlay.querySelector('#mt-results');
      input.addEventListener('input', debounce(async () => {
        const q = input.value.trim();
        if (!q) { results.innerHTML = ''; return; }
        let found;
        try { found = await api.get('/api/contacts' + qs({ search: q, limit: 8 })); }
        catch { return; } // transient search failure — keep last results
        results.innerHTML = (found.contacts || [])
          .map((c) => `<button class="popover-item w-full" data-pick="${c.id}"><span class="av sm" style="width:24px;height:24px;font-size:10px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}</button>`)
          .join('') || '<div class="text-sm text-muted p-2">No matches.</div>';
        results.querySelectorAll('[data-pick]').forEach((b) =>
          b.addEventListener('click', async () => {
            try {
              await api.put(`/api/import/review/${stagingId}`, {
                review_status: 'approved_merge',
                suggested_match_contact_id: Number(b.dataset.pick),
              });
              close();
              onDone?.();
            } catch (err) { toast(err.message, 'error'); }
          }));
      }, 250));
    },
  });
}

async function openConflictResolution(stagingId, targetId, onDone) {
  let staged, target;
  try {
    const [reviewData, contactData] = await Promise.all([
      api.get('/api/import/review'),
      api.get(`/api/contacts/${targetId}`),
    ]);
    staged = (reviewData.records || []).find((r) => r.id === stagingId);
    target = contactData.contact;
  } catch (err) { toast(err.message, 'error'); return; }
  if (!staged) { toast('Record no longer pending.', 'error'); return; }

  const d = staged.normalized_data || {};
  const FIELDS = ['display_name', 'first_name', 'last_name', 'nickname', 'email', 'phone', 'birthday', 'location', 'bio', 'occupation', 'company', 'website'];
  const importedValue = (f) => d[f] ?? (f === 'email' ? d.emails?.[0]?.email : f === 'phone' ? d.phones?.[0]?.phone : null);

  const conflicts = FIELDS.filter((f) => {
    const imp = importedValue(f);
    return imp && target[f] && String(imp) !== String(target[f]);
  });
  const autoFills = FIELDS.filter((f) => importedValue(f) && !target[f]);

  const content = `
    ${conflicts.length ? `
    <div class="uppercase-label mb-2">Conflicting fields</div>
    <table class="data-table mb-3">
      <thead><tr><th>Field</th><th>Existing</th><th>Imported</th><th>Custom</th></tr></thead>
      <tbody>
        ${conflicts.map((f) => `
        <tr style="cursor:default">
          <td class="font-medium">${esc(f.replace(/_/g, ' '))}</td>
          <td><label class="flex gap-1 items-center clickable"><input type="radio" name="cf-${f}" value="existing" checked><span class="text-sm">${esc(target[f])}</span></label></td>
          <td><label class="flex gap-1 items-center clickable"><input type="radio" name="cf-${f}" value="imported"><span class="text-sm">${esc(importedValue(f))}</span></label></td>
          <td><label class="flex gap-1 items-center clickable"><input type="radio" name="cf-${f}" value="custom"><input class="form-input" data-custom="${f}" style="min-width:100px;padding:4px 8px" placeholder="Own value"></label></td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<p class="text-sm text-muted mb-2">No conflicting fields.</p>'}
    ${autoFills.length ? `<div class="text-sm text-secondary">Filled automatically (currently empty): ${autoFills.map((f) => esc(f.replace(/_/g, ' '))).join(', ')}.</div>` : ''}
    <div class="text-sm text-muted mt-2">Emails, phones, socials, and messages merge additively.</div>`;

  openModal(modalShell('conflict-res', `Merge conflicts — ${d.display_name || ''}`, content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save-decisions">Save decisions</button>`,
    { size: 'modal-xl' }), {
    onMount: (overlay, close) => {
      overlay.querySelectorAll('[data-custom]').forEach((inp) =>
        inp.addEventListener('focus', () => {
          overlay.querySelector(`input[name="cf-${inp.dataset.custom}"][value="custom"]`).checked = true;
        }));
      overlay.querySelector('[data-action="save-decisions"]').addEventListener('click', async () => {
        const decisions = {};
        for (const f of conflicts) {
          const choice = overlay.querySelector(`input[name="cf-${f}"]:checked`)?.value;
          if (choice === 'imported') decisions[f] = 'imported';
          else if (choice === 'custom') decisions[f] = overlay.querySelector(`[data-custom="${f}"]`).value || 'existing';
          else decisions[f] = 'existing';
        }
        try {
          await api.put(`/api/import/review/${stagingId}`, {
            review_status: 'approved_merge',
            suggested_match_contact_id: targetId,
            merge_field_decisions: decisions,
          });
          toast('Decisions saved.');
          close();
          onDone?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// wiring
pageRenderers.review = renderReview;
window.addEventListener('kith:open-import', () => openImportModal());
window.addEventListener('kith:shell-ready', () => pollImportWidget(true));
