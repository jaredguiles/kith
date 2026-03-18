const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /
 * Get audit log (with optional filtering)
 * Query params: ?contact_id= or ?entity_type=&entity_id=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, entity_type, entity_id, limit = 100, offset = 0 } = req.query;

    let query = 'SELECT id, user_id, contact_id, action, entity_type, entity_id, old_values, new_values, description, created_at FROM audit_log WHERE 1=1';
    const values = [];

    if (contact_id) {
      query += ' AND contact_id = ?';
      values.push(parseInt(contact_id));
    }

    if (entity_type) {
      query += ' AND entity_type = ?';
      values.push(entity_type);
    }

    if (entity_id) {
      query += ' AND entity_id = ?';
      values.push(parseInt(entity_id));
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM audit_log WHERE 1=1' +
      (contact_id ? ' AND contact_id = ?' : '') +
      (entity_type ? ' AND entity_type = ?' : '') +
      (entity_id ? ' AND entity_id = ?' : ''),
      values.slice(0, values.length - 2)
    );

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
