'use strict';

// Notifications: persistent rows (shares, imports) + derived items (overdue
// reminders, birthdays ≤7d, events ≤7d) computed at read time.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');

const router = express.Router();
router.use(requireAuth);

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

module.exports = router;
