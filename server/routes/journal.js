'use strict';

// Journal: reverse-chronological merged feed across ALL accessible contacts —
// timeline_events + notes + completed events. Spicy rows excluded unless
// spicy mode is active; spicy content decrypted when included.
// Mounted at /api/journal.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');
const { decryptField } = require('../lib/crypto');

const router = express.Router();
router.use(requireAuth);

const SNIPPET_LEN = 280;

function snippet(text) {
  if (text === null || text === undefined) return null;
  const s = String(text);
  return s.length > SNIPPET_LEN ? s.slice(0, SNIPPET_LEN) + '…' : s;
}

// GET /api/journal?page=&limit=
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;

    const showSpicy = await spicyVisible(req.user);
    const admin = isAdmin(req.user);

    // accessible contacts: own + shared-in; basic-scope shares don't expose
    // notes/timeline (mirrors the timeline route's scope gate)
    const contactScope = admin
      ? 'c.deleted_at IS NULL'
      : `c.deleted_at IS NULL AND (c.owner_user_id = ? OR EXISTS (
           SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id
             AND sc.shared_with_user_id = ? AND sc.share_scope != 'basic'))`;
    const scopeParams = admin ? [] : [req.user.id, req.user.id];
    // spicy from shared-in contacts only with full_spicy scope
    const spicySql = showSpicy
      ? (admin ? '' : `AND (x_is_spicy = 0 OR c.owner_user_id = ? OR EXISTS (
           SELECT 1 FROM shared_contacts sc2 WHERE sc2.contact_id = c.id
             AND sc2.shared_with_user_id = ? AND sc2.share_scope = 'full_spicy'))`)
      : 'AND x_is_spicy = 0';
    const spicyParams = showSpicy && !admin ? [req.user.id, req.user.id] : [];

    // UNION of the three kinds, then paginate the merged set in SQL.
    const unionSql = `
      SELECT merged.* FROM (
        SELECT 'timeline' AS kind, tl.id, tl.contact_id, tl.type AS sub_type,
               tl.title, tl.description AS content, tl.is_spicy AS x_is_spicy,
               COALESCE(tl.occurred_at, tl.created_at) AS occurred_at,
               c.display_name, c.photo_url, c.owner_user_id
        FROM timeline_events tl JOIN contacts c ON c.id = tl.contact_id
        WHERE tl.deleted_at IS NULL AND ${contactScope}
        UNION ALL
        SELECT 'note' AS kind, n.id, n.contact_id, 'note' AS sub_type,
               NULL AS title, n.content, n.is_spicy AS x_is_spicy,
               n.created_at AS occurred_at,
               c.display_name, c.photo_url, c.owner_user_id
        FROM notes n JOIN contacts c ON c.id = n.contact_id
        WHERE n.deleted_at IS NULL AND ${contactScope}
        UNION ALL
        SELECT 'event' AS kind, e.id, ec.contact_id, e.type AS sub_type,
               e.title, e.description AS content, e.is_spicy AS x_is_spicy,
               COALESCE(e.starts_at, e.created_at) AS occurred_at,
               c.display_name, c.photo_url, c.owner_user_id
        FROM events e
        JOIN event_contacts ec ON ec.event_id = e.id
        JOIN contacts c ON c.id = ec.contact_id
        WHERE e.deleted_at IS NULL AND e.status = 'completed' AND ${contactScope}
      ) merged
      JOIN contacts c ON c.id = merged.contact_id
      WHERE 1=1 ${spicySql}`;

    const unionParams = [...scopeParams, ...scopeParams, ...scopeParams, ...spicyParams];

    const [rows, totals] = await Promise.all([
      query(
        `${unionSql} ORDER BY occurred_at DESC, kind, id DESC LIMIT ${limit} OFFSET ${offset}`,
        unionParams
      ),
      query(`SELECT COUNT(*) AS total FROM (${unionSql}) t`, unionParams),
    ]);

    const entries = rows.map((r) => {
      const isSpicy = Boolean(r.x_is_spicy);
      // spicy timeline entries + notes are field-encrypted (events are not)
      const title = isSpicy && (r.kind === 'timeline' || r.kind === 'note') ? decryptField(r.title) : r.title;
      const content = isSpicy && (r.kind === 'timeline' || r.kind === 'note') ? decryptField(r.content) : r.content;
      return {
        kind: r.kind,
        id: r.id,
        type: r.sub_type,
        contact: { id: r.contact_id, display_name: r.display_name, photo_url: r.photo_url },
        title,
        content: snippet(content),
        occurred_at: r.occurred_at,
        is_spicy: isSpicy,
      };
    });

    res.json({ entries, total: totals[0].total, page, limit });
  } catch (err) { next(err); }
});

module.exports = router;
