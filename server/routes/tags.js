'use strict';

// Tags: system tags (owner_user_id NULL) + user tags. Add/remove on contacts.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { rebuildSearchIndexAsync } = require('../lib/contacts');

const router = express.Router();
router.use(requireAuth);

// GET /api/tags — system + own
router.get('/', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT t.*, (SELECT COUNT(*) FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id AND c.deleted_at IS NULL WHERE ct.tag_id = t.id) AS usage_count
       FROM tags t WHERE t.owner_user_id IS NULL OR t.owner_user_id = ? ORDER BY t.owner_user_id IS NULL DESC, t.name`,
      [req.user.id]
    );
    res.json({ tags: rows });
  } catch (err) { next(err); }
});

// POST /api/tags
router.post('/', async (req, res, next) => {
  try {
    const { name, color, system } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Tag name is required' });
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Color must be a hex value' });
    const owner = system && isAdmin(req.user) ? null : req.user.id;
    const dupes = await query(
      'SELECT id FROM tags WHERE name = ? AND (owner_user_id <=> ?)',
      [String(name).trim(), owner]
    );
    if (dupes.length) return res.status(409).json({ error: 'A tag with that name already exists' });
    const result = await query('INSERT INTO tags (name, color, owner_user_id) VALUES (?, ?, ?)', [
      String(name).trim(), color || '#7c5bf5', owner,
    ]);
    auditWrite(req.user.id, null, 'create', 'tag', result.insertId, null, { name, color }, `Created tag ${name}`);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

async function loadTag(req, res, next) {
  const id = Number(req.params.tagId ?? req.params.id);
  const rows = await query('SELECT * FROM tags WHERE id = ?', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Tag not found' });
  const tag = rows[0];
  // system tags manageable by admins only; user tags by their owner (or admin)
  if (tag.owner_user_id === null && !isAdmin(req.user)) return res.status(403).json({ error: 'System tags are managed by admins' });
  if (tag.owner_user_id !== null && tag.owner_user_id !== req.user.id && !isAdmin(req.user)) {
    return res.status(404).json({ error: 'Tag not found' });
  }
  req.tag = tag;
  next();
}

// PUT /api/tags/:id
router.put('/:id', loadTag, async (req, res, next) => {
  try {
    const { name, color } = req.body || {};
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Color must be a hex value' });
    const updates = [];
    const params = [];
    if (name && String(name).trim()) { updates.push('name = ?'); params.push(String(name).trim()); }
    if (color) { updates.push('color = ?'); params.push(color); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.tag.id);
    await query(`UPDATE tags SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, null, 'update', 'tag', req.tag.id, { name: req.tag.name, color: req.tag.color }, req.body, `Updated tag`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/tags/:id
router.delete('/:id', loadTag, async (req, res, next) => {
  try {
    await query('DELETE FROM tags WHERE id = ?', [req.tag.id]);
    auditWrite(req.user.id, null, 'delete', 'tag', req.tag.id, { name: req.tag.name }, null, `Deleted tag ${req.tag.name}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Contact-tag attach/detach — mounted under /api/contacts/:id/tags/:tagId
const contactTags = express.Router({ mergeParams: true });
contactTags.use(requireAuth);

contactTags.post('/:tagId', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    const tagId = Number(req.params.tagId);
    const rows = await query('SELECT * FROM tags WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)', [tagId, req.user.id]);
    if (rows.length === 0 && !isAdmin(req.user)) return res.status(404).json({ error: 'Tag not found' });
    await query('INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', [req.contact.id, tagId]);
    rebuildSearchIndexAsync(req.contact.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

contactTags.delete('/:tagId', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    await query('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?', [req.contact.id, Number(req.params.tagId)]);
    rebuildSearchIndexAsync(req.contact.id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = { tagsRouter: router, contactTags };
