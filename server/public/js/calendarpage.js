// Calendar page — month grid of events, birthdays, important dates, reminders.
// Data from GET /api/calendar?month=YYYY-MM. Mobile (<768px) shows an agenda
// list via CSS (both layouts render; CSS toggles).

import { api, qs } from './api.js';
import { esc, parseDate, fmtDateTime } from './utils.js';
import { icon } from './icons.js';
import { emptyState, openModal, modalShell } from './components.js';
import { pageRenderers } from './pages.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let current = null; // 'YYYY-MM' being displayed (persists across re-renders)

function monthKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return monthKey(d);
}

/** Build day → chips map from the API payload. Chip: {cls, icon, label, href, time} */
function buildDayMap(data, year, month) {
  const days = new Map(); // dayNum → [chip]
  const add = (day, chip) => {
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(chip);
  };
  const dayOf = (dstr) => {
    const d = parseDate(dstr);
    if (!d || d.getFullYear() !== year || d.getMonth() !== month) return null;
    return d.getDate();
  };

  for (const ev of data.events || []) {
    const day = dayOf(ev.starts_at);
    if (day == null) continue;
    add(day, {
      cls: 'chip-event', icon: 'calendar', label: ev.title, href: '#/events',
      time: fmtDateTime(ev.starts_at), sort: 0,
    });
  }
  for (const b of data.birthdays || []) {
    // Birthday dates come normalized to the requested month/year (or original
    // year) — match on month+day, project into the viewed year.
    const d = parseDate(b.date);
    if (!d || d.getMonth() !== month) continue;
    add(d.getDate(), {
      cls: 'chip-birthday', icon: 'cake', label: `${b.display_name}'s birthday`,
      href: `#/contacts/${encodeURIComponent(b.contact_id)}`, time: '', sort: 1,
    });
  }
  for (const it of data.dates || []) {
    const d = parseDate(it.date);
    if (!d || d.getMonth() !== month) continue;
    if (!it.recurring && d.getFullYear() !== year) continue;
    add(d.getDate(), {
      cls: 'chip-date', icon: 'gift', label: `${it.label} · ${it.contact_name}`,
      href: `#/contacts/${encodeURIComponent(it.contact_id)}`, time: '', sort: 2,
    });
  }
  for (const r of data.reminders || []) {
    const day = dayOf(r.due_at);
    if (day == null) continue;
    add(day, {
      cls: 'chip-reminder', icon: 'bell', label: r.title,
      href: r.contact_id ? `#/contacts/${encodeURIComponent(r.contact_id)}` : '#/notifications',
      time: fmtDateTime(r.due_at), sort: 3,
    });
  }
  for (const chips of days.values()) chips.sort((a, b) => a.sort - b.sort);
  return days;
}

function chipHtml(chip, extraCls = '') {
  return `<a class="cal-chip ${chip.cls} ${extraCls}" href="${esc(chip.href)}" title="${esc(chip.label)}">${icon(chip.icon)}<span class="truncate">${esc(chip.label)}</span></a>`;
}

function openDayModal(year, month, day, chips) {
  const title = `${MONTHS[month]} ${day}, ${year}`;
  const body = chips.map((c) => `
    <a class="cal-day-item" href="${esc(c.href)}">
      <span class="feed-icon cal-day-icon ${c.cls}">${icon(c.icon)}</span>
      <span class="flex-1">
        <span class="text-sm font-medium truncate" style="display:block">${esc(c.label)}</span>
        ${c.time ? `<span class="text-xs text-muted">${esc(c.time)}</span>` : ''}
      </span>
    </a>`).join('');
  const { overlay, close } = openModal(modalShell('cal-day', title, body || '<p class="text-sm text-muted">Nothing on this day.</p>', ''));
  overlay.querySelectorAll('.cal-day-item').forEach((a) =>
    a.addEventListener('click', () => close()));
}

async function renderCalendarPage(el) {
  if (!current) current = monthKey(new Date());
  const [year, monthNum] = current.split('-').map(Number);
  const month = monthNum - 1;

  el.innerHTML = `
  <div class="page-inner cal-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">Calendar</h1>
        <div class="page-subtitle">${esc(MONTHS[month])} ${year}</div>
      </div>
      <div class="page-actions">
        <button class="btn btn-icon" data-cal="prev" aria-label="Previous month">${icon('chevron-left')}</button>
        <button class="btn btn-secondary btn-sm" data-cal="today">Today</button>
        <button class="btn btn-icon" data-cal="next" aria-label="Next month">${icon('chevron-right')}</button>
      </div>
    </div>
    <div class="card" id="cal-body" style="padding:0">
      ${emptyState('clock', 'Loading…', 'Fetching this month.')}
    </div>
  </div>`;

  el.querySelector('[data-cal="prev"]').addEventListener('click', () => { current = shiftMonth(current, -1); renderCalendarPage(el); });
  el.querySelector('[data-cal="next"]').addEventListener('click', () => { current = shiftMonth(current, 1); renderCalendarPage(el); });
  el.querySelector('[data-cal="today"]').addEventListener('click', () => { current = monthKey(new Date()); renderCalendarPage(el); });

  let data;
  try {
    data = await api.get('/api/calendar' + qs({ month: current }));
  } catch (err) {
    const body = el.querySelector('#cal-body');
    if (body) body.innerHTML = emptyState('alert-circle', "Couldn't load the calendar", err?.message || 'Try again shortly.');
    return;
  }
  const body = el.querySelector('#cal-body');
  if (!body) return;

  const days = buildDayMap(data, year, month);
  const firstDow = new Date(year, month, 1).getDay(); // Sunday start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const isToday = (d) => today.getFullYear() === year && today.getMonth() === month && today.getDate() === d;

  // ------- month grid (desktop)
  let cells = '';
  for (let i = 0; i < firstDow; i++) cells += '<div class="cal-cell cal-cell-empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const chips = days.get(d) || [];
    const shown = chips.slice(0, 3);
    const more = chips.length - shown.length;
    cells += `
      <div class="cal-cell ${isToday(d) ? 'cal-today' : ''}">
        <div class="cal-cell-num">${d}</div>
        ${shown.map((c) => chipHtml(c)).join('')}
        ${more > 0 ? `<button class="cal-more" data-cal-day="${d}">+${more} more</button>` : ''}
      </div>`;
  }

  const gridHtml = `
    <div class="cal-grid-head">${DOW.map((d) => `<div class="cal-dow">${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>`;

  // ------- agenda list (mobile)
  const sortedDays = [...days.keys()].sort((a, b) => a - b);
  const agendaHtml = sortedDays.length
    ? sortedDays.map((d) => `
      <div class="cal-agenda-day">
        <div class="cal-agenda-date ${isToday(d) ? 'cal-agenda-today' : ''}">${esc(MONTHS[month].slice(0, 3))} ${d}</div>
        <div class="cal-agenda-items">${(days.get(d) || []).map((c) => chipHtml(c, 'cal-chip-lg')).join('')}</div>
      </div>`).join('')
    : emptyState('calendar', 'Nothing this month', 'No events, birthdays, or reminders.');

  body.innerHTML = `
    <div class="cal-desktop">${gridHtml}</div>
    <div class="cal-mobile">${agendaHtml}</div>`;

  body.querySelectorAll('[data-cal-day]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const d = Number(btn.dataset.calDay);
      openDayModal(year, month, d, days.get(d) || []);
    }));
}

pageRenderers.calendar = renderCalendarPage;
