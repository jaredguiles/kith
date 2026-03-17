import express from 'express';
import pool from '../database/connection.js';
import { addHours } from 'date-fns';

const router = express.Router();

// GET /api/reminders - List all active reminders
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const connection = await pool.getConnection();

    const [reminders] = await connection.execute(
      `SELECT r.*, c.display_name
       FROM reminders r
       JOIN contacts c ON r.contact_id = c.id
       WHERE r.completed_at IS NULL AND r.deleted_at IS NULL
       ORDER BY r.due_at ASC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    // Get total count
    const [[{ total }]] = await connection.execute(
      `SELECT COUNT(*) as total FROM reminders
       WHERE completed_at IS NULL AND deleted_at IS NULL`
    );

    connection.release();

    res.json({
      success: true,
      data: reminders,
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/reminders/due - Get reminders due within next 24 hours or overdue
router.get('/due', async (req, res, next) => {
  try {
    const connection = await pool.getConnection();
    const now = new Date();
    const tomorrow = addHours(now, 24);

    const [reminders] = await connection.execute(
      `SELECT r.*, c.display_name
       FROM reminders r
       JOIN contacts c ON r.contact_id = c.id
       WHERE r.completed_at IS NULL AND r.deleted_at IS NULL
       AND r.due_at <= ?
       ORDER BY r.due_at ASC`,
      [tomorrow.toISOString()]
    );

    connection.release();

    res.json({
      success: true,
      data: reminders,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/reminders - Create reminder and timeline event
router.post('/contacts/:id/reminders', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, due_at } = req.body;

    if (!due_at) {
      return res.status(400).json({ success: false, error: 'due_at is required' });
    }

    const connection = await pool.getConnection();

    // Create timeline event
    const [eventResult] = await connection.execute(
      `INSERT INTO timeline_events (contact_id, event_type, title, description, occurred_at, created_at, updated_at)
       VALUES (?, 'reminder', ?, ?, ?, NOW(), NOW())`,
      [id, title || 'Reminder', description || null, due_at]
    );

    const timelineEventId = eventResult.insertId;

    // Create reminder
    const [result] = await connection.execute(
      `INSERT INTO reminders (contact_id, timeline_event_id, title, description, due_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [id, timelineEventId, title || 'Reminder', description || null, due_at]
    );

    const [[reminder]] = await connection.execute(
      'SELECT * FROM reminders WHERE id = ?',
      [result.insertId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/reminders/:id - Update reminder
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, description, due_at } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE reminders SET
       title = COALESCE(?, title),
       description = COALESCE(?, description),
       due_at = COALESCE(?, due_at),
       updated_at = NOW()
       WHERE id = ?`,
      [title, description, due_at, id]
    );

    const [[reminder]] = await connection.execute(
      'SELECT * FROM reminders WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/reminders/:id/complete - Mark reminder as completed
router.put('/:id/complete', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE reminders SET completed_at = NOW(), updated_at = NOW() WHERE id = ?',
      [id]
    );

    const [[reminder]] = await connection.execute(
      'SELECT * FROM reminders WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: reminder,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/reminders/:id - Soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE reminders SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
