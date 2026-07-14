'use strict';

// Notifications: persistent rows (shares, imports) + derived items (overdue
// reminders, birthdays ≤7d, events ≤7d) computed at read time.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');
const scheduler = require('../lib/scheduler');

const router = express.Router();
router.use(requireAuth);

// --------------------------------------------------------------- prefs
// The notify_* / digest_* / nudge_* fields the settings UI reads/writes.
const NOTIFY_CHANNELS = ['email', 'push', 'both', 'none'];
const BOOL_FIELDS = ['digest_weekly', 'nudge_birthdays', 'nudge_reminders', 'nudge_out_of_touch'];

function isEmailish(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

async function derivedNotifications(user) {
  const showSpicy = await spicyVisible(user);
  const scope = isAdmin(user) ? '' : `AND c.owner_user_id = ${Number(user.id)}`;
  const [overdue, birthdays, events, importantDates, outOfTouch] = await Promise.all([
    query(
      `SELECT r.id, r.title, r.due_at, c.display_name AS contact_name, r.contact_id
       FROM reminders r LEFT JOIN contacts c ON c.id = r.contact_id
       WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL AND r.due_at < NOW()
       ORDER BY r.due_at ASC LIMIT 20`,
      [user.id]
    ),
    query(
      `SELECT c.id, c.display_name, c.birthday FROM contacts c
       WHERE c.deleted_at IS NULL AND c.birthday IS NOT NULL ${scope}
         AND DATEDIFF(
           DATE_ADD(c.birthday, INTERVAL YEAR(CURDATE()) - YEAR(c.birthday) + IF(DATE_FORMAT(c.birthday,'%m-%d') < DATE_FORMAT(CURDATE(),'%m-%d'), 1, 0) YEAR),
           CURDATE()) BETWEEN 0 AND 7
       ORDER BY DATE_FORMAT(c.birthday, '%m-%d') LIMIT 20`
    ),
    query(
      `SELECT e.id, e.title, e.starts_at FROM events e
       WHERE e.deleted_at IS NULL AND e.status = 'upcoming' AND e.owner_user_id = ?
         ${showSpicy ? '' : 'AND e.is_spicy = 0'}
         AND e.starts_at BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 7 DAY)
       ORDER BY e.starts_at ASC LIMIT 20`,
      [user.id]
    ),
    // important dates within 7 days (recurring → next occurrence; one-off → literal)
    query(
      `SELECT d.id, d.label, d.date, c.id AS contact_id, c.display_name FROM important_dates d
       JOIN contacts c ON c.id = d.contact_id
       WHERE c.deleted_at IS NULL ${scope}
         AND (
           (d.recurring = 1 AND DATEDIFF(
             DATE_ADD(d.date, INTERVAL YEAR(CURDATE()) - YEAR(d.date) + IF(DATE_FORMAT(d.date,'%m-%d') < DATE_FORMAT(CURDATE(),'%m-%d'), 1, 0) YEAR),
             CURDATE()) BETWEEN 0 AND 7)
           OR (d.recurring = 0 AND d.date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 7 DAY))
         )
       ORDER BY DATE_FORMAT(d.date, '%m-%d') LIMIT 20`
    ),
    // out-of-touch: keep_in_touch_days set and overdue (never contacted counts too)
    query(
      `SELECT c.id, c.display_name, c.last_contacted_at, c.keep_in_touch_days FROM contacts c
       WHERE c.deleted_at IS NULL AND c.keep_in_touch_days IS NOT NULL AND c.keep_in_touch_days > 0 ${scope}
         AND (c.last_contacted_at IS NULL OR c.last_contacted_at < DATE_SUB(NOW(), INTERVAL c.keep_in_touch_days DAY))
       ORDER BY c.last_contacted_at IS NOT NULL, c.last_contacted_at ASC LIMIT 10`
    ),
  ]);

  return [
    ...overdue.map((r) => ({
      id: `reminder-${r.id}`, type: 'reminder_overdue',
      title: `Overdue: ${r.title}`,
      body: r.contact_name ? `Linked to ${r.contact_name}` : null,
      link: '#/home', at: r.due_at, derived: true, entity_id: r.id,
    })),
    ...birthdays.map((c) => ({
      id: `birthday-${c.id}`, type: 'birthday',
      title: `${c.display_name} has a birthday soon`,
      body: null, link: `#/contacts/${c.id}`, at: c.birthday, derived: true,
    })),
    ...events.map((e) => ({
      id: `event-${e.id}`, type: 'event_upcoming',
      title: `Upcoming: ${e.title}`,
      body: null, link: '#/events', at: e.starts_at, derived: true,
    })),
    ...importantDates.map((d) => ({
      id: `date-${d.id}`, type: 'important_date',
      title: `${d.label} — ${d.display_name}`,
      body: null, link: `#/contacts/${d.contact_id}`, at: d.date, derived: true,
    })),
    ...outOfTouch.map((c) => ({
      id: `outoftouch-${c.id}`, type: 'out_of_touch',
      title: `Time to reach out to ${c.display_name}`,
      body: c.last_contacted_at ? `Last contact: ${String(c.last_contacted_at).slice(0, 10)}` : 'No contact recorded yet',
      link: `#/contacts/${c.id}`, at: c.last_contacted_at, derived: true,
    })),
  ];
}

// GET /api/notifications
router.get('/', async (req, res, next) => {
  try {
    const stored = await query(
      `SELECT * FROM notifications WHERE user_id = ? AND dismissed_at IS NULL ORDER BY created_at DESC LIMIT 100`,
      [req.user.id]
    );
    const derived = await derivedNotifications(req.user);
    res.json({
      notifications: [
        ...stored.map((n) => ({ ...n, derived: false, unread: !n.read_at })),
        ...derived.map((n) => ({ ...n, unread: false })),
      ],
    });
  } catch (err) { next(err); }
});

// GET /api/notifications/count — unread STORED notifications only; derived
// items (birthdays/events/overdue reminders) are undismissable and would make
// the badge permanent, so they count in the list but not the badge.
router.get('/count', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND dismissed_at IS NULL AND read_at IS NULL',
      [req.user.id]
    );
    res.json({ count: rows[0].c });
  } catch (err) { next(err); }
});

// POST /api/notifications/:id/read
router.post('/:id/read', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Notification not found' });
    await query('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/notifications/:id/dismiss
router.post('/:id/dismiss', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Notification not found' });
    await query('UPDATE notifications SET dismissed_at = NOW() WHERE id = ? AND user_id = ?', [id, req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notifications/:id — hard delete one's own notification
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Notification not found' });
    const result = await query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Notification not found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/notifications/prefs — the user's notify_/digest_/nudge_ settings
router.get('/prefs', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT notify_email, notify_channel, digest_weekly, digest_day,
              nudge_birthdays, nudge_reminders, nudge_out_of_touch, email
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    const u = rows[0] || {};
    res.json({
      prefs: {
        notify_email: u.notify_email || null,
        notify_channel: u.notify_channel || 'email',
        digest_weekly: Boolean(u.digest_weekly),
        digest_day: Number(u.digest_day ?? 1),
        nudge_birthdays: Boolean(u.nudge_birthdays),
        nudge_reminders: Boolean(u.nudge_reminders),
        nudge_out_of_touch: Boolean(u.nudge_out_of_touch),
        account_email: u.email || null,
      },
    });
  } catch (err) { next(err); }
});

// PUT /api/notifications/prefs — update notify_/digest_/nudge_ settings
router.put('/prefs', async (req, res, next) => {
  try {
    const body = req.body || {};
    const updates = [];
    const params = [];

    for (const f of BOOL_FIELDS) {
      if (body[f] !== undefined) {
        if (typeof body[f] !== 'boolean') return res.status(400).json({ error: `${f} must be a boolean` });
        updates.push(`${f} = ?`); params.push(body[f] ? 1 : 0);
      }
    }
    if (body.digest_day !== undefined) {
      const d = Number(body.digest_day);
      if (!Number.isInteger(d) || d < 0 || d > 6) return res.status(400).json({ error: 'digest_day must be 0-6' });
      updates.push('digest_day = ?'); params.push(d);
    }
    if (body.notify_channel !== undefined) {
      if (!NOTIFY_CHANNELS.includes(body.notify_channel)) {
        return res.status(400).json({ error: `notify_channel must be one of: ${NOTIFY_CHANNELS.join(', ')}` });
      }
      updates.push('notify_channel = ?'); params.push(body.notify_channel);
    }
    if (body.notify_email !== undefined) {
      if (body.notify_email === null || body.notify_email === '') {
        updates.push('notify_email = ?'); params.push(null);
      } else if (!isEmailish(body.notify_email)) {
        return res.status(400).json({ error: 'notify_email must be a valid email address' });
      } else {
        updates.push('notify_email = ?'); params.push(String(body.notify_email).trim());
      }
    }

    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.user.id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/notifications/test-digest — preview: run the weekly digest for just
// the current user immediately. Wrapped so it never 500s.
router.post('/test-digest', async (req, res, _next) => {
  try {
    const sent = await scheduler.runWeeklyDigest(req.user.id);
    res.json({ ok: true, sent });
  } catch (err) {
    console.error('[notifications] test-digest failed:', err.message);
    res.json({ ok: false, error: 'Digest preview could not be sent' });
  }
});

module.exports = router;
