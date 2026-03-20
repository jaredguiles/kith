const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// GET /api/groups - List all groups with member counts
router.get('/', requireAuth, async (req, res) => {
  try {
    const [groups] = await pool.query(
      `SELECT g.id, g.name, g.icon, g.color, g.description, g.owner_user_id, g.is_system,
              COUNT(gm.contact_id) as member_count, g.created_at
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.owner_user_id IS NULL OR g.owner_user_id = ?
       GROUP BY g.id
       ORDER BY g.name ASC`,
      [req.user.id]
    );

    res.json(groups);
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /api/groups - Create group
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, icon, color, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const [result] = await pool.query(
      'INSERT INTO groups (name, icon, color, description, owner_user_id, is_system) VALUES (?, ?, ?, ?, ?, 0)',
      [name, icon || null, color || null, description || null, req.user.id]
    );

    const [group] = await pool.query(
      `SELECT id, name, icon, color, description, owner_user_id, is_system, 0 as member_count, created_at
       FROM groups WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(group[0]);
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// PUT /api/groups/:id - Update group
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const { name, icon, color, description } = req.body;

    // Get group to check ownership
    const [group] = await pool.query(
      'SELECT owner_user_id FROM groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check ownership/admin
    if (group[0].owner_user_id !== null && group[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (name !== undefined) {
      updateFields.push('name = ?');
      updateValues.push(name);
    }
    if (icon !== undefined) {
      updateFields.push('icon = ?');
      updateValues.push(icon);
    }
    if (color !== undefined) {
      updateFields.push('color = ?');
      updateValues.push(color);
    }
    if (description !== undefined) {
      updateFields.push('description = ?');
      updateValues.push(description);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(groupId);
    const query = `UPDATE groups SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      `SELECT g.id, g.name, g.icon, g.color, g.description, g.owner_user_id, g.is_system,
              COUNT(gm.contact_id) as member_count, g.created_at
       FROM groups g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.id = ?
       GROUP BY g.id`,
      [groupId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// DELETE /api/groups/:id - Delete group
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;

    // Get group to check ownership and system status
    const [group] = await pool.query(
      'SELECT owner_user_id, is_system FROM groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Cannot delete system groups
    if (group[0].is_system && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Cannot delete system groups' });
    }

    // Check ownership/admin
    if (group[0].owner_user_id !== null && group[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM groups WHERE id = ?', [groupId]);

    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

// POST /api/groups/:id/members/:contactId - Add member to group
router.post('/:id/members/:contactId', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const contactId = req.params.contactId;

    // Verify contact ownership
    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ?',
      [contactId]
    );

    if (!contact || contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify group exists and ownership
    const [group] = await pool.query(
      'SELECT owner_user_id FROM groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group[0].owner_user_id !== null && group[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Insert or ignore duplicate
    await pool.query(
      'INSERT IGNORE INTO group_members (group_id, contact_id) VALUES (?, ?)',
      [groupId, contactId]
    );

    res.status(201).json({ message: 'Member added to group' });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// DELETE /api/groups/:id/members/:contactId - Remove member
router.delete('/:id/members/:contactId', requireAuth, async (req, res) => {
  try {
    const groupId = req.params.id;
    const contactId = req.params.contactId;

    // Verify contact ownership
    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ?',
      [contactId]
    );

    if (!contact || contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify group ownership
    const [group] = await pool.query(
      'SELECT owner_user_id FROM groups WHERE id = ?',
      [groupId]
    );

    if (!group || group.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group[0].owner_user_id !== null && group[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'DELETE FROM group_members WHERE group_id = ? AND contact_id = ?',
      [groupId, contactId]
    );

    res.json({ message: 'Member removed from group' });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

module.exports = router;
