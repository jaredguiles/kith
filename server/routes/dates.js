'use strict';

// Important dates (anniversaries, adoption days, …) per contact.
// Mounted at /api → /api/contacts/:id/dates + /api/dates/:id.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value) {
  if (!DATE_RE.test(String(value))) return false;
  const [y, m, d] = String(value).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

// GET /api/contacts/:id/dates
router.get('/contacts/:id/dates', requireContactAccess('id'), async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, contact_id, label, date, recurring, created_at FROM important_dates WHERE contact_id = ? ORDER BY date',
      [req.contact.id]
    );
    res.json({ dates: rows.map((r) => ({ ...r, recurring: Boolean(r.recurring) })) });
  } catch (err) { next(err); }
});

// POST /api/contacts/:id/dates — { label, date, recurring? }
router.post('/contacts/:id/dates', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    const { label, date, recurring } = req.body || {};
    if (!label || !String(label).trim()) return res.status(400).json({ error: 'Label is required' });
    if (!date || !isValidDateOnly(date)) return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD' });
    const rec = recurring === undefined ? 1 : (recurring ? 1 : 0);
    const result = await query(
      'INSERT INTO important_dates (contact_id, label, date, recurring) VALUES (?, ?, ?, ?)',
      [req.contact.id, String(label).trim().slice(0, 100), date, rec]
    );
    auditWrite(req.user.id, req.contact.id, 'create', 'important_date', result.insertId, null,
      { label, date, recurring: Boolean(rec) }, 'Added important date');
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

async function loadDate(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Date not found' });
    const rows = await query('SELECT * FROM important_dates WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Date not found' });
    const found = await contactAccess(req.user, rows[0].contact_id);
    if (!found) return res.status(404).json({ error: 'Date not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access' });
    }
    req.importantDate = rows[0];
    next();
  } catch (err) { next(err); }
}

// PUT /api/dates/:id — { label?, date?, recurring? }
router.put('/dates/:id', loadDate, async (req, res, next) => {
  try {
    const { label, date, recurring } = req.body || {};
    const updates = [];
    const params = [];
    if (label !== undefined) {
      if (!label || !String(label).trim()) return res.status(400).json({ error: 'Label cannot be empty' });
      updates.push('label = ?'); params.push(String(label).trim().slice(0, 100));
    }
    if (date !== undefined) {
      if (!date || !isValidDateOnly(date)) return res.status(400).json({ error: 'date must be a valid YYYY-MM-DD' });
      updates.push('date = ?'); params.push(date);
    }
    if (recurring !== undefined) { updates.push('recurring = ?'); params.push(recurring ? 1 : 0); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.importantDate.id);
    await query(`UPDATE important_dates SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, req.importantDate.contact_id, 'update', 'important_date', req.importantDate.id,
      { label: req.importantDate.label, date: req.importantDate.date }, { label, date, recurring }, 'Updated important date');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/dates/:id
router.delete('/dates/:id', loadDate, async (req, res, next) => {
  try {
    await query('DELETE FROM important_dates WHERE id = ?', [req.importantDate.id]);
    auditWrite(req.user.id, req.importantDate.contact_id, 'delete', 'important_date', req.importantDate.id,
      { label: req.importantDate.label, date: req.importantDate.date }, null, 'Removed important date');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
