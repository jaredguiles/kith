const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// GET /api/notes?contact_id= - List notes for contact
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
      SELECT id, contact_id, content, is_spicy, created_at, updated_at
      FROM notes
      WHERE contact_id = ? AND deleted_at IS NULL`;
    const params = [contactId];

    // Filter spicy unless spicy mode
    if (!spicyMode) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY created_at DESC';

    const [notes] = await pool.query(query, params);
    res.json(notes);
  } catch (err) {
    console.error('Get notes error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// POST /api/notes - Create note
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, content, is_spicy } = req.body;

    if (!contact_id || !content) {
      return res.status(400).json({ error: 'contact_id and content are required' });
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
      'INSERT INTO notes (contact_id, content, is_spicy) VALUES (?, ?, ?)',
      [contact_id, content, is_spicy ? 1 : 0]
    );

    const [note] = await pool.query(
      'SELECT id, contact_id, content, is_spicy, created_at, updated_at FROM notes WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(note[0]);
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// PUT /api/notes/:id - Update note
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const noteId = req.params.id;
    const { content, is_spicy } = req.body;

    // Get note to verify ownership
    const [note] = await pool.query(
      `SELECT n.id, c.owner_user_id
       FROM notes n
       JOIN contacts c ON n.contact_id = c.id
       WHERE n.id = ?`,
      [noteId]
    );

    if (!note || note.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (note[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (content !== undefined) {
      updateFields.push('content = ?');
      updateValues.push(content);
    }
    if (is_spicy !== undefined) {
      updateFields.push('is_spicy = ?');
      updateValues.push(is_spicy ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(noteId);
    const query = `UPDATE notes SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      'SELECT id, contact_id, content, is_spicy, created_at, updated_at FROM notes WHERE id = ?',
      [noteId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// DELETE /api/notes/:id - Soft delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const noteId = req.params.id;

    // Get note to verify ownership
    const [note] = await pool.query(
      `SELECT n.id, c.owner_user_id
       FROM notes n
       JOIN contacts c ON n.contact_id = c.id
       WHERE n.id = ?`,
      [noteId]
    );

    if (!note || note.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    if (note[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'UPDATE notes SET deleted_at = NOW() WHERE id = ?',
      [noteId]
    );

    res.json({ message: 'Note deleted' });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

module.exports = router;
