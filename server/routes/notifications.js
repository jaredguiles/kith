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
  const [overdue, birthdays, events] = await Promise.all([
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

// GET /api/notifications/count — unread stored + derived count for the badge
router.get('/count', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND dismissed_at IS NULL AND read_at IS NULL',
      [req.user.id]
    );
    const derived = await derivedNotifications(req.user);
    res.json({ count: rows[0].c + derived.length });
  } catch (err) { next(err); }
});

// POST /api/notifications/:id/read
router.post('/:id/read', async (req, res, next) => {
  try {
    await query('UPDATE notifications SET read_at = NOW() WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/notifications/:id/dismiss
router.post('/:id/dismiss', async (req, res, next) => {
  try {
    await query('UPDATE notifications SET dismissed_at = NOW() WHERE id = ? AND user_id = ?', [Number(req.params.id), req.user.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
