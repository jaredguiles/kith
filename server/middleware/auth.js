'use strict';

// Auth middleware: JWT verification (httpOnly cookie preferred, Bearer fallback),
// role gates, forced-password-change gate, and a basic in-memory login throttle.

const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const { query } = require('../database/connection');

const COOKIE_NAME = 'kith_token';
const TOKEN_TTL = '7d'; // O6 default
const PAT_PREFIX = 'kith_'; // personal access tokens (api_tokens table)

// Whether the app is reached over TLS. The auth cookie's `Secure` flag must
// match: a Secure cookie is NOT sent by browsers over plain HTTP, so on an
// HTTP-only deployment (e.g. a LAN/IP demo with no TLS proxy) marking it
// Secure silently breaks the whole session — the SPA loads unauthenticated,
// avatars/media 401, and the map/data never populate. Defaults to true under
// NODE_ENV=production (prod sits behind a TLS reverse proxy); set BEHIND_TLS=false for
// HTTP-only deployments so the cookie is actually sent back.
const BEHIND_TLS = process.env.BEHIND_TLS != null
  ? !/^(0|false|no)$/i.test(String(process.env.BEHIND_TLS).trim())
  : process.env.NODE_ENV === 'production';

function signToken(user) {
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role, tv: user.token_version ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/**
 * Short-lived intermediate token issued after a valid password when TOTP is
 * enabled. requireAuth REJECTS tokens carrying `purpose` — this can only be
 * exchanged at POST /api/auth/login/totp.
 */
function signPendingTotpToken(user) {
  return jwt.sign(
    { sub: user.id, purpose: 'totp', tv: user.token_version ?? 0 },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
}

function setAuthCookie(res, token) {
  // httpOnly + SameSite=Strict (§7.14). `Secure` only when actually behind TLS
  // (BEHIND_TLS) — a Secure cookie isn't sent over plain HTTP, which would
  // break sessions on an HTTP-only deployment.
  const secure = BEHIND_TLS;
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${7 * 24 * 3600}${secure ? '; Secure' : ''}`
  );
}

function clearAuthCookie(res) {
  const secure = BEHIND_TLS;
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure ? '; Secure' : ''}`);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function extractToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  if (cookies[COOKIE_NAME]) return cookies[COOKIE_NAME];
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ---------------------------------------------------------------------------
// Personal access tokens (api_tokens): 'kith_' + 40 hex. Stored as sha256 hex.
// ---------------------------------------------------------------------------

const PAT_LAST_USED_THROTTLE_MS = 60 * 1000;
const patLastUsedWrites = new Map(); // token id → last write ts (in-memory throttle)

/**
 * Authenticate a raw 'kith_…' token string against api_tokens.
 * Returns { user, scopes, tokenRow } or null. Updates last_used_at at most
 * once per 60s per token (fire-and-forget).
 */
async function authenticateApiToken(rawToken) {
  if (typeof rawToken !== 'string' || !rawToken.startsWith(PAT_PREFIX)) return null;
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const rows = await query(
    `SELECT * FROM api_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW())`,
    [hash]
  );
  if (rows.length === 0) return null;
  const tokenRow = rows[0];

  const users = await query(
    'SELECT id, username, email, display_name, role, is_active, must_change_password, token_version FROM users WHERE id = ?',
    [tokenRow.user_id]
  );
  if (users.length === 0 || !users[0].is_active) return null;

  // last_used_at update — throttled (once/60s per token), fire-and-forget
  const now = Date.now();
  const last = patLastUsedWrites.get(tokenRow.id) || 0;
  if (now - last > PAT_LAST_USED_THROTTLE_MS) {
    patLastUsedWrites.set(tokenRow.id, now);
    query('UPDATE api_tokens SET last_used_at = NOW() WHERE id = ?', [tokenRow.id])
      .catch((err) => console.error('[pat] last_used_at update failed:', err.message));
  }

  return { user: users[0], scopes: tokenRow.scopes || 'read', tokenRow };
}

/**
 * requireAuth — verifies JWT, loads the user fresh from DB (deactivated users
 * rejected immediately §7.6), enforces the forced-password-change gate.
 * Also accepts personal access tokens (Bearer kith_…) with scope enforcement.
 */
async function requireAuth(req, res, next) {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    // --- Personal access token path (Bearer kith_…) ---
    if (token.startsWith(PAT_PREFIX)) {
      const auth = await authenticateApiToken(token);
      if (!auth) return res.status(401).json({ error: 'Invalid or expired token' });
      const fullPath = (req.originalUrl || '').split('?')[0];
      const isReadMethod = req.method === 'GET' || req.method === 'HEAD';
      // PATs never operate on the auth surface (password change, TOTP, …)
      // except reading identity via GET /api/auth/me.
      if (fullPath.startsWith('/api/auth') && !(isReadMethod && fullPath === '/api/auth/me')) {
        return res.status(403).json({ error: 'API tokens cannot access auth endpoints' });
      }
      if (auth.scopes !== 'read_write' && !isReadMethod) {
        return res.status(403).json({ error: 'This API token is read-only' });
      }
      req.user = auth.user;
      req.tokenScopes = auth.scopes;
      req.authMethod = 'api_token';
      return next();
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }
    // Intermediate tokens (TOTP pending etc.) are NOT sessions.
    if (payload.purpose) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const rows = await query(
      'SELECT id, username, email, display_name, role, is_active, must_change_password, token_version FROM users WHERE id = ?',
      [payload.sub]
    );
    if (rows.length === 0 || !rows[0].is_active) {
      return res.status(401).json({ error: 'Account is not active' });
    }
    // Token-version invalidation: password changes / admin resets bump
    // token_version, killing all previously issued tokens.
    if ((payload.tv ?? 0) !== (rows[0].token_version ?? 0)) {
      return res.status(401).json({ error: 'Session expired — please sign in again' });
    }
    req.user = rows[0];

    // Forced first-login password change (§7.15): block everything except
    // password change, identity check, and logout. A banner is not sufficient.
    if (req.user.must_change_password) {
      // req.path is router-relative; use originalUrl (query-stripped) for the check.
      const fullPath = (req.originalUrl || '').split('?')[0];
      const allowed =
        (req.method === 'PUT' && fullPath === '/api/auth/password') ||
        (req.method === 'GET' && fullPath === '/api/auth/me') ||
        (req.method === 'POST' && fullPath === '/api/auth/logout');
      if (!allowed) {
        return res.status(403).json({ error: 'Password change required', code: 'MUST_CHANGE_PASSWORD' });
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** requireAdmin — main_admin or admin only. */
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'main_admin' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function isAdmin(user) {
  return user.role === 'main_admin' || user.role === 'admin';
}

/**
 * Resolve access to a contact for the current user.
 * Returns { contact, access: 'owner'|'admin'|'shared', share } or null.
 * Excludes soft-deleted contacts unless includeDeleted.
 */
async function contactAccess(user, contactId, { includeDeleted = false } = {}) {
  const rows = await query('SELECT * FROM contacts WHERE id = ?', [contactId]);
  if (rows.length === 0) return null;
  const contact = rows[0];
  if (contact.deleted_at && !includeDeleted) return null;

  if (contact.owner_user_id === user.id) return { contact, access: 'owner', share: null };
  if (isAdmin(user)) return { contact, access: 'admin', share: null };

  const shares = await query(
    'SELECT * FROM shared_contacts WHERE contact_id = ? AND shared_with_user_id = ?',
    [contactId, user.id]
  );
  if (shares.length > 0) return { contact, access: 'shared', share: shares[0] };
  return null;
}

/**
 * requireContactAccess(paramName, { edit }) — middleware factory. Attaches
 * req.contact / req.contactAccess / req.contactShare. 404 (not 403) on no
 * access so existence isn't leaked.
 */
function requireContactAccess(paramName = 'id', { edit = false } = {}) {
  return async (req, res, next) => {
    try {
      const id = Number(req.params[paramName]);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid contact id' });
      const found = await contactAccess(req.user, id);
      if (!found) return res.status(404).json({ error: 'Contact not found' });
      if (edit && found.access === 'shared' && found.share.permissions !== 'edit') {
        return res.status(403).json({ error: 'Read-only access to this contact' });
      }
      req.contact = found.contact;
      req.contactAccess = found.access;
      req.contactShare = found.share;
      next();
    } catch (err) {
      next(err);
    }
  };
}

// ---------------------------------------------------------------------------
// In-memory login throttle (§7.7): per-IP+username, 5 failures → 15 min lockout.
// ---------------------------------------------------------------------------
const loginAttempts = new Map(); // key → { count, firstAt, lockedUntil }
const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;

function throttleKey(req, username) {
  // Normalize: trim + lowercase so 'admin ' / 'ADMIN' share one budget
  // (DB lookup uses a PAD SPACE collation, so 'admin ' matches 'admin').
  return `${req.ip}|${String(username || '').trim().toLowerCase()}`;
}

function checkThrottle(req, username) {
  const entry = loginAttempts.get(throttleKey(req, username));
  if (!entry) return { blocked: false };
  if (entry.lockedUntil && Date.now() < entry.lockedUntil) {
    return { blocked: true, retryAfterSec: Math.ceil((entry.lockedUntil - Date.now()) / 1000) };
  }
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    loginAttempts.delete(throttleKey(req, username));
  }
  return { blocked: false };
}

function recordFailure(req, username) {
  const key = throttleKey(req, username);
  const now = Date.now();
  const entry = loginAttempts.get(key) || { count: 0, firstAt: now, lockedUntil: 0 };
  if (now - entry.firstAt > WINDOW_MS) {
    entry.count = 0;
    entry.firstAt = now;
    entry.lockedUntil = 0;
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) entry.lockedUntil = now + WINDOW_MS;
  loginAttempts.set(key, entry);
}

function recordSuccess(req, username) {
  loginAttempts.delete(throttleKey(req, username));
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireContactAccess,
  contactAccess,
  isAdmin,
  signToken,
  signPendingTotpToken,
  setAuthCookie,
  clearAuthCookie,
  checkThrottle,
  recordFailure,
  recordSuccess,
  authenticateApiToken,
  COOKIE_NAME,
  PAT_PREFIX,
};
