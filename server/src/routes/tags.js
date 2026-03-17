import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/tags - List all tags with contact count
router.get('/', async (req, res, next) => {
  try {
    const connection = await pool.getConnection();

    const [tags] = await connection.execute(
      `SELECT t.*, COUNT(ct.contact_id) as contactCount
       FROM tags t
       LEFT JOIN contact_tags ct ON t.id = ct.tag_id
       GROUP BY t.id
       ORDER BY t.name ASC`
    );

    connection.release();

    res.json({
      success: true,
      data: tags,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/tags - Create tag
router.post('/', async (req, res, next) => {
  try {
    const { name, color } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO tags (name, color, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [name, color || '#cccccc']
    );

    const [[tag]] = await connection.execute(
      'SELECT * FROM tags WHERE id = ?',
      [result.insertId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      data: tag,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/tags/:id - Update tag
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, color } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE tags SET
       name = COALESCE(?, name),
       color = COALESCE(?, color),
       updated_at = NOW()
       WHERE id = ?`,
      [name, color, id]
    );

    const [[tag]] = await connection.execute(
      'SELECT * FROM tags WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: tag,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/tags/:id - Delete tag and associations
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    // Delete associations
    await connection.execute(
      'DELETE FROM contact_tags WHERE tag_id = ?',
      [id]
    );

    // Delete tag
    await connection.execute(
      'DELETE FROM tags WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts/:id/tags - Add tag to contact
router.post('/contacts/:id/tags', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tag_id } = req.body;

    if (!tag_id) {
      return res.status(400).json({ success: false, error: 'tag_id is required' });
    }

    const connection = await pool.getConnection();

    // Check if already tagged
    const [existing] = await connection.execute(
      'SELECT id FROM contact_tags WHERE contact_id = ? AND tag_id = ?',
      [id, tag_id]
    );

    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Contact already has this tag' });
    }

    await connection.execute(
      'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)',
      [id, tag_id]
    );

    connection.release();

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/contacts/:id/tags/:tagId - Remove tag from contact
router.delete('/contacts/:id/tags/:tagId', async (req, res, next) => {
  try {
    const { id, tagId } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?',
      [id, tagId]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
