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
const { getSetting } = require('./settings');

const router = express.Router();
router.use(requireAuth);

const SORTABLE = {
  name: 'c.display_name',
  created: 'c.created_at',
  updated: 'c.updated_at',
  rating: 'c.rating',
  location: 'c.location',
  birthday: 'c.birthday',
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
              (c.owner_user_id != ${Number(req.user.id)}) AS is_shared_in
       ${fromWhere}
       ORDER BY ${orderCol} ${dir}, c.id ASC
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
    for (const df of ['birthday', 'met_date']) {
      if (data[df] === '') data[df] = null;
      if (data[df] != null && !isValidDate(data[df])) {
        return res.status(400).json({ error: `Invalid ${df === 'birthday' ? 'birthday' : 'met date'} — use YYYY-MM-DD` });
      }
    }
    if (data.birthday && !data.zodiac_sign) data.zodiac_sign = zodiacFromBirthday(data.birthday);
    if (data.rating != null) data.rating = Math.max(0, Math.min(5, Number(data.rating) || 0));
    for (const b of ['is_favorite', 'is_spicy', 'is_anonymous']) if (b in data) data[b] = data[b] ? 1 : 0;

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

    for (const df of ['birthday', 'met_date']) {
      if (df in data) {
        if (data[df] === '') data[df] = null;
        if (data[df] != null && !isValidDate(data[df])) {
          return res.status(400).json({ error: `Invalid ${df === 'birthday' ? 'birthday' : 'met date'} — use YYYY-MM-DD` });
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
    for (const b of ['is_favorite', 'is_spicy', 'is_anonymous']) if (b in data) data[b] = data[b] ? 1 : 0;
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
