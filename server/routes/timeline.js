const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, getSpicyEnabled } = require('../middleware/auth');

/**
 * GET /
 * List timeline events for a contact
 * Query params: ?contact_id= (required), ?limit=, ?offset=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, limit = 100, offset = 0 } = req.query;
    const spicyEnabled = await getSpicyEnabled();

    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id parameter required' });
    }

    const contactId = parseInt(contact_id);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    let query = 'SELECT id, contact_id, event_id, type, title, description, is_spicy, occurred_at, created_at FROM timeline_events WHERE contact_id = ? AND deleted_at IS NULL';
    const values = [contactId];

    if (!spicyEnabled) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY occurred_at DESC, created_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    const countQuery = 'SELECT COUNT(*) as total FROM timeline_events WHERE contact_id = ? AND deleted_at IS NULL' +
      (!spicyEnabled ? ' AND is_spicy = 0' : '');
    const [countResult] = await pool.query(
      countQuery,
      [contactId]
    );

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('List timeline events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create timeline event
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, event_id, type, title, description, is_spicy, occurred_at } = req.body;

    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id required' });
    }

    const contactId = parseInt(contact_id);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const isOwner = contact[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const eventIdValue = event_id ? parseInt(event_id) : null;

    const [result] = await pool.query(
      'INSERT INTO timeline_events (contact_id, event_id, type, title, description, is_spicy, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [contactId, eventIdValue, type || null, title || null, description || null, is_spicy ? 1 : 0, occurred_at || null]
    );

    const [timelineEvent] = await pool.query(
      'SELECT id, contact_id, event_id, type, title, description, is_spicy, occurred_at, created_at FROM timeline_events WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(timelineEvent[0]);
  } catch (err) {
    console.error('Create timeline event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Soft delete timeline event
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const timelineId = parseInt(req.params.id);
    if (isNaN(timelineId)) return res.status(400).json({ error: 'Invalid timeline event ID' });

    const [existing] = await pool.query(
      'SELECT contact_id FROM timeline_events WHERE id = ? AND deleted_at IS NULL',
      [timelineId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Timeline event not found' });
    }

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [existing[0].contact_id]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const isOwner = contact[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('UPDATE timeline_events SET deleted_at = NOW() WHERE id = ?', [timelineId]);

    res.status(200).json({ success: true, message: 'Timeline event deleted' });
  } catch (err) {
    console.error('Delete timeline event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
