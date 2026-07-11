'use strict';

// Per-user preferences + spicy PIN management (O5: bcrypt hash in preferences
// key `spicy_pin_hash`; convenience gate, not a security boundary §7.8).

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const { requireAuth } = require('../middleware/auth');
const { getSetting } = require('./settings');

const router = express.Router();
router.use(requireAuth);

const HIDDEN_KEYS = ['spicy_pin_hash'];

// Known preference keys with constrained values (validated on write, defaulted on read).
const KNOWN_PREFS = {
  theme: { values: ['dark', 'light', 'system'], default: 'dark' },
};

// --- PIN verify throttle (mirror of the login throttle style, per user id) ---
const PIN_MAX_FAILURES = 5;
const PIN_LOCKOUT_MS = 15 * 60 * 1000;
const pinAttempts = new Map(); // userId -> { count, lockedUntil }

function pinThrottleCheck(userId) {
  const entry = pinAttempts.get(userId);
  if (!entry) return { blocked: false };
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return { blocked: true, retryAfterSec: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
  }
  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) pinAttempts.delete(userId); // lazy expiry
  return { blocked: false };
}

function pinRecordFailure(userId) {
  const entry = pinAttempts.get(userId) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= PIN_MAX_FAILURES) entry.lockedUntil = Date.now() + PIN_LOCKOUT_MS;
  pinAttempts.set(userId, entry);
}

function pinRecordSuccess(userId) {
  pinAttempts.delete(userId);
}

// periodic cleanup so the map can't grow unbounded
setInterval(() => {
  const now = Date.now();
  for (const [uid, entry] of pinAttempts) {
    if (entry.lockedUntil && entry.lockedUntil <= now) pinAttempts.delete(uid);
  }
}, 10 * 60 * 1000).unref();

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
    // Spicy auto-disable enforcement on boot: if the activation window has
    // lapsed (or a legacy true value has no timestamp), report AND persist
    // spicy_visible=false so a closed tab can't leave spicy on server-side.
    if (prefs.spicy_visible) {
      const mins = Number(await getSetting('spicy_auto_disable_minutes')) || 0;
      const activatedAt = Number(prefs.spicy_activated_at) || null;
      if (mins > 0 && (!activatedAt || Date.now() - activatedAt > mins * 60 * 1000)) {
        prefs.spicy_visible = false;
        await query(
          'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)',
          [req.user.id, 'spicy_visible', JSON.stringify(false), 'boolean']
        );
      }
    }
    // defaults + value sanitation for known constrained keys
    for (const [k, spec] of Object.entries(KNOWN_PREFS)) {
      if (!spec.values.includes(prefs[k])) prefs[k] = spec.default;
    }
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
    const throttle = pinThrottleCheck(req.user.id);
    if (throttle.blocked) {
      return res.status(429).json({ error: `Too many attempts — try again in ${Math.ceil(throttle.retryAfterSec / 60)} min` });
    }
    const { pin } = req.body || {};
    const rows = await query('SELECT value FROM preferences WHERE user_id = ? AND `key` = ?', [req.user.id, 'spicy_pin_hash']);
    if (rows.length === 0) return res.json({ ok: true, noPin: true });
    const hash = JSON.parse(rows[0].value);
    const ok = await bcrypt.compare(String(pin ?? ''), hash);
    if (!ok) {
      pinRecordFailure(req.user.id);
      return res.status(401).json({ error: 'Wrong PIN' });
    }
    pinRecordSuccess(req.user.id);
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
    if (KNOWN_PREFS[key] && !KNOWN_PREFS[key].values.includes(value)) {
      return res.status(400).json({ error: `${key} must be one of: ${KNOWN_PREFS[key].values.join(', ')}` });
    }
    const valueType = type || (typeof value === 'boolean' ? 'boolean' : typeof value === 'object' ? 'json' : 'string');
    await query(
      'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)',
      [req.user.id, key, JSON.stringify(value ?? null), valueType]
    );
    // Enabling spicy stamps an activation time so the server can enforce the
    // auto-disable window even if the client tab (and its timer) disappears.
    if (key === 'spicy_visible' && value === true) {
      await query(
        'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)',
        [req.user.id, 'spicy_activated_at', JSON.stringify(Date.now()), 'string']
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
