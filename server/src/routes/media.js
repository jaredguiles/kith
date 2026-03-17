import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/contacts/:id/media - List media for contact
router.get('/contacts/:id/media', async (req, res, next) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const connection = await pool.getConnection();

    const [media] = await connection.execute(
      `SELECT * FROM media_assets
       WHERE contact_id = ? AND deleted_at IS NULL
       ORDER BY captured_at DESC, created_at DESC
       LIMIT ? OFFSET ?`,
      [id, limit, offset]
    );

    // Get total count
    const [[{ total }]] = await connection.execute(
      `SELECT COUNT(*) as total FROM media_assets WHERE contact_id = ? AND deleted_at IS NULL`,
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: media,
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/media - Create media asset records (batch)
router.post('/contacts/:id/media', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { media } = req.body;

    if (!Array.isArray(media) || media.length === 0) {
      return res.status(400).json({ success: false, error: 'media array is required' });
    }

    const connection = await pool.getConnection();

    // Create timeline event for media exchange
    const [eventResult] = await connection.execute(
      `INSERT INTO timeline_events (contact_id, event_type, title, description, occurred_at, created_at, updated_at)
       VALUES (?, 'media_exchange', ?, ?, NOW(), NOW(), NOW())`,
      [id, `${media.length} media assets`, `${media.length} files shared`]
    );

    const timelineEventId = eventResult.insertId;

    // Insert media with URL-based deduplication
    let insertedCount = 0;
    for (const item of media) {
      const { file_url, media_type, captured_at, platform } = item;

      if (!file_url) {
        continue;
      }

      // Check for duplicates (same URL)
      const [existing] = await connection.execute(
        `SELECT id FROM media_assets
         WHERE contact_id = ? AND file_url = ? LIMIT 1`,
        [id, file_url]
      );

      if (existing.length === 0) {
        await connection.execute(
          `INSERT INTO media_assets (contact_id, timeline_event_id, file_url, media_type, platform, captured_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [id, timelineEventId, file_url, media_type || 'image', platform || 'unknown', captured_at || new Date().toISOString()]
        );
        insertedCount++;
      }
    }

    // Update timeline event with actual count
    if (insertedCount > 0) {
      await connection.execute(
        `UPDATE timeline_events SET
         title = ?,
         description = ?
         WHERE id = ?`,
        [`${insertedCount} media assets`, `${insertedCount} new files shared`, timelineEventId]
      );
    } else {
      // Delete timeline event if no new media
      await connection.execute(
        `DELETE FROM timeline_events WHERE id = ?`,
        [timelineEventId]
      );
    }

    connection.release();

    res.status(201).json({
      success: true,
      data: {
        newMediaAdded: insertedCount,
        totalSubmitted: media.length,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/media/:id/spicy - Toggle spicy status
router.patch('/:id/spicy', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_spicy } = req.body;

    if (is_spicy === undefined) {
      return res.status(400).json({ success: false, error: 'is_spicy is required' });
    }

    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE media_assets SET is_spicy = ?, updated_at = NOW() WHERE id = ?',
      [is_spicy ? 1 : 0, id]
    );

    const [[media]] = await connection.execute(
      'SELECT * FROM media_assets WHERE id = ?',
      [id]
    );

    connection.release();

    if (!media) {
      return res.status(404).json({ success: false, error: 'Media not found' });
    }

    res.json({
      success: true,
      data: media,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/media/:id - Soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE media_assets SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
