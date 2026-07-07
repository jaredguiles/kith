'use strict';

// Gift ideas per contact. Mounted at /api → /api/contacts/:id/gifts + /api/gifts/:id.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const STATUSES = ['idea', 'purchased', 'given'];

function validUrl(u) {
  try {
    const parsed = new URL(String(u));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// GET /api/contacts/:id/gifts
router.get('/contacts/:id/gifts', requireContactAccess('id'), async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, contact_id, title, notes, url, occasion, status, created_at, updated_at
       FROM gift_ideas WHERE contact_id = ? ORDER BY FIELD(status, 'idea', 'purchased', 'given'), created_at DESC`,
      [req.contact.id]
    );
    res.json({ gifts: rows });
  } catch (err) { next(err); }
});

// POST /api/contacts/:id/gifts — { title, notes?, url?, occasion? }
router.post('/contacts/:id/gifts', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    const { title, notes, url, occasion } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (url && !validUrl(url)) return res.status(400).json({ error: 'URL must be http(s)' });
    const result = await query(
      'INSERT INTO gift_ideas (contact_id, title, notes, url, occasion) VALUES (?, ?, ?, ?, ?)',
      [req.contact.id, String(title).trim(), notes || null,
       url ? String(url).slice(0, 500) : null, occasion ? String(occasion).slice(0, 100) : null]
    );
    auditWrite(req.user.id, req.contact.id, 'create', 'gift_idea', result.insertId, null, { title }, 'Added gift idea');
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

async function loadGift(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Gift not found' });
    const rows = await query('SELECT * FROM gift_ideas WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Gift not found' });
    const found = await contactAccess(req.user, rows[0].contact_id);
    if (!found) return res.status(404).json({ error: 'Gift not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access' });
    }
    req.gift = rows[0];
    next();
  } catch (err) { next(err); }
}

// PUT /api/gifts/:id — { title?, notes?, url?, occasion?, status? }
router.put('/gifts/:id', loadGift, async (req, res, next) => {
  try {
    const b = req.body || {};
    const updates = [];
    const params = [];
    if ('title' in b) {
      if (!b.title || !String(b.title).trim()) return res.status(400).json({ error: 'Title cannot be empty' });
      updates.push('title = ?'); params.push(String(b.title).trim());
    }
    if ('notes' in b) { updates.push('notes = ?'); params.push(b.notes || null); }
    if ('url' in b) {
      if (b.url && !validUrl(b.url)) return res.status(400).json({ error: 'URL must be http(s)' });
      updates.push('url = ?'); params.push(b.url ? String(b.url).slice(0, 500) : null);
    }
    if ('occasion' in b) { updates.push('occasion = ?'); params.push(b.occasion ? String(b.occasion).slice(0, 100) : null); }
    if ('status' in b) {
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
      updates.push('status = ?'); params.push(b.status);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.gift.id);
    await query(`UPDATE gift_ideas SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, req.gift.contact_id, 'update', 'gift_idea', req.gift.id,
      { title: req.gift.title, status: req.gift.status }, b, 'Updated gift idea');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/gifts/:id
router.delete('/gifts/:id', loadGift, async (req, res, next) => {
  try {
    await query('DELETE FROM gift_ideas WHERE id = ?', [req.gift.id]);
    auditWrite(req.user.id, req.gift.contact_id, 'delete', 'gift_idea', req.gift.id, { title: req.gift.title }, null, 'Removed gift idea');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
