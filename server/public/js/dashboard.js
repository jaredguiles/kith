// Home dashboard + Notifications page.

import { api } from './api.js';
import { esc, fmtDate, fmtDateTime, timeAgo, parseDate } from './utils.js';
import { icon } from './icons.js';
import { emptyState, toast, sectionHeader, leaderRow } from './components.js';
import { pageRenderers } from './pages.js';
import { state, refreshNotifCount } from './app.js';
import { openReminderForm, recurBadge } from './events.js';

// ---------------------------------------------------------------- home
function daypart() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}

/** Mock-style dateline: 'MONDAY · JULY 7 · 2026' (CSS uppercases). */
function datelineToday() {
  const d = new Date();
  const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
  const month = d.toLocaleDateString(undefined, { month: 'long' });
  return `${weekday} · ${month} ${d.getDate()} · ${d.getFullYear()}`;
}

/** 'Sat, Jul 11' for a birthday N days out. */
function bdayDate(daysUntil) {
  const d = new Date(Date.now() + Number(daysUntil) * 86400000);
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Mono due tag for a reminder: OVERDUE · 2D / DUE TODAY / TOMORROW / date. */
function dueTag(dueAt) {
  const due = parseDate(dueAt);
  if (!due) return { label: '', overdue: false };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((startOfDay(due) - startOfDay(new Date())) / 86400000);
  if (diffDays < 0) return { label: `Overdue · ${Math.abs(diffDays)}d`, overdue: true };
  if (diffDays === 0) return { label: 'Due today', overdue: false };
  if (diffDays === 1) return { label: 'Tomorrow', overdue: false };
  return { label: fmtDate(due), overdue: false };
}

async function renderHome(el) {
  let data;
  try {
    data = await api.get('/api/dashboard');
  } catch (err) {
    el.innerHTML = `<div class="page-inner">${emptyState('alert-circle', "Couldn't load", 'Check your connection and try again.')}</div>`;
    return;
  }
  const { birthdays, reminders, events, activity, stats } = data;
  const outOfTouch = data.out_of_touch || [];
  const upcomingDates = data.upcoming_dates || [];
  const firstName = (state.user.display_name || state.user.username).split(' ')[0];
  const relTag = (n) => n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;

  // 01 UPCOMING BIRTHDAYS — dotted-leader rows, accent 'in N days'
  const bdayRows = birthdays.length ? birthdays.map((b) => leaderRow(
    `<span class="rec-bday-name">${esc(b.display_name)}</span>`,
    `<span class="rec-bday-date">${esc(bdayDate(b.days_until))}</span><span class="rec-bday-rel">${esc(relTag(b.days_until))}</span>`,
    { tag: 'a', attrs: `href="#/contacts/${Number(b.id)}"` }
  )).join('') : '<div class="text-sm text-muted" style="padding:6px 0">No birthdays in the next 30 days.</div>';

  // 02 REMINDERS — hollow-square complete button + serif text + mono due tag
  const remindRows = reminders.length ? reminders.map((r) => {
    const due = dueTag(r.due_at);
    return `
      <div class="rec-remind-row">
        <button class="rec-check" data-complete-reminder="${Number(r.id)}" aria-label="Complete ${esc(r.title)}" title="Complete"></button>
        <span class="rec-remind-t">${esc(r.title)}${r.contact_name ? ` <span class="rec-mono">· ${esc(r.contact_name)}</span>` : ''}</span>
        ${recurBadge(r)}
        <span class="rec-remind-due ${due.overdue ? 'overdue' : ''}">${esc(due.label)}</span>
      </div>`;
  }).join('') : '<div class="text-sm text-muted" style="padding:6px 0">Nothing due. Nice.</div>';

  // 03 NEXT UP — mono day/hour block + serif title + mono location
  const eventRows = events.length ? events.map((e) => {
    const d = parseDate(e.starts_at);
    const day = d ? d.toLocaleDateString(undefined, { weekday: 'short' }) : '';
    const hour = d ? d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
    return `
      <div class="rec-ev-row">
        <div class="rec-ev-when"><div class="rec-ev-day">${esc(day)}</div><div class="rec-ev-hour">${esc(hour)}</div></div>
        <div class="rec-ev-body"><div class="rec-ev-title">${esc(e.title)}</div>${e.location ? `<div class="rec-ev-where">${esc(e.location)}</div>` : ''}</div>
      </div>`;
  }).join('') : '<div class="text-sm text-muted" style="padding:6px 0">Nothing planned yet.</div>';

  // 04 RECENT ACTIVITY — mono timestamp + serif-italic name + muted action
  const activityRows = activity.length ? activity.map((a) => `
    <a class="rec-log-row" href="#/contacts/${Number(a.contact_id)}">
      <span class="rec-log-when">${esc(timeAgo(a.created_at))}</span>
      <span class="rec-log-body"><span class="rec-log-who">${esc(a.contact_name)}</span> <span class="rec-log-what">— ${esc(a.title || (a.type === 'note' ? 'note added' : a.type))}</span></span>
    </a>`).join('') : '<div class="text-sm text-muted" style="padding:6px 0">No activity yet.</div>';

  // 05 OUT OF TOUCH — leader rows, mono cadence
  const ootRows = outOfTouch.map((c) => leaderRow(
    `<span class="rec-serif-lg">${esc(c.display_name)}</span>`,
    `<span class="rec-mono">${c.last_contacted_at ? `last ${esc(timeAgo(c.last_contacted_at))}` : 'no contact recorded'} · every ${Number(c.keep_in_touch_days)}d</span>`,
    { tag: 'a', attrs: `href="#/contacts/${Number(c.id)}"` }
  )).join('');

  // 06 COMING UP — important dates, accent countdown
  const upRows = upcomingDates.map((d) => leaderRow(
    `<span class="rec-serif">${esc(d.label)}</span> <span class="rec-mono">· ${esc(d.contact_name)}</span>`,
    `<span class="rec-bday-rel">${esc(relTag(d.days_until))}</span>`,
    { tag: 'a', attrs: `href="#/contacts/${Number(d.contact_id)}"` }
  )).join('');

  el.innerHTML = `
  <div class="page-inner">
    <div class="rec-dateline">
      <span>${esc(datelineToday())}</span>
      <span>${Number(reminders.length)} reminder${reminders.length === 1 ? '' : 's'} pending</span>
    </div>
    <h1 class="rec-greeting">Good ${esc(daypart())}, ${esc(firstName)}.</h1>

    <div class="rec-stats">
      <div class="rec-stat"><div class="rec-stat-v">${Number(stats.total_contacts) || 0}</div><div class="rec-stat-l">People</div></div>
      <div class="rec-stat"><div class="rec-stat-v">${Number(stats.contacts_this_month) || 0}</div><div class="rec-stat-l">Added · month</div></div>
      <div class="rec-stat"><div class="rec-stat-v">${Number(stats.events_this_month) || 0}</div><div class="rec-stat-l">Events · month</div></div>
      <div class="rec-stat"><div class="rec-stat-v">${Number(stats.overdue_reminders) || 0}</div><div class="rec-stat-l">Overdue</div></div>
    </div>

    <div class="rec-cols">
      <div class="rec-col">
        <div class="rec-section">
          ${sectionHeader('01', 'Upcoming birthdays')}
          ${bdayRows}
        </div>
        <div class="rec-section">
          ${sectionHeader('02', 'Reminders', `<button class="rec-head-action" data-action="new-reminder">+ New</button>`)}
          ${remindRows}
        </div>
        ${outOfTouch.length ? `
        <div class="rec-section">
          ${sectionHeader('05', 'Out of touch')}
          ${ootRows}
        </div>` : ''}
      </div>
      <div class="rec-col">
        <div class="rec-section">
          ${sectionHeader('03', 'Next up', `<a class="rec-head-action" href="#/events">All events</a>`)}
          ${eventRows}
        </div>
        <div class="rec-section">
          ${sectionHeader('04', 'Recent activity')}
          ${activityRows}
        </div>
        ${upcomingDates.length ? `
        <div class="rec-section">
          ${sectionHeader('06', 'Coming up')}
          ${upRows}
        </div>` : ''}
      </div>
    </div>
  </div>`;

  el.querySelector('[data-action="new-reminder"]').addEventListener('click', () => openReminderForm(null, () => renderHome(el)));
  el.querySelectorAll('[data-complete-reminder]').forEach((b) =>
    b.addEventListener('click', async () => {
      try {
        const res = await api.post(`/api/reminders/${b.dataset.completeReminder}/complete`);
        toast(res?.next_due_at ? `Reminder completed. Next: ${fmtDateTime(res.next_due_at)}` : 'Reminder completed.');
        renderHome(el);
        refreshNotifCount();
      } catch (err) { toast(err.message, 'error'); }
    }));
}

// ---------------------------------------------------------- notifications
const NOTIF_ICONS = {
  share_received: 'share', import_complete: 'import', import_review: 'import',
  reminder_overdue: 'clock', birthday: 'cake', event_upcoming: 'calendar',
  important_date: 'gift', out_of_touch: 'clock',
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
