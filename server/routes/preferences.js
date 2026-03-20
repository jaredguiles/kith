const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

// GET /api/preferences - Get current user's preferences
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT `key`, value, type FROM preferences WHERE user_id = ? ORDER BY `key` ASC',
      [req.user.id]
    );

    // Convert to key-value object
    const preferences = {};
    rows.forEach(row => {
      preferences[row.key] = row.value;
    });

    res.json(preferences);
  } catch (err) {
    console.error('Get preferences error:', err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

// PUT /api/preferences/:key - Upsert preference
router.put('/:key', requireAuth, async (req, res) => {
  try {
    const key = req.params.key;
    const { value, type } = req.body;

    if (!value && value !== '0' && value !== false) {
      return res.status(400).json({ error: 'value is required' });
    }

    // Insert or update preference
    await pool.query(
      'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)',
      [req.user.id, key, value, type || 'string']
    );

    const [pref] = await pool.query(
      'SELECT `key`, value, type FROM preferences WHERE user_id = ? AND `key` = ?',
      [req.user.id, key]
    );

    res.json(pref[0]);
  } catch (err) {
    console.error('Update preference error:', err);
    res.status(500).json({ error: 'Failed to update preference' });
  }
});

module.exports = router;
