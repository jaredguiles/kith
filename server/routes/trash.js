'use strict';

// Trash: soft-deleted contacts / events / media within the 30-day retention
// window, restore, hard purge, and the purgeExpiredTrash() sweeper (wired to
// a daily interval in index.js).

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';
const RETENTION_DAYS = 30;

/** Resolve a stored relative path inside MEDIA_PATH, guarding traversal. */
function resolveMediaPath(relPath) {
  if (!relPath) return null;
  const abs = path.resolve(MEDIA_PATH, relPath);
  const root = path.resolve(MEDIA_PATH);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

async function unlinkMediaFiles(media) {
  for (const rel of [media.file_path, media.thumbnail_path]) {
    const abs = resolveMediaPath(rel);
    if (!abs) continue;
    try {
      await fs.promises.unlink(abs);
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('[trash] unlink failed:', err.message);
    }
  }
}

// ------------------------------------------------------------------- list
// GET /api/trash → { contacts: [...], events: [...], media: [...] }
router.get('/', async (req, res, next) => {
  try {
    const admin = isAdmin(req.user);
    const scope = admin ? '' : 'AND owner_user_id = ?';
    const params = admin ? [] : [req.user.id];

    const [contacts, events, media] = await Promise.all([
      query(
        `SELECT id, display_name, deleted_at FROM contacts
         WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL ${RETENTION_DAYS} DAY ${scope}
         ORDER BY deleted_at DESC LIMIT 500`, params),
      query(
        `SELECT id, title, starts_at, deleted_at FROM events
         WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL ${RETENTION_DAYS} DAY ${scope}
         ORDER BY deleted_at DESC LIMIT 500`, params),
      query(
        `SELECT id, type, caption, contact_id, deleted_at FROM media_assets
         WHERE deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL ${RETENTION_DAYS} DAY ${scope}
         ORDER BY deleted_at DESC LIMIT 500`, params),
    ]);

    res.json({
      contacts,
      events,
      media: media.map((m) => ({ id: m.id, type: m.type, caption: m.caption, contact_id: m.contact_id, deleted_at: m.deleted_at })),
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- helpers
const TYPES = {
  contact: { table: 'contacts', entity: 'contact', label: (r) => r.display_name },
  event: { table: 'events', entity: 'event', label: (r) => r.title },
  media: { table: 'media_assets', entity: 'media', label: (r) => r.file_path && path.basename(r.file_path) },
};

async function loadTrashed(req, res) {
  const { type, id } = req.body || {};
  if (!TYPES[type]) {
    res.status(400).json({ error: "type must be 'contact', 'event' or 'media'" });
    return null;
  }
  const numId = Number(id);
  if (!Number.isInteger(numId) || numId <= 0) {
    res.status(400).json({ error: 'id must be a positive integer' });
    return null;
  }
  const t = TYPES[type];
  const rows = await query(`SELECT * FROM \`${t.table}\` WHERE id = ? AND deleted_at IS NOT NULL`, [numId]);
  if (rows.length === 0) {
    res.status(404).json({ error: 'Not found in trash' });
    return null;
  }
  const row = rows[0];
  if (row.owner_user_id !== req.user.id && !isAdmin(req.user)) {
    res.status(404).json({ error: 'Not found in trash' }); // don't leak existence
    return null;
  }
  return { ...t, type, row };
}

// ---------------------------------------------------------------- restore
// POST /api/trash/restore { type: 'contact'|'event'|'media', id }
router.post('/restore', async (req, res, next) => {
  try {
    const found = await loadTrashed(req, res);
    if (!found) return;
    await query(`UPDATE \`${found.table}\` SET deleted_at = NULL WHERE id = ?`, [found.row.id]);
    auditWrite(req.user.id, found.type === 'contact' ? found.row.id : found.row.contact_id ?? null,
      'restore', found.entity, found.row.id, null, null,
      `Restored ${found.entity} ${found.label(found.row) || found.row.id} from trash`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------------ purge
// DELETE /api/trash/purge { type, id } — hard delete (media: unlink files)
router.delete('/purge', async (req, res, next) => {
  try {
    const found = await loadTrashed(req, res);
    if (!found) return;
    if (found.type === 'media') await unlinkMediaFiles(found.row);
    await query(`DELETE FROM \`${found.table}\` WHERE id = ?`, [found.row.id]);
    auditWrite(req.user.id, found.type === 'contact' ? found.row.id : found.row.contact_id ?? null,
      'purge', found.entity, found.row.id, null, null,
      `Permanently deleted ${found.entity} ${found.label(found.row) || found.row.id}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// purgeExpiredTrash — hard-delete rows soft-deleted > 30 days ago.
// The other agent wires this to a daily interval in index.js. Never throws.
// ---------------------------------------------------------------------------
async function purgeExpiredTrash() {
  try {
    // media first: unlink blobs before rows disappear
    const media = await query(
      `SELECT id, file_path, thumbnail_path FROM media_assets
       WHERE deleted_at IS NOT NULL AND deleted_at <= NOW() - INTERVAL ${RETENTION_DAYS} DAY LIMIT 1000`
    );
    for (const m of media) {
      await unlinkMediaFiles(m);
      await query('DELETE FROM media_assets WHERE id = ?', [m.id]);
    }
    const events = await query(
      `DELETE FROM events WHERE deleted_at IS NOT NULL AND deleted_at <= NOW() - INTERVAL ${RETENTION_DAYS} DAY`
    );
    const contacts = await query(
      `DELETE FROM contacts WHERE deleted_at IS NOT NULL AND deleted_at <= NOW() - INTERVAL ${RETENTION_DAYS} DAY`
    );
    const total = media.length + (events.affectedRows || 0) + (contacts.affectedRows || 0);
    if (total > 0) console.log(`[trash] purged ${total} expired item(s)`);
  } catch (err) {
    console.error('[trash] purge sweep failed:', err.message);
  }
}

module.exports = router;
module.exports.purgeExpiredTrash = purgeExpiredTrash;
