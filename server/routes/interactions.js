'use strict';

// Interactions — one-tap touchpoint log per contact (distinct from notes).
// Recording an interaction bumps the contact's last_contacted_at (cadence).
// Mounted at /api.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const contactsLib = require('../lib/contacts');
const { isValidDate, touchContact } = contactsLib;

const router = express.Router();
router.use(requireAuth);

const INTERACTION_TYPES = ['call', 'text', 'met', 'email', 'video', 'gift', 'social', 'other'];

// POST /api/contacts/:id/interactions — log a touchpoint
router.post('/contacts/:id/interactions', async (req, res, next) => {
  try {
    const cid = Number(req.params.id);
    if (!Number.isInteger(cid) || cid <= 0) return res.status(404).json({ error: 'Contact not found' });
    const found = await contactAccess(req.user, cid);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    // shared-in edit allowed; basic/read-only rejected
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access' });
    }

    const { type, note, occurred_at } = req.body || {};
    const t = type || 'other';
    if (!INTERACTION_TYPES.includes(t)) {
      return res.status(400).json({ error: `type must be one of: ${INTERACTION_TYPES.join(', ')}` });
    }
    if (occurred_at != null && occurred_at !== '' && !isValidDate(occurred_at)) {
      return res.status(400).json({ error: 'Invalid occurred_at date' });
    }
    if (note != null && String(note).length > 500) {
      return res.status(400).json({ error: 'note must be 500 characters or fewer' });
    }

    const result = await query(
      `INSERT INTO interactions (contact_id, owner_user_id, type, note, occurred_at)
       VALUES (?, ?, ?, ?, COALESCE(?, NOW()))`,
      [found.contact.id, req.user.id, t, note ? String(note) : null, occurred_at || null]
    );
    auditWrite(req.user.id, found.contact.id, 'create', 'interaction', result.insertId, null, { type: t }, 'Logged interaction');
    touchContact(found.contact.id, occurred_at || undefined);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// GET /api/contacts/:id/interactions?limit= — newest first
router.get('/contacts/:id/interactions', async (req, res, next) => {
  try {
    const cid = Number(req.params.id);
    if (!Number.isInteger(cid) || cid <= 0) return res.status(404).json({ error: 'Contact not found' });
    const found = await contactAccess(req.user, cid);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }

    let limit = Number(req.query.limit);
    if (!Number.isInteger(limit) || limit <= 0) limit = 50;
    if (limit > 200) limit = 200;

    // limit is a validated integer (1..200); safe to inline (mysql2 execute
    // rejects a bound LIMIT placeholder under some server modes).
    const rows = await query(
      `SELECT id, type, note, occurred_at, created_at FROM interactions
       WHERE contact_id = ? ORDER BY occurred_at DESC, id DESC LIMIT ${limit}`,
      [found.contact.id]
    );
    res.json({ interactions: rows });
  } catch (err) { next(err); }
});

// PUT /api/interactions/:id — owner or admin (same access rule as DELETE)
router.put('/interactions/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Interaction not found' });
    const rows = await query('SELECT * FROM interactions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Interaction not found' });
    if (rows[0].owner_user_id !== req.user.id && !isAdmin(req.user)) {
      return res.status(404).json({ error: 'Interaction not found' });
    }

    const { type, note, occurred_at } = req.body || {};
    const updates = [];
    const params = [];
    if (type !== undefined) {
      if (!INTERACTION_TYPES.includes(type)) {
        return res.status(400).json({ error: `type must be one of: ${INTERACTION_TYPES.join(', ')}` });
      }
      updates.push('type = ?'); params.push(type);
    }
    if (note !== undefined) {
      if (note != null && String(note).length > 500) {
        return res.status(400).json({ error: 'note must be 500 characters or fewer' });
      }
      updates.push('note = ?'); params.push(note ? String(note) : null);
    }
    if (occurred_at !== undefined) {
      if (occurred_at == null || occurred_at === '' || !isValidDate(occurred_at)) {
        return res.status(400).json({ error: 'Invalid occurred_at date' });
      }
      updates.push('occurred_at = ?'); params.push(occurred_at);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(rows[0].id);
    await query(`UPDATE interactions SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, rows[0].contact_id, 'update', 'interaction', rows[0].id,
      { type: rows[0].type }, { type: type || rows[0].type }, 'Updated interaction');
    // last_contacted_at only moves forward (GREATEST in touchContact), so a
    // backdated edit never regresses cadence — same semantics as the POST.
    if (occurred_at !== undefined) touchContact(rows[0].contact_id, occurred_at);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/interactions/:id — owner or admin
router.delete('/interactions/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Interaction not found' });
    const rows = await query('SELECT * FROM interactions WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Interaction not found' });
    if (rows[0].owner_user_id !== req.user.id && !isAdmin(req.user)) {
      return res.status(404).json({ error: 'Interaction not found' });
    }
    await query('DELETE FROM interactions WHERE id = ?', [rows[0].id]);
    auditWrite(req.user.id, rows[0].contact_id, 'delete', 'interaction', rows[0].id, null, null, 'Deleted interaction');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
