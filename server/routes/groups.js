const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /
 * List groups with member counts
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.id, g.name, g.color, g.icon, g.description, g.owner_user_id, g.is_system, g.created_at,
              COUNT(gm.contact_id) as member_count
       FROM \`groups\` g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.owner_user_id IS NULL OR g.owner_user_id = ?
       GROUP BY g.id
       ORDER BY g.name`,
      [req.user.id]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create new group
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { name, color, icon, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const [result] = await pool.query(
      'INSERT INTO `groups` (name, color, icon, description, owner_user_id) VALUES (?, ?, ?, ?, ?)',
      [name, color || '#808080', icon || null, description || null, req.user.id]
    );

    const [group] = await pool.query(
      `SELECT id, name, color, icon, description, owner_user_id, is_system, created_at, 0 as member_count
       FROM \`groups\` WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(group[0]);
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update group
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group ID' });

    const { name, color, icon, description } = req.body;

    const [existing] = await pool.query(
      'SELECT owner_user_id, is_system FROM `groups` WHERE id = ?',
      [groupId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (existing[0].is_system) {
      return res.status(403).json({ error: 'Cannot edit system groups' });
    }

    if (existing[0].owner_user_id && existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (color !== undefined) {
      updates.push('color = ?');
      values.push(color);
    }
    if (icon !== undefined) {
      updates.push('icon = ?');
      values.push(icon);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(groupId);
    const query = `UPDATE \`groups\` SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [group] = await pool.query(
      `SELECT g.id, g.name, g.color, g.icon, g.description, g.owner_user_id, g.is_system, g.created_at,
              COUNT(gm.contact_id) as member_count
       FROM \`groups\` g
       LEFT JOIN group_members gm ON g.id = gm.group_id
       WHERE g.id = ?
       GROUP BY g.id`,
      [groupId]
    );

    res.status(200).json(group[0]);
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Delete group (not system groups)
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) return res.status(400).json({ error: 'Invalid group ID' });

    const [existing] = await pool.query(
      'SELECT owner_user_id, is_system FROM `groups` WHERE id = ?',
      [groupId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (existing[0].is_system) {
      return res.status(403).json({ error: 'Cannot delete system groups' });
    }

    if (existing[0].owner_user_id && existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM group_members WHERE group_id = ?', [groupId]);
    await pool.query('DELETE FROM `groups` WHERE id = ?', [groupId]);

    res.status(200).json({ success: true, message: 'Group deleted' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /:id/members/:contactId
 * Add member to group
 */
router.post('/:id/members/:contactId', requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const contactId = parseInt(req.params.contactId);

    if (isNaN(groupId) || isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid group or contact ID' });
    }

    const [group] = await pool.query(
      'SELECT owner_user_id FROM `groups` WHERE id = ?',
      [groupId]
    );

    if (group.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group[0].owner_user_id && group[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    try {
      await pool.query(
        'INSERT INTO group_members (group_id, contact_id) VALUES (?, ?)',
        [groupId, contactId]
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Contact already in group' });
      }
      throw err;
    }

    res.status(201).json({ success: true, message: 'Member added to group' });
  } catch (err) {
    console.error('Add member to group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id/members/:contactId
 * Remove member from group
 */
router.delete('/:id/members/:contactId', requireAuth, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);
    const contactId = parseInt(req.params.contactId);

    if (isNaN(groupId) || isNaN(contactId)) {
      return res.status(400).json({ error: 'Invalid group or contact ID' });
    }

    const [group] = await pool.query(
      'SELECT owner_user_id FROM `groups` WHERE id = ?',
      [groupId]
    );

    if (group.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group[0].owner_user_id && group[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'DELETE FROM group_members WHERE group_id = ? AND contact_id = ?',
      [groupId, contactId]
    );

    res.status(200).json({ success: true, message: 'Member removed from group' });
  } catch (err) {
    console.error('Remove member from group error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
