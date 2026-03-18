const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, getSpicyEnabled } = require('../middleware/auth');

/**
 * GET /
 * List notes (with optional filtering)
 * Query params: ?contact_id=, ?spicy=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, spicy, limit = 100, offset = 0 } = req.query;
    const spicyEnabled = await getSpicyEnabled();

    if (!contact_id) {
      return res.status(400).json({ error: 'contact_id parameter required' });
    }

    const contactId = parseInt(contact_id);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    let query = 'SELECT id, contact_id, content, is_spicy, created_at, updated_at FROM notes WHERE contact_id = ? AND deleted_at IS NULL';
    const values = [contactId];

    if (!spicyEnabled) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    const countQuery = 'SELECT COUNT(*) as total FROM notes WHERE contact_id = ? AND deleted_at IS NULL' +
      (!spicyEnabled ? ' AND is_spicy = 0' : '');
    const [countResult] = await pool.query(
      countQuery,
      [contactId]
    );

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('List notes error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create note
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, content, is_spicy } = req.body;

    if (!contact_id || !content) {
      return res.status(400).json({ error: 'contact_id and content required' });
    }

    const contactId = parseInt(contact_id);
    if (isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid contact ID' });
    }

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const isOwner = contact[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [result] = await pool.query(
      'INSERT INTO notes (contact_id, content, is_spicy) VALUES (?, ?, ?)',
      [contactId, content, is_spicy ? 1 : 0]
    );

    const [note] = await pool.query(
      'SELECT id, contact_id, content, is_spicy, created_at, updated_at FROM notes WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(note[0]);
  } catch (err) {
    console.error('Create note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update note
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const noteId = parseInt(req.params.id);
    if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

    const { content, is_spicy } = req.body;

    const [existing] = await pool.query(
      'SELECT contact_id FROM notes WHERE id = ? AND deleted_at IS NULL',
      [noteId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [existing[0].contact_id]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const isOwner = contact[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];

    if (content !== undefined) {
      updates.push('content = ?');
      values.push(content);
    }
    if (is_spicy !== undefined) {
      updates.push('is_spicy = ?');
      values.push(is_spicy ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(noteId);
    const query = `UPDATE notes SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [note] = await pool.query(
      'SELECT id, contact_id, content, is_spicy, created_at, updated_at FROM notes WHERE id = ?',
      [noteId]
    );

    res.status(200).json(note[0]);
  } catch (err) {
    console.error('Update note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Soft delete note
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const noteId = parseInt(req.params.id);
    if (isNaN(noteId)) return res.status(400).json({ error: 'Invalid note ID' });

    const [existing] = await pool.query(
      'SELECT contact_id FROM notes WHERE id = ? AND deleted_at IS NULL',
      [noteId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [existing[0].contact_id]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const isOwner = contact[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('UPDATE notes SET deleted_at = NOW() WHERE id = ?', [noteId]);

    res.status(200).json({ success: true, message: 'Note deleted' });
  } catch (err) {
    console.error('Delete note error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
