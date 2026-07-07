'use strict';

// Per-user preferences + spicy PIN management (O5: bcrypt hash in preferences
// key `spicy_pin_hash`; convenience gate, not a security boundary §7.8).

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const HIDDEN_KEYS = ['spicy_pin_hash'];

// GET /api/preferences
router.get('/', async (req, res, next) => {
  try {
    const rows = await query('SELECT `key`, value, type FROM preferences WHERE user_id = ?', [req.user.id]);
    const prefs = {};
    for (const row of rows) {
      if (HIDDEN_KEYS.includes(row.key)) continue;
      try { prefs[row.key] = JSON.parse(row.value); } catch { prefs[row.key] = row.value; }
    }
    prefs.spicy_pin_set = rows.some((r) => r.key === 'spicy_pin_hash');
    res.json({ preferences: prefs });
  } catch (err) { next(err); }
});

// POST /api/preferences/spicy-pin — set/change own PIN (body: { pin } or { pin: null } to clear)
router.post('/spicy-pin', async (req, res, next) => {
  try {
    const { pin } = req.body || {};
    if (pin === null || pin === '') {
      await query('DELETE FROM preferences WHERE user_id = ? AND `key` = ?', [req.user.id, 'spicy_pin_hash']);
      return res.json({ ok: true, cleared: true });
    }
    if (!/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be 4–8 digits' });
    const hash = await bcrypt.hash(String(pin), 10);
    await query(
      'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [req.user.id, 'spicy_pin_hash', JSON.stringify(hash), 'string']
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/preferences/spicy-pin/verify
router.post('/spicy-pin/verify', async (req, res, next) => {
  try {
    const { pin } = req.body || {};
    const rows = await query('SELECT value FROM preferences WHERE user_id = ? AND `key` = ?', [req.user.id, 'spicy_pin_hash']);
    if (rows.length === 0) return res.json({ ok: true, noPin: true });
    const hash = JSON.parse(rows[0].value);
    const ok = await bcrypt.compare(String(pin ?? ''), hash);
    if (!ok) return res.status(401).json({ error: 'Wrong PIN' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// PUT /api/preferences/:key — upsert (own prefs only)
router.put('/:key', async (req, res, next) => {
  try {
    const key = req.params.key;
    if (HIDDEN_KEYS.includes(key)) return res.status(400).json({ error: 'Use the PIN endpoints for this' });
    if (!/^[a-z0-9_]{1,100}$/i.test(key)) return res.status(400).json({ error: 'Invalid preference key' });
    const { value, type } = req.body || {};
    const valueType = type || (typeof value === 'boolean' ? 'boolean' : typeof value === 'object' ? 'json' : 'string');
    await query(
      'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)',
      [req.user.id, key, JSON.stringify(value ?? null), valueType]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
