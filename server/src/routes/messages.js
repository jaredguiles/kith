import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/contacts/:id/messages - List messages for contact
router.get('/contacts/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const platform = req.query.platform;
    const offset = (page - 1) * limit;

    const connection = await pool.getConnection();

    let query = `
      SELECT m.* FROM messages m
      WHERE m.contact_id = ? AND m.deleted_at IS NULL
    `;
    const params = [id];

    if (platform) {
      query += ` AND m.platform = ?`;
      params.push(platform);
    }

    query += ` ORDER BY m.created_at DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const [messages] = await connection.execute(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(*) as total FROM messages WHERE contact_id = ? AND deleted_at IS NULL`;
    const countParams = [id];
    if (platform) {
      countQuery += ` AND platform = ?`;
      countParams.push(platform);
    }

    const [[{ total }]] = await connection.execute(countQuery, countParams);

    connection.release();

    res.json({
      success: true,
      data: messages,
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/messages - Create messages (batch) with timeline event
router.post('/contacts/:id/messages', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: 'messages array is required' });
    }

    const connection = await pool.getConnection();

    // Create timeline event for batch
    const [eventResult] = await connection.execute(
      `INSERT INTO timeline_events (contact_id, event_type, title, occurred_at, created_at, updated_at)
       VALUES (?, 'message_batch', ?, NOW(), NOW(), NOW())`,
      [id, `${messages.length} messages`]
    );

    const timelineEventId = eventResult.insertId;

    // Insert messages with deduplication
    let insertedCount = 0;
    for (const msg of messages) {
      const { sender, content, timestamp, message_type, platform } = msg;

      if (!sender || !content) {
        continue;
      }

      // Check for duplicates (same sender + content)
      const [existing] = await connection.execute(
        `SELECT id FROM messages
         WHERE contact_id = ? AND sender = ? AND content = ? LIMIT 1`,
        [id, sender, content]
      );

      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO messages (contact_id, timeline_event_id, sender, content, message_type, platform, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
          [id, timelineEventId, sender, content, message_type || 'text', platform || 'unknown', timestamp || new Date().toISOString()]
        );
        insertedCount++;
      }
    }

    // Update timeline event description with count
    if (insertedCount > 0) {
      await connection.execute(
        `UPDATE timeline_events SET description = ? WHERE id = ?`,
        [`${insertedCount} new messages added`, timelineEventId]
      );
    } else {
      // Delete timeline event if no new messages
      await connection.execute(
        `DELETE FROM timeline_events WHERE id = ?`,
        [timelineEventId]
      );
    }

    connection.release();

    res.status(201).json({
      success: true,
      data: {
        newMessagesAdded: insertedCount,
        totalSubmitted: messages.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/:id/messages/:eventId - Get all messages linked to timeline event
router.get('/contacts/:id/messages/:eventId', async (req, res, next) => {
  try {
    const { id, eventId } = req.params;
    const connection = await pool.getConnection();

    const [messages] = await connection.execute(
      `SELECT * FROM messages
       WHERE contact_id = ? AND timeline_event_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id, eventId]
    );

    connection.release();

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/messages/:id/spicy - Toggle spicy status
router.patch('/:id/spicy', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_spicy } = req.body;

    if (is_spicy === undefined) {
      return res.status(400).json({ success: false, error: 'is_spicy is required' });
    }

    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE messages SET is_spicy = ?, updated_at = NOW() WHERE id = ?',
      [is_spicy ? 1 : 0, id]
    );

    const [[message]] = await connection.execute(
      'SELECT * FROM messages WHERE id = ?',
      [id]
    );

    connection.release();

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
