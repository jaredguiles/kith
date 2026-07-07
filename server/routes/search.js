'use strict';

// Global search for the command palette: contacts, events, notes, groups.
// Max 8 per category. Ownership + spicy visibility respected — spicy note
// content is NEVER searched or returned when spicy mode is off (spicy note
// bodies are field-encrypted anyway; only non-spicy notes are searchable).

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');

const router = express.Router();
router.use(requireAuth);

const MAX = 8;

// GET /api/search?q=
router.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ error: 'q is required' });
    if (q.length > 200) return res.status(400).json({ error: 'q too long' });

    const admin = isAdmin(req.user);
    const showSpicy = await spicyVisible(req.user);
    const like = `%${q}%`;
    const prefix = `${q}%`;

    // -------- contacts: own + shared-in (any scope shows name/email/phone)
    const contactScope = admin
      ? ''
      : `AND (c.owner_user_id = ? OR EXISTS (
           SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ?))`;
    const contactParams = admin ? [] : [req.user.id, req.user.id];
    const contacts = await query(
      `SELECT c.id, c.display_name, c.photo_url, c.email, c.location, c.occupation
       FROM contacts c
       WHERE c.deleted_at IS NULL
         AND (c.display_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?
              OR c.nickname LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)
         ${contactScope}
       ORDER BY (c.display_name LIKE ?) DESC, c.display_name ASC
       LIMIT ${MAX}`,
      [like, prefix, prefix, prefix, prefix, prefix, ...contactParams, prefix]
    );

    // -------- events: own (admin: all), spicy filtered
    const evScope = admin ? '' : 'AND e.owner_user_id = ?';
    const evParams = admin ? [] : [req.user.id];
    const events = await query(
      `SELECT e.id, e.title, e.starts_at
       FROM events e
       WHERE e.deleted_at IS NULL ${showSpicy ? '' : 'AND e.is_spicy = 0'}
         AND (e.title LIKE ? OR e.location LIKE ?)
         ${evScope}
       ORDER BY e.starts_at DESC
       LIMIT ${MAX}`,
      [like, like, ...evParams]
    );

    // -------- notes: non-spicy only (spicy bodies are encrypted + hidden),
    // on contacts the user owns (admin: all). Shared-in notes stay private.
    const noteScope = admin ? '' : 'AND c.owner_user_id = ?';
    const noteParams = admin ? [] : [req.user.id];
    const noteRows = await query(
      `SELECT n.id, n.contact_id, n.content, c.display_name AS contact_name
       FROM notes n
       JOIN contacts c ON c.id = n.contact_id AND c.deleted_at IS NULL
       WHERE n.deleted_at IS NULL AND n.is_spicy = 0
         AND n.content LIKE ?
         ${noteScope}
       ORDER BY n.created_at DESC
       LIMIT ${MAX}`,
      [like, ...noteParams]
    );
    const notes = noteRows.map((n) => {
      const content = String(n.content || '');
      const idx = content.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, idx - 40);
      const snippet = (start > 0 ? '…' : '') + content.slice(start, start + 120) + (content.length > start + 120 ? '…' : '');
      return { id: n.id, contact_id: n.contact_id, contact_name: n.contact_name, snippet };
    });

    // -------- groups: system + own (admin: all)
    const groupScope = admin ? '' : 'AND (g.is_system = 1 OR g.owner_user_id IS NULL OR g.owner_user_id = ?)';
    const groupParams = admin ? [] : [req.user.id];
    const groups = await query(
      `SELECT g.id, g.name FROM \`groups\` g
       WHERE g.name LIKE ? ${groupScope}
       ORDER BY g.name ASC LIMIT ${MAX}`,
      [like, ...groupParams]
    );

    res.json({
      contacts: contacts.map((c) => ({
        id: c.id,
        display_name: c.display_name,
        photo_url: c.photo_url,
        subtitle: c.email || c.occupation || c.location || null,
      })),
      events,
      notes,
      groups,
    });
  } catch (err) { next(err); }
});

module.exports = router;
