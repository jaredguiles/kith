const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, getSpicyEnabled } = require('../middleware/auth');

/**
 * GET /
 * List events for current user
 * Query params: ?status=, ?contact_id=, ?upcoming=, ?past=, ?spicy=, ?limit=, ?offset=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { status, contact_id, upcoming, past, limit = 100, offset = 0 } = req.query;
    const spicyEnabled = await getSpicyEnabled();

    let query = 'SELECT id, owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating, created_at, updated_at FROM events WHERE owner_user_id = ? AND deleted_at IS NULL';
    const values = [req.user.id];

    if (status) {
      query += ' AND status = ?';
      values.push(status);
    }

    if (contact_id) {
      query += ' AND id IN (SELECT event_id FROM event_contacts WHERE contact_id = ?)';
      values.push(parseInt(contact_id));
    }

    if (!spicyEnabled) {
      query += ' AND is_spicy = 0';
    }

    if (upcoming === 'true') {
      query += ' AND starts_at >= NOW()';
    } else if (past === 'true') {
      query += ' AND starts_at < NOW()';
    }

    query += ' ORDER BY starts_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    // Get contact count for each event
    const events = [];
    for (const event of rows) {
      const [contacts] = await pool.query(
        'SELECT contact_id FROM event_contacts WHERE event_id = ?',
        [event.id]
      );
      events.push({
        ...event,
        contact_count: contacts.length,
        contacts: contacts.map(c => c.contact_id)
      });
    }

    const countQuery = 'SELECT COUNT(*) as total FROM events WHERE owner_user_id = ? AND deleted_at IS NULL' +
      (status ? ' AND status = ?' : '') +
      (contact_id ? ' AND id IN (SELECT event_id FROM event_contacts WHERE contact_id = ?)' : '') +
      (!spicyEnabled ? ' AND is_spicy = 0' : '') +
      (upcoming === 'true' ? ' AND starts_at >= NOW()' : '') +
      (past === 'true' ? ' AND starts_at < NOW()' : '');

    const countValues = [req.user.id];
    if (status) countValues.push(status);
    if (contact_id) countValues.push(parseInt(contact_id));

    const [countResult] = await pool.query(countQuery, countValues);

    res.status(200).json({
      data: events,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('List events error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /:id
 * Get event detail with linked contacts
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) return res.status(400).json({ error: 'Invalid event ID' });

    const [rows] = await pool.query(
      'SELECT id, owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating, created_at, updated_at FROM events WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL',
      [eventId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const [contacts] = await pool.query(
      'SELECT contact_id FROM event_contacts WHERE event_id = ?',
      [eventId]
    );

    const [media] = await pool.query(
      'SELECT media_id FROM event_media WHERE event_id = ?',
      [eventId]
    );

    res.status(200).json({
      ...rows[0],
      contacts: contacts.map(c => c.contact_id),
      media: media.map(m => m.media_id)
    });
  } catch (err) {
    console.error('Get event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create event with linked contacts
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating, contact_ids } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'title required' });
    }

    const eventStatus = status || 'upcoming';
    const validStatuses = ['upcoming', 'completed', 'cancelled'];
    if (!validStatuses.includes(eventStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const [result] = await pool.query(
      'INSERT INTO events (owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, title, type || null, description || null, location || null, is_spicy ? 1 : 0, starts_at || null, ends_at || null, eventStatus, followup_notes || null, rating || null]
    );

    const eventId = result.insertId;

    // Add contact links
    if (contact_ids && Array.isArray(contact_ids) && contact_ids.length > 0) {
      for (const contactId of contact_ids) {
        const [contact] = await pool.query(
          'SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL',
          [parseInt(contactId)]
        );
        if (contact.length > 0) {
          await pool.query(
            'INSERT INTO event_contacts (event_id, contact_id) VALUES (?, ?)',
            [eventId, parseInt(contactId)]
          ).catch(() => {});
        }
      }
    }

    const [event] = await pool.query(
      'SELECT id, owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating, created_at, updated_at FROM events WHERE id = ?',
      [eventId]
    );

    const [contacts] = await pool.query(
      'SELECT contact_id FROM event_contacts WHERE event_id = ?',
      [eventId]
    );

    res.status(201).json({
      ...event[0],
      contacts: contacts.map(c => c.contact_id)
    });
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update event
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) return res.status(400).json({ error: 'Invalid event ID' });

    const { title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating } = req.body;

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ? AND deleted_at IS NULL',
      [eventId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];

    if (title !== undefined) { updates.push('title = ?'); values.push(title); }
    if (type !== undefined) { updates.push('type = ?'); values.push(type); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }
    if (location !== undefined) { updates.push('location = ?'); values.push(location); }
    if (is_spicy !== undefined) { updates.push('is_spicy = ?'); values.push(is_spicy ? 1 : 0); }
    if (starts_at !== undefined) { updates.push('starts_at = ?'); values.push(starts_at); }
    if (ends_at !== undefined) { updates.push('ends_at = ?'); values.push(ends_at); }
    if (status !== undefined) { updates.push('status = ?'); values.push(status); }
    if (followup_notes !== undefined) { updates.push('followup_notes = ?'); values.push(followup_notes); }
    if (rating !== undefined) { updates.push('rating = ?'); values.push(rating); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(eventId);
    const query = `UPDATE events SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [event] = await pool.query(
      'SELECT id, owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status, followup_notes, rating, created_at, updated_at FROM events WHERE id = ?',
      [eventId]
    );

    const [contacts] = await pool.query(
      'SELECT contact_id FROM event_contacts WHERE event_id = ?',
      [eventId]
    );

    res.status(200).json({
      ...event[0],
      contacts: contacts.map(c => c.contact_id)
    });
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Soft delete event
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    if (isNaN(eventId)) return res.status(400).json({ error: 'Invalid event ID' });

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ? AND deleted_at IS NULL',
      [eventId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('UPDATE events SET deleted_at = NOW() WHERE id = ?', [eventId]);

    res.status(200).json({ success: true, message: 'Event deleted' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /:id/media/:mediaId
 * Link media to event
 */
router.post('/:id/media/:mediaId', requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const mediaId = parseInt(req.params.mediaId);

    if (isNaN(eventId) || isNaN(mediaId)) {
      return res.status(400).json({ error: 'Invalid event or media ID' });
    }

    const [event] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ? AND deleted_at IS NULL',
      [eventId]
    );

    if (event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [media] = await pool.query(
      'SELECT id FROM media_assets WHERE id = ? AND deleted_at IS NULL',
      [mediaId]
    );

    if (media.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    try {
      await pool.query(
        'INSERT INTO event_media (event_id, media_id) VALUES (?, ?)',
        [eventId, mediaId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Media already linked to event' });
      }
      throw err;
    }

    res.status(201).json({ success: true, message: 'Media linked to event' });
  } catch (err) {
    console.error('Link media to event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id/media/:mediaId
 * Unlink media from event
 */
router.delete('/:id/media/:mediaId', requireAuth, async (req, res) => {
  try {
    const eventId = parseInt(req.params.id);
    const mediaId = parseInt(req.params.mediaId);

    if (isNaN(eventId) || isNaN(mediaId)) {
      return res.status(400).json({ error: 'Invalid event or media ID' });
    }

    const [event] = await pool.query(
      'SELECT owner_user_id FROM events WHERE id = ? AND deleted_at IS NULL',
      [eventId]
    );

    if (event.length === 0) {
      return res.status(404).json({ error: 'Event not found' });
    }

    if (event[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'DELETE FROM event_media WHERE event_id = ? AND media_id = ?',
      [eventId, mediaId]
    );

    res.status(200).json({ success: true, message: 'Media unlinked from event' });
  } catch (err) {
    console.error('Unlink media from event error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
