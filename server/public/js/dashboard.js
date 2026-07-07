// Home dashboard + Notifications page.

import { api } from './api.js';
import { esc, fmtDate, fmtDateTime, timeAgo, initials, daysUntilBirthday } from './utils.js';
import { icon } from './icons.js';
import { emptyState, feedItem, toast } from './components.js';
import { pageRenderers } from './pages.js';
import { state, refreshNotifCount } from './app.js';
import { openReminderForm } from './events.js';

// ---------------------------------------------------------------- home
async function renderHome(el) {
  let data;
  try {
    data = await api.get('/api/dashboard');
  } catch (err) {
    el.innerHTML = `<div class="page-inner">${emptyState('alert-circle', "Couldn't load", 'Check your connection and try again.')}</div>`;
    return;
  }
  const { birthdays, reminders, events, activity, stats } = data;
  const firstName = (state.user.display_name || state.user.username).split(' ')[0];

  el.innerHTML = `
  <div class="page-inner">
    <div class="page-header">
      <div>
        <h1 class="page-title">Home</h1>
        <div class="page-subtitle">Welcome back, ${esc(firstName)}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-secondary" data-action="new-reminder">${icon('bell')} Reminder</button>
      </div>
    </div>

    <div class="grid-4 mb-4">
      ${statCard('users', stats.total_contacts, 'People')}
      ${statCard('plus', stats.contacts_this_month, 'Added this month')}
      ${statCard('calendar', stats.events_this_month, 'Events this month')}
      ${statCard('clock', stats.overdue_reminders, 'Overdue reminders', stats.overdue_reminders > 0 ? 'var(--amber)' : null)}
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header"><span class="card-title">Due reminders</span></div>
        ${reminders.length ? reminders.map((r) => `
          <div class="flex-between" style="padding:7px 0;border-bottom:1px solid var(--border)">
            <div>
              <div class="text-sm font-medium">${esc(r.title)}</div>
              <div class="text-xs text-muted">${esc(fmtDateTime(r.due_at))}${r.contact_name ? ` · ${esc(r.contact_name)}` : ''}</div>
            </div>
            <button class="btn btn-icon" data-complete-reminder="${r.id}" aria-label="Complete">${icon('check')}</button>
          </div>`).join('') : '<div class="text-sm text-muted">Nothing due. Nice.</div>'}
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Upcoming birthdays</span></div>
        ${birthdays.length ? birthdays.map((b) => `
          <a class="flex-between" style="padding:7px 0;border-bottom:1px solid var(--border);text-decoration:none;color:inherit" href="#/contacts/${b.id}">
            <span class="flex items-center gap-2">
              <span class="av sm">${esc(initials(b.display_name))}${b.photo_url ? `<img src="${esc(b.photo_url)}" alt="">` : ''}</span>
              <span class="text-sm font-medium">${esc(b.display_name)}</span>
            </span>
            <span class="badge ${b.days_until <= 7 ? 'amber' : 'neutral'}">${b.days_until === 0 ? 'Today' : b.days_until === 1 ? 'Tomorrow' : `${b.days_until}d`}</span>
          </a>`).join('') : '<div class="text-sm text-muted">No birthdays in the next 30 days.</div>'}
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Next events</span><a class="btn btn-ghost btn-sm" href="#/events">All events</a></div>
        ${events.length ? events.map((e) => `
          <div style="padding:7px 0;border-bottom:1px solid var(--border)">
            <div class="text-sm font-medium">${esc(e.title)}</div>
            <div class="text-xs text-muted">${esc(fmtDateTime(e.starts_at))}${e.location ? ` · ${esc(e.location)}` : ''}</div>
          </div>`).join('') : '<div class="text-sm text-muted">Nothing planned yet.</div>'}
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Recent activity</span></div>
        ${activity.length ? activity.map((a) => `
          <a class="flex items-center gap-2" style="padding:6px 0;border-bottom:1px solid var(--border);text-decoration:none;color:inherit" href="#/contacts/${a.contact_id}">
            <span class="feed-icon" style="width:26px;height:26px">${icon(a.type === 'note' ? 'sticky-note' : 'clock')}</span>
            <span class="text-sm flex-1 truncate">${esc(a.title || (a.type === 'note' ? 'Note added' : a.type))} · <span class="text-secondary">${esc(a.contact_name)}</span></span>
            <span class="text-micro text-muted">${esc(timeAgo(a.created_at))}</span>
          </a>`).join('') : '<div class="text-sm text-muted">No activity yet.</div>'}
      </div>
    </div>
  </div>`;

  el.querySelector('[data-action="new-reminder"]').addEventListener('click', () => openReminderForm(null, () => renderHome(el)));
  el.querySelectorAll('[data-complete-reminder]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        await api.post(`/api/reminders/${b.dataset.completeReminder}/complete`);
        toast('Reminder completed.');
        renderHome(el);
        refreshNotifCount();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

function statCard(iconName, value, label, color = null) {
  return `
  <div class="card card-compact flex items-center gap-3">
    <span class="feed-icon" ${color ? `style="color:${color}"` : ''}>${icon(iconName)}</span>
    <div>
      <div style="font-size:20px;font-weight:700" class="tabular">${Number(value) || 0}</div>
      <div class="text-xs text-muted">${esc(label)}</div>
    </div>
  </div>`;
}

// ---------------------------------------------------------- notifications
const NOTIF_ICONS = {
  share_received: 'share', import_complete: 'import', import_review: 'import',
  reminder_overdue: 'clock', birthday: 'cake', event_upcoming: 'calendar',
};

async function renderNotifications(el) {
  let data;
  try {
    data = await api.get('/api/notifications');
  } catch {
    el.innerHTML = `<div class="page-inner">${emptyState('bell', "Couldn't load", 'Try again shortly.')}</div>`;
    return;
  }
  const items = data.notifications || [];

  el.innerHTML = `
  <div class="page-inner" style="max-width:720px">
    <div class="page-header">
      <div><h1 class="page-title">Notifications</h1><div class="page-subtitle">${items.length} item${items.length === 1 ? '' : 's'}</div></div>
    </div>
    <div class="card" style="padding:0">
      ${items.length ? items.map((n) => `
        <div class="notif-item ${n.unread ? 'unread' : ''}" data-notif="${esc(String(n.id))}" data-derived="${n.derived ? '1' : '0'}">
          <span class="feed-icon">${icon(NOTIF_ICONS[n.type] || 'bell')}</span>
          <div class="flex-1 clickable" data-link="${esc(n.link || '')}">
            <div class="text-sm font-medium">${esc(n.title)}</div>
            ${n.body ? `<div class="text-sm text-secondary">${esc(n.body)}</div>` : ''}
            <div class="text-micro text-muted mt-1">${esc(n.derived ? fmtDate(n.at) : timeAgo(n.created_at))}</div>
          </div>
          ${!n.derived ? `
          <div class="flex gap-1">
            ${n.unread ? `<button class="btn btn-icon" data-read aria-label="Mark read">${icon('check')}</button>` : ''}
            <button class="btn btn-icon" data-dismiss aria-label="Dismiss">${icon('x')}</button>
          </div>` : ''}
        </div>`).join('') : emptyState('bell', 'All caught up', 'Nothing needs your attention.')}
    </div>
  </div>`;

  el.querySelectorAll('[data-link]').forEach((div) =>
    div.addEventListener('click', () => {
      const link = div.dataset.link;
      if (link) location.hash = link.replace(/^#/, '');
    }));

  el.querySelectorAll('.notif-item').forEach((item) => {
    const id = item.dataset.notif;
    item.querySelector('[data-read]')?.addEventListener('click', async () => {
      await api.post(`/api/notifications/${id}/read`).catch(() => {});
      renderNotifications(el);
      refreshNotifCount();
    });
    item.querySelector('[data-dismiss]')?.addEventListener('click', async () => {
      await api.post(`/api/notifications/${id}/dismiss`).catch(() => {});
      renderNotifications(el);
      refreshNotifCount();
    });
  });
}

pageRenderers.home = renderHome;
pageRenderers.notifications = renderNotifications;
