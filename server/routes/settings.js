const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// GET /api/settings - Get all app settings (admin only)
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT `key`, value, type FROM app_settings ORDER BY `key` ASC'
    );

    // Convert to key-value object
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });

    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT /api/settings/:key - Update a setting (admin only)
router.put('/:key', requireAuth, requireAdmin, async (req, res) => {
  try {
    const key = req.params.key;
    const { value, type } = req.body;

    if (!value && value !== '0' && value !== false) {
      return res.status(400).json({ error: 'value is required' });
    }

    // Insert or update setting
    await pool.query(
      'INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value), type = VALUES(type)',
      [key, value, type || 'string']
    );

    const [setting] = await pool.query(
      'SELECT `key`, value, type FROM app_settings WHERE `key` = ?',
      [key]
    );

    res.json(setting[0]);
  } catch (err) {
    console.error('Update setting error:', err);
    res.status(500).json({ error: 'Failed to update setting' });
  }
});

module.exports = router;
