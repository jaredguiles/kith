'use strict';

// Personal API tokens (PATs): 'kith_' + 40 hex chars, stored as sha256 hex.
// Full token shown ONCE at creation. Scope 'read' (GET only) or 'read_write'.
// Mounted at /api/tokens. Middleware acceptance lives in middleware/auth.js.

const express = require('express');
const crypto = require('node:crypto');
const { query } = require('../database/connection');
const { requireAuth, PAT_PREFIX } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const SCOPES = ['read', 'read_write'];
const MAX_EXPIRES_DAYS = 3650;

// Managing tokens with a token would let a leaked read_write PAT mint more —
// session-auth only for this router.
router.use((req, res, next) => {
  if (req.authMethod === 'api_token') {
    return res.status(403).json({ error: 'API tokens cannot manage API tokens' });
  }
  next();
});

// POST /api/tokens — { name, scopes: 'read'|'read_write', expires_days? }
router.post('/', async (req, res, next) => {
  try {
    const { name, scopes, expires_days } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Name is required' });
    const scope = scopes === undefined ? 'read' : scopes;
    if (!SCOPES.includes(scope)) return res.status(400).json({ error: `scopes must be one of: ${SCOPES.join(', ')}` });

    let expiresAt = null;
    if (expires_days !== undefined && expires_days !== null && expires_days !== '') {
      const days = Number(expires_days);
      if (!Number.isInteger(days) || days <= 0 || days > MAX_EXPIRES_DAYS) {
        return res.status(400).json({ error: `expires_days must be an integer between 1 and ${MAX_EXPIRES_DAYS}` });
      }
      expiresAt = new Date(Date.now() + days * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    }

    const token = PAT_PREFIX + crypto.randomBytes(20).toString('hex'); // kith_ + 40 hex
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const prefix = token.slice(0, 12);

    const result = await query(
      'INSERT INTO api_tokens (user_id, name, token_hash, prefix, scopes, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, String(name).trim().slice(0, 100), hash, prefix, scope, expiresAt]
    );
    auditWrite(req.user.id, null, 'create', 'api_token', result.insertId, null,
      { name: String(name).trim(), scopes: scope, prefix }, 'Created API token');

    // Full token returned exactly ONCE. Never stored, never logged.
    res.status(201).json({
      token,
      id: result.insertId,
      name: String(name).trim().slice(0, 100),
      prefix,
      scopes: scope,
      expires_at: expiresAt,
    });
  } catch (err) { next(err); }
});

// GET /api/tokens — own tokens, no hashes
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, name, prefix, scopes, last_used_at, expires_at, revoked_at, created_at
       FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ tokens: rows });
  } catch (err) { next(err); }
});

// DELETE /api/tokens/:id — revoke (soft)
router.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Token not found' });
    const rows = await query('SELECT * FROM api_tokens WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Token not found' });
    if (rows[0].revoked_at) return res.status(400).json({ error: 'Token is already revoked' });
    await query('UPDATE api_tokens SET revoked_at = NOW() WHERE id = ?', [id]);
    auditWrite(req.user.id, null, 'delete', 'api_token', id, { name: rows[0].name, prefix: rows[0].prefix }, null, 'Revoked API token');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
