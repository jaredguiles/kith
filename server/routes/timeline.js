const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// GET /api/timeline?contact_id= - List timeline events for a contact
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
      SELECT id, contact_id, event_id, type, title, description, is_spicy, occurred_at, created_at
      FROM timeline_events
      WHERE contact_id = ? AND deleted_at IS NULL`;
    const params = [contactId];

    // Filter spicy unless spicy mode
    if (!spicyMode) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY occurred_at DESC';

    const [events] = await pool.query(query, params);
    res.json(events);
  } catch (err) {
    console.error('Get timeline error:', err);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// POST /api/timeline - Create timeline event
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, type, title, description, is_spicy, occurred_at } = req.body;

    if (!contact_id || !type || !title) {
      return res.status(400).json({ error: 'contact_id, type, and title are required' });
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
      `INSERT INTO timeline_events (contact_id, type, title, description, is_spicy, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [contact_id, type, title, description || null, is_spicy ? 1 : 0, occurred_at]
    );

    const [event] = await pool.query(
      `SELECT id, contact_id, event_id, type, title, description, is_spicy, occurred_at, created_at
       FROM timeline_events WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(event[0]);
  } catch (err) {
    console.error('Create timeline event error:', err);
    res.status(500).json({ error: 'Failed to create timeline event' });
  }
});

// DELETE /api/timeline/:id - Soft delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const eventId = req.params.id;

    // Get event to verify ownership via contact
    const [event] = await pool.query(
      `SELECT te.contact_id, c.owner_user_id
       FROM timeline_events te
       JOIN contacts c ON te.contact_id = c.id
       WHERE te.id = ?`,
      [eventId]
    );

    if (!event || event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'UPDATE timeline_events SET deleted_at = NOW() WHERE id = ?',
      [eventId]
    );

    res.json({ message: 'Timeline event deleted' });
  } catch (err) {
    console.error('Delete timeline event error:', err);
    res.status(500).json({ error: 'Failed to delete timeline event' });
  }
});

module.exports = router;
