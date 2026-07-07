'use strict';

// App settings: admin-managed. GET /public returns the non-sensitive subset
// any authenticated user needs to render the shell (app name, accents,
// spicy_enabled, spicy_require_pin, auto-disable).

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();

const PUBLIC_KEYS = [
  'app_name', 'app_logo', 'accent_color', 'spicy_accent_color',
  'spicy_enabled', 'spicy_require_pin', 'spicy_auto_disable_minutes',
  'relationship_types', 'max_upload_size', 'import_max_upload_size',
];

const KNOWN_KEYS = [...PUBLIC_KEYS, 'media_path'];

function parseValue(row) {
  try { return JSON.parse(row.value); } catch { return row.value; }
}

async function getSettingsMap(keys = null) {
  const rows = keys
    ? await query(`SELECT \`key\`, value, type FROM app_settings WHERE \`key\` IN (${keys.map(() => '?').join(',')})`, keys)
    : await query('SELECT `key`, value, type FROM app_settings');
  const map = {};
  for (const row of rows) map[row.key] = parseValue(row);
  return map;
}

/** Server-side helper used by other routes for the spicy gate. */
async function getSetting(key) {
  const rows = await query('SELECT value FROM app_settings WHERE `key` = ?', [key]);
  if (rows.length === 0) return undefined;
  try { return JSON.parse(rows[0].value); } catch { return rows[0].value; }
}

// GET /api/settings/public — any authenticated user
router.get('/public', requireAuth, async (req, res, next) => {
  try {
    res.json({ settings: await getSettingsMap(PUBLIC_KEYS) });
  } catch (err) { next(err); }
});

// GET /api/settings — admin only (full set)
router.get('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    res.json({ settings: await getSettingsMap() });
  } catch (err) { next(err); }
});

// PUT /api/settings/:key — admin only
router.put('/:key', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const key = req.params.key;
    if (!KNOWN_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown setting' });
    const { value, type } = req.body || {};
    const valueType = type || (typeof value === 'boolean' ? 'boolean' : typeof value === 'object' ? 'json' : 'string');

    // basic validation for specific keys
    if ((key === 'accent_color' || key === 'spicy_accent_color') && value && !/^#[0-9a-fA-F]{6}$/.test(value)) {
      return res.status(400).json({ error: 'Color must be a hex value like #7c5bf5' });
    }
    if (key === 'spicy_enabled' && typeof value !== 'boolean') {
      return res.status(400).json({ error: 'spicy_enabled must be boolean' });
    }

    await query(
      'INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)',
      [key, JSON.stringify(value ?? null), valueType]
    );
    auditWrite(req.user.id, null, 'update', 'app_setting', null, null, { key, value }, `Updated setting ${key}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.getSetting = getSetting;
