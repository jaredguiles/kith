import express from 'express';
import bcrypt from 'bcryptjs';
import pool from '../database/connection.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require admin
router.use(requireAdmin);

// GET /api/users - list all users
router.get('/', async (req, res, next) => {
  try {
    const connection = await pool.getConnection();
    const [users] = await connection.execute(
      'SELECT id, username, email, display_name, role, is_active, last_login_at, created_at FROM users ORDER BY created_at ASC'
    );
    connection.release();
    res.json({ success: true, data: users });
  } catch (error) {
    next(error);
  }
});

// POST /api/users - create a new user
router.post('/', async (req, res, next) => {
  try {
    const { username, email, password, display_name, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: 'username, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' });
    }

    const hash = await bcrypt.hash(password, 12);
    const connection = await pool.getConnection();

    try {
      const [result] = await connection.execute(
        'INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)',
        [username, email, hash, display_name || username, role || 'member']
      );

      const [newUser] = await connection.execute(
        'SELECT id, username, email, display_name, role, is_active, created_at FROM users WHERE id = ?',
        [result.insertId]
      );
      connection.release();
      res.status(201).json({ success: true, data: newUser[0] });
    } catch (err) {
      connection.release();
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ success: false, error: 'Username or email already exists' });
      }
      throw err;
    }
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:id - update a user
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { username, email, display_name, role, is_active, password } = req.body;

    const connection = await pool.getConnection();
    const fields = [];
    const values = [];

    if (username !== undefined) { fields.push('username = ?'); values.push(username); }
    if (email !== undefined) { fields.push('email = ?'); values.push(email); }
    if (display_name !== undefined) { fields.push('display_name = ?'); values.push(display_name); }
    if (role !== undefined) { fields.push('role = ?'); values.push(role); }
    if (is_active !== undefined) { fields.push('is_active = ?'); values.push(is_active ? 1 : 0); }
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      fields.push('password_hash = ?');
      values.push(hash);
    }

    if (fields.length === 0) {
      connection.release();
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    values.push(id);
    await connection.execute(`UPDATE users SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);

    const [updated] = await connection.execute(
      'SELECT id, username, email, display_name, role, is_active, last_login_at, created_at FROM users WHERE id = ?',
      [id]
    );
    connection.release();

    if (updated.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: updated[0] });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/users/:id - deactivate user
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Prevent deleting yourself
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    }

    const connection = await pool.getConnection();
    await connection.execute('UPDATE users SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
    connection.release();
    res.json({ success: true, message: 'User deactivated' });
  } catch (error) {
    next(error);
  }
});

export default router;
