const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

// GET /api/reminders/due - Get reminders that are due or upcoming
router.get('/due', requireAuth, async (req, res) => {
  try {
    // Get due (past due or within next 7 days) and incomplete reminders
    const [reminders] = await pool.query(
      `SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at
       FROM reminders
       WHERE owner_user_id = ? AND completed_at IS NULL AND deleted_at IS NULL
       AND (due_at <= DATE_ADD(NOW(), INTERVAL 7 DAY) OR due_at <= NOW())
       ORDER BY due_at ASC`,
      [req.user.id]
    );

    res.json(reminders);
  } catch (err) {
    console.error('Get due reminders error:', err);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// GET /api/reminders - List all reminders for user
router.get('/', requireAuth, async (req, res) => {
  try {
    const contactId = req.query.contact_id;

    let query = `
      SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at
      FROM reminders
      WHERE owner_user_id = ? AND deleted_at IS NULL`;
    const params = [req.user.id];

    if (contactId) {
      query += ' AND contact_id = ?';
      params.push(contactId);
    }

    query += ' ORDER BY due_at ASC';

    const [reminders] = await pool.query(query, params);
    res.json(reminders);
  } catch (err) {
    console.error('Get reminders error:', err);
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
});

// POST /api/reminders - Create reminder
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, title, description, due_at } = req.body;

    if (!title || !due_at) {
      return res.status(400).json({ error: 'title and due_at are required' });
    }

    // Verify contact ownership if provided
    if (contact_id) {
      const [contact] = await pool.query(
        'SELECT owner_user_id FROM contacts WHERE id = ?',
        [contact_id]
      );

      if (!contact || contact.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      if (contact[0].owner_user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const [result] = await pool.query(
      'INSERT INTO reminders (owner_user_id, contact_id, title, description, due_at) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, contact_id || null, title, description || null, due_at]
    );

    const [reminder] = await pool.query(
      'SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at FROM reminders WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(reminder[0]);
  } catch (err) {
    console.error('Create reminder error:', err);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
});

// PUT /api/reminders/:id - Update reminder
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const reminderId = req.params.id;
    const { contact_id, title, description, due_at } = req.body;

    // Get reminder to verify ownership
    const [reminder] = await pool.query(
      'SELECT owner_user_id FROM reminders WHERE id = ?',
      [reminderId]
    );

    if (!reminder || reminder.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (reminder[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (contact_id !== undefined) {
      updateFields.push('contact_id = ?');
      updateValues.push(contact_id);
    }
    if (title !== undefined) {
      updateFields.push('title = ?');
      updateValues.push(title);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }
    if (due_at !== undefined) {
      updateFields.push('due_at = ?');
      updateValues.push(due_at);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(reminderId);
    const query = `UPDATE reminders SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      'SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at FROM reminders WHERE id = ?',
      [reminderId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update reminder error:', err);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

// POST /api/reminders/:id/complete - Mark as complete
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const reminderId = req.params.id;

    // Get reminder to verify ownership
    const [reminder] = await pool.query(
      'SELECT owner_user_id FROM reminders WHERE id = ?',
      [reminderId]
    );

    if (!reminder || reminder.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (reminder[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'UPDATE reminders SET completed_at = NOW() WHERE id = ?',
      [reminderId]
    );

    const [updated] = await pool.query(
      'SELECT id, owner_user_id, contact_id, title, description, due_at, completed_at, created_at FROM reminders WHERE id = ?',
      [reminderId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Complete reminder error:', err);
    res.status(500).json({ error: 'Failed to complete reminder' });
  }
});

// DELETE /api/reminders/:id - Soft delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const reminderId = req.params.id;

    // Get reminder to verify ownership
    const [reminder] = await pool.query(
      'SELECT owner_user_id FROM reminders WHERE id = ?',
      [reminderId]
    );

    if (!reminder || reminder.length === 0) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    if (reminder[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'UPDATE reminders SET deleted_at = NOW() WHERE id = ?',
      [reminderId]
    );

    res.json({ message: 'Reminder deleted' });
  } catch (err) {
    console.error('Delete reminder error:', err);
    res.status(500).json({ error: 'Failed to delete reminder' });
  }
});

module.exports = router;
