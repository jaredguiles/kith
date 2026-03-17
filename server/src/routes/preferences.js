import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/preferences - List all preferences
router.get('/', async (req, res, next) => {
  try {
    const connection = await pool.getConnection();

    const [preferences] = await connection.execute(
      'SELECT * FROM preferences ORDER BY key ASC'
    );

    connection.release();

    res.json({
      success: true,
      data: preferences,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/preferences/:key - Get single preference
router.get('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      'SELECT * FROM preferences WHERE key = ?',
      [key]
    );

    connection.release();

    if (result.length === 0) {
      return res.status(404).json({ success: false, error: 'Preference not found' });
    }

    res.json({
      success: true,
      data: result[0],
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/preferences/:key - Upsert preference
router.put('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, type } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, error: 'value is required' });
    }

    const connection = await pool.getConnection();

    await connection.execute(
      `INSERT INTO preferences (key, value, type, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE value = ?, type = ?, updated_at = NOW()`,
      [key, JSON.stringify(value), type || 'string', JSON.stringify(value), type || 'string']
    );

    const [[preference]] = await connection.execute(
      'SELECT * FROM preferences WHERE key = ?',
      [key]
    );

    connection.release();

    res.json({
      success: true,
      data: preference,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
