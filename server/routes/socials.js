const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// GET /api/socials?contact_id= - List social links for a contact
router.get('/', requireAuth, async (req, res) => {
  try {
    const contactId = req.query.contact_id;

    if (!contactId) {
      return res.status(400).json({ error: 'contact_id parameter is required' });
    }

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

    const [socials] = await pool.query(
      'SELECT id, contact_id, platform, url, username, created_at FROM social_links WHERE contact_id = ? ORDER BY created_at DESC',
      [contactId]
    );

    res.json(socials);
  } catch (err) {
    console.error('Get socials error:', err);
    res.status(500).json({ error: 'Failed to fetch social links' });
  }
});

// POST /api/socials - Create social link
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, platform, url, username } = req.body;

    if (!contact_id || !platform) {
      return res.status(400).json({ error: 'contact_id and platform are required' });
    }

    // Verify contact ownership
    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ?',
      [contact_id]
    );

    if (!contact || contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [result] = await pool.query(
      'INSERT INTO social_links (contact_id, platform, url, username) VALUES (?, ?, ?, ?)',
      [contact_id, platform, url || null, username || null]
    );

    const [social] = await pool.query(
      'SELECT id, contact_id, platform, url, username, created_at FROM social_links WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(social[0]);
  } catch (err) {
    console.error('Create social error:', err);
    res.status(500).json({ error: 'Failed to create social link' });
  }
});

// PUT /api/socials/:id - Update social link
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const socialId = req.params.id;
    const { platform, url, username } = req.body;

    // Get social to verify ownership
    const [social] = await pool.query(
      'SELECT sl.id, c.owner_user_id FROM social_links sl JOIN contacts c ON sl.contact_id = c.id WHERE sl.id = ?',
      [socialId]
    );

    if (!social || social.length === 0) {
      return res.status(404).json({ error: 'Social link not found' });
    }

    if (social[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (platform !== undefined) {
      updateFields.push('platform = ?');
      updateValues.push(platform);
    }
    if (url !== undefined) {
      updateFields.push('url = ?');
      updateValues.push(url);
    }
    if (username !== undefined) {
      updateFields.push('username = ?');
      updateValues.push(username);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(socialId);
    const query = `UPDATE social_links SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      'SELECT id, contact_id, platform, url, username, created_at FROM social_links WHERE id = ?',
      [socialId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update social error:', err);
    res.status(500).json({ error: 'Failed to update social link' });
  }
});

// DELETE /api/socials/:id - Delete social link
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const socialId = req.params.id;

    // Get social to verify ownership
    const [social] = await pool.query(
      'SELECT sl.id, c.owner_user_id FROM social_links sl JOIN contacts c ON sl.contact_id = c.id WHERE sl.id = ?',
      [socialId]
    );

    if (!social || social.length === 0) {
      return res.status(404).json({ error: 'Social link not found' });
    }

    if (social[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM social_links WHERE id = ?', [socialId]);

    res.json({ message: 'Social link deleted' });
  } catch (err) {
    console.error('Delete social error:', err);
    res.status(500).json({ error: 'Failed to delete social link' });
  }
});

module.exports = router;
