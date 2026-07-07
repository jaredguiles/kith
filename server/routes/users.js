'use strict';

// Admin-only user CRUD. DELETE deactivates (soft) — main_admin cannot be
// deactivated or demoted by anyone but themselves is also disallowed (single
// seeded main_admin stays).

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();

// All routes require auth; admin gate is applied per-route below so that
// /directory stays available to regular users (sharing flow username→id).
router.use(requireAuth);

// GET /api/users/directory — ANY authenticated user. Active users only,
// minimal fields (no email, no password_hash).
router.get('/directory', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, username, display_name FROM users WHERE is_active = 1 ORDER BY display_name, username'
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// Everything below is admin-only.
router.use(requireAdmin);

// GET /api/users
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      'SELECT id, username, email, display_name, role, is_active, must_change_password, created_at FROM users ORDER BY id'
    );
    res.json({ users: rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/users
router.post('/', async (req, res, next) => {
  try {
    const { username, email, display_name, password, role } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email and password are required' });
    }
    if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const newRole = role === 'admin' ? 'admin' : 'user'; // main_admin can never be created
    if (role === 'admin' && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the main admin can create admins' });
    }
    const dupes = await query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (dupes.length > 0) return res.status(409).json({ error: 'Username or email already in use' });

    const hash = await bcrypt.hash(password, 10);
    let result;
    try {
      result = await query(
        `INSERT INTO users (username, email, display_name, password_hash, role, is_active, must_change_password)
         VALUES (?, ?, ?, ?, ?, 1, 1)`,
        [username, email, display_name || username, hash, newRole]
      );
    } catch (err) {
      // Check-then-insert race: unique key on username/email wins.
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Username or email already in use' });
      }
      throw err;
    }
    await query('INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?)', [
      result.insertId, 'spicy_visible', JSON.stringify(false), 'boolean',
    ]);
    auditWrite(req.user.id, null, 'create', 'user', result.insertId, null, { username, email, role: newRole }, `Created user ${username}`);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const target = rows[0];

    if (target.role === 'main_admin' && req.user.id !== target.id) {
      return res.status(403).json({ error: 'The main admin can only be edited by themselves' });
    }

    const { email, display_name, role, is_active, password } = req.body || {};
    const updates = [];
    const params = [];

    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (display_name !== undefined) { updates.push('display_name = ?'); params.push(display_name); }
    if (role !== undefined && target.role !== 'main_admin') {
      if (req.user.role !== 'main_admin') return res.status(403).json({ error: 'Only the main admin can change roles' });
      if (!['admin', 'user'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
      updates.push('role = ?'); params.push(role);
    }
    if (is_active !== undefined && target.role !== 'main_admin') {
      updates.push('is_active = ?'); params.push(is_active ? 1 : 0);
      // Deactivation kills existing sessions immediately.
      if (!is_active) updates.push('token_version = token_version + 1');
    }
    if (password) {
      if (String(password).length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      updates.push('password_hash = ?'); params.push(await bcrypt.hash(password, 10));
      updates.push('must_change_password = 1');
      // Admin password reset invalidates the user's existing tokens.
      updates.push('token_version = token_version + 1');
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(id);
    await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    // Audit only whitelisted, non-secret fields — NEVER the plaintext password.
    const audited = {
      ...(email !== undefined && { email }),
      ...(display_name !== undefined && { display_name }),
      ...(role !== undefined && { role }),
      ...(is_active !== undefined && { is_active: Boolean(is_active) }),
      password_changed: Boolean(password),
    };
    auditWrite(req.user.id, null, 'update', 'user', id, null, audited, `Updated user ${target.username}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/users/:id — deactivate
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
    if (rows[0].role === 'main_admin') return res.status(403).json({ error: 'The main admin cannot be deactivated' });
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate yourself' });

    await query('UPDATE users SET is_active = 0, token_version = token_version + 1 WHERE id = ?', [id]);
    auditWrite(req.user.id, null, 'delete', 'user', id, null, null, `Deactivated user ${rows[0].username}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
