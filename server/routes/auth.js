'use strict';

// Auth routes: login, me, password change, logout.

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');
const {
  requireAuth,
  signToken,
  signPendingTotpToken,
  setAuthCookie,
  clearAuthCookie,
  checkThrottle,
  recordFailure,
  recordSuccess,
} = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { encryptField, decryptField } = require('../lib/crypto');
const { generateSecret, verifyTotp } = require('../lib/totp');

const router = express.Router();

/** Issue a real session (cookie + token + user payload) — shared by login & login/totp. */
function issueSession(res, user) {
  const token = signToken(user);
  setAuthCookie(res, token);
  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      must_change_password: Boolean(user.must_change_password),
    },
  };
}

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
      'SELECT id, username, email, display_name, password_hash, role, is_active, must_change_password, token_version, totp_enabled FROM users WHERE username = ? OR email = ?',
      [username, username]
    );
    const user = rows[0];
    const ok = user && user.is_active && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      recordFailure(req, username);
      // Non-fatal audit of failed attempts (no password logged)
      auditWrite(user ? user.id : null, null, 'login_failed', 'user', user ? user.id : null, null,
        { identifier: String(username).trim().toLowerCase(), ip: req.ip }, 'Failed login attempt');
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    recordSuccess(req, username);

    // TOTP second factor: valid password → intermediate token only, NO session.
    if (user.totp_enabled) {
      return res.json({ totp_required: true, pending_token: signPendingTotpToken(user) });
    }

    auditWrite(user.id, null, 'login', 'user', user.id, null, { ip: req.ip }, `User ${user.username} logged in`);
    res.json(issueSession(res, user));
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login/totp — exchange pending_token + TOTP code for a session
router.post('/login/totp', async (req, res, next) => {
  try {
    const { pending_token, code } = req.body || {};
    if (!pending_token || !code) return res.status(400).json({ error: 'pending_token and code are required' });

    let payload;
    try {
      payload = jwt.verify(pending_token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired login — start over' });
    }
    if (payload.purpose !== 'totp') return res.status(401).json({ error: 'Invalid or expired login — start over' });

    const rows = await query(
      'SELECT id, username, email, display_name, role, is_active, must_change_password, token_version, totp_secret, totp_enabled FROM users WHERE id = ?',
      [payload.sub]
    );
    const user = rows[0];
    if (!user || !user.is_active || !user.totp_enabled || !user.totp_secret) {
      return res.status(401).json({ error: 'Invalid or expired login — start over' });
    }
    if ((payload.tv ?? 0) !== (user.token_version ?? 0)) {
      return res.status(401).json({ error: 'Invalid or expired login — start over' });
    }

    // Failed TOTP attempts share the login throttle, keyed on ip|user id.
    const throttleId = `totp:${user.id}`;
    const throttle = checkThrottle(req, throttleId);
    if (throttle.blocked) {
      return res.status(429).json({ error: `Too many attempts — try again in ${Math.ceil(throttle.retryAfterSec / 60)} min` });
    }

    const secret = decryptField(user.totp_secret);
    if (!verifyTotp(secret, code)) {
      recordFailure(req, throttleId);
      auditWrite(user.id, null, 'login_failed', 'user', user.id, null,
        { ip: req.ip, totp: true }, 'Failed TOTP attempt');
      return res.status(401).json({ error: 'Invalid code' });
    }
    recordSuccess(req, throttleId);
    auditWrite(user.id, null, 'login', 'user', user.id, null, { ip: req.ip, totp: true }, `User ${user.username} logged in (TOTP)`);
    res.json(issueSession(res, user));
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const rows = await query('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        display_name: req.user.display_name,
        role: req.user.role,
        must_change_password: Boolean(req.user.must_change_password),
        totp_enabled: Boolean(rows[0] && rows[0].totp_enabled),
      },
    });
  } catch (err) {
    next(err);
  }
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
    // Bump token_version so all previously issued JWTs are invalidated…
    await query(
      'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1 WHERE id = ?',
      [hash, req.user.id]
    );
    // …then re-issue a fresh token for THIS session so the user stays logged in.
    const fresh = await query('SELECT id, username, role, token_version FROM users WHERE id = ?', [req.user.id]);
    const token = signToken(fresh[0]);
    setAuthCookie(res, token);
    auditWrite(req.user.id, null, 'password_change', 'user', req.user.id, null,
      { password_changed: true }, `User ${req.user.username} changed their password`);
    res.json({ ok: true, token });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// TOTP 2FA management (session-auth'd; PATs are blocked from /api/auth/*)
// ---------------------------------------------------------------------------

// POST /api/auth/totp/setup — generate + store a new (disabled) secret
router.post('/totp/setup', requireAuth, async (req, res, next) => {
  try {
    const rows = await query('SELECT totp_enabled FROM users WHERE id = ?', [req.user.id]);
    if (rows[0] && rows[0].totp_enabled) {
      return res.status(400).json({ error: '2FA is already enabled — disable it first to re-enroll' });
    }
    const secret = generateSecret(20); // base32 of 20 random bytes
    await query('UPDATE users SET totp_secret = ?, totp_enabled = 0 WHERE id = ?', [encryptField(secret), req.user.id]);
    const label = encodeURIComponent(`Kith:${req.user.username}`);
    res.json({
      secret_base32: secret,
      otpauth_url: `otpauth://totp/${label}?secret=${secret}&issuer=Kith`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/totp/enable — verify a code against the stored secret, then flip on
router.post('/totp/enable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Code is required' });
    const rows = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0] || !rows[0].totp_secret) return res.status(400).json({ error: 'Run TOTP setup first' });
    if (rows[0].totp_enabled) return res.status(400).json({ error: '2FA is already enabled' });
    const secret = decryptField(rows[0].totp_secret);
    if (!verifyTotp(secret, code)) return res.status(401).json({ error: 'Invalid code' });
    await query('UPDATE users SET totp_enabled = 1 WHERE id = ?', [req.user.id]);
    auditWrite(req.user.id, null, 'update', 'user', req.user.id, null,
      { totp_enabled: true }, `User ${req.user.username} enabled 2FA`);
    res.json({ ok: true, totp_enabled: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/totp/disable — must present a valid current code
router.post('/totp/disable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Code is required' });
    const rows = await query('SELECT totp_secret, totp_enabled FROM users WHERE id = ?', [req.user.id]);
    if (!rows[0] || !rows[0].totp_enabled || !rows[0].totp_secret) {
      return res.status(400).json({ error: '2FA is not enabled' });
    }
    const secret = decryptField(rows[0].totp_secret);
    if (!verifyTotp(secret, code)) return res.status(401).json({ error: 'Invalid code' });
    await query('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?', [req.user.id]);
    auditWrite(req.user.id, null, 'update', 'user', req.user.id, null,
      { totp_enabled: false }, `User ${req.user.username} disabled 2FA`);
    res.json({ ok: true, totp_enabled: false });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
