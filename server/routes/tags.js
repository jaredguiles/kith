const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireAdmin, isAdminRole } = require('../middleware/auth');

// GET /api/tags - List all tags (system tags + user's own)
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, color, owner_user_id, created_at
       FROM tags
       WHERE owner_user_id IS NULL OR owner_user_id = ?
       ORDER BY name ASC`,
      [req.user.id]
    );

    res.json(rows);
  } catch (err) {
    console.error('Get tags error:', err);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// POST /api/tags - Create tag
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Tag name is required' });
    }

    const [result] = await pool.query(
      'INSERT INTO tags (name, color, owner_user_id) VALUES (?, ?, ?)',
      [name, color || null, req.user.id]
    );

    const [tag] = await pool.query(
      'SELECT id, name, color, owner_user_id, created_at FROM tags WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(tag[0]);
  } catch (err) {
    console.error('Create tag error:', err);
    res.status(500).json({ error: 'Failed to create tag' });
  }
});

// PUT /api/tags/:id - Update tag
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const tagId = req.params.id;
    const { name, color } = req.body;

    // Get tag to check ownership
    const [tag] = await pool.query(
      'SELECT owner_user_id FROM tags WHERE id = ?',
      [tagId]
    );

    if (!tag || tag.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Check ownership/admin
    if (tag[0].owner_user_id !== null && tag[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(color);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(tagId);
    const query = `UPDATE tags SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      'SELECT id, name, color, owner_user_id, created_at FROM tags WHERE id = ?',
      [tagId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update tag error:', err);
    res.status(500).json({ error: 'Failed to update tag' });
  }
});

// DELETE /api/tags/:id - Delete tag
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const tagId = req.params.id;

    // Get tag to check ownership and system status
    const [tag] = await pool.query(
      'SELECT owner_user_id FROM tags WHERE id = ?',
      [tagId]
    );

    if (!tag || tag.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Cannot delete system tags
    if (tag[0].owner_user_id === null && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Cannot delete system tags' });
    }

    // Check ownership/admin
    if (tag[0].owner_user_id !== null && tag[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM tags WHERE id = ?', [tagId]);

    res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error('Delete tag error:', err);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// POST /api/tags/:tagId/contacts/:contactId - Link tag to contact
router.post('/:tagId/contacts/:contactId', requireAuth, async (req, res) => {
  try {
    const tagId = req.params.tagId;
    const contactId = req.params.contactId;

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

    // Verify tag exists
    const [tag] = await pool.query('SELECT id FROM tags WHERE id = ?', [tagId]);
    if (!tag || tag.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Insert or ignore duplicate
    await pool.query(
      'INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)',
      [contactId, tagId]
    );

    res.status(201).json({ message: 'Tag linked to contact' });
  } catch (err) {
    console.error('Link tag error:', err);
    res.status(500).json({ error: 'Failed to link tag' });
  }
});

// DELETE /api/tags/:tagId/contacts/:contactId - Unlink tag from contact
router.delete('/:tagId/contacts/:contactId', requireAuth, async (req, res) => {
  try {
    const tagId = req.params.tagId;
    const contactId = req.params.contactId;

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

    await pool.query(
      'DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?',
      [contactId, tagId]
    );

    res.json({ message: 'Tag unlinked from contact' });
  } catch (err) {
    console.error('Unlink tag error:', err);
    res.status(500).json({ error: 'Failed to unlink tag' });
  }
});

module.exports = router;
