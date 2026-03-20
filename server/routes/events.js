const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// GET /api/events - List events
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, contact_id, upcoming, past } = req.query;

    let query = `
      SELECT e.id, e.owner_user_id, e.title, e.type, e.description, e.location,
             e.is_spicy, e.starts_at, e.ends_at, e.status, e.followup_notes, e.rating,
             e.created_at, e.updated_at
      FROM events e
      WHERE e.deleted_at IS NULL`;
    const params = [];

    // Filter by owner unless admin
    if (!isAdminRole(req.user.role)) {
      query += ' AND e.owner_user_id = ?';
      params.push(req.user.id);
    }

    // Filter by status
    if (status) {
      query += ' AND e.status = ?';
      params.push(status);
    }

    // Filter by contact
    if (contact_id) {
      query += ' AND EXISTS (SELECT 1 FROM event_contacts WHERE event_id = e.id AND contact_id = ?)';
      params.push(contact_id);
    }

    // Filter upcoming
    if (upcoming === 'true') {
      query += ' AND e.starts_at > NOW()';
    }

    // Filter past
    if (past === 'true') {
      query += ' AND e.starts_at < NOW()';
    }

    query += ' ORDER BY e.starts_at DESC';

    const [events] = await pool.query(query, params);
    res.json(events);
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/events/:id - Event detail with linked contacts
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const eventId = req.params.id;

    // Get event
    const [event] = await pool.query(
      `SELECT id, owner_user_id, title, type, description, location, is_spicy,
              starts_at, ends_at, status, followup_notes, rating, created_at, updated_at
       FROM events WHERE id = ? AND deleted_at IS NULL`,
      [eventId]
    );

    if (!event || event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get linked contacts
    const [contacts] = await pool.query(
      `SELECT c.id, c.display_name, c.email, c.photo_url
       FROM contacts c
       JOIN event_contacts ec ON c.id = ec.contact_id
       WHERE ec.event_id = ?`,
      [eventId]
    );

    res.json({
      ...event[0],
      contacts
    });
  } catch (err) {
    console.error('Get event error:', err);
    res.status(500).json({ error: 'Failed to fetch event' });
  }
});

// POST /api/events - Create event
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, type, description, location, is_spicy, starts_at, ends_at, contact_ids } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Event title is required' });
    }

    // Create event
    const [result] = await pool.query(
      `INSERT INTO events (owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming')`,
      [req.user.id, title, type || null, description || null, location || null, is_spicy ? 1 : 0, starts_at, ends_at || null]
    );

    const eventId = result.insertId;

    // Link contacts if provided
    if (contact_ids && Array.isArray(contact_ids)) {
      for (const contactId of contact_ids) {
        // Verify contact ownership
        const [contact] = await pool.query(
          'SELECT id FROM contacts WHERE id = ? AND owner_user_id = ?',
          [contactId, req.user.id]
        );

        if (contact && contact.length > 0) {
          // Add to event_contacts
          await pool.query(
            'INSERT IGNORE INTO event_contacts (event_id, contact_id) VALUES (?, ?)',
            [eventId, contactId]
          );

          // Create timeline event
          await pool.query(
            `INSERT INTO timeline_events (contact_id, event_id, type, title, is_spicy, occurred_at)
             VALUES (?, ?, 'event', ?, ?, ?)`,
            [contactId, eventId, title, is_spicy ? 1 : 0, starts_at]
          );
        }
      }
    }

    const [event] = await pool.query(
      `SELECT id, owner_user_id, title, type, description, location, is_spicy,
              starts_at, ends_at, status, followup_notes, rating, created_at, updated_at
       FROM events WHERE id = ?`,
      [eventId]
    );

    res.status(201).json(event[0]);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// PUT /api/events/:id - Update event
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const eventId = req.params.id;
    const { title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating, contact_ids } = req.body;

    // Get event to verify ownership
    const [event] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ?',
      [eventId]
    );

    if (!event || event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (type !== undefined) {
      updateFields.push('type = ?');
      updateValues.push(type);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (location !== undefined) {
      updateFields.push('location = ?');
      updateValues.push(location);
    }
    if (is_spicy !== undefined) {
      updateFields.push('is_spicy = ?');
      updateValues.push(is_spicy ? 1 : 0);
    }
    if (starts_at !== undefined) {
      updateFields.push('starts_at = ?');
      updateValues.push(starts_at);
    }
    if (ends_at !== undefined) {
      updateFields.push('ends_at = ?');
      updateValues.push(ends_at);
    }
    if (status !== undefined) {
      updateFields.push('status = ?');
      updateValues.push(status);
    }
    if (followup_notes !== undefined) {
      updateFields.push('followup_notes = ?');
      updateValues.push(followup_notes);
    }
    if (rating !== undefined) {
      updateFields.push('rating = ?');
      updateValues.push(rating);
    }

    if (updateFields.length > 0) {
      updateValues.push(eventId);
      const query = `UPDATE events SET ${updateFields.join(', ')} WHERE id = ?`;
      await pool.query(query, updateValues);
    }

    // Sync contact_ids if provided
    if (contact_ids && Array.isArray(contact_ids)) {
      // Remove existing contacts
      await pool.query('DELETE FROM event_contacts WHERE event_id = ?', [eventId]);

      // Add new contacts
      for (const contactId of contact_ids) {
        const [contact] = await pool.query(
          'SELECT id FROM contacts WHERE id = ? AND owner_user_id = ?',
          [contactId, req.user.id]
        );

        if (contact && contact.length > 0) {
          await pool.query(
            'INSERT IGNORE INTO event_contacts (event_id, contact_id) VALUES (?, ?)',
            [eventId, contactId]
          );

          // Create timeline event
          const [eventData] = await pool.query(
            'SELECT title, is_spicy, starts_at FROM events WHERE id = ?',
            [eventId]
          );

          await pool.query(
            `INSERT INTO timeline_events (contact_id, event_id, type, title, is_spicy, occurred_at)
             VALUES (?, ?, 'event', ?, ?, ?)`,
            [contactId, eventId, eventData[0].title, eventData[0].is_spicy, eventData[0].starts_at]
          );
        }
      }
    }

    const [updated] = await pool.query(
      `SELECT id, owner_user_id, title, type, description, location, is_spicy,
              starts_at, ends_at, status, followup_notes, rating, created_at, updated_at
       FROM events WHERE id = ?`,
      [eventId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// DELETE /api/events/:id - Soft delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const eventId = req.params.id;

    // Get event to verify ownership
    const [event] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ?',
      [eventId]
    );

    if (!event || event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'UPDATE events SET deleted_at = NOW() WHERE id = ?',
      [eventId]
    );

    res.json({ message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

// POST /api/events/:id/media/:mediaId - Link media to event
router.post('/:id/media/:mediaId', requireAuth, async (req, res) => {
  try {
    const eventId = req.params.id;
    const mediaId = req.params.mediaId;

    // Verify event ownership
    const [event] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ?',
      [eventId]
    );

    if (!event || event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify media exists
    const [media] = await pool.query(
      'SELECT id FROM media_assets WHERE id = ?',
      [mediaId]
    );

    if (!media || media.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    // Insert or ignore duplicate
    await pool.query(
      'INSERT IGNORE INTO event_media (event_id, media_id) VALUES (?, ?)',
      [eventId, mediaId]
    );

    res.status(201).json({ message: 'Media linked to event' });
  } catch (err) {
    console.error('Link media error:', err);
    res.status(500).json({ error: 'Failed to link media' });
  }
});

// DELETE /api/events/:id/media/:mediaId - Unlink media
router.delete('/:id/media/:mediaId', requireAuth, async (req, res) => {
  try {
    const eventId = req.params.id;
    const mediaId = req.params.mediaId;

    // Verify event ownership
    const [event] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ?',
      [eventId]
    );

    if (!event || event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'DELETE FROM event_media WHERE event_id = ? AND media_id = ?',
      [eventId, mediaId]
    );

    res.json({ message: 'Media unlinked from event' });
  } catch (err) {
    console.error('Unlink media error:', err);
    res.status(500).json({ error: 'Failed to unlink media' });
  }
});

module.exports = router;
