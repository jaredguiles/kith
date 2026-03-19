import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const tags = await query(
      'SELECT id, name, color, owner_user_id, created_at FROM tags WHERE owner_user_id = ? OR owner_user_id IS NULL ORDER BY name ASC',
      [req.user.id]
    );

    for (const tag of tags) {
      const usageCount = await query('SELECT COUNT(*) as count FROM contact_tags WHERE tag_id = ?', [tag.id]);
      tag.usage_count = usageCount[0].count;
    }

    res.json({ tags });
  } catch (err) {
    console.error('List tags error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const result = await query('INSERT INTO tags (name, color, owner_user_id) VALUES (?, ?, ?)', [
      name,
      color,
      req.user.id,
    ]);

    res.status(201).json({
      id: result.insertId,
      name,
      color,
      owner_user_id: req.user.id,
      usage_count: 0,
    });
  } catch (err) {
    console.error('Create tag error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);

    const tags = await query('SELECT * FROM tags WHERE id = ?', [tagId]);

    if (tags.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const tag = tags[0];

    if (tag.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, color } = req.body;

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

    await query(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedTags = await query('SELECT * FROM tags WHERE id = ?', [tagId]);
    const updatedTag = updatedTags[0];

    res.json({ tag: updatedTag });
  } catch (err) {
    console.error('Update tag error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const tagId = parseInt(req.params.id);

    const tags = await query('SELECT * FROM tags WHERE id = ?', [tagId]);

    if (tags.length === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const tag = tags[0];

    if (tag.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM contact_tags WHERE tag_id = ?', [tagId]);
    await query('DELETE FROM tags WHERE id = ?', [tagId]);

    res.json({ message: 'Tag deleted' });
  } catch (err) {
    console.error('Delete tag error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
