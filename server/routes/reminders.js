const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /due
 * Get due/upcoming reminders for current user
 */
router.get('/due', requireAuth, async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const [rows] = await pool.query(
      `SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at
       FROM reminders
       WHERE owner_user_id = ? AND deleted_at IS NULL AND completed_at IS NULL
       ORDER BY due_at ASC
       LIMIT ? OFFSET ?`,
      [req.user.id, parseInt(limit), parseInt(offset)]
    );

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM reminders WHERE owner_user_id = ? AND deleted_at IS NULL AND completed_at IS NULL',
      [req.user.id]
    );

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Get due reminders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create reminder
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, title, description, due_at } = req.body;

    if (!title || !due_at) {
      return res.status(400).json({ error: 'title and due_at required' });
    }

    const contactIdValue = contact_id ? parseInt(contact_id) : null;

    if (contactIdValue !== null) {
      const [contact] = await pool.query(
        'SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL',
        [contactIdValue]
      );
      if (contact.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }
    }

    const [result] = await pool.query(
      'INSERT INTO reminders (owner_user_id, contact_id, title, description, due_at) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, contactIdValue, title, description || null, due_at]
    );

    const [reminder] = await pool.query(
      'SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at FROM reminders WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(reminder[0]);
  } catch (err) {
    console.error('Create reminder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /:id
 * Get reminder detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const reminderId = parseInt(req.params.id);
    if (isNaN(reminderId)) return res.status(400).json({ error: 'Invalid reminder ID' });

    const [rows] = await pool.query(
      'SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at FROM reminders WHERE id = ? AND deleted_at IS NULL',
      [reminderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (rows[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('Get reminder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update reminder
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const reminderId = parseInt(req.params.id);
    if (isNaN(reminderId)) return res.status(400).json({ error: 'Invalid reminder ID' });

    const { title, description, due_at } = req.body;

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM reminders WHERE id = ? AND deleted_at IS NULL',
      [reminderId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (due_at !== undefined) {
      updates.push('due_at = ?');
      values.push(due_at);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(reminderId);
    const query = `UPDATE reminders SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [reminder] = await pool.query(
      'SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at FROM reminders WHERE id = ?',
      [reminderId]
    );

    res.status(200).json(reminder[0]);
  } catch (err) {
    console.error('Update reminder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /:id/complete
 * Mark reminder as complete
 */
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const reminderId = parseInt(req.params.id);
    if (isNaN(reminderId)) return res.status(400).json({ error: 'Invalid reminder ID' });

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM reminders WHERE id = ? AND deleted_at IS NULL',
      [reminderId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('UPDATE reminders SET completed_at = NOW() WHERE id = ?', [reminderId]);

    const [reminder] = await pool.query(
      'SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at FROM reminders WHERE id = ?',
      [reminderId]
    );

    res.status(200).json(reminder[0]);
  } catch (err) {
    console.error('Complete reminder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Soft delete reminder
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const reminderId = parseInt(req.params.id);
    if (isNaN(reminderId)) return res.status(400).json({ error: 'Invalid reminder ID' });

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM reminders WHERE id = ? AND deleted_at IS NULL',
      [reminderId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('UPDATE reminders SET deleted_at = NOW() WHERE id = ?', [reminderId]);

    res.status(200).json({ success: true, message: 'Reminder deleted' });
  } catch (err) {
    console.error('Delete reminder error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
