'use strict';

// Journal: the app user's personal diary (journal_entries) — free-form
// entries, reflections, travels, dreams, memories; optionally linked to an
// event and optionally located (geocoded via lib/geo → geo_cache).
// GET /timeline additionally serves the merged "life feed": own journal
// entries + own events (one row per event, participants aggregated), used by
// the Timeline page (list + map modes). Mounted at /api/journal.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth } = require('../middleware/auth');
const { spicyVisible } = require('./contacts');
const { encryptField, decryptField } = require('../lib/crypto');
const { geocode, queryHash } = require('../lib/geo');
const { auditWrite } = require('../lib/audit');
const { isValidDate } = require('../lib/contacts');

const router = express.Router();
router.use(requireAuth);

const KINDS = ['entry', 'reflection', 'travel', 'dream', 'memory'];
const SNIPPET_LEN = 280;

function snippet(text) {
  if (text === null || text === undefined) return null;
  const s = String(text);
  return s.length > SNIPPET_LEN ? s.slice(0, SNIPPET_LEN) + '…' : s;
}

function num(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Load an entry owned by the requester (a diary is never shared — admins
// included). Spicy entries 404 unless spicy mode is visible.
async function loadEntry(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid entry id' });
    const rows = await query(
      'SELECT * FROM journal_entries WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length || rows[0].owner_user_id !== req.user.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    if (rows[0].is_spicy && !(await spicyVisible(req.user))) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    req.entry = rows[0];
    next();
  } catch (err) { next(err); }
}

// Validate an event link: must exist, not deleted, and be owned by the user.
async function checkEventLink(user, eventId) {
  const id = Number(eventId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const rows = await query(
    'SELECT id FROM events WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL',
    [id, user.id]);
  return rows.length ? id : null;
}

// ------------------------------------------------------------------- list
// GET /api/journal?page=&limit=&kind=
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const showSpicy = await spicyVisible(req.user);

    const where = ['j.owner_user_id = ?', 'j.deleted_at IS NULL'];
    const params = [req.user.id];
    if (!showSpicy) where.push('j.is_spicy = 0');
    if (req.query.kind && KINDS.includes(req.query.kind)) {
      where.push('j.kind = ?');
      params.push(req.query.kind);
    }

    const [rows, totals] = await Promise.all([
      query(
        `SELECT j.*, e.title AS event_title,
                (e.is_spicy = 0 OR ${showSpicy ? 'TRUE' : 'FALSE'}) AS event_visible
         FROM journal_entries j
         LEFT JOIN events e ON e.id = j.event_id AND e.deleted_at IS NULL
         WHERE ${where.join(' AND ')}
         ORDER BY COALESCE(j.occurred_at, j.created_at) DESC, j.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
      query(`SELECT COUNT(*) AS total FROM journal_entries j WHERE ${where.join(' AND ')}`, params),
    ]);

    const entries = rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.is_spicy ? decryptField(r.title) : r.title,
      content: r.is_spicy ? decryptField(r.content) : r.content,
      location: r.location,
      latitude: num(r.latitude),
      longitude: num(r.longitude),
      event_id: r.event_id,
      event: r.event_id && r.event_title != null && r.event_visible
        ? { id: r.event_id, title: r.event_title } : null,
      is_spicy: Boolean(r.is_spicy),
      occurred_at: r.occurred_at || r.created_at,
      created_at: r.created_at,
    }));

    res.json({ entries, total: totals[0].total, page, limit });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------------- create
// POST /api/journal { kind, title, content, location, event_id, is_spicy, occurred_at }
router.post('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const kind = KINDS.includes(b.kind) ? b.kind : 'entry';
    const title = b.title != null && String(b.title).trim() ? String(b.title).trim() : null;
    const content = b.content != null && String(b.content).trim() ? String(b.content).trim() : null;
    const location = b.location != null && String(b.location).trim() ? String(b.location).trim().slice(0, 255) : null;

    if (!content && !(kind === 'travel' && location)) {
      return res.status(400).json({ error: 'Content is required' });
    }
    if (b.occurred_at != null && b.occurred_at !== '' && !isValidDate(b.occurred_at)) {
      return res.status(400).json({ error: 'Invalid occurred_at date' });
    }

    let eventId = null;
    if (b.event_id != null && b.event_id !== '') {
      eventId = await checkEventLink(req.user, b.event_id);
      if (!eventId) return res.status(400).json({ error: 'Invalid event_id' });
    }

    let spicyFlag = b.is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;

    // geocode never throws — misses are cached, entry saves without a pin
    let lat = null, lng = null;
    if (location) {
      const g = await geocode(location);
      if (g) { lat = g.lat; lng = g.lng; }
    }

    // spicy entries are field-encrypted like notes/timeline (§7.E Layer C)
    const storedTitle = spicyFlag && title ? encryptField(title) : title;
    const storedContent = spicyFlag && content ? encryptField(content) : content;

    const result = await query(
      `INSERT INTO journal_entries
         (owner_user_id, kind, title, content, location, latitude, longitude, event_id, is_spicy, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [req.user.id, kind, storedTitle, storedContent, location, lat, lng,
       eventId, spicyFlag, b.occurred_at || null]
    );
    auditWrite(req.user.id, null, 'create', 'journal_entry', result.insertId,
      null, { kind, is_spicy: spicyFlag }, 'Added journal entry');
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------------- update
// PUT /api/journal/:id — merge-with-existing so partial bodies stay valid
router.put('/:id', loadEntry, async (req, res, next) => {
  try {
    const b = req.body || {};
    const cur = req.entry;
    const wasSpicy = Boolean(cur.is_spicy);

    const kind = 'kind' in b ? (KINDS.includes(b.kind) ? b.kind : cur.kind) : cur.kind;
    const curTitle = wasSpicy ? decryptField(cur.title) : cur.title;
    const curContent = wasSpicy ? decryptField(cur.content) : cur.content;
    const title = 'title' in b
      ? (b.title != null && String(b.title).trim() ? String(b.title).trim() : null)
      : curTitle;
    const content = 'content' in b
      ? (b.content != null && String(b.content).trim() ? String(b.content).trim() : null)
      : curContent;
    const location = 'location' in b
      ? (b.location != null && String(b.location).trim() ? String(b.location).trim().slice(0, 255) : null)
      : cur.location;

    if (!content && !(kind === 'travel' && location)) {
      return res.status(400).json({ error: 'Content is required' });
    }

    let occurredAt = cur.occurred_at;
    if ('occurred_at' in b) {
      if (b.occurred_at != null && b.occurred_at !== '' && !isValidDate(b.occurred_at)) {
        return res.status(400).json({ error: 'Invalid occurred_at date' });
      }
      occurredAt = b.occurred_at || null;
    }

    let eventId = cur.event_id;
    if ('event_id' in b) {
      if (b.event_id == null || b.event_id === '') {
        eventId = null;
      } else {
        eventId = await checkEventLink(req.user, b.event_id);
        if (!eventId) return res.status(400).json({ error: 'Invalid event_id' });
      }
    }

    let spicyFlag = wasSpicy ? 1 : 0;
    if ('is_spicy' in b) {
      spicyFlag = b.is_spicy ? 1 : 0;
      if (spicyFlag && !wasSpicy && !(await spicyVisible(req.user))) spicyFlag = 0;
    }

    // re-geocode only when the location text actually changed
    let lat = num(cur.latitude), lng = num(cur.longitude);
    if ((location || null) !== (cur.location || null)) {
      lat = null; lng = null;
      if (location) {
        const g = await geocode(location);
        if (g) { lat = g.lat; lng = g.lng; }
      }
    }

    const storedTitle = spicyFlag && title ? encryptField(title) : title;
    const storedContent = spicyFlag && content ? encryptField(content) : content;

    await query(
      `UPDATE journal_entries SET kind = ?, title = ?, content = ?, location = ?,
         latitude = ?, longitude = ?, event_id = ?, is_spicy = ?,
         occurred_at = COALESCE(?, occurred_at)
       WHERE id = ?`,
      [kind, storedTitle, storedContent, location, lat, lng, eventId, spicyFlag,
       occurredAt, cur.id]
    );
    auditWrite(req.user.id, null, 'update', 'journal_entry', cur.id,
      { kind: cur.kind }, { kind, is_spicy: spicyFlag }, 'Updated journal entry');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------------- delete
// DELETE /api/journal/:id — soft
router.delete('/:id', loadEntry, async (req, res, next) => {
  try {
    await query('UPDATE journal_entries SET deleted_at = NOW() WHERE id = ?', [req.entry.id]);
    auditWrite(req.user.id, null, 'delete', 'journal_entry', req.entry.id,
      { kind: req.entry.kind }, null, 'Deleted journal entry');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// --------------------------------------------------------------- timeline
// GET /api/journal/timeline?page=&limit=&kind=&sub=&located=1
// Merged life feed: own journal entries + own events (one row per event,
// participants aggregated). Journal rows carry event_id so the client can
// collapse an event already narrated by a diary entry.
router.get('/timeline', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const offset = (page - 1) * limit;
    const showSpicy = await spicyVisible(req.user);

    const jSpicy = showSpicy ? '' : 'AND j.is_spicy = 0';
    const eSpicy = showSpicy ? '' : 'AND e.is_spicy = 0';

    const unionSql = `
      SELECT * FROM (
        SELECT 'journal' AS kind, j.id, j.kind AS sub, j.title, j.content,
               j.location, j.latitude, j.longitude, j.is_spicy AS x_spicy,
               COALESCE(j.occurred_at, j.created_at) AS occurred_at,
               j.event_id, NULL AS with_names, NULL AS with_ids
        FROM journal_entries j
        WHERE j.owner_user_id = ? AND j.deleted_at IS NULL ${jSpicy}
        UNION ALL
        SELECT 'event' AS kind, e.id, e.type AS sub, e.title, e.description AS content,
               e.location, NULL AS latitude, NULL AS longitude, e.is_spicy AS x_spicy,
               COALESCE(e.starts_at, e.created_at) AS occurred_at,
               NULL AS event_id, agg.with_names, agg.with_ids
        FROM events e
        LEFT JOIN (
          SELECT ec.event_id,
                 GROUP_CONCAT(c.display_name SEPARATOR ', ') AS with_names,
                 GROUP_CONCAT(c.id) AS with_ids
          FROM event_contacts ec
          JOIN contacts c ON c.id = ec.contact_id AND c.deleted_at IS NULL
          GROUP BY ec.event_id
        ) agg ON agg.event_id = e.id
        WHERE e.owner_user_id = ? AND e.deleted_at IS NULL ${eSpicy}
      ) merged`;
    const unionParams = [req.user.id, req.user.id];

    const outer = [];
    const outerParams = [];
    if (req.query.kind === 'journal' || req.query.kind === 'event') {
      outer.push('merged.kind = ?');
      outerParams.push(req.query.kind);
    }
    if (req.query.sub && String(req.query.sub).length <= 30) {
      outer.push('merged.sub = ?');
      outerParams.push(String(req.query.sub));
    }
    if (req.query.located === '1') {
      outer.push(`((merged.latitude IS NOT NULL AND merged.longitude IS NOT NULL)
                   OR (merged.location IS NOT NULL AND merged.location != ''))`);
    }
    const whereSql = outer.length ? `WHERE ${outer.join(' AND ')}` : '';
    const allParams = [...unionParams, ...outerParams];

    const [rows, totals] = await Promise.all([
      query(
        `${unionSql} ${whereSql} ORDER BY occurred_at DESC, kind, id DESC LIMIT ${limit} OFFSET ${offset}`,
        allParams
      ),
      query(`SELECT COUNT(*) AS total FROM (${unionSql} ${whereSql}) t`, allParams),
    ]);

    // Lazily resolve coords for event rows with a location string but no pin,
    // through geo_cache exactly like routes/geo.js: one batch cache read by
    // queryHash, then capped fresh geocode() calls (which cache hits+misses).
    const pending = rows.filter((r) =>
      r.kind === 'event' && r.location && (r.latitude == null || r.longitude == null));
    if (pending.length) {
      const cacheByHash = new Map();
      const hashes = [...new Set(pending.map((r) => queryHash(r.location)))];
      const ph = hashes.map(() => '?').join(',');
      const cachedRows = await query(
        `SELECT query_hash, latitude, longitude, label, source FROM geo_cache WHERE query_hash IN (${ph})`,
        hashes
      );
      for (const c of cachedRows) cacheByHash.set(c.query_hash, c);

      let lookups = 0;
      const MAX_LOOKUPS = 100;
      for (const r of pending) {
        const cached = cacheByHash.get(queryHash(r.location));
        if (cached) {
          if (cached.latitude == null) continue; // cached miss
          r.latitude = Number(cached.latitude);
          r.longitude = Number(cached.longitude);
        } else {
          if (lookups >= MAX_LOOKUPS) continue;
          lookups++;
          const g = await geocode(r.location); // computes + caches (hit or miss)
          if (g) { r.latitude = g.lat; r.longitude = g.lng; }
        }
      }
    }

    const entries = rows.map((r) => {
      const isSpicy = Boolean(r.x_spicy);
      // spicy journal rows are field-encrypted; events are not
      const title = isSpicy && r.kind === 'journal' ? decryptField(r.title) : r.title;
      const content = isSpicy && r.kind === 'journal' ? decryptField(r.content) : r.content;
      return {
        kind: r.kind,
        id: r.id,
        sub: r.sub,
        title,
        content: snippet(content),
        location: r.location,
        latitude: num(r.latitude),
        longitude: num(r.longitude),
        occurred_at: r.occurred_at,
        event_id: r.event_id,
        with_names: r.with_names || null,
        with_ids: r.with_ids || null,
        is_spicy: isSpicy,
      };
    });

    res.json({ entries, total: totals[0].total, page, limit });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------- single entry
// GET /api/journal/:id — one entry, owner-scoped + spicy-filtered (loadEntry).
// Registered AFTER /timeline so the literal path can't be shadowed by :id.
router.get('/:id', loadEntry, async (req, res, next) => {
  try {
    const r = req.entry;
    let event = null;
    if (r.event_id) {
      const showSpicy = await spicyVisible(req.user);
      const evRows = await query(
        `SELECT id, title, is_spicy FROM events WHERE id = ? AND deleted_at IS NULL ${showSpicy ? '' : 'AND is_spicy = 0'}`,
        [r.event_id]);
      if (evRows.length) event = { id: evRows[0].id, title: evRows[0].title };
    }
    res.json({
      entry: {
        id: r.id,
        kind: r.kind,
        title: r.is_spicy ? decryptField(r.title) : r.title,
        content: r.is_spicy ? decryptField(r.content) : r.content,
        location: r.location,
        latitude: num(r.latitude),
        longitude: num(r.longitude),
        event_id: r.event_id,
        event,
        is_spicy: Boolean(r.is_spicy),
        occurred_at: r.occurred_at || r.created_at,
        created_at: r.created_at,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
