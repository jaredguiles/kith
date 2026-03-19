import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const groups = await query(
      'SELECT id, name, color, icon, description, owner_user_id, is_system, created_at FROM groups WHERE owner_user_id = ? OR is_system = 1 ORDER BY name ASC',
      [req.user.id]
    );

    for (const group of groups) {
      const memberCount = await query('SELECT COUNT(*) as count FROM group_members WHERE group_id = ?', [group.id]);
      group.member_count = memberCount[0].count;
    }

    res.json({ groups });
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, color, icon, description } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name required' });
    }

    const result = await query(
      'INSERT INTO groups (name, color, icon, description, owner_user_id, is_system) VALUES (?, ?, ?, ?, ?, 0)',
      [name, color, icon, description, req.user.id]
    );

    res.status(201).json({
      id: result.insertId,
      name,
      color,
      icon,
      description,
      owner_user_id: req.user.id,
      is_system: 0,
      member_count: 0,
    });
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);

    const groups = await query('SELECT * FROM groups WHERE id = ?', [groupId]);

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groups[0];

    if (!group.is_system && group.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const contacts = await query(
      'SELECT c.id, c.display_name, c.email, c.phone FROM contacts c INNER JOIN group_members gm ON c.id = gm.contact_id WHERE gm.group_id = ? AND c.deleted_at IS NULL',
      [groupId]
    );

    group.members = contacts;

    res.json({ group });
  } catch (err) {
    console.error('Get group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);

    const groups = await query('SELECT * FROM groups WHERE id = ?', [groupId]);

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groups[0];

    if (!group.is_system && group.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name, color, icon, description } = req.body;

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

    await query(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedGroups = await query('SELECT * FROM groups WHERE id = ?', [groupId]);
    const updatedGroup = updatedGroups[0];

    res.json({ group: updatedGroup });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const groupId = parseInt(req.params.id);

    const groups = await query('SELECT * FROM groups WHERE id = ?', [groupId]);

    if (groups.length === 0) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const group = groups[0];

    if (group.is_system) {
      return res.status(403).json({ error: 'Cannot delete system groups' });
    }

    if (group.owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM group_members WHERE group_id = ?', [groupId]);
    await query('DELETE FROM groups WHERE id = ?', [groupId]);

    res.json({ message: 'Group deleted' });
  } catch (err) {
    console.error('Delete group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
