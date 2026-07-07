'use strict';

// Auth routes: login, me, password change, logout.

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const {
  requireAuth,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  checkThrottle,
  recordFailure,
  recordSuccess,
} = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

    const throttle = checkThrottle(req, username);
    if (throttle.blocked) {
      return res.status(429).json({ error: `Too many attempts — try again in ${Math.ceil(throttle.retryAfterSec / 60)} min` });
    }

    const rows = await query(
      'SELECT id, username, email, display_name, password_hash, role, is_active, must_change_password FROM users WHERE username = ? OR email = ?',
      [username, username]
    );
    const user = rows[0];
    const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      recordFailure(req, username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    recordSuccess(req, username);

    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        must_change_password: Boolean(user.must_change_password),
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user.id,
      username: req.user.username,
      email: req.user.email,
      display_name: req.user.display_name,
      role: req.user.role,
      must_change_password: Boolean(req.user.must_change_password),
    },
  });
});

// PUT /api/auth/password
router.put('/password', requireAuth, async (req, res, next) => {
  try {
    const { current_password, new_password } = req.body || {};
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    if (String(new_password).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    if (new_password === 'changeme') {
      return res.status(400).json({ error: 'Pick a different password' });
    }

    const rows = await query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    const ok = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 10);
    await query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

module.exports = router;
