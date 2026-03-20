const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// GET /api/messages?contact_id= - List messages for contact
router.get('/', requireAuth, async (req, res) => {
  try {
    const contactId = req.query.contact_id;
    const spicyMode = req.headers['x-spicy-mode'] === 'true';

    if (!contactId) {
      return res.status(400).json({ error: 'contact_id parameter is required' });
    }

    // Verify contact ownership
    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ?',
      [contactId]
    );

    if (!contact || contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    let query = `
      SELECT id, contact_id, platform, direction, content, is_spicy, sent_at, created_at
      FROM messages
      WHERE contact_id = ?`;
    const params = [contactId];

    // Filter spicy unless spicy mode
    if (!spicyMode) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY sent_at DESC';

    const [messages] = await pool.query(query, params);
    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/messages - Create message
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, platform, direction, content, is_spicy, sent_at } = req.body;

    if (!contact_id || !platform || !direction || !content) {
      return res.status(400).json({ error: 'contact_id, platform, direction, and content are required' });
    }

    // Verify contact ownership
    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ?',
      [contact_id]
    );

    if (!contact || contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [result] = await pool.query(
      'INSERT INTO messages (contact_id, platform, direction, content, is_spicy, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
      [contact_id, platform, direction, content, is_spicy ? 1 : 0, sent_at || new Date().toISOString()]
    );

    const [message] = await pool.query(
      'SELECT id, contact_id, platform, direction, content, is_spicy, sent_at, created_at FROM messages WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(message[0]);
  } catch (err) {
    console.error('Create message error:', err);
    res.status(500).json({ error: 'Failed to create message' });
  }
});

module.exports = router;
