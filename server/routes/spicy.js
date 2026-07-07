'use strict';

// Spicy profiles: GET/PUT /api/contacts/:id/spicy.
// 403 when spicy globally disabled (standardized). All sensitive fields are
// AES-256-GCM encrypted at rest (§7.E Layer C) — the DB only ever sees
// ciphertext for this table's sensitive columns.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { getSetting } = require('./settings');
const { spicyVisible } = require('./contacts');
const { encryptField, decryptField } = require('../lib/crypto');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

// Encrypted columns (everything sensitive; spicy_type/orientation/body_type
// stay cleartext as low-sensitivity categorical labels would still be useful
// — NO: plan §7.E says encrypt every spicy_profiles field listed. Encrypt all
// content-bearing fields; keep only contact_id/timestamps clear.)
const ENCRYPTED_FIELDS = [
  'role_preference', 'positions', 'kinks', 'turn_ons', 'turn_offs', 'boundaries',
  'safe_word', 'protection_preference', 'hiv_status', 'on_prep', 'prep_since',
  'last_tested_date', 'sti_notes', 'body_notes', 'endowment', 'grooming',
  'spicy_rating', 'chemistry_rating', 'would_repeat', 'spicy_notes',
  'last_encounter', 'encounter_count',
];
const CLEAR_FIELDS = ['spicy_type', 'orientation', 'body_type'];
const ALL_FIELDS = [...CLEAR_FIELDS, ...ENCRYPTED_FIELDS];

/** Gate: 403 when spicy disabled globally OR session not in active spicy mode. */
async function spicyGate(req, res, next) {
  const enabled = await getSetting('spicy_enabled');
  if (!enabled) return res.status(403).json({ error: 'Spicy features are disabled' });
  if (!(await spicyVisible(req.user))) return res.status(403).json({ error: 'Spicy mode is not active' });
  next();
}

function decryptProfile(row) {
  const out = { ...row };
  for (const f of ENCRYPTED_FIELDS) out[f] = decryptField(row[f]);
  // JSON-decode kinks
  if (out.kinks) { try { out.kinks = JSON.parse(out.kinks); } catch { /* keep as string */ } }
  return out;
}

// GET /api/contacts/:id/spicy
router.get('/', spicyGate, requireContactAccess('id'), async (req, res, next) => {
  try {
    if (req.contactAccess === 'shared' && req.contactShare.share_scope !== 'full_spicy') {
      return res.status(403).json({ error: 'Not shared at spicy scope' });
    }
    const rows = await query('SELECT * FROM spicy_profiles WHERE contact_id = ?', [req.contact.id]);
    if (!rows.length) return res.json({ spicy_profile: null });
    res.json({ spicy_profile: decryptProfile(rows[0]) });
  } catch (err) { next(err); }
});

// PUT /api/contacts/:id/spicy — create/update
router.put('/', spicyGate, requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    if (req.contactAccess === 'shared' && req.contactShare.share_scope !== 'full_spicy') {
      return res.status(403).json({ error: 'Not shared at spicy scope' });
    }
    const b = req.body || {};
    const data = {};
    for (const f of ALL_FIELDS) {
      if (!(f in b)) continue;
      let v = b[f];
      if (v === '' || v === undefined) v = null;
      if (f === 'kinks' && Array.isArray(v)) v = JSON.stringify(v);
      if (v !== null && typeof v !== 'string') v = String(typeof v === 'boolean' ? (v ? 1 : 0) : v);
      data[f] = ENCRYPTED_FIELDS.includes(f) && v !== null ? encryptField(v) : v;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Nothing to update' });

    const existing = await query('SELECT id FROM spicy_profiles WHERE contact_id = ?', [req.contact.id]);
    if (existing.length) {
      const cols = Object.keys(data);
      await query(
        `UPDATE spicy_profiles SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE contact_id = ?`,
        [...cols.map((k) => data[k]), req.contact.id]
      );
    } else {
      const cols = Object.keys(data);
      await query(
        `INSERT INTO spicy_profiles (contact_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
        [req.contact.id, ...cols.map((k) => data[k])]
      );
    }
    // mark the contact as spicy
    await query('UPDATE contacts SET is_spicy = 1 WHERE id = ?', [req.contact.id]);
    // audit WITHOUT values (never write spicy plaintext into audit_log)
    auditWrite(req.user.id, req.contact.id, existing.length ? 'update' : 'create', 'spicy_profile',
      existing.length ? existing[0].id : null, null, null, 'Spicy profile updated');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
