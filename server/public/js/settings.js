// Settings page (admin sections) + per-user preferences + Account & security
// (2FA, API tokens, password, theme — visible to ALL users).

import { api, qs, setToken } from './api.js';
import { esc, fmtBytes, fmtDate, timeAgo, debounce, initials } from './utils.js';
import { icon } from './icons.js';
import {
  emptyState, modalShell, formGroup, textInput, selectInput,
  toast, openModal, confirmModal, toggleSwitch, sectionHeader,
} from './components.js';
import { pageRenderers } from './pages.js';
import { state, refreshSidebarLists, setThemePref, getThemePref, refreshUser, isSpicyOn } from './app.js';

const THEME_OPTIONS = [
  { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' },
];

async function renderSettings(el) {
  if (state.user.role === 'user') {
    // Non-admins get their personal Account & security page here.
    el.innerHTML = `
    <div class="page-inner">
      <div class="rec-toolbar"><span class="rec-crumb"><span>Account & Security</span></span></div>
      <div class="rec-rule-strong mb-4"></div>
      <div class="rec-section" id="account-section"><div class="text-sm text-muted">Loading…</div></div>
      <div class="rec-section" id="notifications-section"><div class="text-sm text-muted">Loading…</div></div>
      <div class="rec-section" id="immich-section"><div class="text-sm text-muted">Loading…</div></div>
      <div class="mb-6"></div>
    </div>`;
    renderAccountSection(el.querySelector('#account-section'));
    renderNotificationsSection(el.querySelector('#notifications-section'));
    renderImmichSection(el.querySelector('#immich-section'), '11');
    return;
  }

  let settings, users, tags, groups, prefs;
  try {
    [settings, users, tags, groups, prefs] = await Promise.all([
      api.get('/api/settings').then((d) => d.settings),
      api.get('/api/users').then((d) => d.users),
      api.get('/api/tags').then((d) => d.tags),
      api.get('/api/groups').then((d) => d.groups),
      api.get('/api/preferences').then((d) => d.preferences),
    ]);
  } catch (err) {
    el.innerHTML = `<div class="page-inner">${emptyState('alert-circle', "Couldn't load settings", err.message)}</div>`;
    return;
  }

  const isMainAdmin = state.user.role === 'main_admin';

  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-toolbar"><span class="rec-crumb"><span>Settings</span></span></div>
    <div class="rec-rule-strong mb-4"></div>

    <div class="rec-section" id="account-section"><div class="text-sm text-muted">Loading account…</div></div>
    <div class="rec-section" id="notifications-section"><div class="text-sm text-muted">Loading…</div></div>

    <div class="rec-section">
      ${sectionHeader('02', 'General')}
      ${formGroup('App name', textInput('app_name', settings.app_name, 'data-setting="app_name"'))}
      ${formGroup('Relationship types (comma-separated)', textInput('relationship_types', (settings.relationship_types || []).join(', '), 'data-setting="relationship_types"'))}
      <button class="btn btn-secondary btn-sm" data-save-general>Save general</button>
    </div>

    <div class="rec-section">
      ${sectionHeader('03', 'Appearance')}
      ${formGroup('Theme', selectInput('theme_pref', THEME_OPTIONS, getThemePref(), 'data-theme-select'), 'Applies to your account on every device.')}
    </div>

    <div class="rec-section">
      ${sectionHeader('04', 'Confidential layer')}
      <div class="toggle-row">
        <div><div class="toggle-label">Enable spicy features</div><div class="toggle-desc">When off, the confidential toggle and all spicy content disappear everywhere.</div></div>
        ${toggleSwitch(Boolean(settings.spicy_enabled), 'data-toggle-setting="spicy_enabled"')}
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Require PIN</div><div class="toggle-desc">Ask for your PIN each time spicy mode turns on.</div></div>
        ${toggleSwitch(Boolean(settings.spicy_require_pin), 'data-toggle-setting="spicy_require_pin"')}
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Auto-disable</div><div class="toggle-desc">Turn spicy mode off automatically.</div></div>
        <div style="width:140px">${selectInput('spicy_auto', [
          { value: '0', label: 'Never' }, { value: '15', label: 'After 15 min' },
          { value: '30', label: 'After 30 min' }, { value: '60', label: 'After 1 hour' },
        ], String(settings.spicy_auto_disable_minutes || 0), 'data-setting-select="spicy_auto_disable_minutes"')}</div>
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">My spicy PIN</div><div class="toggle-desc">4–8 digits. Convenience only — not a security boundary.</div></div>
        <button class="btn btn-secondary btn-sm" data-set-pin>${prefs.spicy_pin_set ? 'Change PIN' : 'Set PIN'}</button>
      </div>
    </div>

    <div class="rec-section">
      ${sectionHeader('05', 'Media')}
      ${formGroup('Media storage path', textInput('media_path', settings.media_path, 'data-setting="media_path" disabled'), )}
      <div class="form-hint mb-2">Set via the MEDIA_PATH environment variable; shown for reference.</div>
      ${formGroup('Max upload size', `<input class="form-input" value="${esc(fmtBytes(settings.max_upload_size))}" disabled>`)}
    </div>

    <div class="rec-section">
      ${sectionHeader('06', 'Users', `<button class="rec-head-action" data-new-user>+ New user</button>`)}
      <table class="data-table">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${users.map((u) => `
          <tr style="cursor:default">
            <td><div class="font-medium">${esc(u.display_name || u.username)}</div><div class="td-muted">${esc(u.email)}</div></td>
            <td class="td-muted capitalize">${esc(u.role.replace('_', ' '))}</td>
            <td>${u.is_active ? '<span class="badge green">Active</span>' : '<span class="badge neutral">Inactive</span>'}</td>
            <td>
              ${u.role !== 'main_admin' ? `
              <div class="flex gap-1">
                <button class="btn btn-icon" data-edit-user="${u.id}" aria-label="Edit user">${icon('edit')}</button>
                ${u.is_active ? `<button class="btn btn-icon" data-deactivate-user="${u.id}" aria-label="Deactivate">${icon('x')}</button>`
                : `<button class="btn btn-icon" data-reactivate-user="${u.id}" aria-label="Reactivate">${icon('check')}</button>`}
              </div>` : ''}
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="rec-section">
      ${sectionHeader('07', 'Data')}
      <div class="flex gap-2 flex-wrap">
        <a class="btn btn-secondary" href="#/settings?import=1" data-open-import>${icon('import')} Import</a>
        <button class="btn btn-secondary" data-export>${icon('download')} Full backup (JSON)</button>
        <button class="btn btn-secondary" data-export-vcf>${icon('download')} Export all (vCard)</button>
        <button class="btn btn-secondary" data-export-csv>${icon('download')} Export all (CSV)</button>
      </div>
      <div class="divider"></div>
      <div class="uppercase-label mb-2">System tags</div>
      <div class="flex gap-1 flex-wrap mb-3">
        ${tags.filter((t) => t.owner_user_id === null).map((t) => `
          <span class="tag-pill"><span class="dot" style="background:${esc(t.color || '#7c5bf5')}"></span>${esc(t.name)} <span class="text-muted">(${t.usage_count})</span></span>`).join('')}
      </div>
      <div class="uppercase-label mb-2">System groups</div>
      <div class="flex gap-1 flex-wrap">
        ${groups.filter((g) => g.is_system).map((g) => `<span class="group-badge" style="color:${esc(g.color || 'inherit')}">${icon(g.icon || 'users')}${esc(g.name)}</span>`).join('')}
      </div>
      <div class="form-hint mt-2">Manage groups on the <a href="#/groups">Groups page</a>; tags from any contact. Deleted items live in the <a href="#/trash">Trash</a>.</div>
    </div>
    <div class="rec-section" id="immich-section"><div class="text-sm text-muted">Loading…</div></div>
    <div class="mb-6"></div>
  </div>`;

  // ---- account & security (all users; admins see it atop settings)
  renderAccountSection(el.querySelector('#account-section'));
  renderNotificationsSection(el.querySelector('#notifications-section'));
  renderImmichSection(el.querySelector('#immich-section'), '08');

  // ---- theme (per-user preference)
  el.querySelector('[data-theme-select]')?.addEventListener('change', (e) => setThemePref(e.target.value));

  // ---- general
  el.querySelector('[data-save-general]').addEventListener('click', async () => {
    try {
      await api.put('/api/settings/app_name', { value: el.querySelector('[data-setting="app_name"]').value || 'Kith', type: 'string' });
      const relTypes = el.querySelector('[data-setting="relationship_types"]').value.split(',').map((s) => s.trim()).filter(Boolean);
      await api.put('/api/settings/relationship_types', { value: relTypes, type: 'json' });
      toast('Settings saved. Reloading.');
      setTimeout(() => location.reload(), 600);
    } catch (err) { toast(err.message, 'error'); }
  });

  // ---- toggles
  el.querySelectorAll('[data-toggle-setting]').forEach((t) =>
    t.addEventListener('click', async () => {
      const key = t.dataset.toggleSetting;
      const newVal = !t.classList.contains('on');
      try {
        await api.put(`/api/settings/${key}`, { value: newVal, type: 'boolean' });
        t.classList.toggle('on', newVal);
        t.setAttribute('aria-checked', newVal ? 'true' : 'false');
        if (key === 'spicy_enabled') {
          toast(newVal ? 'Spicy features enabled.' : 'Spicy features disabled.');
          setTimeout(() => location.reload(), 700);
        } else {
          toast('Saved.');
        }
      } catch (err) { toast(err.message, 'error'); }
    }));

  el.querySelector('[data-setting-select="spicy_auto_disable_minutes"]')?.addEventListener('change', async (e) => {
    try {
      await api.put('/api/settings/spicy_auto_disable_minutes', { value: Number(e.target.value), type: 'string' });
      toast('Saved.');
    } catch (err) { toast(err.message, 'error'); }
  });

  // ---- PIN
  el.querySelector('[data-set-pin]').addEventListener('click', () => {
    openModal(modalShell('pin', 'Spicy PIN',
      formGroup('New PIN (4–8 digits)', `<input class="form-input" name="pin" type="password" inputmode="numeric" autocomplete="off">`) +
      `<div class="form-hint">Leave empty and save to remove the PIN.</div>`,
      `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
       <button class="btn btn-primary" data-action="save-pin">Save</button>`), {
      onMount: (overlay, close) => {
        overlay.querySelector('[data-action="save-pin"]').addEventListener('click', async () => {
          try {
            const pin = overlay.querySelector('[name="pin"]').value;
            await api.post('/api/preferences/spicy-pin', { pin: pin || null });
            toast(pin ? 'PIN saved.' : 'PIN removed.');
            close();
            renderSettings(el);
          } catch (err) { toast(err.message, 'error'); }
        });
      },
    });
  });

  // ---- users
  el.querySelector('[data-new-user]').addEventListener('click', () => openUserForm(null, () => renderSettings(el), isMainAdmin));
  el.querySelectorAll('[data-edit-user]').forEach((b) =>
    b.addEventListener('click', () => {
      const u = users.find((x) => String(x.id) === b.dataset.editUser);
      openUserForm(u, () => renderSettings(el), isMainAdmin);
    }));
  el.querySelectorAll('[data-deactivate-user]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmModal('Deactivate user', 'Deactivate this user? They will be signed out and unable to log in.', { confirmLabel: 'Deactivate' });
      if (!ok) return;
      try {
        await api.del(`/api/users/${b.dataset.deactivateUser}`);
        toast('User deactivated.');
        renderSettings(el);
      } catch (err) { toast(err.message, 'error'); }
    }));
  el.querySelectorAll('[data-reactivate-user]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api.put(`/api/users/${b.dataset.reactivateUser}`, { is_active: true });
        toast('User reactivated.');
        renderSettings(el);
      } catch (err) { toast(err.message, 'error'); }    }));

  // ---- export
  el.querySelector('[data-export]').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/export/backup', { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kith-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast('Export downloaded.');
    } catch (err) { toast(err.message, 'error'); }
  });
  el.querySelector('[data-export-vcf]').addEventListener('click', () => downloadUrl('/api/export/vcf?all=1'));
  el.querySelector('[data-export-csv]').addEventListener('click', () => downloadUrl('/api/export/csv?all=1'));

  // ---- import entry (Phase 9 fills this in)
  el.querySelector('[data-open-import]').addEventListener('click', (e) => {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('kith:open-import'));
  });
}

function openUserForm(existing, onSaved, isMainAdmin) {
  const u = existing || {};
  const content = `
    ${!existing ? formGroup('Username', textInput('username', u.username)) : ''}
    ${formGroup('Email', textInput('email', u.email, 'type="email"'))}
    ${formGroup('Display name', textInput('display_name', u.display_name))}
    ${isMainAdmin ? formGroup('Role', selectInput('role', [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }], u.role === 'admin' ? 'admin' : 'user')) : ''}
    ${formGroup(existing ? 'Reset password (optional)' : 'Password', `<input class="form-input" name="password" type="password" autocomplete="new-password">`,
      existing ? 'If set, the user must change it on next login.' : 'The user must change it on first login.')}`;

  openModal(modalShell('user-form', existing ? `Edit ${u.username}` : 'New user', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">${existing ? 'Save' : 'Create'}</button>`), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const values = {};
        for (const elm of overlay.querySelectorAll('[name]')) {
          if (elm.value !== '') values[elm.name] = elm.value;
        }
        try {
          if (existing) await api.put(`/api/users/${u.id}`, values);
          else await api.post('/api/users', values);
          toast(existing ? 'User saved.' : 'User created.');
          close();
          onSaved?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

pageRenderers.settings = renderSettings;

// ---------------------------------------------- Notifications & push (all users)
const DIGEST_DAYS = [
  { value: '0', label: 'Sunday' }, { value: '1', label: 'Monday' }, { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' }, { value: '4', label: 'Thursday' }, { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];
const CHANNEL_OPTIONS = [
  { value: 'email', label: 'Email' }, { value: 'push', label: 'Push' },
  { value: 'both', label: 'Both' }, { value: 'none', label: 'None' },
];

// VAPID key (base64url) → Uint8Array for pushManager.subscribe.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function renderNotificationsSection(container) {
  if (!container) return;
  let prefs;
  try {
    prefs = (await api.get('/api/notifications/prefs')).prefs || {};
  } catch (err) {
    container.innerHTML = `${sectionHeader('10', 'Notifications')}<div class="text-sm text-muted">${esc(err?.message || "Couldn't load notification settings.")}</div>`;
    return;
  }

  const secure = location.protocol === 'https:';
  const supported = pushSupported();

  container.innerHTML = `
    ${sectionHeader('10', 'Notifications')}
    <div class="form-row">
      ${formGroup('Channel', selectInput('notify_channel', CHANNEL_OPTIONS, prefs.notify_channel || 'email', 'data-notif="notify_channel"'), 'How Kith reaches you.')}
      ${formGroup('Delivery email', `<input class="form-input" name="notify_email" type="email" value="${esc(prefs.notify_email || '')}" placeholder="${esc(prefs.account_email || 'name@example.com')}" data-notif-email>`, 'Leave blank to use your account email.')}
    </div>
    <button class="btn btn-secondary btn-sm mb-2" data-save-notif>Save channel & email</button>

    <div class="divider"></div>
    <div class="toggle-row">
      <div><div class="toggle-label">Weekly digest</div><div class="toggle-desc">A once-a-week summary of birthdays, reminders, and people you’re losing touch with.</div></div>
      ${toggleSwitch(Boolean(prefs.digest_weekly), 'data-notif-toggle="digest_weekly"')}
    </div>
    <div class="toggle-row">
      <div><div class="toggle-label">Digest day</div><div class="toggle-desc">Which day the weekly digest is sent.</div></div>
      <div style="width:160px">${selectInput('digest_day', DIGEST_DAYS, String(prefs.digest_day ?? 1), 'data-notif-select="digest_day"')}</div>
    </div>

    <div class="divider"></div>
    <div class="uppercase-label mb-2">Nudges</div>
    <div class="toggle-row">
      <div><div class="toggle-label">Birthdays</div><div class="toggle-desc">Remind me before a contact’s birthday.</div></div>
      ${toggleSwitch(Boolean(prefs.nudge_birthdays), 'data-notif-toggle="nudge_birthdays"')}
    </div>
    <div class="toggle-row">
      <div><div class="toggle-label">Reminders</div><div class="toggle-desc">Nudge me about overdue reminders.</div></div>
      ${toggleSwitch(Boolean(prefs.nudge_reminders), 'data-notif-toggle="nudge_reminders"')}
    </div>
    <div class="toggle-row">
      <div><div class="toggle-label">Out of touch</div><div class="toggle-desc">Flag people I haven’t contacted in a while.</div></div>
      ${toggleSwitch(Boolean(prefs.nudge_out_of_touch), 'data-notif-toggle="nudge_out_of_touch"')}
    </div>

    <div class="divider"></div>
    <button class="btn btn-secondary btn-sm" data-test-digest>${icon('mail')} Send me a test digest</button>

    <div class="divider"></div>
    <div class="uppercase-label mb-2">Push on this device</div>
    <div id="push-controls">${pushControlsHtml(supported, secure)}</div>`;

  // channel + email save
  container.querySelector('[data-save-notif]')?.addEventListener('click', async () => {
    const btn = container.querySelector('[data-save-notif]');
    btn.disabled = true;
    try {
      await api.put('/api/notifications/prefs', {
        notify_channel: container.querySelector('[data-notif="notify_channel"]').value,
        notify_email: container.querySelector('[data-notif-email]').value.trim() || null,
      });
      toast('Notification settings saved.');
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false;
  });

  // toggles (save individually, like the confidential-layer toggles)
  container.querySelectorAll('[data-notif-toggle]').forEach((t) =>
    t.addEventListener('click', async () => {
      const key = t.dataset.notifToggle;
      const newVal = !t.classList.contains('on');
      try {
        await api.put('/api/notifications/prefs', { [key]: newVal });
        t.classList.toggle('on', newVal);
        t.setAttribute('aria-checked', newVal ? 'true' : 'false');
      } catch (err) { toast(err.message, 'error'); }
    }));

  // digest day select
  container.querySelector('[data-notif-select="digest_day"]')?.addEventListener('change', async (e) => {
    try {
      await api.put('/api/notifications/prefs', { digest_day: Number(e.target.value) });
      toast('Digest day updated.');
    } catch (err) { toast(err.message, 'error'); }
  });

  // test digest
  container.querySelector('[data-test-digest]')?.addEventListener('click', async () => {
    const btn = container.querySelector('[data-test-digest]');
    btn.disabled = true;
    try {
      const res = await api.post('/api/notifications/test-digest');
      toast(res?.sent ? 'Test digest sent — check your inbox.' : 'Digest queued.');
    } catch (err) { toast(err.message, 'error'); }
    btn.disabled = false;
  });

  bindPushControls(container);
}

function pushControlsHtml(supported, secure) {
  if (!secure) {
    return `<div class="text-sm text-muted">Push requires HTTPS — open the app at <a href="https://kith.example.com">https://kith.example.com</a> to enable notifications on this device.</div>`;
  }
  if (!supported) {
    return `<div class="text-sm text-muted">This browser doesn’t support push notifications.</div>`;
  }
  return `
    <div class="flex gap-2 flex-wrap" id="push-btns">
      <button class="btn btn-primary btn-sm" data-push-enable>${icon('bell')} Enable push on this device</button>
      <button class="btn btn-secondary btn-sm hidden" data-push-test>${icon('bell')} Send test notification</button>
      <button class="btn btn-secondary btn-sm hidden" data-push-disable>Turn off push here</button>
    </div>
    <div class="text-micro text-muted mt-2" id="push-status">Checking device status…</div>`;
}

function bindPushControls(container) {
  const secure = location.protocol === 'https:';
  const supported = pushSupported();
  if (!secure || !supported) return;

  const statusEl = container.querySelector('#push-status');
  const enableBtn = container.querySelector('[data-push-enable]');
  const testBtn = container.querySelector('[data-push-test]');
  const disableBtn = container.querySelector('[data-push-disable]');
  const setState = (subscribed, note) => {
    enableBtn.classList.toggle('hidden', subscribed);
    testBtn.classList.toggle('hidden', !subscribed);
    disableBtn.classList.toggle('hidden', !subscribed);
    if (statusEl) statusEl.textContent = note || (subscribed ? 'Push is enabled on this device.' : 'Push is off on this device.');
  };

  // Acquire an up-to-date registration: register /sw.js explicitly (don't rely
  // only on app.js), then update() so a newer waiting worker is fetched. Falls
  // back to serviceWorker.ready if register isn't available for any reason.
  const getReg = async () => {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      try { await reg.update(); } catch { /* update is best-effort */ }
      // If a newer worker is waiting (e.g. one that has the push handler),
      // activate it now so pushManager operations run against a live handler.
      if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      return reg;
    } catch {
      return navigator.serviceWorker.ready;
    }
  };

  // reflect current subscription state
  (async () => {
    try {
      const reg = await getReg();
      const sub = await reg.pushManager.getSubscription();
      setState(Boolean(sub));
    } catch { setState(false); }
  })();

  enableBtn?.addEventListener('click', async () => {
    enableBtn.disabled = true;
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast(perm === 'denied' ? 'Notifications are blocked in your browser settings.' : 'Permission not granted.', 'error');
        enableBtn.disabled = false;
        return;
      }
      const reg = await getReg();
      const { publicKey } = await api.get('/api/push/key');
      if (!publicKey) throw new Error('Server is missing a push key.');

      // Always re-subscribe fresh: an existing subscription may have been
      // created with an old VAPID key and would silently fail delivery.
      // Unsubscribe any existing sub, then subscribe with the current key.
      let sub = await reg.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      } catch (subErr) {
        console.error('[push] pushManager.subscribe failed:', subErr.name, subErr.message);
        toast(`Push subscribe failed: ${subErr.name || 'error'}`, 'error');
        enableBtn.disabled = false;
        return;
      }

      const json = sub.toJSON();
      try {
        await api.post('/api/push/subscribe', {
          subscription: { endpoint: sub.endpoint, keys: json.keys },
          user_agent: navigator.userAgent,
        });
      } catch (postErr) {
        console.error('[push] POST /api/push/subscribe failed:', postErr.message);
        toast(`Couldn't save subscription: ${postErr.message || 'server error'}`, 'error');
        enableBtn.disabled = false;
        return;
      }
      setState(true, 'Push enabled on this device.');
      toast('Push notifications enabled.');
    } catch (err) {
      toast(err.message || "Couldn't enable push.", 'error');
    }
    enableBtn.disabled = false;
  });

  testBtn?.addEventListener('click', async () => {
    testBtn.disabled = true;
    try {
      const res = await api.post('/api/push/test');
      toast(res?.sent ? 'Test notification sent.' : 'Test queued.');
    } catch (err) { toast(err.message, 'error'); }
    testBtn.disabled = false;
  });

  disableBtn?.addEventListener('click', async () => {
    disableBtn.disabled = true;
    try {
      const reg = await getReg();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api.post('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setState(false, 'Push turned off on this device.');
      toast('Push turned off here.');
    } catch (err) { toast(err.message, 'error'); }
    disableBtn.disabled = false;
  });
}

// Non-admins have no Settings link in the sidebar (app.js renders it for
// admins only, and we must not touch app.js). Inject an "Account" nav item
// pointing at #/settings, which renders the Account & security page for them.
window.addEventListener('kith:shell-ready', () => {
  if (state.user?.role !== 'user') return;
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.querySelector('[data-nav="settings"]')) return;
  const a = document.createElement('a');
  a.className = 'nav-item';
  a.dataset.nav = 'settings';
  a.href = '#/settings';
  // Number continues the existing index (non-admins have 01–09, so this is
  // 10) — a hardcoded '08' collided with Journal's 08.
  const nextNum = String(nav.querySelectorAll('.nav-item').length + 1).padStart(2, '0');
  a.innerHTML = `<span class="nav-num">${nextNum}</span><span class="nav-label">Account</span><span class="nav-marker"></span>`;
  nav.appendChild(a);
});

// ---------------------------------------------------------------------------
// Account & security — per-user: password, 2FA, API tokens, theme (for
// non-admins who don't see the admin Appearance card).
// ---------------------------------------------------------------------------

function downloadUrl(url) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function renderAccountSection(container) {
  if (!container) return;
  let me;
  let tokens;
  let tokensErr = null;
  try {
    [me, tokens] = await Promise.all([
      api.get('/api/auth/me').then((d) => d.user),
      api.get('/api/tokens').then((d) => d.tokens || []).catch((e) => { tokensErr = e; return []; }),
    ]);
  } catch (err) {
    container.innerHTML = `<div class="text-sm text-muted">${esc(err?.message || "Couldn't load your account.")}</div>`;
    return;
  }
  // linked self-contact name (best-effort; the id link still works without it)
  let selfContactName = null;
  if (me.self_contact_id) {
    try {
      selfContactName = (await api.get(`/api/contacts/${me.self_contact_id}`)).contact?.display_name || null;
    } catch { /* deleted/inaccessible — show id link only */ }
  }
  const isAdminPage = state.user.role !== 'user';
  const active = tokens.filter((t) => !t.revoked_at);

  container.innerHTML = `
    ${sectionHeader('01', 'Account & Security')}
    <div class="form-row">
      ${formGroup('Display name', textInput('account_display_name', me.display_name || '', 'autocomplete="name"'))}
      ${formGroup('Email', textInput('account_email', me.email || '', 'type="email" autocomplete="email"'))}
    </div>
    <button class="btn btn-secondary btn-sm mb-2" data-save-account>Save account</button>
    <div class="toggle-row">
      <div><div class="toggle-label">My profile contact</div>
        <div class="toggle-desc">${me.self_contact_id
          ? `Linked to ${selfContactName ? `<a href="#/contacts/${encodeURIComponent(me.self_contact_id)}">${esc(selfContactName)}</a>` : `<a href="#/contacts/${encodeURIComponent(me.self_contact_id)}">your contact</a>`} — record your own details and family links.`
          : 'You as a contact — record your own details and link family relationships.'}</div></div>
      <div class="flex gap-1 flex-wrap" style="justify-content:flex-end">
        ${me.self_contact_id
          ? `<button class="btn btn-secondary btn-sm" data-self-unlink>Unlink</button>`
          : `<button class="btn btn-secondary btn-sm" data-self-create>Create</button>
             <button class="btn btn-secondary btn-sm" data-self-link>Link existing…</button>`}
      </div>
    </div>
    <div class="toggle-row">
      <div><div class="toggle-label">Password</div><div class="toggle-desc">Change your Kith password.</div></div>
      <button class="btn btn-secondary btn-sm" data-change-password>Change password</button>
    </div>
    <div class="toggle-row">
      <div><div class="toggle-label">Two-factor authentication</div>
        <div class="toggle-desc">${me.totp_enabled ? 'On — a 6-digit code is required at login.' : 'Off — add an authenticator app for extra protection.'}</div></div>
      ${me.totp_enabled
        ? `<button class="btn btn-secondary btn-sm" data-totp-disable>Disable 2FA</button>`
        : `<button class="btn btn-primary btn-sm" data-totp-enable>${icon('key')} Enable 2FA</button>`}
    </div>
    ${!isAdminPage ? `
    <div class="toggle-row">
      <div><div class="toggle-label">Theme</div><div class="toggle-desc">Applies to your account on every device.</div></div>
      <div style="width:140px">${selectInput('theme_pref', THEME_OPTIONS, getThemePref(), 'data-account-theme')}</div>
    </div>` : ''}
    <div class="divider"></div>
    <div class="flex-between mb-2">
      <div class="uppercase-label">API tokens</div>
      <button class="btn btn-secondary btn-sm" data-new-token>${icon('plus')} New token</button>
    </div>
    ${tokensErr ? `<div class="text-sm text-muted">${esc(tokensErr.message)}</div>` : active.length ? `
    <div style="overflow-x:auto">
    <table class="data-table">
      <thead><tr><th>Name</th><th>Prefix</th><th>Scope</th><th>Last used</th><th>Expires</th><th></th></tr></thead>
      <tbody>
        ${active.map((t) => `
        <tr style="cursor:default">
          <td class="font-medium">${esc(t.name)}</td>
          <td class="td-muted"><code>${esc(t.prefix)}…</code></td>
          <td class="td-secondary">${esc(t.scopes === 'read_write' ? 'read + write' : 'read')}</td>
          <td class="td-muted">${t.last_used_at ? esc(timeAgo(t.last_used_at)) : 'never'}</td>
          <td class="td-muted">${t.expires_at ? esc(fmtDate(t.expires_at)) : 'never'}</td>
          <td><button class="btn btn-icon" data-revoke-token="${t.id}" aria-label="Revoke token">${icon('x')}</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    </div>` : '<div class="text-sm text-muted">No API tokens yet. Create one for scripts or the calendar feed.</div>'}
    <div class="form-hint mt-2">Calendar feed: subscribe to <code>${esc(location.origin)}/api/ics/calendar.ics?token=&lt;your token&gt;</code> with a read token.</div>`;

  container.querySelector('[data-change-password]').addEventListener('click', openChangePasswordModal);

  // account fields (display name + email → PUT /api/users/me)
  container.querySelector('[data-save-account]')?.addEventListener('click', async () => {
    const btn = container.querySelector('[data-save-account]');
    const display_name = container.querySelector('[name="account_display_name"]').value.trim();
    const email = container.querySelector('[name="account_email"]').value.trim();
    if (!email) { toast('Email is required.', 'error'); return; }
    btn.disabled = true;
    try {
      await api.put('/api/users/me', { display_name: display_name || null, email });
      await refreshUser();
      toast('Account saved.');
      renderAccountSection(container);
    } catch (err) {
      btn.disabled = false;
      toast(err.status === 409 ? 'That email is already in use.' : err.message, 'error');
    }
  });

  // self-contact link management
  container.querySelector('[data-self-create]')?.addEventListener('click', async () => {
    try {
      const res = await api.post('/api/users/me/self-contact');
      await refreshUser();
      refreshSidebarLists();
      toast(res.created ? 'Your profile contact is ready.' : 'Linked to your existing profile.');
      renderAccountSection(container);
    } catch (err) { toast(err.message, 'error'); }
  });
  container.querySelector('[data-self-unlink]')?.addEventListener('click', async () => {
    const ok = await confirmModal('Unlink profile contact',
      'Unlink your profile contact? The contact itself is kept.', { confirmLabel: 'Unlink' });
    if (!ok) return;
    try {
      await api.put('/api/users/me/self-contact', { contact_id: null });
      await refreshUser();
      toast('Profile contact unlinked.');
      renderAccountSection(container);
    } catch (err) { toast(err.message, 'error'); }
  });
  container.querySelector('[data-self-link]')?.addEventListener('click', () =>
    openSelfContactLinkModal(() => { renderAccountSection(container); }));

  container.querySelector('[data-totp-enable]')?.addEventListener('click', () => openTotpEnableModal(() => renderAccountSection(container)));
  container.querySelector('[data-totp-disable]')?.addEventListener('click', () => openTotpDisableModal(() => renderAccountSection(container)));
  container.querySelector('[data-account-theme]')?.addEventListener('change', (e) => setThemePref(e.target.value));
  container.querySelector('[data-new-token]').addEventListener('click', () => openTokenCreateModal(() => renderAccountSection(container)));
  container.querySelectorAll('[data-revoke-token]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmModal('Revoke token', 'Revoke this token? Anything using it stops working immediately.', { confirmLabel: 'Revoke' });
      if (!ok) return;
      try {
        await api.del(`/api/tokens/${b.dataset.revokeToken}`);
        toast('Token revoked.');
        renderAccountSection(container);
      } catch (err) { toast(err.message, 'error'); }
    }));
}

// ---------------------------------------------- self-contact link picker
function openSelfContactLinkModal(onDone) {
  const content = `
    <p class="text-sm text-secondary mb-3">Pick the contact that is you. Kith links it to your account so your own details and family relationships have a home.</p>
    <div class="form-group">
      <div class="search-input-wrap">${icon('search')}<input class="form-input" id="self-link-search" placeholder="Type to find a person" autocomplete="off"></div>
      <div id="self-link-results"></div>
    </div>`;
  openModal(modalShell('self-link', 'Link your profile contact', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>`), {
    onMount: (overlay, close) => {
      const searchInput = overlay.querySelector('#self-link-search');
      const resultsEl = overlay.querySelector('#self-link-results');
      searchInput.addEventListener('input', debounce(async () => {
        const q = searchInput.value.trim();
        if (!q) { resultsEl.innerHTML = ''; return; }
        let found;
        try { found = await api.get('/api/contacts' + qs({ search: q, limit: 6 })); } catch { return; }
        resultsEl.innerHTML = (found.contacts || [])
          .filter((c) => !c.is_shared_in) // own contacts only
          .map((c) => `<button class="popover-item w-full" data-pick="${c.id}"><span class="av sm" style="width:22px;height:22px;font-size:9px">${esc(initials(c.display_name))}</span>${esc(c.display_name)}</button>`)
          .join('') || '<div class="text-sm text-muted p-2">No matches among your own contacts.</div>';
        resultsEl.querySelectorAll('[data-pick]').forEach((b) =>
          b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              await api.put('/api/users/me/self-contact', { contact_id: Number(b.dataset.pick) });
              await refreshUser();
              toast('Profile contact linked.');
              close();
              onDone?.();
            } catch (err) {
              b.disabled = false;
              toast(err.message, 'error');
            }
          }));
      }, 250));
    },
  });
}

// ------------------------------------------------------------ password
function openChangePasswordModal() {
  const content = `
    ${formGroup('Current password', `<input class="form-input" name="current_password" type="password" autocomplete="current-password">`)}
    ${formGroup('New password', `<input class="form-input" name="new_password" type="password" autocomplete="new-password" minlength="8">`, 'At least 8 characters.')}`;
  openModal(modalShell('change-pw', 'Change password', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Change password</button>`), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        try {
          const res = await api.put('/api/auth/password', {
            current_password: overlay.querySelector('[name="current_password"]').value,
            new_password: overlay.querySelector('[name="new_password"]').value,
          });
          if (res?.token) setToken(res.token);
          toast('Password changed.');
          close();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ---------------------------------------------------------------- 2FA
function openTotpEnableModal(onDone) {
  openModal(modalShell('totp-setup', 'Enable two-factor authentication',
    `<div class="text-sm text-muted">Preparing your secret…</div>`, ''), {
    onMount: async (overlay, close) => {
      let setup;
      try {
        setup = await api.post('/api/auth/totp/setup');
      } catch (err) {
        toast(err.message, 'error');
        close();
        return;
      }
      overlay.querySelector('.modal-content').innerHTML = `
        <p class="text-sm text-secondary mb-3">Add Kith to your authenticator app (1Password, Aegis, Google Authenticator…). Most apps let you enter a setup key manually.</p>
        <div class="form-group">
          <label class="form-label">Setup key (base32)</label>
          <div class="flex gap-2">
            <code class="totp-secret flex-1">${esc(setup.secret_base32)}</code>
            <button class="btn btn-secondary btn-sm" data-copy="${esc(setup.secret_base32)}">Copy</button>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Or the full otpauth URL</label>
          <div class="flex gap-2">
            <code class="totp-secret flex-1" style="font-size:11px">${esc(setup.otpauth_url)}</code>
            <button class="btn btn-secondary btn-sm" data-copy="${esc(setup.otpauth_url)}">Copy</button>
          </div>
        </div>
        <div class="divider"></div>
        ${formGroup('Enter the 6-digit code from your app to confirm', `<input class="form-input totp-input" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="••••••">`)}
        <div class="form-error hidden" data-totp-error></div>`;
      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      footer.innerHTML = `
        <button class="btn btn-secondary" data-action="close-modal">Cancel</button>
        <button class="btn btn-primary" data-action="verify">Verify & enable</button>`;
      overlay.querySelector('.modal').appendChild(footer);

      bindCopyButtons(overlay);
      const codeInput = overlay.querySelector('[name="code"]');
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      });
      footer.querySelector('[data-action="verify"]').addEventListener('click', async () => {
        const errEl = overlay.querySelector('[data-totp-error]');
        errEl.classList.add('hidden');
        const code = codeInput.value;
        if (code.length !== 6) { errEl.textContent = 'Enter the 6-digit code.'; errEl.classList.remove('hidden'); return; }
        try {
          await api.post('/api/auth/totp/enable', { code });
          toast('Two-factor authentication enabled.');
          close();
          onDone?.();
        } catch (err) {
          errEl.textContent = err.message;
          errEl.classList.remove('hidden');
          codeInput.select();
        }
      });
    },
  });
}

function openTotpDisableModal(onDone) {
  const content = `
    <p class="text-sm text-secondary mb-3">Enter a current code from your authenticator app to turn 2FA off.</p>
    ${formGroup('6-digit code', `<input class="form-input totp-input" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="••••••">`)}`;
  openModal(modalShell('totp-disable', 'Disable two-factor authentication', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-danger" data-action="disable">Disable 2FA</button>`), {
    onMount: (overlay, close) => {
      const codeInput = overlay.querySelector('[name="code"]');
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
      });
      overlay.querySelector('[data-action="disable"]').addEventListener('click', async () => {
        try {
          await api.post('/api/auth/totp/disable', { code: codeInput.value });
          toast('Two-factor authentication disabled.');
          close();
          onDone?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

// ---------------------------------------------------------- API tokens
function openTokenCreateModal(onDone) {
  const content = `
    ${formGroup('Name', textInput('name', '', 'placeholder="e.g. Calendar feed"'))}
    ${formGroup('Scope', selectInput('scopes', [
      { value: 'read', label: 'Read only' }, { value: 'read_write', label: 'Read + write' },
    ], 'read'))}
    ${formGroup('Expires', selectInput('expires_days', [
      { value: '30', label: 'In 30 days' }, { value: '90', label: 'In 90 days' },
      { value: '365', label: 'In 1 year' }, { value: '', label: 'Never' },
    ], '90'))}`;
  openModal(modalShell('token-form', 'New API token', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">Create token</button>`), {
    onMount: (overlay, close) => {
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const name = overlay.querySelector('[name="name"]').value.trim();
        if (!name) { toast('Give the token a name.', 'error'); return; }
        const expires = overlay.querySelector('[name="expires_days"]').value;
        try {
          const res = await api.post('/api/tokens', {
            name,
            scopes: overlay.querySelector('[name="scopes"]').value,
            expires_days: expires ? Number(expires) : null,
          });
          close();
          openTokenShowOnceModal(res);
          onDone?.();
        } catch (err) { toast(err.message, 'error'); }
      });
    },
  });
}

function openTokenShowOnceModal(res) {
  const icsUrl = `${location.origin}/api/ics/calendar.ics?token=${res.token}`;
  const content = `
    <div class="form-error mb-3" style="display:block">This token is shown ONCE. Copy it now — you won't see it again.</div>
    <div class="form-group">
      <label class="form-label">${esc(res.name)}</label>
      <div class="flex gap-2">
        <code class="totp-secret flex-1">${esc(res.token)}</code>
        <button class="btn btn-secondary btn-sm" data-copy="${esc(res.token)}">Copy</button>
      </div>
    </div>
    ${res.scopes === 'read' ? `
    <div class="form-group">
      <label class="form-label">Calendar feed URL</label>
      <div class="flex gap-2">
        <code class="totp-secret flex-1" style="font-size:11px">${esc(icsUrl)}</code>
        <button class="btn btn-secondary btn-sm" data-copy="${esc(icsUrl)}">Copy</button>
      </div>
      <div class="form-hint">Subscribe to this URL in your calendar app for Kith events, birthdays, and reminders.</div>
    </div>` : ''}`;
  openModal(modalShell('token-once', 'Token created', content,
    `<button class="btn btn-primary" data-action="close-modal">Done</button>`), {
    onMount: (overlay) => bindCopyButtons(overlay),
  });
}

function bindCopyButtons(scope) {
  scope.querySelectorAll('[data-copy]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(b.dataset.copy);
        toast('Copied.');
      } catch { toast("Couldn't copy — select and copy manually.", 'error'); }
    }));
}

// ---------------------------------------------------------------------------
// Photo libraries · Immich — per-user connections to self-hosted Immich
// servers. API keys never reach the browser; everything proxies server-side.
// ---------------------------------------------------------------------------

async function renderImmichSection(container, sectionNo) {
  if (!container) return;
  let instances = [];
  try {
    instances = (await api.get('/api/immich/instances')).instances || [];
  } catch (err) {
    container.innerHTML = `${sectionHeader(sectionNo, 'Photo libraries · Immich')}<div class="text-sm text-muted">${esc(err?.message || "Couldn't load photo libraries.")}</div>`;
    return;
  }

  container.innerHTML = `
    ${sectionHeader(sectionNo, 'Photo libraries · Immich', `<button class="rec-head-action" data-immich-add>+ Add library</button>`)}
    ${instances.length ? `
    <div class="immich-instance-list">
      ${instances.map((i) => `
      <div class="immich-instance-row">
        <div class="flex-1" style="min-width:0">
          <div class="font-medium">${esc(i.name)} ${i.is_spicy ? '<span class="badge neutral">private</span>' : ''}</div>
          <div class="td-muted immich-instance-url">${esc(i.base_url)}</div>
        </div>
        <div class="flex gap-1">
          <button class="btn btn-icon" data-immich-edit="${Number(i.id)}" aria-label="Edit library">${icon('edit')}</button>
          <button class="btn btn-icon" data-immich-del="${Number(i.id)}" aria-label="Delete library">${icon('x')}</button>
        </div>
      </div>`).join('')}
    </div>` : `<div class="text-sm text-muted">No photo libraries connected. Add your Immich server to attach photos to people and events without re-uploading them.</div>`}`;

  const reload = () => renderImmichSection(container, sectionNo);
  container.querySelector('[data-immich-add]').addEventListener('click', () => openImmichForm(null, reload));
  container.querySelectorAll('[data-immich-edit]').forEach((b) =>
    b.addEventListener('click', () => {
      const inst = instances.find((x) => String(x.id) === b.dataset.immichEdit);
      openImmichForm(inst, reload);
    }));
  container.querySelectorAll('[data-immich-del]').forEach((b) =>
    b.addEventListener('click', async () => {
      const ok = await confirmModal('Remove library',
        'Remove this Immich library? All media attached from it will be deleted from Kith (the photos stay on your Immich server).');
      if (!ok) return;
      try {
        await api.del(`/api/immich/instances/${b.dataset.immichDel}`);
        toast('Library removed.');
        reload();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

function openImmichForm(existing, onSaved) {
  const i = existing || {};
  const content = `
    ${formGroup('Name', textInput('name', i.name, 'placeholder="e.g. Home photos"'))}
    ${formGroup('Base URL', textInput('base_url', i.base_url, 'placeholder="https://photos.example.com" type="url"'))}
    ${formGroup('API key', `<input class="form-input" name="api_key" type="password" autocomplete="off" placeholder="${existing ? 'Leave blank to keep the current key' : ''}">`,
      'Immich → Account Settings → API Keys → New API Key')}
    ${isSpicyOn() ? `
    <div class="toggle-row">
      <div><div class="toggle-label">Private library</div><div class="toggle-desc">Only visible with spicy mode on; attached photos are marked spicy.</div></div>
      ${toggleSwitch(Boolean(i.is_spicy), 'data-immich-spicy')}
    </div>` : ''}`;

  openModal(modalShell('immich-form', existing ? `Edit ${i.name}` : 'Add Immich library', content,
    `<button class="btn btn-secondary" data-action="close-modal">Cancel</button>
     <button class="btn btn-primary" data-action="save">${existing ? 'Save' : 'Connect'}</button>`), {
    onMount: (overlay, close) => {
      const spicyToggle = overlay.querySelector('[data-immich-spicy]');
      spicyToggle?.addEventListener('click', () => {
        const on = !spicyToggle.classList.contains('on');
        spicyToggle.classList.toggle('on', on);
        spicyToggle.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      overlay.querySelector('[data-action="save"]').addEventListener('click', async () => {
        const btn = overlay.querySelector('[data-action="save"]');
        const name = overlay.querySelector('[name="name"]').value.trim();
        const base_url = overlay.querySelector('[name="base_url"]').value.trim();
        const api_key = overlay.querySelector('[name="api_key"]').value.trim();
        if (!name || !base_url || (!existing && !api_key)) {
          toast('Name, base URL, and API key are required.', 'error');
          return;
        }
        const body = { name, base_url };
        if (api_key) body.api_key = api_key;
        if (spicyToggle) body.is_spicy = spicyToggle.classList.contains('on');
        btn.disabled = true;
        btn.textContent = 'Verifying…';
        try {
          if (existing) await api.put(`/api/immich/instances/${i.id}`, body);
          else await api.post('/api/immich/instances', body);
          toast('Connected — pong received.');
          close();
          onSaved?.();
        } catch (err) {
          btn.disabled = false;
          btn.textContent = existing ? 'Save' : 'Connect';
          toast(err.message, 'error');
        }
      });
    },
  });
}
