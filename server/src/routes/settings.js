import express from 'express';
import { query } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'admin' || req.user.role === 'main_admin') {
      const settings = await query('SELECT key, value FROM settings');
      const settingsObj = {};
      for (const setting of settings) {
        settingsObj[setting.key] = setting.value;
      }
      return res.json({ settings: settingsObj });
    }

    const settings = await query('SELECT key, value FROM settings WHERE key IN (?, ?, ?)', [
      'app_name',
      'spicy_mode_enabled',
      'media_storage_path',
    ]);
    const settingsObj = {};
    for (const setting of settings) {
      settingsObj[setting.key] = setting.value;
    }
    res.json({ settings: settingsObj });
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object required' });
    }

    for (const [key, value] of Object.entries(settings)) {
      await query('INSERT INTO settings (key, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = ?', [key, value, value]);
    }

    const updatedSettings = await query('SELECT key, value FROM settings');
    const settingsObj = {};
    for (const setting of updatedSettings) {
      settingsObj[setting.key] = setting.value;
    }

    res.json({ settings: settingsObj });
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
