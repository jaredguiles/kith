const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, getSpicyEnabled } = require('../middleware/auth');

/**
 * GET /
 * List messages for a contact
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

    let query = 'SELECT id, contact_id, platform, direction, content, is_spicy, sent_at, created_at FROM messages WHERE contact_id = ?';
    const values = [contactId];

    if (!spicyEnabled) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY sent_at DESC, created_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    const countQuery = 'SELECT COUNT(*) as total FROM messages WHERE contact_id = ?' +
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
    console.error('List messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create message
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, platform, direction, content, is_spicy, sent_at } = req.body;

    if (!contact_id || !platform || !direction) {
      return res.status(400).json({ error: 'contact_id, platform, and direction required' });
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

    const [result] = await pool.query(
      'INSERT INTO messages (contact_id, platform, direction, content, is_spicy, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
      [contactId, platform, direction, content || null, is_spicy ? 1 : 0, sent_at || null]
    );

    const [message] = await pool.query(
      'SELECT id, contact_id, platform, direction, content, is_spicy, sent_at, created_at FROM messages WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(message[0]);
  } catch (err) {
    console.error('Create message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
