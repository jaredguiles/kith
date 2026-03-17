import express from 'express';
import pool from '../database/connection.js';

const router = express.Router();

// GET /api/groups - List all groups with member count
router.get('/', async (req, res, next) => {
  try {
    const connection = await pool.getConnection();

    const [groups] = await connection.execute(
      `SELECT g.*, COUNT(gm.contact_id) as memberCount
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.deleted_at IS NULL
       GROUP BY g.id
       ORDER BY g.name ASC`
    );

    connection.release();

    res.json({
      success: true,
      data: groups,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/groups - Create group
router.post('/', async (req, res, next) => {
  try {
    const { name, description } = req.body;

    if (!name) {
      return res.status(400).json({ success: false, error: 'name is required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO groups (name, description, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [name, description || null]
    );

    const [[group]] = await connection.execute(
      'SELECT * FROM groups WHERE id = ?',
      [result.insertId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      data: group,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/groups/:id - Update group
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE groups SET
       name = COALESCE(?, name),
       description = COALESCE(?, description),
       updated_at = NOW()
       WHERE id = ?`,
      [name, description, id]
    );

    const [[group]] = await connection.execute(
      'SELECT * FROM groups WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: group,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/groups/:id - Soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE groups SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/groups/:id/members - List contacts in group
router.get('/:id/members', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    const [members] = await connection.execute(
      `SELECT c.* FROM contacts c
       INNER JOIN group_members gm ON c.id = gm.contact_id
       WHERE gm.group_id = ? AND c.deleted_at IS NULL
       ORDER BY c.display_name ASC`,
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: members,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/groups/:id/members - Add contact to group
router.post('/:id/members', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { contact_id } = req.body;

    if (!contact_id) {
      return res.status(400).json({ success: false, error: 'contact_id is required' });
    }

    const connection = await pool.getConnection();

    // Check if already in group
    const [existing] = await connection.execute(
      'SELECT id FROM group_members WHERE group_id = ? AND contact_id = ?',
      [id, contact_id]
    );

    if (existing.length > 0) {
      connection.release();
      return res.status(400).json({ success: false, error: 'Contact already in group' });
    }

    await connection.execute(
      'INSERT INTO group_members (group_id, contact_id) VALUES (?, ?)',
      [id, contact_id]
    );

    connection.release();

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/groups/:id/members/:contactId - Remove from group
router.delete('/:id/members/:contactId', async (req, res, next) => {
  try {
    const { id, contactId } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'DELETE FROM group_members WHERE group_id = ? AND contact_id = ?',
      [id, contactId]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
