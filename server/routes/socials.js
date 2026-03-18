const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireContactAccess } = require('../middleware/auth');

/**
 * GET /contacts/:id/socials
 * List social links for a contact
 */
router.get('/contacts/:id/socials', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const [rows] = await pool.query(
      'SELECT id, contact_id, platform, url, username, created_at FROM social_links WHERE contact_id = ? ORDER BY platform',
      [contactId]
    );

    res.status(200).json(rows);
  } catch (err) {
    console.error('List socials error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /contacts/:id/socials
 * Add social link to contact
 */
router.post('/contacts/:id/socials', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const { platform, url, username } = req.body;

    if (!platform) {
      return res.status(400).json({ error: 'Platform required' });
    }

    const [result] = await pool.query(
      'INSERT INTO social_links (contact_id, platform, url, username) VALUES (?, ?, ?, ?)',
      [contactId, platform, url || null, username || null]
    );

    const [social] = await pool.query(
      'SELECT id, contact_id, platform, url, username, created_at FROM social_links WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(social[0]);
  } catch (err) {
    console.error('Create social error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update social link
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const socialId = parseInt(req.params.id);
    if (isNaN(socialId)) return res.status(400).json({ error: 'Invalid social ID' });

    const { platform, url, username } = req.body;

    const [existing] = await pool.query(
      'SELECT contact_id FROM social_links WHERE id = ?',
      [socialId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Social link not found' });
    }

    const contactId = existing[0].contact_id;

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const isOwner = contact[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];

    if (platform !== undefined) {
      updates.push('platform = ?');
      values.push(platform);
    }
    if (url !== undefined) {
      updates.push('url = ?');
      values.push(url);
    }
    if (username !== undefined) {
      updates.push('username = ?');
      values.push(username);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(socialId);
    const query = `UPDATE social_links SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [social] = await pool.query(
      'SELECT id, contact_id, platform, url, username, created_at FROM social_links WHERE id = ?',
      [socialId]
    );

    res.status(200).json(social[0]);
  } catch (err) {
    console.error('Update social error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Delete social link
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const socialId = parseInt(req.params.id);
    if (isNaN(socialId)) return res.status(400).json({ error: 'Invalid social ID' });

    const [existing] = await pool.query(
      'SELECT contact_id FROM social_links WHERE id = ?',
      [socialId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Social link not found' });
    }

    const contactId = existing[0].contact_id;

    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const isOwner = contact[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM social_links WHERE id = ?', [socialId]);

    res.status(200).json({ success: true, message: 'Social link deleted' });
  } catch (err) {
    console.error('Delete social error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
