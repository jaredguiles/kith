const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /
 * Get current user's preferences
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT `key`, value, type FROM preferences WHERE user_id = ? ORDER BY `key`',
      [req.user.id]
    );

    const prefs = {};
    for (const row of rows) {
      try {
        prefs[row.key] = row.type === 'json' ? JSON.parse(row.value) : JSON.parse(row.value);
      } catch {
        prefs[row.key] = row.value;
      }
    }

    res.status(200).json(prefs);
  } catch (err) {
    console.error('Get preferences error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:key
 * Upsert a preference for current user
 */
router.put('/:key', requireAuth, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, type } = req.body;

    if (!key || value === undefined) {
      return res.status(400).json({ error: 'Key and value required' });
    }

    const prefType = type || 'string';
    let serializedValue;

    if (typeof value === 'object') {
      serializedValue = JSON.stringify(value);
    } else if (typeof value === 'boolean') {
      serializedValue = value ? 'true' : 'false';
    } else {
      serializedValue = String(value);
    }

    const [existing] = await pool.query(
      'SELECT id FROM preferences WHERE user_id = ? AND `key` = ?',
      [req.user.id, key]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE preferences SET value = ?, type = ? WHERE user_id = ? AND `key` = ?',
        [serializedValue, prefType, req.user.id, key]
      );
    } else {
      await pool.query(
        'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?)',
        [req.user.id, key, serializedValue, prefType]
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
      type: prefType
    });
  } catch (err) {
    console.error('Upsert preference error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
