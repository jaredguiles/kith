'use strict';

// ICS calendar feed (RFC 5545). Mounted at /api/ics.
// GET /calendar.ics?token=kith_… — token-auth via query param (calendar apps
// can't send headers). GET /events/:id.ics — session-auth'd single event.
// Hand-rolled VCALENDAR: CRLF line endings, folding at 75 octets, escaping.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, authenticateApiToken, isAdmin } = require('../middleware/auth');

const router = express.Router();

// --------------------------------------------------------- RFC5545 helpers

/** Escape TEXT values per RFC 5545 §3.3.11. */
function icsEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/** Fold a content line at 75 octets (UTF-8 aware), continuation = CRLF + space. */
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    let limit = first ? 75 : 74; // continuation lines start with a space
    let end = Math.min(start + limit, bytes.length);
    // don't split a UTF-8 sequence: back off while the next byte is a continuation byte
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((first ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
    start = end;
    first = false;
  }
  return out.join('\r\n');
}

/** 'YYYY-MM-DD HH:MM:SS' (DB, treated as UTC) → 'YYYYMMDDTHHMMSSZ'. */
function toUtcStamp(dt) {
  const m = String(dt || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}T${m[4] || '00'}${m[5] || '00'}${m[6] || '00'}Z`;
}

/** 'YYYY-MM-DD…' → 'YYYYMMDD' (all-day values). */
function toDateStamp(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

function vevent(lines) {
  return ['BEGIN:VEVENT', ...lines.filter(Boolean), 'END:VEVENT'];
}

function buildCalendar(events, name = 'Kith') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kith//Personal CRM//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(name)}`,
  ];
  for (const ev of events) lines.push(...ev);
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

const nowStamp = () => toUtcStamp(new Date().toISOString().slice(0, 19).replace('T', ' '));

// ------------------------------------------------------------ data scoping

/** Contact ids accessible to a user: own + shared-in (admins: all). */
function contactScopeSql(user) {
  if (isAdmin(user)) return { clause: 'c.deleted_at IS NULL', params: [] };
  return {
    clause: `c.deleted_at IS NULL AND (c.owner_user_id = ? OR EXISTS (
       SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ?))`,
    params: [user.id, user.id],
  };
}

// -------------------------------------------------------------- feed route

// GET /api/ics/calendar.ics?token=kith_…
router.get('/calendar.ics', async (req, res, next) => {
  try {
    const rawToken = String(req.query.token || '');
    const auth = await authenticateApiToken(rawToken);
    if (!auth) return res.status(401).json({ error: 'Invalid or expired token' });
    // Query-param tokens leak via logs/Referer (audit S2): only read-only
    // tokens may authenticate this way — a leaked read_write PAT would grant
    // full write access. Mint a 'read' scoped token for calendar feeds.
    if (auth.scopes !== 'read') {
      return res.status(401).json({ error: 'Calendar feeds require a read-only API token' });
    }
    // the feed is read-only by nature — 'read' scope suffices
    const user = auth.user;

    const scope = contactScopeSql(user);

    const [events, birthdays, dates, reminders] = await Promise.all([
      // spicy events excluded from the feed — it leaves the app's auth boundary
      isAdmin(user)
        ? query(`SELECT id, title, description, location, starts_at, ends_at FROM events
                 WHERE deleted_at IS NULL AND is_spicy = 0 AND status != 'cancelled' AND starts_at IS NOT NULL`)
        : query(`SELECT id, title, description, location, starts_at, ends_at FROM events
                 WHERE deleted_at IS NULL AND is_spicy = 0 AND status != 'cancelled' AND starts_at IS NOT NULL
                   AND owner_user_id = ?`, [user.id]),
      query(`SELECT c.id, c.display_name, c.birthday FROM contacts c
             WHERE c.birthday IS NOT NULL AND ${scope.clause}`, scope.params),
      query(`SELECT d.id, d.label, d.date, d.recurring, c.display_name FROM important_dates d
             JOIN contacts c ON c.id = d.contact_id WHERE ${scope.clause}`, scope.params),
      query(`SELECT r.id, r.title, r.description, r.due_at FROM reminders r
             WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL`, [user.id]),
    ]);

    const stamp = nowStamp();
    const vevents = [];

    for (const e of events) {
      const dtstart = toUtcStamp(e.starts_at);
      if (!dtstart) continue;
      const dtend = toUtcStamp(e.ends_at);
      vevents.push(vevent([
        `UID:kith-event-${e.id}@kith`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dtstart}`,
        dtend ? `DTEND:${dtend}` : null,
        `SUMMARY:${icsEscape(e.title)}`,
        e.description ? `DESCRIPTION:${icsEscape(e.description)}` : null,
        e.location ? `LOCATION:${icsEscape(e.location)}` : null,
      ]));
    }

    for (const b of birthdays) {
      const d = toDateStamp(b.birthday);
      if (!d) continue;
      vevents.push(vevent([
        `UID:kith-birthday-${b.id}@kith`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`,
        'RRULE:FREQ=YEARLY',
        `SUMMARY:${icsEscape(`🎂 ${b.display_name}'s birthday`)}`,
      ]));
    }

    for (const idate of dates) {
      const d = toDateStamp(idate.date);
      if (!d) continue;
      vevents.push(vevent([
        `UID:kith-date-${idate.id}@kith`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${d}`,
        idate.recurring ? 'RRULE:FREQ=YEARLY' : null,
        `SUMMARY:${icsEscape(`${idate.label} — ${idate.display_name}`)}`,
      ]));
    }

    for (const r of reminders) {
      const dtstart = toUtcStamp(r.due_at);
      if (!dtstart) continue;
      vevents.push(vevent([
        `UID:kith-reminder-${r.id}@kith`,
        `DTSTAMP:${stamp}`,
        `DTSTART:${dtstart}`,
        `SUMMARY:${icsEscape(`⏰ ${r.title}`)}`,
        r.description ? `DESCRIPTION:${icsEscape(r.description)}` : null,
      ]));
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kith-calendar.ics"');
    res.send(buildCalendar(vevents, 'Kith'));
  } catch (err) { next(err); }
});

// GET /api/ics/events/:id.ics — session-auth'd single event download
// (param captured as :file and the .ics suffix parsed manually — Express 5's
// path-to-regexp no longer supports literal suffixes after a param)
router.get('/events/:file', requireAuth, async (req, res, next) => {
  try {
    const m = String(req.params.file).match(/^(\d+)\.ics$/);
    if (!m) return res.status(404).json({ error: 'Event not found' });
    const id = Number(m[1]);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Event not found' });
    const rows = await query('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Event not found' });
    const e = rows[0];
    if (e.owner_user_id !== req.user.id && !isAdmin(req.user)) return res.status(404).json({ error: 'Event not found' });
    if (!e.starts_at) return res.status(400).json({ error: 'Event has no start date' });

    const stamp = nowStamp();
    const dtend = toUtcStamp(e.ends_at);
    const ev = vevent([
      `UID:kith-event-${e.id}@kith`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toUtcStamp(e.starts_at)}`,
      dtend ? `DTEND:${dtend}` : null,
      `SUMMARY:${icsEscape(e.title)}`,
      e.description ? `DESCRIPTION:${icsEscape(e.description)}` : null,
      e.location ? `LOCATION:${icsEscape(e.location)}` : null,
    ]);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kith-event-${e.id}.ics"`);
    res.send(buildCalendar([ev], e.title));
  } catch (err) { next(err); }
});

module.exports = router;
