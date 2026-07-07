'use strict';

// Events: standalone, owner-scoped, linked to contacts (event_contacts) and
// media (event_media). Spicy events server-filtered. Completed events carry
// followup_notes + rating. Events surface in linked contacts' timelines via
// the timeline route (join), not by duplicating rows.

const express = require('express');
const { query, withTransaction } = require('../database/connection');
const { requireAuth, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { spicyVisible } = require('./contacts');

const router = express.Router();
router.use(requireAuth);

const EVENT_TYPES = ['meetup', 'date', 'hangout', 'hookup', 'party', 'trip', 'call', 'dinner', 'coffee', 'workout', 'other'];

async function loadEvent(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid event id' });
    const rows = await query('SELECT * FROM events WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Event not found' });
    const ev = rows[0];
    if (ev.owner_user_id !== req.user.id && !isAdmin(req.user)) return res.status(404).json({ error: 'Event not found' });
    if (ev.is_spicy && !(await spicyVisible(req.user))) return res.status(404).json({ error: 'Event not found' });
    req.event = ev;
    next();
  } catch (err) { next(err); }
}

// GET /api/events?status=&contact_id=&upcoming=&past=&type=
router.get('/', async (req, res, next) => {
  try {
    const { status, contact_id, upcoming, past, type } = req.query;
    const where = ['e.deleted_at IS NULL'];
    const params = [];

    if (!isAdmin(req.user)) { where.push('e.owner_user_id = ?'); params.push(req.user.id); }
    if (!(await spicyVisible(req.user))) where.push('e.is_spicy = 0');
    if (status && ['upcoming', 'completed', 'cancelled'].includes(status)) { where.push('e.status = ?'); params.push(status); }
    if (type && EVENT_TYPES.includes(type)) { where.push('e.type = ?'); params.push(type); }
    if (upcoming === '1') where.push("e.starts_at >= NOW() AND e.status = 'upcoming'");
    if (past === '1') where.push('(e.starts_at < NOW() OR e.status IN (\'completed\',\'cancelled\'))');
    if (contact_id) {
      where.push('EXISTS (SELECT 1 FROM event_contacts ec WHERE ec.event_id = e.id AND ec.contact_id = ?)');
      params.push(Number(contact_id));
    }

    const rows = await query(
      `SELECT e.* FROM events e WHERE ${where.join(' AND ')} ORDER BY e.starts_at ${past === '1' ? 'DESC' : 'ASC'} LIMIT 500`,
      params
    );

    // linked contacts per event
    const ids = rows.map((r) => r.id);
    let linked = {};
    if (ids.length) {
      const linkRows = await query(
        `SELECT ec.event_id, c.id, c.display_name, c.photo_url, c.orientation
         FROM event_contacts ec JOIN contacts c ON c.id = ec.contact_id AND c.deleted_at IS NULL
         WHERE ec.event_id IN (${ids.map(() => '?').join(',')})`, ids);
      for (const lr of linkRows) (linked[lr.event_id] ||= []).push({ id: lr.id, display_name: lr.display_name, photo_url: lr.photo_url, orientation: lr.orientation });
    }
    res.json({ events: rows.map((r) => ({ ...r, contacts: linked[r.id] || [] })) });
  } catch (err) { next(err); }
});

// GET /api/events/:id
router.get('/:id', loadEvent, async (req, res, next) => {
  try {
    const contacts = await query(
      `SELECT c.id, c.display_name, c.photo_url, c.orientation FROM event_contacts ec
       JOIN contacts c ON c.id = ec.contact_id AND c.deleted_at IS NULL WHERE ec.event_id = ?`,
      [req.event.id]
    );
    const media = await query(
      `SELECT m.id, m.type, m.file_path, m.thumbnail_path, m.caption, m.is_spicy FROM event_media em
       JOIN media_assets m ON m.id = em.media_id AND m.deleted_at IS NULL WHERE em.event_id = ?
       ${(await spicyVisible(req.user)) ? '' : 'AND m.is_spicy = 0'}`,
      [req.event.id]
    );
    res.json({ event: req.event, contacts, media });
  } catch (err) { next(err); }
});

// POST /api/events
router.post('/', async (req, res, next) => {
  try {
    const { title, type, description, location, starts_at, ends_at, status, is_spicy, contact_ids } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });

    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;

    const result = await withTransaction(async (conn) => {
      const [r] = await conn.execute(
        `INSERT INTO events (owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, String(title).trim(), EVENT_TYPES.includes(type) ? type : 'other',
         description || null, location || null, spicyFlag, starts_at || null, ends_at || null,
         ['upcoming', 'completed', 'cancelled'].includes(status) ? status : 'upcoming']
      );
      const eventId = r.insertId;
      for (const cid of [...new Set((contact_ids || []).map(Number))]) {
        const found = await contactAccess(req.user, cid);
        if (found) await conn.execute('INSERT IGNORE INTO event_contacts (event_id, contact_id) VALUES (?, ?)', [eventId, cid]);
      }
      return eventId;
    });
    auditWrite(req.user.id, null, 'create', 'event', result, null, { title }, `Created event ${title}`);
    res.status(201).json({ id: result });
  } catch (err) { next(err); }
});

// PUT /api/events/:id — including followup + rating + contact links
router.put('/:id', loadEvent, async (req, res, next) => {
  try {
    const b = req.body || {};
    const updates = [];
    const params = [];
    const set = (col, val) => { updates.push(`${col} = ?`); params.push(val); };

    if ('title' in b && String(b.title || '').trim()) set('title', String(b.title).trim());
    if ('type' in b) set('type', EVENT_TYPES.includes(b.type) ? b.type : 'other');
    if ('description' in b) set('description', b.description || null);
    if ('location' in b) set('location', b.location || null);
    if ('starts_at' in b) set('starts_at', b.starts_at || null);
    if ('ends_at' in b) set('ends_at', b.ends_at || null);
    if ('status' in b && ['upcoming', 'completed', 'cancelled'].includes(b.status)) set('status', b.status);
    if ('followup_notes' in b) set('followup_notes', b.followup_notes || null);
    if ('rating' in b) set('rating', b.rating == null ? null : Math.max(1, Math.min(5, Number(b.rating) || 1)));
    if ('is_spicy' in b) {
      let flag = b.is_spicy ? 1 : 0;
      if (flag && !(await spicyVisible(req.user))) flag = req.event.is_spicy;
      set('is_spicy', flag);
    }

    if (updates.length) {
      params.push(req.event.id);
      await query(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (Array.isArray(b.contact_ids)) {
      const wanted = [...new Set(b.contact_ids.map(Number))];
      const current = (await query('SELECT contact_id FROM event_contacts WHERE event_id = ?', [req.event.id])).map((r) => r.contact_id);
      for (const cid of wanted.filter((c) => !current.includes(c))) {
        const found = await contactAccess(req.user, cid);
        if (found) await query('INSERT IGNORE INTO event_contacts (event_id, contact_id) VALUES (?, ?)', [req.event.id, cid]);
      }
      for (const cid of current.filter((c) => !wanted.includes(c))) {
        await query('DELETE FROM event_contacts WHERE event_id = ? AND contact_id = ?', [req.event.id, cid]);
      }
    }

    auditWrite(req.user.id, null, 'update', 'event', req.event.id, { title: req.event.title }, b, `Updated event ${req.event.title}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/events/:id — soft
router.delete('/:id', loadEvent, async (req, res, next) => {
  try {
    await query('UPDATE events SET deleted_at = NOW() WHERE id = ?', [req.event.id]);
    auditWrite(req.user.id, null, 'delete', 'event', req.event.id, { title: req.event.title }, null, `Deleted event ${req.event.title}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST/DELETE /api/events/:id/media/:mediaId — link/unlink
router.post('/:id/media/:mediaId', loadEvent, async (req, res, next) => {
  try {
    const mediaId = Number(req.params.mediaId);
    const rows = await query('SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL', [mediaId]);
    if (!rows.length) return res.status(404).json({ error: 'Media not found' });
    const m = rows[0];
    if (m.owner_user_id !== req.user.id && !isAdmin(req.user)) return res.status(404).json({ error: 'Media not found' });
    await query('INSERT IGNORE INTO event_media (event_id, media_id) VALUES (?, ?)', [req.event.id, mediaId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/media/:mediaId', loadEvent, async (req, res, next) => {
  try {
    await query('DELETE FROM event_media WHERE event_id = ? AND media_id = ?', [req.event.id, Number(req.params.mediaId)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.EVENT_TYPES = EVENT_TYPES;
