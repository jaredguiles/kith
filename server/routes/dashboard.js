'use strict';

// Dashboard aggregates + full data export (Settings → Data → Export/Backup).
// Export covers DB data + media references, not blobs (O4 default).

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireAdmin, isAdmin } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');

const router = express.Router();
router.use(requireAuth);

// GET /api/dashboard
router.get('/dashboard', async (req, res, next) => {
  try {
    const showSpicy = await spicyVisible(req.user);
    const scope = isAdmin(req.user) ? '' : `AND c.owner_user_id = ${Number(req.user.id)}`;
    const evScope = isAdmin(req.user) ? '' : `AND e.owner_user_id = ${Number(req.user.id)}`;

    const [birthdays, reminders, events, activity, stats] = await Promise.all([
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
        `SELECT tl.id, tl.type, tl.title, tl.description, tl.occurred_at, tl.created_at,
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
    ]);

    // recent notes as part of activity
    const notes = await query(
      `SELECT n.id, 'note' AS type, NULL AS title, n.created_at, c.id AS contact_id, c.display_name AS contact_name
       FROM notes n JOIN contacts c ON c.id = n.contact_id AND c.deleted_at IS NULL ${scope}
       WHERE n.deleted_at IS NULL ${showSpicy ? '' : 'AND n.is_spicy = 0'}
       ORDER BY n.created_at DESC LIMIT 10`
    );
    const combined = [...activity, ...notes]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .slice(0, 10);

    res.json({ birthdays, reminders, events, activity: combined, stats: stats[0] });
  } catch (err) { next(err); }
});

// GET /api/export — admin-only full data export (JSON)
router.get('/export', requireAdmin, async (req, res, next) => {
  try {
    const tables = [
      'users', 'contacts', 'contact_emails', 'contact_phones', 'contact_addresses',
      'social_links', 'tags', 'contact_tags', 'groups', 'group_members',
      'shared_contacts', 'events', 'event_contacts', 'event_media', 'timeline_events',
      'notes', 'reminders', 'messages', 'media_assets', 'audit_log',
      'contact_field_changelog', 'import_jobs', 'import_staging', 'app_settings',
      'preferences', 'spicy_profiles',
    ];
    const dump = { exported_at: new Date().toISOString(), version: 1, tables: {} };
    for (const t of tables) {
      const rows = await query(`SELECT * FROM \`${t}\``);
      if (t === 'users') rows.forEach((r) => { delete r.password_hash; });
      dump.tables[t] = rows;
    }
    // Note: spicy_profiles + spicy note/message content export as CIPHERTEXT —
    // restoring requires the same FIELD_ENCRYPTION_KEY. Documented in README.
    res.setHeader('Content-Disposition', `attachment; filename="kith-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(dump);
  } catch (err) { next(err); }
});

module.exports = router;
