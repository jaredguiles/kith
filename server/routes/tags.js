const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireContactAccess } = require('../middleware/auth');

/**
 * GET /
 * List all tags (system tags + user's own)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, color, owner_user_id, created_at FROM tags WHERE owner_user_id IS NULL OR owner_user_id = ? ORDER BY name',
      [req.user.id]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error('List tags error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create new tag
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const [result] = await pool.query(
      'INSERT INTO tags (name, color, owner_user_id) VALUES (?, ?, ?)',
      [name, color || '#808080', req.user.id]
    );

    const [tag] = await pool.query(
      'SELECT id, name, color, owner_user_id, created_at FROM tags WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(tag[0]);
  } catch (err) {
    console.error('Create tag error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update tag
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);
    if (isNaN(tagId)) return res.status(400).json({ error: 'Invalid tag ID' });

    const { name, color } = req.body;

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM tags WHERE id = ?',
      [tagId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    if (existing[0].owner_user_id && existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(tagId);
    const query = `UPDATE tags SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [tag] = await pool.query(
      'SELECT id, name, color, owner_user_id, created_at FROM tags WHERE id = ?',
      [tagId]
    );

    res.status(200).json(tag[0]);
  } catch (err) {
    console.error('Update tag error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Delete tag
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);
    if (isNaN(tagId)) return res.status(400).json({ error: 'Invalid tag ID' });

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM tags WHERE id = ?',
      [tagId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    if (existing[0].owner_user_id && existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM contact_tags WHERE tag_id = ?', [tagId]);
    await pool.query('DELETE FROM tags WHERE id = ?', [tagId]);

    res.status(200).json({ success: true, message: 'Tag deleted' });
  } catch (err) {
    console.error('Delete tag error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /contacts/:id/tags/:tagId
 * Add tag to contact
 */
router.post('/contacts/:id/tags/:tagId', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    if (isNaN(contactId) || isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid contact or tag ID' });
    }

    const [tag] = await pool.query('SELECT id FROM tags WHERE id = ?', [tagId]);
    if (tag.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    try {
      await pool.query(
        'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)',
        [contactId, tagId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Tag already applied to contact' });
      }
      throw err;
    }

    res.status(201).json({ success: true, message: 'Tag added to contact' });
  } catch (err) {
    console.error('Add tag to contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /contacts/:id/tags/:tagId
 * Remove tag from contact
 */
router.delete('/contacts/:id/tags/:tagId', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const tagId = parseInt(req.params.tagId);

    if (isNaN(contactId) || isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid contact or tag ID' });
    }

    await pool.query(
      'DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?',
      [contactId, tagId]
    );

    res.status(200).json({ success: true, message: 'Tag removed from contact' });
  } catch (err) {
    console.error('Remove tag from contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
