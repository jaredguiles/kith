const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /
 * Get field-level change history
 * Query params: ?contact_id= (required), ?field_name=, ?limit=, ?offset=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, field_name, limit = 100, offset = 0 } = req.query;

    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id parameter required' });
    }

    const contactId = parseInt(contact_id);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    let query = 'SELECT id, contact_id, user_id, import_job_id, source, field_name, old_value, new_value, changed_at FROM contact_field_changelog WHERE contact_id = ?';
    const values = [contactId];

    if (field_name) {
      query += ' AND field_name = ?';
      values.push(field_name);
    }

    query += ' ORDER BY changed_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM contact_field_changelog WHERE contact_id = ?' +
      (field_name ? ' AND field_name = ?' : ''),
      field_name ? [contactId, field_name] : [contactId]
    );

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Get changelog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
