'use strict';

// Timeline, notes, reminders, messages.
// Timeline: per-contact chronological feed aggregating timeline_events rows,
// notes, events (via event_contacts), and message batches. Spicy filtered
// server-side. Spicy note/message content is field-encrypted (§7.E Layer C).

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { spicyVisible } = require('./contacts');
const { encryptField, decryptField } = require('../lib/crypto');
const { geocode, queryHash } = require('../lib/geo');
const { US_STATES, US_STATE_CODES, countryCode, parseGeoLabel } = require('../lib/places');
const contactsLib = require('../lib/contacts');
const { rebuildSearchIndexAsync, isValidDate, touchContact } = contactsLib;

// ------------------------------------------------------------- timeline
const timelineRouter = express.Router();
timelineRouter.use(requireAuth);

// GET /api/timeline?contact_id= — aggregated feed
timelineRouter.get('/', async (req, res, next) => {
  try {
    const contactId = Number(req.query.contact_id);
    if (!contactId) return res.status(400).json({ error: 'contact_id is required' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const showSpicy = (await spicyVisible(req.user)) &&
      (found.access !== 'shared' || found.share.share_scope === 'full_spicy');
    const spicyFilter = showSpicy ? '' : 'AND is_spicy = 0';

    const [manual, notes, events, msgBatches] = await Promise.all([
      query(`SELECT id, 'timeline' AS kind, type, title, description, is_spicy, occurred_at AS at, event_id
             FROM timeline_events WHERE contact_id = ? AND deleted_at IS NULL ${spicyFilter}`, [contactId]),
      query(`SELECT id, 'note' AS kind, 'note' AS type, NULL AS title, content AS description, is_spicy, created_at AS at, NULL AS event_id
             FROM notes WHERE contact_id = ? AND deleted_at IS NULL ${spicyFilter}`, [contactId]),
      query(`SELECT e.id, 'event' AS kind, e.type, e.title, e.description, e.is_spicy, COALESCE(e.starts_at, e.created_at) AS at, e.id AS event_id
             FROM events e JOIN event_contacts ec ON ec.event_id = e.id
             WHERE ec.contact_id = ? AND e.deleted_at IS NULL ${showSpicy ? '' : 'AND e.is_spicy = 0'}`, [contactId]),
      query(`SELECT MIN(id) AS id, 'message_batch' AS kind, platform AS type,
                    CONCAT(COUNT(*), ' messages') AS title, NULL AS description,
                    MAX(is_spicy) AS is_spicy, DATE(sent_at) AS at, NULL AS event_id
             FROM messages WHERE contact_id = ? ${spicyFilter}
             GROUP BY platform, DATE(sent_at)`, [contactId]),
    ]);

    const items = [...manual, ...notes, ...events, ...msgBatches]
      .map((it) => {
        // spicy timeline entries + notes are field-encrypted; decryptField
        // passes legacy plaintext rows through unchanged
        if (it.is_spicy && (it.kind === 'note' || it.kind === 'timeline')) {
          return { ...it, title: decryptField(it.title), description: decryptField(it.description) };
        }
        return it;
      })
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

    res.json({ timeline: items.slice(0, 200) });
  } catch (err) { next(err); }
});

// POST /api/timeline — manual entry
timelineRouter.post('/', async (req, res, next) => {
  try {
    const { contact_id, type, title, description, is_spicy, occurred_at } = req.body || {};
    const cid = Number(contact_id);
    if (!Number.isInteger(cid) || cid <= 0) return res.status(404).json({ error: 'Contact not found' });
    const found = await contactAccess(req.user, cid);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access' });
    }
    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;
    if (occurred_at != null && occurred_at !== '' && !isValidDate(occurred_at)) {
      return res.status(400).json({ error: 'Invalid occurred_at date' });
    }
    // spicy entries are field-encrypted like notes/messages (§7.E Layer C)
    const storedTitle = spicyFlag && title ? encryptField(String(title)) : (title || null);
    const storedDescription = spicyFlag && description ? encryptField(String(description)) : (description || null);
    const result = await query(
      `INSERT INTO timeline_events (contact_id, type, title, description, is_spicy, occurred_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [found.contact.id, type || 'note', storedTitle, storedDescription, spicyFlag, occurred_at || null]
    );
    auditWrite(req.user.id, found.contact.id, 'create', 'timeline_event', result.insertId, null, { type, is_spicy: spicyFlag }, 'Added timeline entry');
    touchContact(found.contact.id, occurred_at || undefined);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/timeline/:id — edit a manual entry (same access rule as DELETE)
timelineRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
    const rows = await query('SELECT * FROM timeline_events WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const entry = rows[0];
    const found = await contactAccess(req.user, entry.contact_id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    if (entry.is_spicy && !(await spicyVisible(req.user))) return res.status(404).json({ error: 'Not found' });

    const b = req.body || {};
    let spicyFlag = entry.is_spicy ? 1 : 0;
    if ('is_spicy' in b) {
      const wanted = b.is_spicy ? 1 : 0;
      if (!wanted || (await spicyVisible(req.user))) spicyFlag = wanted;
    }
    if ('occurred_at' in b && b.occurred_at != null && b.occurred_at !== '' && !isValidDate(b.occurred_at)) {
      return res.status(400).json({ error: 'Invalid occurred_at date' });
    }

    const updates = [];
    const params = [];
    // title/description re-encoded to match the (possibly changed) spicy state
    if ('title' in b || 'is_spicy' in b) {
      const plain = 'title' in b
        ? (b.title != null && b.title !== '' ? String(b.title) : null)
        : (entry.is_spicy ? decryptField(entry.title) : entry.title);
      updates.push('title = ?');
      params.push(spicyFlag && plain ? encryptField(plain) : plain);
    }
    if ('description' in b || 'is_spicy' in b) {
      const plain = 'description' in b
        ? (b.description != null && b.description !== '' ? String(b.description) : null)
        : (entry.is_spicy ? decryptField(entry.description) : entry.description);
      updates.push('description = ?');
      params.push(spicyFlag && plain ? encryptField(plain) : plain);
    }
    if ('is_spicy' in b) { updates.push('is_spicy = ?'); params.push(spicyFlag); }
    if ('type' in b) { updates.push('type = ?'); params.push(b.type || 'note'); }
    if ('occurred_at' in b) { updates.push('occurred_at = COALESCE(?, NOW())'); params.push(b.occurred_at || null); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(entry.id);
    await query(`UPDATE timeline_events SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, entry.contact_id, 'update', 'timeline_event', entry.id,
      { type: entry.type }, { type: 'type' in b ? b.type : entry.type, is_spicy: spicyFlag }, 'Updated timeline entry');
    if ('occurred_at' in b) touchContact(entry.contact_id, b.occurred_at || undefined);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/timeline/:id — soft (manual entries only)
timelineRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Not found' });
    const rows = await query('SELECT * FROM timeline_events WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const found = await contactAccess(req.user, rows[0].contact_id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    await query('UPDATE timeline_events SET deleted_at = NOW() WHERE id = ?', [rows[0].id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ----------------------------------------------------------- timeline map
// GET /api/timeline/map — every located event as map pins: the primary
// events.location (lazily geocoded through geo_cache, like the journal
// timeline) plus all event_locations stops (roadtrips). Owner-scoped,
// spicy-filtered like the events routes.
timelineRouter.get('/map', async (req, res, next) => {
  try {
    const showSpicy = await spicyVisible(req.user);
    const where = ['e.deleted_at IS NULL'];
    const params = [];
    if (!isAdmin(req.user)) { where.push('e.owner_user_id = ?'); params.push(req.user.id); }
    if (!showSpicy) where.push('e.is_spicy = 0');
    const whereSql = where.join(' AND ');

    const [primary, extras] = await Promise.all([
      query(
        `SELECT e.id, e.title, e.type, e.starts_at, e.location
         FROM events e WHERE ${whereSql} AND e.location IS NOT NULL AND e.location != ''
         ORDER BY e.starts_at DESC LIMIT 1000`, params),
      query(
        `SELECT el.event_id, el.label, el.latitude, el.longitude, el.position,
                e.title, e.type, e.starts_at
         FROM event_locations el JOIN events e ON e.id = el.event_id
         WHERE ${whereSql} AND el.latitude IS NOT NULL AND el.longitude IS NOT NULL
         ORDER BY e.starts_at DESC, el.position LIMIT 2000`, params),
    ]);

    const pins = [];
    // primary locations — resolve coords through geo_cache; capped fresh lookups
    const cacheByHash = new Map();
    if (primary.length) {
      const hashes = [...new Set(primary.map((r) => queryHash(r.location)))];
      const ph = hashes.map(() => '?').join(',');
      const cachedRows = await query(
        `SELECT query_hash, latitude, longitude, label FROM geo_cache WHERE query_hash IN (${ph})`, hashes);
      for (const c of cachedRows) cacheByHash.set(c.query_hash, c);
    }
    let lookups = 0;
    const MAX_LOOKUPS = 100;
    for (const r of primary) {
      let lat = null, lng = null;
      const cached = cacheByHash.get(queryHash(r.location));
      if (cached) {
        if (cached.latitude == null) continue; // cached miss
        lat = Number(cached.latitude); lng = Number(cached.longitude);
      } else {
        if (lookups >= MAX_LOOKUPS) continue;
        lookups++;
        const g = await geocode(r.location); // computes + caches (hit or miss)
        if (!g) continue;
        lat = g.lat; lng = g.lng;
      }
      pins.push({
        event_id: r.id, title: r.title, type: r.type, starts_at: r.starts_at,
        label: r.location, lat, lng, primary: true,
      });
    }
    for (const r of extras) {
      pins.push({
        event_id: r.event_id, title: r.title, type: r.type, starts_at: r.starts_at,
        label: r.label, lat: Number(r.latitude), lng: Number(r.longitude), primary: false,
      });
    }
    res.json({ pins });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------- visited places
// The Places bucket list: manual marks (visited_places, user-scoped) merged
// with marks derived on the fly from event locations' geo metadata. Derived
// marks are never stored; unchecking is only possible for manual marks.
const VP_KINDS = ['country', 'us_state'];

/** Derive visited state/country codes from the user's events: event_locations
 * carry parsed metadata; primary events.location falls back to parsing the
 * cached geocoder label (no fresh geocoding here — the map/timeline routes
 * warm the cache). Returns { states: Set<code>, countries: Set<code> }. */
async function derivedPlaces(user) {
  const showSpicy = await spicyVisible(user);
  const where = ['e.deleted_at IS NULL', `e.owner_user_id = ?`];
  const params = [user.id];
  if (!showSpicy) where.push('e.is_spicy = 0');
  const whereSql = where.join(' AND ');

  const states = new Set();
  const countries = new Set();

  const locRows = await query(
    `SELECT DISTINCT el.state_code, el.country_code
     FROM event_locations el JOIN events e ON e.id = el.event_id
     WHERE ${whereSql}`, params);
  for (const r of locRows) {
    if (r.state_code && US_STATE_CODES.has(r.state_code)) states.add(r.state_code);
    if (r.country_code) countries.add(String(r.country_code).toUpperCase());
  }

  const primRows = await query(
    `SELECT DISTINCT e.location FROM events e
     WHERE ${whereSql} AND e.location IS NOT NULL AND e.location != '' LIMIT 1000`, params);
  if (primRows.length) {
    const byHash = new Map(primRows.map((r) => [queryHash(r.location), r.location]));
    const hashes = [...byHash.keys()];
    const ph = hashes.map(() => '?').join(',');
    const cachedRows = await query(
      `SELECT query_hash, latitude, label FROM geo_cache WHERE query_hash IN (${ph})`, hashes);
    for (const c of cachedRows) {
      if (c.latitude == null || !c.label) continue; // cached miss / no label
      const meta = parseGeoLabel(c.label);
      if (meta.state_code) states.add(meta.state_code);
      if (meta.country_code) countries.add(meta.country_code);
    }
  }
  return { states, countries };
}

// GET /api/timeline/places → { us_states: [{code, source}], countries: [{code, source}] }
// source: 'manual' | 'derived' | 'both' — manual wins for delete affordance.
timelineRouter.get('/places', async (req, res, next) => {
  try {
    const [manualRows, derived] = await Promise.all([
      query('SELECT kind, code FROM visited_places WHERE user_id = ? AND source = ?', [req.user.id, 'manual']),
      derivedPlaces(req.user),
    ]);
    const manualStates = new Set();
    const manualCountries = new Set();
    for (const r of manualRows) {
      if (r.kind === 'us_state') manualStates.add(r.code);
      else if (r.kind === 'country') manualCountries.add(r.code);
    }
    const merge = (manual, derivedSet) => {
      const out = [];
      for (const code of new Set([...manual, ...derivedSet])) {
        const m = manual.has(code), d = derivedSet.has(code);
        out.push({ code, source: m && d ? 'both' : (m ? 'manual' : 'derived') });
      }
      return out.sort((a, b) => a.code.localeCompare(b.code));
    };
    res.json({
      us_states: merge(manualStates, derived.states),
      countries: merge(manualCountries, derived.countries),
      us_state_total: US_STATES.length,
    });
  } catch (err) { next(err); }
});

// POST /api/timeline/places { kind, code } — manual "been there" mark
timelineRouter.post('/places', async (req, res, next) => {
  try {
    const { kind, code } = req.body || {};
    if (!VP_KINDS.includes(kind)) return res.status(400).json({ error: "kind must be 'country' or 'us_state'" });
    const c = String(code || '').trim().toUpperCase();
    if (kind === 'us_state' && !US_STATE_CODES.has(c)) {
      return res.status(400).json({ error: 'Unknown US state code' });
    }
    if (kind === 'country' && !(/^[A-Z]{2}$/.test(c) || countryCode(c))) {
      return res.status(400).json({ error: 'Unknown country code' });
    }
    const stored = kind === 'country' && !/^[A-Z]{2}$/.test(c) ? countryCode(c) : c;
    await query(
      "INSERT IGNORE INTO visited_places (user_id, kind, code, source) VALUES (?, ?, ?, 'manual')",
      [req.user.id, kind, stored]
    );
    res.status(201).json({ ok: true, code: stored });
  } catch (err) { next(err); }
});

// DELETE /api/timeline/places/:kind/:code — remove a manual mark (derived
// marks come from event data and can't be unchecked here)
timelineRouter.delete('/places/:kind/:code', async (req, res, next) => {
  try {
    const kind = String(req.params.kind);
    if (!VP_KINDS.includes(kind)) return res.status(400).json({ error: 'Invalid kind' });
    const code = String(req.params.code || '').trim().toUpperCase().slice(0, 10);
    await query(
      "DELETE FROM visited_places WHERE user_id = ? AND kind = ? AND code = ? AND source = 'manual'",
      [req.user.id, kind, code]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- notes
const notesRouter = express.Router();
notesRouter.use(requireAuth);

// GET /api/notes?contact_id=&page=&limit= (default 100, max 500)
notesRouter.get('/', async (req, res, next) => {
  try {
    const contactId = Number(req.query.contact_id);
    if (!contactId) return res.status(400).json({ error: 'contact_id is required' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const lim = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
    const off = (Math.max(parseInt(req.query.page, 10) || 1, 1) - 1) * lim;
    const showSpicy = (await spicyVisible(req.user)) &&
      (found.access !== 'shared' || found.share.share_scope === 'full_spicy');
    const rows = await query(
      `SELECT * FROM notes WHERE contact_id = ? AND deleted_at IS NULL ${showSpicy ? '' : 'AND is_spicy = 0'}
       ORDER BY created_at DESC, id DESC LIMIT ${lim} OFFSET ${off}`,
      [contactId]
    );
    res.json({ notes: rows.map((n) => ({ ...n, content: n.is_spicy ? decryptField(n.content) : n.content })) });
  } catch (err) { next(err); }
});

// POST /api/notes
notesRouter.post('/', async (req, res, next) => {
  try {
    const { contact_id, content, is_spicy } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ error: 'Note content is required' });
    const cid = Number(contact_id);
    if (!Number.isInteger(cid) || cid <= 0) return res.status(404).json({ error: 'Contact not found' });
    const found = await contactAccess(req.user, cid);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;
    const stored = spicyFlag ? encryptField(String(content)) : String(content);
    const result = await query(
      'INSERT INTO notes (contact_id, content, is_spicy) VALUES (?, ?, ?)',
      [found.contact.id, stored, spicyFlag]
    );
    auditWrite(req.user.id, found.contact.id, 'create', 'note', result.insertId, null, { is_spicy: spicyFlag }, 'Added note');
    rebuildSearchIndexAsync(found.contact.id);
    touchContact(found.contact.id);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// GET /api/notes/:id — single note (read scoping mirrors the list, not loadNote,
// which demands edit permission)
notesRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Note not found' });
    const rows = await query('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Note not found' });
    const found = await contactAccess(req.user, rows[0].contact_id);
    if (!found) return res.status(404).json({ error: 'Note not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    if (rows[0].is_spicy) {
      const showSpicy = (await spicyVisible(req.user)) &&
        (found.access !== 'shared' || found.share.share_scope === 'full_spicy');
      if (!showSpicy) return res.status(404).json({ error: 'Note not found' });
    }
    const n = rows[0];
    res.json({ note: { ...n, content: n.is_spicy ? decryptField(n.content) : n.content } });
  } catch (err) { next(err); }
});

async function loadNote(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Note not found' });
  const rows = await query('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Note not found' });
  const found = await contactAccess(req.user, rows[0].contact_id);
  if (!found) return res.status(404).json({ error: 'Note not found' });
  if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
  if (rows[0].is_spicy && !(await spicyVisible(req.user))) return res.status(404).json({ error: 'Note not found' });
  req.note = rows[0];
  next();
}

// PUT /api/notes/:id
notesRouter.put('/:id', loadNote, async (req, res, next) => {
  try {
    const { content, is_spicy } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ error: 'Note content is required' });
    let spicyFlag = is_spicy !== undefined ? (is_spicy ? 1 : 0) : req.note.is_spicy;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = req.note.is_spicy;
    const stored = spicyFlag ? encryptField(String(content)) : String(content);
    await query('UPDATE notes SET content = ?, is_spicy = ? WHERE id = ?', [stored, spicyFlag, req.note.id]);
    rebuildSearchIndexAsync(req.note.contact_id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notes/:id — soft
notesRouter.delete('/:id', loadNote, async (req, res, next) => {
  try {
    await query('UPDATE notes SET deleted_at = NOW() WHERE id = ?', [req.note.id]);
    rebuildSearchIndexAsync(req.note.contact_id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------- reminders
const remindersRouter = express.Router();
remindersRouter.use(requireAuth);

const RECUR_RULES = ['daily', 'weekly', 'monthly', 'yearly'];

/**
 * Advance a due_at ('YYYY-MM-DD HH:MM:SS' or ISO-ish) by a recur rule.
 * Monthly/yearly preserve the day-of-month, clamped to the target month's
 * length (Jan 31 + monthly → Feb 28/29). Returns 'YYYY-MM-DD HH:MM:SS'.
 */
function advanceDueAt(dueAt, rule) {
  const m = String(dueAt).match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return null;
  let [, y, mo, d, hh, mi, ss] = m;
  y = Number(y); mo = Number(mo); d = Number(d);
  hh = Number(hh || 0); mi = Number(mi || 0); ss = Number(ss || 0);

  if (rule === 'daily' || rule === 'weekly') {
    const dt = new Date(Date.UTC(y, mo - 1, d, hh, mi, ss));
    dt.setUTCDate(dt.getUTCDate() + (rule === 'daily' ? 1 : 7));
    y = dt.getUTCFullYear(); mo = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else if (rule === 'monthly' || rule === 'yearly') {
    if (rule === 'monthly') {
      mo += 1;
      if (mo > 12) { mo = 1; y += 1; }
    } else {
      y += 1;
    }
    // clamp day-of-month (day 0 of next month = last day of target month)
    const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
    if (d > daysInMonth) d = daysInMonth;
  } else {
    return null;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${y}-${pad(mo)}-${pad(d)} ${pad(hh)}:${pad(mi)}:${pad(ss)}`;
}

// GET /api/reminders/due — due/upcoming (next 30d + overdue), plus all open
remindersRouter.get('/due', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT r.*, c.display_name AS contact_name FROM reminders r
       LEFT JOIN contacts c ON c.id = r.contact_id AND c.deleted_at IS NULL
       WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL
       ORDER BY r.due_at ASC LIMIT 200`,
      [req.user.id]
    );
    res.json({ reminders: rows });
  } catch (err) { next(err); }
});

// POST /api/reminders
remindersRouter.post('/', async (req, res, next) => {
  try {
    const { title, description, due_at, contact_id, recur_rule, recur_until } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (!due_at) return res.status(400).json({ error: 'Due date is required' });
    if (!isValidDate(due_at)) return res.status(400).json({ error: 'Invalid due date' });
    if (recur_rule != null && recur_rule !== '' && !RECUR_RULES.includes(recur_rule)) {
      return res.status(400).json({ error: `recur_rule must be one of: ${RECUR_RULES.join(', ')}` });
    }
    if (recur_until != null && recur_until !== '' && !isValidDate(recur_until)) {
      return res.status(400).json({ error: 'Invalid recur_until date' });
    }
    let cid = null;
    if (contact_id) {
      const found = await contactAccess(req.user, Number(contact_id));
      if (found) cid = found.contact.id;
    }
    const result = await query(
      'INSERT INTO reminders (owner_user_id, contact_id, title, description, due_at, recur_rule, recur_until) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, cid, String(title).trim(), description || null, due_at,
       RECUR_RULES.includes(recur_rule) ? recur_rule : null, recur_until || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

async function loadReminder(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Reminder not found' });
  const rows = await query('SELECT * FROM reminders WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Reminder not found' });
  if (rows[0].owner_user_id !== req.user.id && !isAdmin(req.user)) return res.status(404).json({ error: 'Reminder not found' });
  req.reminder = rows[0];
  next();
}

// PUT /api/reminders/:id
remindersRouter.put('/:id', loadReminder, async (req, res, next) => {
  try {
    const { title, description, due_at, contact_id, recur_rule, recur_until } = req.body || {};
    const updates = [];
    const params = [];
    if (title && String(title).trim()) { updates.push('title = ?'); params.push(String(title).trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }
    if (due_at) {
      if (!isValidDate(due_at)) return res.status(400).json({ error: 'Invalid due date' });
      updates.push('due_at = ?'); params.push(due_at);
    }
    if (recur_rule !== undefined) {
      if (recur_rule !== null && recur_rule !== '' && !RECUR_RULES.includes(recur_rule)) {
        return res.status(400).json({ error: `recur_rule must be one of: ${RECUR_RULES.join(', ')}` });
      }
      updates.push('recur_rule = ?'); params.push(RECUR_RULES.includes(recur_rule) ? recur_rule : null);
    }
    if (recur_until !== undefined) {
      if (recur_until !== null && recur_until !== '' && !isValidDate(recur_until)) {
        return res.status(400).json({ error: 'Invalid recur_until date' });
      }
      updates.push('recur_until = ?'); params.push(recur_until || null);
    }
    if (contact_id !== undefined) {
      let cid = null;
      if (contact_id) {
        const found = await contactAccess(req.user, Number(contact_id));
        if (found) cid = found.contact.id;
      }
      updates.push('contact_id = ?'); params.push(cid);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.reminder.id);
    await query(`UPDATE reminders SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/reminders/:id/complete — recurring reminders spawn the next one
remindersRouter.post('/:id/complete', loadReminder, async (req, res, next) => {
  try {
    await query('UPDATE reminders SET completed_at = NOW() WHERE id = ?', [req.reminder.id]);

    let nextDueAt = null;
    if (req.reminder.recur_rule && RECUR_RULES.includes(req.reminder.recur_rule)) {
      const candidate = advanceDueAt(req.reminder.due_at, req.reminder.recur_rule);
      const withinUntil = !req.reminder.recur_until ||
        (candidate && candidate.slice(0, 10) <= String(req.reminder.recur_until).slice(0, 10));
      if (candidate && withinUntil) {
        await query(
          `INSERT INTO reminders (owner_user_id, contact_id, title, description, due_at, recur_rule, recur_until)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [req.reminder.owner_user_id, req.reminder.contact_id, req.reminder.title,
           req.reminder.description, candidate, req.reminder.recur_rule, req.reminder.recur_until]
        );
        nextDueAt = candidate;
      }
    }
    res.json(nextDueAt ? { ok: true, next_due_at: nextDueAt } : { ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/reminders/:id — soft
remindersRouter.delete('/:id', loadReminder, async (req, res, next) => {
  try {
    await query('UPDATE reminders SET deleted_at = NOW() WHERE id = ?', [req.reminder.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// -------------------------------------------------------------- messages
const messagesRouter = express.Router();
messagesRouter.use(requireAuth);

// GET /api/messages?contact_id=
messagesRouter.get('/', async (req, res, next) => {
  try {
    const contactId = Number(req.query.contact_id);
    if (!contactId) return res.status(400).json({ error: 'contact_id is required' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const showSpicy = (await spicyVisible(req.user)) &&
      (found.access !== 'shared' || found.share.share_scope === 'full_spicy');
    const rows = await query(
      `SELECT * FROM messages WHERE contact_id = ? ${showSpicy ? '' : 'AND is_spicy = 0'} ORDER BY sent_at DESC LIMIT 500`,
      [contactId]
    );
    res.json({ messages: rows.map((m) => ({ ...m, content: m.is_spicy ? decryptField(m.content) : m.content })) });
  } catch (err) { next(err); }
});

// POST /api/messages — manual entry (D10)
messagesRouter.post('/', async (req, res, next) => {
  try {
    const { contact_id, platform, direction, content, is_spicy, sent_at } = req.body || {};
    const cid = Number(contact_id);
    if (!Number.isInteger(cid) || cid <= 0) return res.status(404).json({ error: 'Contact not found' });
    const found = await contactAccess(req.user, cid);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;
    if (sent_at != null && sent_at !== '' && !isValidDate(sent_at)) {
      return res.status(400).json({ error: 'Invalid sent_at date' });
    }
    const stored = spicyFlag ? encryptField(String(content || '')) : (content || null);
    const result = await query(
      'INSERT INTO messages (contact_id, platform, direction, content, is_spicy, sent_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))',
      [found.contact.id, platform || null, direction === 'out' ? 'out' : 'in', stored, spicyFlag, sent_at || null]
    );
    touchContact(found.contact.id, sent_at || undefined);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// PUT /api/messages/:id — edit a logged message (same access rule as DELETE)
messagesRouter.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Message not found' });
    const rows = await query('SELECT * FROM messages WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Message not found' });
    const msg = rows[0];
    const found = await contactAccess(req.user, msg.contact_id);
    if (!found) return res.status(404).json({ error: 'Message not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    if (msg.is_spicy && !(await spicyVisible(req.user))) return res.status(404).json({ error: 'Message not found' });

    const b = req.body || {};
    let spicyFlag = msg.is_spicy ? 1 : 0;
    if ('is_spicy' in b) {
      const wanted = b.is_spicy ? 1 : 0;
      if (!wanted || (await spicyVisible(req.user))) spicyFlag = wanted;
    }
    if ('sent_at' in b && b.sent_at != null && b.sent_at !== '' && !isValidDate(b.sent_at)) {
      return res.status(400).json({ error: 'Invalid sent_at date' });
    }
    if ('direction' in b && b.direction != null && b.direction !== 'in' && b.direction !== 'out') {
      return res.status(400).json({ error: "direction must be 'in' or 'out'" });
    }

    const updates = [];
    const params = [];
    if ('content' in b || 'is_spicy' in b) {
      // re-encode content to match the (possibly changed) spicy state
      const plain = 'content' in b
        ? (b.content != null ? String(b.content) : null)
        : (msg.is_spicy ? decryptField(msg.content) : msg.content);
      updates.push('content = ?');
      params.push(spicyFlag && plain ? encryptField(plain) : plain);
    }
    if ('is_spicy' in b) { updates.push('is_spicy = ?'); params.push(spicyFlag); }
    if ('platform' in b) { updates.push('platform = ?'); params.push(b.platform || null); }
    if ('direction' in b) { updates.push('direction = ?'); params.push(b.direction === 'out' ? 'out' : 'in'); }
    if ('sent_at' in b) { updates.push('sent_at = COALESCE(?, NOW())'); params.push(b.sent_at || null); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });

    params.push(msg.id);
    await query(`UPDATE messages SET ${updates.join(', ')} WHERE id = ?`, params);
    if ('sent_at' in b) touchContact(msg.contact_id, b.sent_at || undefined);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

messagesRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Message not found' });
    const rows = await query('SELECT contact_id FROM messages WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Message not found' });
    const found = await contactAccess(req.user, rows[0].contact_id);
    if (!found) return res.status(404).json({ error: 'Message not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    await query('DELETE FROM messages WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { timelineRouter, notesRouter, remindersRouter, messagesRouter };
