'use strict';

// Admin-only user CRUD. DELETE deactivates (soft) — main_admin cannot be
// deactivated or demoted by anyone but themselves is also disallowed (single
// seeded main_admin stays).

const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { rebuildSearchIndex } = require('../lib/contacts');

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

// ---------------------------------------------------------------------------
// Self-service endpoints — ANY authenticated user, own row only.
// ---------------------------------------------------------------------------

// Pragmatic email shape check (same leniency as the importer: something@something).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// PUT /api/users/me {display_name?, email?} — update own profile basics.
router.put('/me', async (req, res, next) => {
  try {
    const { display_name, email } = req.body || {};
    const updates = [];
    const params = [];

    if (email !== undefined) {
      const e = String(email || '').trim();
      if (!EMAIL_RE.test(e)) return res.status(400).json({ error: 'Invalid email address' });
      if (e.length > 255) return res.status(400).json({ error: 'Email too long' });
      updates.push('email = ?'); params.push(e);
    }
    if (display_name !== undefined) {
      const d = String(display_name || '').trim();
      if (!d) return res.status(400).json({ error: 'Display name cannot be empty' });
      if (d.length > 100) return res.status(400).json({ error: 'Display name too long (max 100)' });
      updates.push('display_name = ?'); params.push(d);
    }
    if (updates.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(req.user.id);
    try {
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Email already in use' });
      }
      throw err;
    }
    const audited = {
      ...(email !== undefined && { email: String(email).trim() }),
      ...(display_name !== undefined && { display_name: String(display_name).trim() }),
    };
    auditWrite(req.user.id, null, 'update', 'user', req.user.id, null, audited,
      `User ${req.user.username} updated their profile`);
    const rows = await query('SELECT id, username, email, display_name, role FROM users WHERE id = ?', [req.user.id]);
    res.json({ user: rows[0] });
  } catch (err) {
    next(err);
  }
});

/** Load the user's linked self-contact if it exists and is not soft-deleted. */
async function loadSelfContact(userId) {
  const users = await query('SELECT self_contact_id FROM users WHERE id = ?', [userId]);
  const selfId = users[0] && users[0].self_contact_id;
  if (!selfId) return null;
  const contacts = await query('SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL', [selfId]);
  return contacts.length ? contacts[0] : null; // dangling / soft-deleted → null
}

// POST /api/users/me/self-contact — idempotent create-or-return of the user's
// own contact card. A dangling/soft-deleted link is replaced with a fresh one.
router.post('/me/self-contact', async (req, res, next) => {
  try {
    const existing = await loadSelfContact(req.user.id);
    if (existing) return res.json({ contact_id: existing.id, created: false });

    const displayName = req.user.display_name || req.user.username;
    // Naive first/last split on the first space.
    const sp = displayName.indexOf(' ');
    const firstName = sp === -1 ? displayName : displayName.slice(0, sp);
    const lastName = sp === -1 ? null : displayName.slice(sp + 1).trim() || null;

    const result = await query(
      `INSERT INTO contacts (owner_user_id, display_name, first_name, last_name, email)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, displayName, firstName, lastName, req.user.email || null]
    );
    const contactId = result.insertId;
    await query('UPDATE users SET self_contact_id = ? WHERE id = ?', [contactId, req.user.id]);
    await rebuildSearchIndex(contactId);
    auditWrite(req.user.id, contactId, 'create', 'contact', contactId, null,
      { display_name: displayName, self_contact: true },
      `Created self-contact for user ${req.user.username}`);
    res.status(201).json({ contact_id: contactId, created: true });
  } catch (err) {
    next(err);
  }
});

// PUT /api/users/me/self-contact {contact_id} — link an existing own contact
// as the self-contact; contact_id: null clears the link.
router.put('/me/self-contact', async (req, res, next) => {
  try {
    const { contact_id } = req.body || {};
    if (contact_id === null) {
      await query('UPDATE users SET self_contact_id = NULL WHERE id = ?', [req.user.id]);
      auditWrite(req.user.id, null, 'update', 'user', req.user.id, null,
        { self_contact_id: null }, `User ${req.user.username} cleared their self-contact link`);
      return res.json({ ok: true });
    }
    const id = Number(contact_id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'contact_id must be a positive integer or null' });
    }
    // Must be an existing, non-deleted contact OWNED by the user.
    const rows = await query(
      'SELECT id FROM contacts WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL',
      [id, req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

    await query('UPDATE users SET self_contact_id = ? WHERE id = ?', [id, req.user.id]);
    auditWrite(req.user.id, id, 'update', 'user', req.user.id, null,
      { self_contact_id: id }, `User ${req.user.username} linked contact ${id} as their self-contact`);
    res.json({ ok: true });
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
    // Lateral-takeover guard (audit S3): a regular admin must not modify
    // ANOTHER admin's account (password reset would kill their sessions and
    // hand over the account). Only main_admin may edit other admins; a
    // regular admin may still edit non-admin users and themselves.
    if (target.role === 'admin' && target.id !== req.user.id && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the main admin can modify other admin accounts' });
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
    try {
      await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    } catch (err) {
      // duplicate email hits the users.email unique key → 409, not a 500
      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Email already in use' });
      }
      throw err;
    }
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
    if (rows[0].role === 'admin' && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Only the main admin can deactivate admin accounts' });
    }
    if (id === req.user.id) return res.status(400).json({ error: 'You cannot deactivate yourself' });

    await query('UPDATE users SET is_active = 0, token_version = token_version + 1 WHERE id = ?', [id]);
    auditWrite(req.user.id, null, 'delete', 'user', id, null, null, `Deactivated user ${rows[0].username}`);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
