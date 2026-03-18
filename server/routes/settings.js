const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * GET /public
 * Get public app settings (available to all authenticated users)
 * Returns only the settings needed for the UI to function
 */
router.get('/public', requireAuth, async (req, res) => {
  try {
    const publicKeys = [
      'app_name', 'app_logo', 'accent_color', 'spicy_accent_color',
      'spicy_enabled', 'spicy_pin', 'spicy_auto_disable'
    ];
    const [rows] = await pool.query(
      `SELECT \`key\`, value, type FROM app_settings WHERE \`key\` IN (${publicKeys.map(() => '?').join(',')})`,
      publicKeys
    );

    const settings = {};
    for (const row of rows) {
      try {
        settings[row.key] = JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    res.status(200).json(settings);
  } catch (err) {
    console.error('Get public settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /
 * Get all app settings (admin only)
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT `key`, value, type, updated_at FROM app_settings ORDER BY `key`'
    );

    const settings = {};
    for (const row of rows) {
      try {
        settings[row.key] = row.type === 'json' ? JSON.parse(row.value) : JSON.parse(row.value);
      } catch {
        settings[row.key] = row.value;
      }
    }

    res.status(200).json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:key
 * Update a setting (admin only)
 */
router.put('/:key', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, type } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value required' });
    }

    const settingType = type || 'string';
    let serializedValue;

    if (typeof value === 'object') {
      serializedValue = JSON.stringify(value);
    } else if (typeof value === 'boolean') {
      serializedValue = value ? 'true' : 'false';
    } else {
      serializedValue = String(value);
    }

    const [existing] = await pool.query(
      'SELECT id FROM app_settings WHERE `key` = ?',
      [key]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE app_settings SET value = ?, type = ? WHERE `key` = ?',
        [serializedValue, settingType, key]
      );
    } else {
      await pool.query(
        'INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, ?)',
        [key, serializedValue, settingType]
      );
    }

    let parsedValue;
    try {
      parsedValue = JSON.parse(serializedValue);
    } catch {
      parsedValue = serializedValue;
    }

    res.status(200).json({
      key,
      value: parsedValue,
      type: settingType
    });
  } catch (err) {
    console.error('Update setting error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
