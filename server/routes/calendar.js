'use strict';

// Month-view calendar aggregate. Mounted at /api/calendar.
// GET /?month=YYYY-MM → events, birthdays (projected), important dates
// (recurring projected into the month), open reminders.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');

const router = express.Router();
router.use(requireAuth);

// GET /api/calendar?month=YYYY-MM
router.get('/', async (req, res, next) => {
  try {
    const monthStr = String(req.query.month || '');
    const m = monthStr.match(/^(\d{4})-(\d{2})$/);
    if (!m) return res.status(400).json({ error: 'month must be YYYY-MM' });
    const year = Number(m[1]);
    const month = Number(m[2]);
    if (month < 1 || month > 12 || year < 1900 || year > 2200) {
      return res.status(400).json({ error: 'month must be a valid YYYY-MM' });
    }

    const monthStart = `${monthStr}-01 00:00:00`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, '0')} 23:59:59`;
    const mm = String(month).padStart(2, '0');

    const showSpicy = await spicyVisible(req.user);
    const admin = isAdmin(req.user);

    // accessible contacts: own + shared-in (admins: all)
    const contactScope = admin
      ? { clause: 'c.deleted_at IS NULL', params: [] }
      : {
          clause: `c.deleted_at IS NULL AND (c.owner_user_id = ? OR EXISTS (
             SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ?))`,
          params: [req.user.id, req.user.id],
        };

    const [events, birthdays, dates, reminders] = await Promise.all([
      query(
        `SELECT e.id, e.title, e.starts_at, e.type AS event_type, e.status FROM events e
         WHERE e.deleted_at IS NULL ${admin ? '' : 'AND e.owner_user_id = ?'}
           ${showSpicy ? '' : 'AND e.is_spicy = 0'}
           AND e.starts_at BETWEEN ? AND ?
         ORDER BY e.starts_at`,
        admin ? [monthStart, monthEnd] : [req.user.id, monthStart, monthEnd]
      ),
      // birthdays: match month-of-year, project into the requested year
      query(
        `SELECT c.id AS contact_id, c.display_name, c.birthday FROM contacts c
         WHERE c.birthday IS NOT NULL AND c.is_deceased = 0 AND MONTH(c.birthday) = ? AND ${contactScope.clause}
         ORDER BY DAY(c.birthday)`,
        [month, ...contactScope.params]
      ),
      // important dates: recurring → any year in this month; one-off → exact month
      query(
        `SELECT d.id, d.contact_id, c.display_name AS contact_name, d.label, d.date, d.recurring
         FROM important_dates d JOIN contacts c ON c.id = d.contact_id
         WHERE ${contactScope.clause}
           AND ((d.recurring = 1 AND MONTH(d.date) = ?) OR (d.recurring = 0 AND d.date BETWEEN ? AND ?))
         ORDER BY DAY(d.date)`,
        [...contactScope.params, month, `${monthStr}-01`, `${monthStr}-${String(daysInMonth).padStart(2, '0')}`]
      ),
      query(
        `SELECT r.id, r.title, r.due_at, r.contact_id FROM reminders r
         WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL
           AND r.due_at BETWEEN ? AND ?
         ORDER BY r.due_at`,
        [req.user.id, monthStart, monthEnd]
      ),
    ]);

    // Project recurring dates/birthdays into the requested year, clamping
    // Feb-29 to Feb-28 in non-leap years.
    const clampDay = (day) => Math.min(day, daysInMonth);
    const projectDate = (orig) => {
      const dm = String(orig).match(/^\d{4}-\d{2}-(\d{2})/);
      const day = dm ? clampDay(Number(dm[1])) : 1;
      return `${monthStr}-${String(day).padStart(2, '0')}`;
    };

    res.json({
      month: monthStr,
      events,
      birthdays: birthdays.map((b) => ({
        contact_id: b.contact_id,
        display_name: b.display_name,
        date: projectDate(b.birthday),
        birthday: b.birthday,
      })),
      dates: dates.map((d) => ({
        id: d.id,
        contact_id: d.contact_id,
        contact_name: d.contact_name,
        label: d.label,
        date: d.recurring ? projectDate(d.date) : String(d.date).slice(0, 10),
        recurring: Boolean(d.recurring),
      })),
      reminders,
    });
  } catch (err) { next(err); }
});

module.exports = router;
