'use strict';

// Groups: system groups (renamable, not deletable) + user groups; membership.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

// GET /api/groups — with member counts (members scoped to what the user can see)
router.get('/', async (req, res, next) => {
  try {
    const admin = isAdmin(req.user);
    const scopeJoin = admin
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ${Number(req.user.id)}))`;
    const rows = await query(
      `SELECT g.*,
        (SELECT COUNT(*) FROM group_members gm JOIN contacts c ON c.id = gm.contact_id AND c.deleted_at IS NULL ${scopeJoin}
         WHERE gm.group_id = g.id) AS member_count
       FROM \`groups\` g
       WHERE g.owner_user_id IS NULL OR g.owner_user_id = ?
       ORDER BY g.is_system DESC, g.name`,
      [req.user.id]
    );
    res.json({ groups: rows });
  } catch (err) { next(err); }
});

// GET /api/groups/:id/members
router.get('/:id/members', async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) return res.status(404).json({ error: 'Group not found' });
    const groups = await query('SELECT * FROM `groups` WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)', [groupId, req.user.id]);
    if (!groups.length) return res.status(404).json({ error: 'Group not found' });
    const admin = isAdmin(req.user);
    const scope = admin
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ${Number(req.user.id)}))`;
    const members = await query(
      `SELECT c.id, c.display_name, c.location, c.photo_url, c.orientation
       FROM group_members gm JOIN contacts c ON c.id = gm.contact_id
       WHERE gm.group_id = ? AND c.deleted_at IS NULL ${scope}
       ORDER BY c.display_name`,
      [groupId]
    );
    res.json({ members });
  } catch (err) { next(err); }
});

// POST /api/groups
router.post('/', async (req, res, next) => {
  try {
    const { name, color, icon, description, system } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Group name is required' });
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Color must be a hex value' });
    const isSystemGroup = system && isAdmin(req.user);
    const owner = isSystemGroup ? null : req.user.id;
    const result = await query(
      'INSERT INTO `groups` (name, color, icon, description, owner_user_id, is_system) VALUES (?, ?, ?, ?, ?, ?)',
      [String(name).trim(), color || '#7c5bf5', icon || 'users', description || null, owner, isSystemGroup ? 1 : 0]
    );
    auditWrite(req.user.id, null, 'create', 'group', result.insertId, null, { name }, `Created group ${name}`);
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

async function loadGroup(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Group not found' });
  const rows = await query('SELECT * FROM `groups` WHERE id = ?', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Group not found' });
  const group = rows[0];
  if (group.owner_user_id !== null && group.owner_user_id !== req.user.id && !isAdmin(req.user)) {
    return res.status(404).json({ error: 'Group not found' });
  }
  if (group.is_system && !isAdmin(req.user)) {
    return res.status(403).json({ error: 'System groups are managed by admins' });
  }
  req.group = group;
  next();
}

// PUT /api/groups/:id — system groups renamable, not deletable
router.put('/:id', loadGroup, async (req, res, next) => {
  try {
    const { name, color, icon, description } = req.body || {};
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Color must be a hex value' });
    const updates = [];
    const params = [];
    if (name && String(name).trim()) { updates.push('name = ?'); params.push(String(name).trim()); }
    if (color) { updates.push('color = ?'); params.push(color); }
    if (icon !== undefined) { updates.push('icon = ?'); params.push(icon || 'users'); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.group.id);
    await query(`UPDATE \`groups\` SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, null, 'update', 'group', req.group.id, { name: req.group.name }, req.body, 'Updated group');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id
router.delete('/:id', loadGroup, async (req, res, next) => {
  try {
    if (req.group.is_system) return res.status(403).json({ error: "System groups can't be deleted" });
    await query('DELETE FROM `groups` WHERE id = ?', [req.group.id]);
    auditWrite(req.user.id, null, 'delete', 'group', req.group.id, { name: req.group.name }, null, `Deleted group ${req.group.name}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/groups/:id/members/:contactId
router.post('/:id/members/:contactId', async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) return res.status(404).json({ error: 'Group not found' });
    const contactId = Number(req.params.contactId);
    if (!Number.isInteger(contactId) || contactId <= 0) return res.status(404).json({ error: 'Contact not found' });
    const groups = await query('SELECT * FROM `groups` WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)', [groupId, req.user.id]);
    if (!groups.length) return res.status(404).json({ error: 'Group not found' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access to this contact' });
    }
    await query('INSERT IGNORE INTO group_members (group_id, contact_id) VALUES (?, ?)', [groupId, found.contact.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id/members/:contactId
router.delete('/:id/members/:contactId', async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) return res.status(404).json({ error: 'Group not found' });
    const contactId = Number(req.params.contactId);
    if (!Number.isInteger(contactId) || contactId <= 0) return res.status(404).json({ error: 'Contact not found' });
    const groups = await query('SELECT * FROM `groups` WHERE id = ? AND (owner_user_id IS NULL OR owner_user_id = ?)', [groupId, req.user.id]);
    if (!groups.length) return res.status(404).json({ error: 'Group not found' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    await query('DELETE FROM group_members WHERE group_id = ? AND contact_id = ?', [groupId, found.contact.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
