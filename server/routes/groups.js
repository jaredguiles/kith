'use strict';

// Groups: system groups (renamable, not deletable) + user groups; membership.
// A group with tag_id set is a "smart group": its membership IS the set of
// contacts carrying the linked tag (contact_tags). group_members rows are
// ignored for smart groups; member add/remove writes the tag instead.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { rebuildSearchIndexAsync } = require('../lib/contacts');

const router = express.Router();
router.use(requireAuth);

// Resolve a tag_id value from a request body for linking: null clears the
// link (manual group); a positive int must be a tag visible to the user
// (system tag or own; admins may link any). Returns { ok, value?, error? }.
async function resolveTagLink(user, raw) {
  if (raw === null || raw === undefined || raw === '') return { ok: true, value: null };
  const tagId = Number(raw);
  if (!Number.isInteger(tagId) || tagId <= 0) return { ok: false, error: 'tag_id must be a positive integer or null' };
  const rows = await query('SELECT id, owner_user_id FROM tags WHERE id = ?', [tagId]);
  if (!rows.length) return { ok: false, error: 'Linked tag not found' };
  if (rows[0].owner_user_id !== null && rows[0].owner_user_id !== user.id && !isAdmin(user)) {
    return { ok: false, error: 'Linked tag not found' };
  }
  return { ok: true, value: tagId };
}

// GET /api/groups — with member counts (members scoped to what the user can see)
router.get('/', async (req, res, next) => {
  try {
    const admin = isAdmin(req.user);
    const scopeJoin = admin
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ${Number(req.user.id)}))`;
    const rows = await query(
      `SELECT g.*, t.name AS tag_name, t.color AS tag_color,
        CASE WHEN g.tag_id IS NULL THEN
          (SELECT COUNT(*) FROM group_members gm JOIN contacts c ON c.id = gm.contact_id AND c.deleted_at IS NULL ${scopeJoin}
           WHERE gm.group_id = g.id)
        ELSE
          (SELECT COUNT(*) FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id AND c.deleted_at IS NULL ${scopeJoin}
           WHERE ct.tag_id = g.tag_id)
        END AS member_count
       FROM \`groups\` g
       LEFT JOIN tags t ON t.id = g.tag_id
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
    const group = groups[0];
    const admin = isAdmin(req.user);
    const scope = admin
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ${Number(req.user.id)}))`;
    // smart group: membership is derived from the linked tag
    const members = group.tag_id !== null
      ? await query(
          `SELECT c.id, c.display_name, c.location, c.photo_url, c.orientation
           FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id
           WHERE ct.tag_id = ? AND c.deleted_at IS NULL ${scope}
           ORDER BY c.display_name`,
          [group.tag_id]
        )
      : await query(
          `SELECT c.id, c.display_name, c.location, c.photo_url, c.orientation
           FROM group_members gm JOIN contacts c ON c.id = gm.contact_id
           WHERE gm.group_id = ? AND c.deleted_at IS NULL ${scope}
           ORDER BY c.display_name`,
          [groupId]
        );
    res.json({ members });
  } catch (err) { next(err); }
});

// GET /api/groups/:id — one group with tag link + member count (same
// visibility as the list: system groups + own; counts scoped to what the
// user can see). No shadowing risk: /:id is single-segment and can never
// match /:id/members.
router.get('/:id', async (req, res, next) => {
  try {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId <= 0) return res.status(404).json({ error: 'Group not found' });
    const admin = isAdmin(req.user);
    const scopeJoin = admin
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ${Number(req.user.id)}))`;
    const rows = await query(
      `SELECT g.*, t.name AS tag_name, t.color AS tag_color,
        CASE WHEN g.tag_id IS NULL THEN
          (SELECT COUNT(*) FROM group_members gm JOIN contacts c ON c.id = gm.contact_id AND c.deleted_at IS NULL ${scopeJoin}
           WHERE gm.group_id = g.id)
        ELSE
          (SELECT COUNT(*) FROM contact_tags ct JOIN contacts c ON c.id = ct.contact_id AND c.deleted_at IS NULL ${scopeJoin}
           WHERE ct.tag_id = g.tag_id)
        END AS member_count
       FROM \`groups\` g
       LEFT JOIN tags t ON t.id = g.tag_id
       WHERE g.id = ? AND (g.owner_user_id IS NULL OR g.owner_user_id = ?)`,
      [groupId, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Group not found' });
    res.json({ group: rows[0] });
  } catch (err) { next(err); }
});

// POST /api/groups
router.post('/', async (req, res, next) => {
  try {
    const { name, color, icon, description, system, tag_id } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Group name is required' });
    if (color && !/^#[0-9a-fA-F]{6}$/.test(color)) return res.status(400).json({ error: 'Color must be a hex value' });
    const link = await resolveTagLink(req.user, tag_id);
    if (!link.ok) return res.status(400).json({ error: link.error });
    const isSystemGroup = system && isAdmin(req.user);
    const owner = isSystemGroup ? null : req.user.id;
    const result = await query(
      'INSERT INTO `groups` (name, color, icon, description, owner_user_id, is_system, tag_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [String(name).trim(), color || '#7c5bf5', icon || 'users', description || null, owner, isSystemGroup ? 1 : 0, link.value]
    );
    auditWrite(req.user.id, null, 'create', 'group', result.insertId, null, { name, tag_id: link.value }, `Created group ${name}`);
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
    if ('tag_id' in (req.body || {})) {
      const link = await resolveTagLink(req.user, req.body.tag_id);
      if (!link.ok) return res.status(400).json({ error: link.error });
      updates.push('tag_id = ?');
      params.push(link.value);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.group.id);
    await query(`UPDATE \`groups\` SET ${updates.join(', ')} WHERE id = ?`, params);
    auditWrite(req.user.id, null, 'update', 'group', req.group.id, { name: req.group.name }, req.body, 'Updated group');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/groups/:id — deleting a smart group deletes ONLY the group row
// (group_members cascades); the linked tag and contact_tags are untouched.
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
    const group = groups[0];
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access to this contact' });
    }
    if (group.tag_id !== null) {
      // smart group: "adding a member" = tagging the contact with the linked tag
      await query('INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', [found.contact.id, group.tag_id]);
      rebuildSearchIndexAsync(found.contact.id);
    } else {
      await query('INSERT IGNORE INTO group_members (group_id, contact_id) VALUES (?, ?)', [groupId, found.contact.id]);
    }
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
    const group = groups[0];
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (group.tag_id !== null) {
      // smart group: "removing a member" = removing the linked tag. Also clear
      // any legacy group_members row so it can't resurrect membership if the
      // group is later unlinked back to manual.
      await query('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?', [found.contact.id, group.tag_id]);
      await query('DELETE FROM group_members WHERE group_id = ? AND contact_id = ?', [groupId, found.contact.id]);
      rebuildSearchIndexAsync(found.contact.id);
    } else {
      await query('DELETE FROM group_members WHERE group_id = ? AND contact_id = ?', [groupId, found.contact.id]);
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
