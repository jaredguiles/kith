const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * GET /
 * List all users (admin only)
 */
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, username, email, display_name, role, is_active, created_at, updated_at FROM users ORDER BY created_at DESC'
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create new user (admin only)
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, email, display_name, password, role } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const validRoles = ['user', 'admin', 'main_admin'];
    const userRole = validRoles.includes(role) ? role : 'user';

    const hash = await bcrypt.hash(password, 12);

    const [result] = await pool.query(
      'INSERT INTO users (username, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, display_name || username, hash, userRole]
    );

    const [newUser] = await pool.query(
      'SELECT id, username, email, display_name, role, is_active, created_at FROM users WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(newUser[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    console.error('Create user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update user (admin only)
 */
router.put('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

    const { email, display_name, role, is_active } = req.body;

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const validRoles = ['user', 'admin', 'main_admin'];
    const updates = [];
    const values = [];

    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(display_name);
    }
    if (role !== undefined && validRoles.includes(role)) {
      updates.push('role = ?');
      values.push(role);
    }
    if (is_active !== undefined) {
      updates.push('is_active = ?');
      values.push(is_active ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(userId);
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [updated] = await pool.query(
      'SELECT id, username, email, display_name, role, is_active, created_at, updated_at FROM users WHERE id = ?',
      [userId]
    );

    res.status(200).json(updated[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Deactivate user (soft delete via is_active flag)
 */
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: 'Invalid user ID' });

    const [existing] = await pool.query(
      'SELECT id FROM users WHERE id = ?',
      [userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query(
      'UPDATE users SET is_active = 0 WHERE id = ?',
      [userId]
    );

    res.status(200).json({ success: true, message: 'User deactivated' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
