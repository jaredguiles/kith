'use strict';

// Contacts core: list (paginated/filter/search/sort), detail, create, update,
// soft delete, favorite. Merge/share/photo/changelog arrive in Phase 8; the
// satellites (emails/phones/addresses/socials) live in satellites.js.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite, changelogWrite, diffFields } = require('../lib/audit');
const {
  zodiacFromBirthday, buildDisplayName, rebuildSearchIndex, rebuildSearchIndexAsync,
  filterContactByScope, CONTACT_FIELDS, isValidDate,
} = require('../lib/contacts');
const { scoreCandidate } = require('../import/matcher');
const { getSetting } = require('./settings');

const router = express.Router();
router.use(requireAuth);

/** Boolean-ish body value → 0/1 ('0'/'false'/''/null are false). */
const toBool = (v) => (v === false || v === 0 || v == null || v === '' || v === '0' || v === 'false') ? 0 : 1;

const SORTABLE = {
  // ALPHA = surname order: structured last_name first, falling back to the
  // last word of display_name for contacts without one. Single expression so
  // the ASC/DESC direction applies to the whole key.
  name: "COALESCE(NULLIF(c.last_name, ''), TRIM(SUBSTRING_INDEX(c.display_name, ' ', -1)))",
  created: 'c.created_at',
  updated: 'c.updated_at',
  rating: 'c.rating',
  location: 'c.location',
  birthday: 'c.birthday',
  last_contacted_at: 'c.last_contacted_at',
};

/** Is spicy content visible for this request? Global setting AND session pref. */
async function spicyVisible(user) {
  const enabled = await getSetting('spicy_enabled');
  if (!enabled) return false;
  const rows = await query('SELECT value FROM preferences WHERE user_id = ? AND `key` = ?', [user.id, 'spicy_visible']);
  if (rows.length === 0) return false;
  try { return Boolean(JSON.parse(rows[0].value)); } catch { return false; }
}

// ---------------------------------------------------------------- list
router.get('/', async (req, res, next) => {
  try {
    const {
      tag, group, search, sort = 'name', sortDir = 'asc', favorites,
      filter, near, radius_km,
      page = 1, limit = 50,
    } = req.query;

    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const off = (Math.max(parseInt(page, 10) || 1, 1) - 1) * lim;

    const where = ['c.deleted_at IS NULL'];
    const params = [];

    // Scope: own + shared, or everything for admins
    if (!isAdmin(req.user)) {
      where.push('(c.owner_user_id = ? OR sc.id IS NOT NULL)');
      params.push(req.user.id);
    }

    if (favorites === '1' || favorites === 'true') where.push('c.is_favorite = 1');

    // keep-in-touch: overdue contacts only
    if (filter === 'out_of_touch') {
      where.push(`(c.is_deceased = 0 AND c.keep_in_touch_days IS NOT NULL AND
        (c.last_contacted_at IS NULL OR c.last_contacted_at < NOW() - INTERVAL c.keep_in_touch_days DAY))`);
    }

    // proximity: contacts with a geocoded address within radius_km of near=lat,lng
    if (near !== undefined) {
      const m = String(near).match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/);
      if (!m) return res.status(400).json({ error: 'near must be "lat,lng"' });
      const nlat = Number(m[1]), nlng = Number(m[2]);
      if (!Number.isFinite(nlat) || !Number.isFinite(nlng) || Math.abs(nlat) > 90 || Math.abs(nlng) > 180) {
        return res.status(400).json({ error: 'near coordinates out of range' });
      }
      const radius = Number(radius_km ?? 50);
      if (!Number.isFinite(radius) || radius <= 0 || radius > 20015) {
        return res.status(400).json({ error: 'radius_km must be a positive number' });
      }
      // haversine over geocoded addresses (6371 km earth radius)
      where.push(`EXISTS (
        SELECT 1 FROM contact_addresses ca
        WHERE ca.contact_id = c.id AND ca.latitude IS NOT NULL AND ca.longitude IS NOT NULL
          AND 6371 * 2 * ASIN(SQRT(
            POWER(SIN(RADIANS(ca.latitude - ?) / 2), 2) +
            COS(RADIANS(?)) * COS(RADIANS(ca.latitude)) *
            POWER(SIN(RADIANS(ca.longitude - ?) / 2), 2)
          )) <= ?
      )`);
      params.push(nlat, nlat, nlng, radius);
    }

    if (tag) {
      where.push('EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ?)');
      params.push(Number(tag));
    }
    if (group) {
      where.push('EXISTS (SELECT 1 FROM group_members gm WHERE gm.contact_id = c.id AND gm.group_id = ?)');
      params.push(Number(group));
    }

    if (search) {
      // FULLTEXT + LIKE-prefix fallback (§4.7: InnoDB FT ignores short tokens)
      where.push(`(
        MATCH(csi.search_text) AGAINST (? IN NATURAL LANGUAGE MODE)
        OR c.display_name LIKE ?
        OR c.first_name LIKE ?
        OR c.last_name LIKE ?
        OR c.nickname LIKE ?
        OR c.email LIKE ?
      )`);
      const prefix = `${search}%`;
      params.push(search, prefix, prefix, prefix, prefix, prefix);
    }

    const orderCol = SORTABLE[sort] || SORTABLE.name;
    const dir = String(sortDir).toLowerCase() === 'desc' ? 'DESC' : 'ASC';

    const joinShare = `LEFT JOIN shared_contacts sc ON sc.contact_id = c.id AND sc.shared_with_user_id = ${Number(req.user.id)}`;
    const joinSearch = search ? 'LEFT JOIN contact_search_index csi ON csi.contact_id = c.id' : '';

    // Same FROM/WHERE for rows + total. SQL_CALC_FOUND_ROWS/FOUND_ROWS() is
    // connection-scoped and query() uses a fresh pool connection per call —
    // a separate COUNT(*) is the only concurrency-safe way to get the total.
    const fromWhere = `FROM contacts c
       ${joinShare}
       ${joinSearch}
       WHERE ${where.join(' AND ')}`;

    const rows = await query(
      `SELECT c.*, sc.share_scope AS shared_scope, sc.permissions AS shared_permissions,
              (c.owner_user_id != ${Number(req.user.id)}) AS is_shared_in,
              (c.is_deceased = 0 AND c.keep_in_touch_days IS NOT NULL AND
               (c.last_contacted_at IS NULL OR c.last_contacted_at < NOW() - INTERVAL c.keep_in_touch_days DAY)) AS out_of_touch
       ${fromWhere}
       ORDER BY ${orderCol} ${dir}, c.display_name ${dir}, c.id ASC
       LIMIT ${lim} OFFSET ${off}`,
      params
    );
    const totalRows = await query(`SELECT COUNT(*) AS total ${fromWhere}`, params);
    const total = totalRows[0].total;

    const showSpicy = await spicyVisible(req.user);

    // Tags per contact (single query for the page)
    const ids = rows.map((r) => r.id);
    let tagsByContact = {};
    if (ids.length) {
      const tagRows = await query(
        `SELECT ct.contact_id, t.id, t.name, t.color FROM contact_tags ct JOIN tags t ON t.id = ct.tag_id
         WHERE ct.contact_id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      for (const tr of tagRows) {
        (tagsByContact[tr.contact_id] ||= []).push({ id: tr.id, name: tr.name, color: tr.color });
      }
    }

    const contacts = rows.map((r) => {
      let c = { ...r };
      // spicy signal hidden entirely when not in active spicy mode
      if (!showSpicy) c.is_spicy = 0;
      c.tags = tagsByContact[r.id] || [];
      c.out_of_touch = Boolean(r.out_of_touch);
      if (r.shared_scope && r.owner_user_id !== req.user.id && !isAdmin(req.user)) {
        const isBasic = r.shared_scope === 'basic';
        // basic scope hides tags in list just like the detail route does
        c = { ...filterContactByScope(c, r.shared_scope), tags: isBasic ? [] : c.tags, is_shared_in: 1, shared_permissions: r.shared_permissions, is_spicy: showSpicy && r.shared_scope === 'full_spicy' ? r.is_spicy : 0 };
      }
      return c;
    });

    res.json({ contacts, total, page: Number(page) || 1, limit: lim });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------- duplicates
// GET /api/contacts/duplicates — pairwise dedupe scan of the user's OWN
// non-deleted contacts using the import matcher's scoring. Must be declared
// before /:id so "duplicates" isn't consumed as a contact id.
router.get('/duplicates', async (req, res, next) => {
  try {
    const contacts = await query(
      `SELECT id, display_name, email, phone, location FROM contacts
       WHERE owner_user_id = ? AND deleted_at IS NULL ORDER BY id`,
      [req.user.id]
    );
    if (contacts.length > 500) {
      return res.status(413).json({ error: `Too many contacts to scan (${contacts.length} > 500) — dedupe scan is capped at 500 contacts` });
    }
    if (contacts.length < 2) return res.json({ pairs: [] });

    const ids = contacts.map((c) => c.id);
    const ph = ids.map(() => '?').join(',');
    const [emails, phones, socials] = await Promise.all([
      query(`SELECT contact_id, email FROM contact_emails WHERE contact_id IN (${ph})`, ids),
      query(`SELECT contact_id, phone FROM contact_phones WHERE contact_id IN (${ph})`, ids),
      query(`SELECT contact_id, platform, username FROM social_links WHERE contact_id IN (${ph})`, ids),
    ]);
    const byId = new Map(contacts.map((c) => [c.id, { contact: c, emails: [], phones: [], socials: [] }]));
    for (const e of emails) byId.get(e.contact_id)?.emails.push(e);
    for (const p of phones) byId.get(p.contact_id)?.phones.push(p);
    for (const s of socials) byId.get(s.contact_id)?.socials.push(s);

    const brief = (c) => ({ id: c.id, display_name: c.display_name, email: c.email, phone: c.phone });
    const pairs = [];
    for (let i = 0; i < contacts.length; i++) {
      const a = byId.get(contacts[i].id);
      // shape contact A as a matcher "record"
      const record = {
        display_name: a.contact.display_name,
        location: a.contact.location,
        emails: [...a.emails, ...(a.contact.email ? [{ email: a.contact.email }] : [])],
        phones: [...a.phones, ...(a.contact.phone ? [{ phone: a.contact.phone }] : [])],
        social_links: a.socials,
      };
      for (let j = i + 1; j < contacts.length; j++) {
        const b = byId.get(contacts[j].id);
        const score = scoreCandidate(record, b);
        if (score >= 0.8) {
          const reason = score >= 0.95 ? 'matching email or phone'
            : score >= 0.85 ? 'matching social link'
            : 'matching name';
          pairs.push({ a: brief(a.contact), b: brief(b.contact), score, reason });
        }
      }
    }
    pairs.sort((x, y) => y.score - x.score);
    res.json({ pairs });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------------- bulk
// POST /api/contacts/bulk — { ids: [int], action, tag_id?, group_id? }
const BULK_ACTIONS = ['add_tag', 'remove_tag', 'add_group', 'remove_group', 'delete', 'favorite', 'unfavorite'];
router.post('/bulk', async (req, res, next) => {
  try {
    const { ids, action, tag_id, group_id } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array is required' });
    if (ids.length > 200) return res.status(400).json({ error: 'Too many ids (max 200)' });
    if (!BULK_ACTIONS.includes(action)) return res.status(400).json({ error: `action must be one of: ${BULK_ACTIONS.join(', ')}` });
    const cleanIds = [...new Set(ids.map(Number))];
    if (cleanIds.some((n) => !Number.isInteger(n) || n <= 0)) return res.status(400).json({ error: 'ids must be positive integers' });

    let tagId = null, groupId = null;
    if (action === 'add_tag' || action === 'remove_tag') {
      tagId = Number(tag_id);
      if (!Number.isInteger(tagId) || tagId <= 0) return res.status(400).json({ error: 'tag_id is required for tag actions' });
      const tags = await query('SELECT id, owner_user_id FROM tags WHERE id = ?', [tagId]);
      if (!tags.length || (tags[0].owner_user_id !== null && tags[0].owner_user_id !== req.user.id && !isAdmin(req.user))) {
        return res.status(404).json({ error: 'Tag not found' });
      }
    }
    if (action === 'add_group' || action === 'remove_group') {
      groupId = Number(group_id);
      if (!Number.isInteger(groupId) || groupId <= 0) return res.status(400).json({ error: 'group_id is required for group actions' });
      const groups = await query('SELECT id, owner_user_id, is_system FROM `groups` WHERE id = ?', [groupId]);
      if (!groups.length || (!groups[0].is_system && groups[0].owner_user_id !== null &&
          groups[0].owner_user_id !== req.user.id && !isAdmin(req.user))) {
        return res.status(404).json({ error: 'Group not found' });
      }
    }

    // Per-id authz: owner or admin only (shared-in contacts rejected)
    const ph = cleanIds.map(() => '?').join(',');
    const rows = await query(`SELECT id, owner_user_id, display_name FROM contacts WHERE id IN (${ph}) AND deleted_at IS NULL`, cleanIds);
    const allowed = rows.filter((r) => r.owner_user_id === req.user.id || isAdmin(req.user));
    let done = 0;
    const skipped = cleanIds.length - allowed.length;

    for (const c of allowed) {
      switch (action) {
        case 'add_tag':
          await query('INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', [c.id, tagId]);
          break;
        case 'remove_tag':
          await query('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?', [c.id, tagId]);
          break;
        case 'add_group':
          await query('INSERT IGNORE INTO group_members (group_id, contact_id) VALUES (?, ?)', [groupId, c.id]);
          break;
        case 'remove_group':
          await query('DELETE FROM group_members WHERE group_id = ? AND contact_id = ?', [groupId, c.id]);
          break;
        case 'delete':
          await query('UPDATE contacts SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [c.id]);
          break;
        case 'favorite':
          await query('UPDATE contacts SET is_favorite = 1 WHERE id = ?', [c.id]);
          break;
        case 'unfavorite':
          await query('UPDATE contacts SET is_favorite = 0 WHERE id = ?', [c.id]);
          break;
      }
      done++;
    }

    auditWrite(req.user.id, null, 'bulk', 'contact', null, null,
      { action, ids: allowed.map((c) => c.id), tag_id: tagId, group_id: groupId },
      `Bulk ${action} on ${done} contact(s)`);
    res.json({ done, skipped });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- detail
router.get('/:id', requireContactAccess('id'), async (req, res, next) => {
  try {
    const c = req.contact;
    const showSpicy = await spicyVisible(req.user);
    const scope = req.contactAccess === 'shared' ? req.contactShare.share_scope : null;

    const [emails, phones, addresses, socials, tags, groups] = await Promise.all([
      query('SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY is_primary DESC, id', [c.id]),
      query('SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY is_primary DESC, id', [c.id]),
      query('SELECT * FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC, id', [c.id]),
      query('SELECT * FROM social_links WHERE contact_id = ? ORDER BY id', [c.id]),
      query('SELECT t.* FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id WHERE ct.contact_id = ? ORDER BY t.name', [c.id]),
      query('SELECT g.* FROM `groups` g JOIN group_members gm ON gm.group_id = g.id WHERE gm.contact_id = ? ORDER BY g.name', [c.id]),
    ]);

    let contact = { ...c };
    if (!showSpicy || (scope && scope !== 'full_spicy')) contact.is_spicy = 0;

    if (scope === 'basic') {
      contact = filterContactByScope(contact, 'basic');
      return res.json({
        contact, emails, phones, addresses: [], socials: [], tags: [], groups: [],
        access: req.contactAccess, permissions: req.contactShare?.permissions || null, share_scope: scope,
      });
    }

    res.json({
      contact, emails, phones, addresses, socials, tags, groups,
      access: req.contactAccess,
      permissions: req.contactShare?.permissions || null,
      share_scope: scope,
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- create
router.post('/', async (req, res, next) => {
  try {
    const body = req.body || {};
    const data = {};
    for (const f of CONTACT_FIELDS) if (f in body) data[f] = body[f];

    data.display_name = buildDisplayName(data);
    for (const df of ['birthday', 'met_date', 'date_of_death']) {
      if (data[df] === '') data[df] = null;
      if (data[df] != null && !isValidDate(data[df])) {
        return res.status(400).json({ error: `Invalid ${df.replace(/_/g, ' ')} — use YYYY-MM-DD` });
      }
    }
    if (data.birthday && !data.zodiac_sign) data.zodiac_sign = zodiacFromBirthday(data.birthday);
    if (data.rating != null) data.rating = Math.max(0, Math.min(5, Number(data.rating) || 0));
    if ('keep_in_touch_days' in data) {
      if (data.keep_in_touch_days === '' || data.keep_in_touch_days === null) data.keep_in_touch_days = null;
      else {
        const kd = Number(data.keep_in_touch_days);
        if (!Number.isInteger(kd) || kd <= 0) return res.status(400).json({ error: 'keep_in_touch_days must be a positive integer or null' });
        data.keep_in_touch_days = kd;
      }
    }
    for (const b of ['is_favorite', 'is_spicy', 'is_anonymous', 'is_deceased']) if (b in data) data[b] = toBool(data[b]);

    // spicy flag only settable when spicy visible
    if (data.is_spicy && !(await spicyVisible(req.user))) data.is_spicy = 0;

    const cols = Object.keys(data);
    const result = await query(
      `INSERT INTO contacts (owner_user_id, ${cols.join(', ')}) VALUES (?, ${cols.map(() => '?').join(', ')})`,
      [req.user.id, ...cols.map((k) => data[k] ?? null)]
    );
    const id = result.insertId;
    await rebuildSearchIndex(id);
    auditWrite(req.user.id, id, 'create', 'contact', id, null, data, `Created contact ${data.display_name}`);
    changelogWrite(id, req.user.id, 'user_edit',
      Object.entries(data).filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([field, v]) => ({ field, oldValue: null, newValue: String(v) })));
    res.status(201).json({ id });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- update
router.put('/:id', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    const c = req.contact;
    const body = req.body || {};
    const data = {};
    for (const f of CONTACT_FIELDS) if (f in body) data[f] = body[f];
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'Nothing to update' });

    for (const df of ['birthday', 'met_date', 'date_of_death']) {
      if (df in data) {
        if (data[df] === '') data[df] = null;
        if (data[df] != null && !isValidDate(data[df])) {
          return res.status(400).json({ error: `Invalid ${df.replace(/_/g, ' ')} — use YYYY-MM-DD` });
        }
      }
    }

    if ('first_name' in data || 'last_name' in data || 'display_name' in data) {
      data.display_name = buildDisplayName({ ...c, ...data, display_name: data.display_name });
    }
    if ('birthday' in data && data.birthday && !('zodiac_sign' in data)) {
      data.zodiac_sign = zodiacFromBirthday(data.birthday);
    }
    if (data.rating != null) data.rating = Math.max(0, Math.min(5, Number(data.rating) || 0));
    if ('keep_in_touch_days' in data) {
      if (data.keep_in_touch_days === '' || data.keep_in_touch_days === null) data.keep_in_touch_days = null;
      else {
        const kd = Number(data.keep_in_touch_days);
        if (!Number.isInteger(kd) || kd <= 0) return res.status(400).json({ error: 'keep_in_touch_days must be a positive integer or null' });
        data.keep_in_touch_days = kd;
      }
    }
    for (const b of ['is_favorite', 'is_spicy', 'is_anonymous', 'is_deceased']) if (b in data) data[b] = toBool(data[b]);
    if ('is_spicy' in data && data.is_spicy && !(await spicyVisible(req.user))) delete data.is_spicy;

    const cols = Object.keys(data);
    await query(
      `UPDATE contacts SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((k) => data[k] ?? null), c.id]
    );
    rebuildSearchIndexAsync(c.id);

    const diffs = diffFields(c, data, cols);
    if (diffs.length) {
      auditWrite(req.user.id, c.id, 'update', 'contact', c.id,
        Object.fromEntries(diffs.map((d) => [d.field, d.oldValue])),
        Object.fromEntries(diffs.map((d) => [d.field, d.newValue])),
        `Updated ${diffs.map((d) => d.field).join(', ')}`);
      changelogWrite(c.id, req.user.id, 'user_edit', diffs);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- delete (soft)
router.delete('/:id', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    if (req.contactAccess === 'shared') return res.status(403).json({ error: 'Only the owner can delete a contact' });
    await query('UPDATE contacts SET deleted_at = NOW() WHERE id = ?', [req.contact.id]);
    auditWrite(req.user.id, req.contact.id, 'delete', 'contact', req.contact.id,
      { display_name: req.contact.display_name }, null, `Deleted contact ${req.contact.display_name}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- favorite
router.put('/:id/favorite', requireContactAccess('id'), async (req, res, next) => {
  try {
    // favoriting is per the viewing user's copy — v1 keeps it on the contact row;
    // only owner/admin may toggle (shared recipients see but don't own the star)
    if (req.contactAccess === 'shared') return res.status(403).json({ error: 'Only the owner can favorite this contact' });
    const newVal = req.body?.is_favorite !== undefined ? (req.body.is_favorite ? 1 : 0) : (req.contact.is_favorite ? 0 : 1);
    await query('UPDATE contacts SET is_favorite = ? WHERE id = ?', [newVal, req.contact.id]);
    res.json({ ok: true, is_favorite: Boolean(newVal) });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- photo
router.put('/:id/photo', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    const { media_id } = req.body || {};
    if (!media_id) {
      await query('UPDATE contacts SET photo_url = NULL WHERE id = ?', [req.contact.id]);
      return res.json({ ok: true });
    }
    const rows = await query(
      'SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL AND type = ? AND is_profile_eligible = 1',
      [Number(media_id), 'photo']
    );
    if (!rows.length) return res.status(404).json({ error: 'Photo not found' });
    const m = rows[0];
    if (m.owner_user_id !== req.user.id && !isAdmin(req.user)) return res.status(404).json({ error: 'Photo not found' });
    // photo_url points at the authenticated media route — never a raw fs path
    await query('UPDATE contacts SET photo_url = ? WHERE id = ?', [`/api/media/${m.id}/file`, req.contact.id]);
    auditWrite(req.user.id, req.contact.id, 'update', 'contact', req.contact.id, null, { photo_media_id: m.id }, 'Set profile photo');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- changelog
router.get('/:id/changelog', requireContactAccess('id'), async (req, res, next) => {
  try {
    if (req.contactAccess === 'shared' && req.contactShare.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const rows = await query(
      `SELECT cl.*, u.username AS user_username FROM contact_field_changelog cl
       LEFT JOIN users u ON u.id = cl.user_id
       WHERE cl.contact_id = ? ORDER BY cl.changed_at DESC, cl.id DESC LIMIT 500`,
      [req.contact.id]
    );
    res.json({ changelog: rows });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.spicyVisible = spicyVisible;
