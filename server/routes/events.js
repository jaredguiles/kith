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
const contactsLib = require('../lib/contacts');
const { isValidDate, touchContact } = contactsLib;
const { decryptField } = require('../lib/crypto');
const { geocode } = require('../lib/geo');
const { parseGeoLabel } = require('../lib/places');

const router = express.Router();
router.use(requireAuth);

const EVENT_TYPES = ['meetup', 'date', 'hangout', 'hookup', 'party', 'trip', 'call', 'dinner', 'coffee', 'workout', 'other'];

const MAX_EVENT_LOCATIONS = 20;

/** Normalize a `locations` request field (array of strings or {label}) into
 * trimmed labels, capped. Returns null when the field is absent/invalid. */
function normalizeLocationLabels(locations) {
  if (!Array.isArray(locations)) return null;
  return locations
    .map((l) => (typeof l === 'string' ? l : (l && l.label)))
    .map((s) => String(s || '').trim().slice(0, 255))
    .filter(Boolean)
    .slice(0, MAX_EVENT_LOCATIONS);
}

/** Replace an event's extra locations (event_locations) with `labels`.
 * Each label is geocoded (lib/geo — cached, never throws) and its
 * city/state/country metadata parsed from the geocoder label so the Places
 * tab can derive visited states/countries without re-geocoding. */
async function saveEventLocations(eventId, labels) {
  await query('DELETE FROM event_locations WHERE event_id = ?', [eventId]);
  let position = 0;
  for (const label of labels) {
    const g = await geocode(label);
    const meta = parseGeoLabel(g ? g.label : label);
    await query(
      `INSERT INTO event_locations
         (event_id, label, latitude, longitude, city, state, state_code, country_code, geocode_source, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [eventId, label, g ? g.lat : null, g ? g.lng : null, meta.city, meta.state,
       meta.state_code, meta.country_code, g ? g.source : null, position]
    );
    position++;
  }
}

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
      const cid = Number(contact_id);
      if (!Number.isInteger(cid) || cid <= 0) return res.status(400).json({ error: 'Invalid contact_id' });
      where.push('EXISTS (SELECT 1 FROM event_contacts ec WHERE ec.event_id = e.id AND ec.contact_id = ?)');
      params.push(cid);
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
      `SELECT m.id, m.type, m.thumbnail_path, m.immich_instance_id, m.caption, m.is_spicy FROM event_media em
       JOIN media_assets m ON m.id = em.media_id AND m.deleted_at IS NULL WHERE em.event_id = ?
       ${(await spicyVisible(req.user)) ? '' : 'AND m.is_spicy = 0'}`,
      [req.event.id]
    );
    const locations = await query(
      `SELECT id, label, latitude, longitude, city, state, state_code, country_code, position
       FROM event_locations WHERE event_id = ? ORDER BY position, id`,
      [req.event.id]
    );
    res.json({
      event: req.event,
      contacts,
      locations,
      // never expose fs paths — mirror the media list route shape
      media: media.map((m) => ({
        id: m.id, type: m.type,
        caption: m.is_spicy ? decryptField(m.caption) : m.caption,
        is_spicy: m.is_spicy,
        has_thumbnail: Boolean(m.thumbnail_path) || Boolean(m.immich_instance_id),
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/events
router.post('/', async (req, res, next) => {
  try {
    const { title, type, description, location, starts_at, ends_at, status, is_spicy, contact_ids, locations } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (!starts_at) return res.status(400).json({ error: 'Start date is required' });
    if (!isValidDate(starts_at)) return res.status(400).json({ error: 'Invalid start date' });
    if (ends_at != null && ends_at !== '' && !isValidDate(ends_at)) return res.status(400).json({ error: 'Invalid end date' });

    const cids = [...new Set((contact_ids || []).map(Number))];
    if (cids.some((c) => !Number.isInteger(c) || c <= 0)) return res.status(400).json({ error: 'Invalid contact id in contact_ids' });

    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;

    const result = await withTransaction(async (conn) => {
      const [r] = await conn.execute(
        `INSERT INTO events (owner_user_id, title, type, description, location, is_spicy, starts_at, ends_at, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req.user.id, String(title).trim(), EVENT_TYPES.includes(type) ? type : 'other',
         description || null, location || null, spicyFlag, starts_at, ends_at || null,
         ['upcoming', 'completed', 'cancelled'].includes(status) ? status : 'upcoming']
      );
      const eventId = r.insertId;
      for (const cid of cids) {
        const found = await contactAccess(req.user, cid);
        if (found) await conn.execute('INSERT IGNORE INTO event_contacts (event_id, contact_id) VALUES (?, ?)', [eventId, cid]);
      }
      return eventId;
    });
    // extra locations (roadtrip stops) — additive to the primary `location`
    const extraLabels = normalizeLocationLabels(locations);
    if (extraLabels && extraLabels.length) await saveEventLocations(result, extraLabels);
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
    if ('starts_at' in b) {
      if (b.starts_at && !isValidDate(b.starts_at)) return res.status(400).json({ error: 'Invalid start date' });
      set('starts_at', b.starts_at || null);
    }
    if ('ends_at' in b) {
      if (b.ends_at && !isValidDate(b.ends_at)) return res.status(400).json({ error: 'Invalid end date' });
      set('ends_at', b.ends_at || null);
    }
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
      if (wanted.some((c) => !Number.isInteger(c) || c <= 0)) return res.status(400).json({ error: 'Invalid contact id in contact_ids' });
      const current = (await query('SELECT contact_id FROM event_contacts WHERE event_id = ?', [req.event.id])).map((r) => r.contact_id);
      for (const cid of wanted.filter((c) => !current.includes(c))) {
        const found = await contactAccess(req.user, cid);
        if (found) await query('INSERT IGNORE INTO event_contacts (event_id, contact_id) VALUES (?, ?)', [req.event.id, cid]);
      }
      for (const cid of current.filter((c) => !wanted.includes(c))) {
        await query('DELETE FROM event_contacts WHERE event_id = ? AND contact_id = ?', [req.event.id, cid]);
      }
    }

    // extra locations: full replace when the field is present (like contact_ids)
    const extraLabels = normalizeLocationLabels(b.locations);
    if (extraLabels !== null) await saveEventLocations(req.event.id, extraLabels);

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

// POST /api/events/:id/complete — mark completed (optional followup_notes/rating),
// touch all linked contacts with the event's starts_at (keep-in-touch tracking)
router.post('/:id/complete', loadEvent, async (req, res, next) => {
  try {
    const b = req.body || {};
    const updates = ["status = 'completed'"];
    const params = [];
    if ('followup_notes' in b) { updates.push('followup_notes = ?'); params.push(b.followup_notes || null); }
    if ('rating' in b) { updates.push('rating = ?'); params.push(b.rating == null ? null : Math.max(1, Math.min(5, Number(b.rating) || 1))); }
    params.push(req.event.id);
    await query(`UPDATE events SET ${updates.join(', ')} WHERE id = ?`, params);

    const linked = await query('SELECT contact_id FROM event_contacts WHERE event_id = ?', [req.event.id]);
    for (const row of linked) touchContact(row.contact_id, req.event.starts_at || undefined);

    auditWrite(req.user.id, null, 'update', 'event', req.event.id, { status: req.event.status },
      { status: 'completed' }, `Completed event ${req.event.title}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/events/:id/locations { label } — add one stop without a full
// event PUT (which replace-alls). Geocoded like saveEventLocations; appended
// at the next position.
router.post('/:id/locations', loadEvent, async (req, res, next) => {
  try {
    const labels = normalizeLocationLabels([req.body?.label ?? req.body?.location]);
    if (!labels || !labels.length) return res.status(400).json({ error: 'label is required' });
    const label = labels[0];
    const countRows = await query(
      'SELECT COUNT(*) AS c, COALESCE(MAX(position), -1) AS maxpos FROM event_locations WHERE event_id = ?',
      [req.event.id]
    );
    if (countRows[0].c >= MAX_EVENT_LOCATIONS) {
      return res.status(400).json({ error: `An event can have at most ${MAX_EVENT_LOCATIONS} locations` });
    }
    const g = await geocode(label); // cached, never throws
    const meta = parseGeoLabel(g ? g.label : label);
    const result = await query(
      `INSERT INTO event_locations
         (event_id, label, latitude, longitude, city, state, state_code, country_code, geocode_source, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.event.id, label, g ? g.lat : null, g ? g.lng : null, meta.city, meta.state,
       meta.state_code, meta.country_code, g ? g.source : null, Number(countRows[0].maxpos) + 1]
    );
    auditWrite(req.user.id, null, 'update', 'event', req.event.id, null, { added_location: label },
      `Added location to event ${req.event.title}`);
    res.status(201).json({ id: result.insertId, latitude: g ? g.lat : null, longitude: g ? g.lng : null });
  } catch (err) { next(err); }
});

// DELETE /api/events/:id/locations/:locId — remove one stop
router.delete('/:id/locations/:locId', loadEvent, async (req, res, next) => {
  try {
    const locId = Number(req.params.locId);
    if (!Number.isInteger(locId) || locId <= 0) return res.status(404).json({ error: 'Location not found' });
    const result = await query('DELETE FROM event_locations WHERE id = ? AND event_id = ?', [locId, req.event.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Location not found' });
    auditWrite(req.user.id, null, 'update', 'event', req.event.id, { removed_location_id: locId }, null,
      `Removed location from event ${req.event.title}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST/DELETE /api/events/:id/media/:mediaId — link/unlink
router.post('/:id/media/:mediaId', loadEvent, async (req, res, next) => {
  try {
    const mediaId = Number(req.params.mediaId);
    if (!Number.isInteger(mediaId) || mediaId <= 0) return res.status(404).json({ error: 'Media not found' });
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
    const mediaId = Number(req.params.mediaId);
    if (!Number.isInteger(mediaId) || mediaId <= 0) return res.status(404).json({ error: 'Media not found' });
    await query('DELETE FROM event_media WHERE event_id = ? AND media_id = ?', [req.event.id, mediaId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.EVENT_TYPES = EVENT_TYPES;
