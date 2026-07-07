// Settings page (admin only) + per-user preferences.

import { api } from './api.js';
import { esc, fmtBytes } from './utils.js';
import { icon } from './icons.js';
import {
  emptyState, modalShell, formGroup, textInput, selectInput,
  toast, openModal, confirmModal, toggleSwitch,
} from './components.js';
import { pageRenderers } from './pages.js';
import { state, refreshSidebarLists } from './app.js';

async function renderSettings(el) {
  if (state.user.role === 'user') {
    el.innerHTML = `<div class="page-inner">${emptyState('shield', 'Admins only', 'Settings are managed by an admin.')}</div>`;
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
  <div class="page-inner" style="max-width:760px">
    <div class="page-header"><div><h1 class="page-title">Settings</h1></div></div>

    <div class="card mb-4">
      <div class="card-header"><span class="card-title">General</span></div>
      ${formGroup('App name', textInput('app_name', settings.app_name, 'data-setting="app_name"'))}
      ${formGroup('Relationship types (comma-separated)', textInput('relationship_types', (settings.relationship_types || []).join(', '), 'data-setting="relationship_types"'))}
      <button class="btn btn-secondary btn-sm" data-save-general>Save general</button>
    </div>

    <div class="card mb-4">
      <div class="card-header"><span class="card-title">Appearance</span></div>
      <div class="form-row">
        ${formGroup('Accent color', `<input class="form-input" type="color" value="${esc(settings.accent_color || '#7c5bf5')}" data-setting-color="accent_color" style="height:38px;padding:4px">`)}
        ${formGroup('Spicy accent color', `<input class="form-input" type="color" value="${esc(settings.spicy_accent_color || '#c2394f')}" data-setting-color="spicy_accent_color" style="height:38px;padding:4px">`)}
      </div>
      <div class="form-hint">Defaults per BRANDING: #7c5bf5 (purple) and #c2394f (rose). Changes apply on save.</div>
      <button class="btn btn-secondary btn-sm mt-2" data-save-appearance>Save appearance</button>
    </div>

    <div class="card mb-4">
      <div class="card-header"><span class="card-title flex items-center gap-2">${icon('flame')} Spicy</span></div>
      <div class="toggle-row">
        <div><div class="toggle-label">Enable spicy features</div><div class="toggle-desc">When off, the flame and all spicy content disappear everywhere.</div></div>
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

    <div class="card mb-4">
      <div class="card-header"><span class="card-title">Media</span></div>
      ${formGroup('Media storage path', textInput('media_path', settings.media_path, 'data-setting="media_path" disabled'), )}
      <div class="form-hint mb-2">Set via the MEDIA_PATH environment variable; shown for reference.</div>
      ${formGroup('Max upload size', `<input class="form-input" value="${esc(fmtBytes(settings.max_upload_size))}" disabled>`)}
    </div>

    <div class="card mb-4">
      <div class="card-header">
        <span class="card-title">Users</span>
        <button class="btn btn-secondary btn-sm" data-new-user>${icon('plus')} New user</button>
      </div>
      <table class="data-table">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>
          ${users.map((u) => `
          <tr style="cursor:default">
            <td><div class="font-medium">${esc(u.display_name || u.username)}</div><div class="td-muted">${esc(u.email)}</div></td>
            <td class="td-secondary capitalize">${esc(u.role.replace('_', ' '))}</td>
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

    <div class="card mb-4">
      <div class="card-header"><span class="card-title">Data</span></div>
      <div class="flex gap-2 flex-wrap">
        <a class="btn btn-secondary" href="#/settings?import=1" data-open-import>${icon('import')} Import</a>
        <button class="btn btn-secondary" data-export>${icon('download')} Export / backup</button>
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
      <div class="form-hint mt-2">Manage groups on the <a href="#/groups">Groups page</a>; tags from any contact.</div>
    </div>
    <div class="mb-6"></div>
  </div>`;

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

  // ---- appearance
  el.querySelector('[data-save-appearance]').addEventListener('click', async () => {
    try {
      for (const input of el.querySelectorAll('[data-setting-color]')) {
        await api.put(`/api/settings/${input.dataset.settingColor}`, { value: input.value, type: 'color' });
      }
      toast('Appearance saved. Reloading.');
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
      const res = await fetch('/api/export', { credentials: 'same-origin' });
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
