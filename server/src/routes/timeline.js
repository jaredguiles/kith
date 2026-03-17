import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/contacts/:id/timeline - List timeline events for a contact
router.get('/contacts/:id/timeline', async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const eventType = req.query.event_type;
    const offset = (page - 1) * limit;

    const connection = await pool.getConnection();

    let query = `
      SELECT te.* FROM timeline_events te
      WHERE te.contact_id = ? AND te.deleted_at IS NULL
    `;
    const params = [id];

    if (eventType) {
      query += ` AND te.event_type = ?`;
      params.push(eventType);
    }

    query += ` ORDER BY te.occurred_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [events] = await connection.execute(query, params);

    // Enrich events with additional data
    for (const event of events) {
      if (event.event_type === 'message_batch') {
        const [messages] = await connection.execute(
          'SELECT COUNT(*) as count FROM messages WHERE timeline_event_id = ?',
          [event.id]
        );
        event.messageCount = messages[0]?.count || 0;
      } else if (event.event_type === 'note') {
        const [notes] = await connection.execute(
          'SELECT content FROM notes WHERE timeline_event_id = ?',
          [event.id]
        );
        event.notePreview = notes[0]?.content?.substring(0, 100) || null;
      }
    }

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM timeline_events WHERE contact_id = ? AND deleted_at IS NULL`;
    const countParams = [id];
    if (eventType) {
      countQuery += ` AND event_type = ?`;
      countParams.push(eventType);
    }

    const [[{ total }]] = await connection.execute(countQuery, countParams);

    connection.release();

    res.json({
      success: true,
      data: events,
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/timeline - Create timeline event
router.post('/contacts/:id/timeline', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, occurred_at, event_type } = req.body;

    if (!event_type || !occurred_at) {
      return res.status(400).json({ success: false, error: 'event_type and occurred_at are required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO timeline_events (contact_id, event_type, title, description, occurred_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, event_type, title || null, description || null, occurred_at]
    );

    const [[event]] = await connection.execute(
      'SELECT * FROM timeline_events WHERE id = ?',
      [result.insertId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/timeline/:id - Get single event with full details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [[event]] = await connection.execute(
      'SELECT * FROM timeline_events WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!event) {
      connection.release();
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    // Enrich with linked data
    if (event.event_type === 'message_batch') {
      const [messages] = await connection.execute(
        'SELECT * FROM messages WHERE timeline_event_id = ? ORDER BY created_at DESC',
        [id]
      );
      event.messages = messages;
    } else if (event.event_type === 'note') {
      const [notes] = await connection.execute(
        'SELECT * FROM notes WHERE timeline_event_id = ?',
        [id]
      );
      event.note = notes[0] || null;
    } else if (event.event_type === 'media_exchange') {
      const [media] = await connection.execute(
        'SELECT * FROM media_assets WHERE timeline_event_id = ? ORDER BY created_at DESC',
        [id]
      );
      event.media = media;
    }

    connection.release();

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/timeline/:id - Update event
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, occurred_at } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE timeline_events SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       occurred_at = COALESCE(?, occurred_at),
       updated_at = NOW()
       WHERE id = ?`,
      [title, description, occurred_at, id]
    );

    const [[event]] = await connection.execute(
      'SELECT * FROM timeline_events WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/timeline/:id/spicy - Toggle spicy status
router.patch('/:id/spicy', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_spicy } = req.body;

    if (is_spicy === undefined) {
      return res.status(400).json({ success: false, error: 'is_spicy is required' });
    }

    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE timeline_events SET is_spicy = ?, updated_at = NOW() WHERE id = ?',
      [is_spicy ? 1 : 0, id]
    );

    const [[event]] = await connection.execute(
      'SELECT * FROM timeline_events WHERE id = ?',
      [id]
    );

    connection.release();

    if (!event) {
      return res.status(404).json({ success: false, error: 'Event not found' });
    }

    res.json({
      success: true,
      data: event,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/timeline/:id - Soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE timeline_events SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
