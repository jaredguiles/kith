import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/contacts/:id/notes - List all notes for contact
router.get('/contacts/:id/notes', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [notes] = await connection.execute(
      `SELECT * FROM notes
       WHERE contact_id = ? AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: notes,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/notes - Create note and timeline event
router.post('/contacts/:id/notes', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, title } = req.body;

    if (!content) {
      return res.status(400).json({ success: false, error: 'content is required' });
    }

    const connection = await pool.getConnection();

    // Create timeline event first
    const [eventResult] = await connection.execute(
      `INSERT INTO timeline_events (contact_id, event_type, title, description, occurred_at, created_at, updated_at)
       VALUES (?, 'note', ?, ?, NOW(), NOW(), NOW())`,
      [id, title || 'Note', content.substring(0, 200)]
    );

    const timelineEventId = eventResult.insertId;

    // Create note
    const [noteResult] = await connection.execute(
      `INSERT INTO notes (contact_id, timeline_event_id, content, created_at, updated_at)
       VALUES (?, ?, ?, NOW(), NOW())`,
      [id, timelineEventId, content]
    );

    const [[note]] = await connection.execute(
      'SELECT * FROM notes WHERE id = ?',
      [noteResult.insertId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notes/:id - Update note
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content, title } = req.body;

    const connection = await pool.getConnection();

    // Get note to find timeline event
    const [[note]] = await connection.execute(
      'SELECT timeline_event_id FROM notes WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (!note) {
      connection.release();
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // Update note
    await connection.execute(
      `UPDATE notes SET content = COALESCE(?, content), updated_at = NOW() WHERE id = ?`,
      [content, id]
    );

    // Update timeline event
    if (note.timeline_event_id) {
      await connection.execute(
        `UPDATE timeline_events SET
         title = COALESCE(?, title),
         description = COALESCE(?, description),
         updated_at = NOW()
         WHERE id = ?`,
        [title, content ? content.substring(0, 200) : null, note.timeline_event_id]
      );
    }

    const [[updatedNote]] = await connection.execute(
      'SELECT * FROM notes WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: updatedNote,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/notes/:id/spicy - Toggle spicy status
router.patch('/:id/spicy', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_spicy } = req.body;

    if (is_spicy === undefined) {
      return res.status(400).json({ success: false, error: 'is_spicy is required' });
    }

    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE notes SET is_spicy = ?, updated_at = NOW() WHERE id = ?',
      [is_spicy ? 1 : 0, id]
    );

    const [[note]] = await connection.execute(
      'SELECT * FROM notes WHERE id = ?',
      [id]
    );

    connection.release();

    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    res.json({
      success: true,
      data: note,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notes/:id - Soft delete note and timeline event
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    // Get note
    const [[note]] = await connection.execute(
      'SELECT timeline_event_id FROM notes WHERE id = ?',
      [id]
    );

    // Soft delete note
    await connection.execute(
      'UPDATE notes SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    // Soft delete timeline event
    if (note?.timeline_event_id) {
      await connection.execute(
        'UPDATE timeline_events SET deleted_at = NOW() WHERE id = ?',
        [note.timeline_event_id]
      );
    }

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
