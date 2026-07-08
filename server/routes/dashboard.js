'use strict';

// Dashboard aggregates. (The full data export moved to routes/export.js as
// GET /api/export/backup.)

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');
const { decryptField } = require('../lib/crypto');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const showSpicy = await spicyVisible(req.user);
    const scope = isAdmin(req.user) ? '' : `AND c.owner_user_id = ${Number(req.user.id)}`;
    const evScope = isAdmin(req.user) ? '' : `AND e.owner_user_id = ${Number(req.user.id)}`;

    const [birthdays, reminders, events, activity, stats, outOfTouch, upcomingDates] = await Promise.all([
      query(
        `SELECT c.id, c.display_name, c.birthday, c.photo_url, c.orientation,
           DATEDIFF(DATE_ADD(c.birthday, INTERVAL YEAR(CURDATE()) - YEAR(c.birthday) + IF(DATE_FORMAT(c.birthday,'%m-%d') < DATE_FORMAT(CURDATE(),'%m-%d'), 1, 0) YEAR), CURDATE()) AS days_until
         FROM contacts c
         WHERE c.deleted_at IS NULL AND c.birthday IS NOT NULL ${scope}
         HAVING days_until BETWEEN 0 AND 30 ORDER BY days_until LIMIT 10`
      ),
      query(
        `SELECT r.*, c.display_name AS contact_name FROM reminders r
         LEFT JOIN contacts c ON c.id = r.contact_id
         WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL
           AND r.due_at <= DATE_ADD(NOW(), INTERVAL 1 DAY)
         ORDER BY r.due_at ASC LIMIT 10`,
        [req.user.id]
      ),
      query(
        `SELECT e.* FROM events e
         WHERE e.deleted_at IS NULL AND e.status = 'upcoming' ${evScope}
           ${showSpicy ? '' : 'AND e.is_spicy = 0'} AND e.starts_at >= NOW()
         ORDER BY e.starts_at ASC LIMIT 5`
      ),
      query(
        `SELECT tl.id, tl.type, tl.title, tl.description, tl.is_spicy, tl.occurred_at, tl.created_at,
                c.id AS contact_id, c.display_name AS contact_name
         FROM timeline_events tl JOIN contacts c ON c.id = tl.contact_id AND c.deleted_at IS NULL ${scope}
         WHERE tl.deleted_at IS NULL ${showSpicy ? '' : 'AND tl.is_spicy = 0'}
         ORDER BY tl.created_at DESC LIMIT 10`
      ),
      query(
        `SELECT
          (SELECT COUNT(*) FROM contacts c WHERE c.deleted_at IS NULL ${scope}) AS total_contacts,
          (SELECT COUNT(*) FROM contacts c WHERE c.deleted_at IS NULL ${scope} AND c.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')) AS contacts_this_month,
          (SELECT COUNT(*) FROM events e WHERE e.deleted_at IS NULL ${evScope} ${showSpicy ? '' : 'AND e.is_spicy = 0'} AND e.starts_at >= DATE_FORMAT(NOW(), '%Y-%m-01') AND e.starts_at < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 1 MONTH)) AS events_this_month,
          (SELECT COUNT(*) FROM reminders r WHERE r.owner_user_id = ${Number(req.user.id)} AND r.deleted_at IS NULL AND r.completed_at IS NULL AND r.due_at < NOW()) AS overdue_reminders`
      ),
      // out-of-touch: keep_in_touch_days set + overdue (never-contacted counts)
      query(
        `SELECT c.id, c.display_name, c.photo_url, c.last_contacted_at, c.keep_in_touch_days FROM contacts c
         WHERE c.deleted_at IS NULL AND c.keep_in_touch_days IS NOT NULL AND c.keep_in_touch_days > 0 ${scope}
           AND (c.last_contacted_at IS NULL OR c.last_contacted_at < DATE_SUB(NOW(), INTERVAL c.keep_in_touch_days DAY))
         ORDER BY c.last_contacted_at IS NOT NULL, c.last_contacted_at ASC LIMIT 10`
      ),
      // upcoming important dates ≤30d (recurring → next occurrence; one-off literal)
      query(
        `SELECT d.id, d.contact_id, c.display_name AS contact_name, d.label, d.date, d.recurring,
           CASE WHEN d.recurring = 1 THEN DATEDIFF(
             DATE_ADD(d.date, INTERVAL YEAR(CURDATE()) - YEAR(d.date) + IF(DATE_FORMAT(d.date,'%m-%d') < DATE_FORMAT(CURDATE(),'%m-%d'), 1, 0) YEAR),
             CURDATE())
           ELSE DATEDIFF(d.date, CURDATE()) END AS days_until
         FROM important_dates d JOIN contacts c ON c.id = d.contact_id
         WHERE c.deleted_at IS NULL ${scope}
         HAVING days_until BETWEEN 0 AND 30 ORDER BY days_until LIMIT 10`
      ),
    ]);

    // recent notes as part of activity
    const notes = await query(
      `SELECT n.id, 'note' AS type, NULL AS title, n.created_at, c.id AS contact_id, c.display_name AS contact_name
       FROM notes n JOIN contacts c ON c.id = n.contact_id AND c.deleted_at IS NULL ${scope}
       WHERE n.deleted_at IS NULL ${showSpicy ? '' : 'AND n.is_spicy = 0'}
       ORDER BY n.created_at DESC LIMIT 10`
    );
    // recent interactions (one-tap touchpoints) as part of activity
    const interactions = await query(
      `SELECT i.id, CONCAT('interaction:', i.type) AS type, i.note AS title, i.created_at,
              c.id AS contact_id, c.display_name AS contact_name
       FROM interactions i JOIN contacts c ON c.id = i.contact_id AND c.deleted_at IS NULL ${scope}
       ORDER BY i.created_at DESC LIMIT 10`
    );
    const combined = [...activity, ...notes, ...interactions]
      .map((a) => (a.is_spicy
        ? { ...a, title: decryptField(a.title), description: decryptField(a.description) }
        : a))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 10);

    res.json({
      birthdays, reminders, events, activity: combined, stats: stats[0],
      out_of_touch: outOfTouch,
      upcoming_dates: upcomingDates.map((d) => ({ ...d, recurring: Boolean(d.recurring) })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
