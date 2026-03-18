const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, getSpicyEnabled } = require('../middleware/auth');

/**
 * GET /
 * List media for current user
 * Query params: ?contact_id=, ?type=, ?spicy=, ?limit=, ?offset=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, type, limit = 100, offset = 0 } = req.query;
    const spicyEnabled = await getSpicyEnabled();

    let query = 'SELECT id, contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy, is_profile_eligible, created_at FROM media_assets WHERE owner_user_id = ? AND deleted_at IS NULL';
    const values = [req.user.id];

    if (contact_id) {
      query += ' AND contact_id = ?';
      values.push(parseInt(contact_id));
    }

    if (type) {
      query += ' AND type = ?';
      values.push(type);
    }

    if (!spicyEnabled) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    const countQuery = 'SELECT COUNT(*) as total FROM media_assets WHERE owner_user_id = ? AND deleted_at IS NULL' +
      (contact_id ? ' AND contact_id = ?' : '') +
      (type ? ' AND type = ?' : '') +
      (!spicyEnabled ? ' AND is_spicy = 0' : '');

    const countValues = [req.user.id];
    if (contact_id) countValues.push(parseInt(contact_id));
    if (type) countValues.push(type);

    const [countResult] = await pool.query(countQuery, countValues);

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('List media error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /:id
 * Get media detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id);
    if (isNaN(mediaId)) return res.status(400).json({ error: 'Invalid media ID' });

    const [rows] = await pool.query(
      'SELECT id, contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy, is_profile_eligible, created_at FROM media_assets WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL',
      [mediaId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('Get media error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Upload media (assumes middleware/multer setup upstream)
 * Body params or multipart: file, contact_id (optional), caption, is_spicy, type
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { contact_id, caption, is_spicy, type } = req.body;
    const file = req.file;

    if (!file || !type) {
      return res.status(400).json({ error: 'File and type required' });
    }

    const contactIdValue = contact_id ? parseInt(contact_id) : null;

    if (contactIdValue !== null) {
      const [contact] = await pool.query(
        'SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL',
        [contactIdValue]
      );
      if (contact.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }
    }

    const [result] = await pool.query(
      'INSERT INTO media_assets (contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [contactIdValue, req.user.id, type, file.path || file.filename, null, caption || null, is_spicy ? 1 : 0]
    );

    const [media] = await pool.query(
      'SELECT id, contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy, is_profile_eligible, created_at FROM media_assets WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(media[0]);
  } catch (err) {
    console.error('Upload media error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update media (caption, spicy flag)
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id);
    if (isNaN(mediaId)) return res.status(400).json({ error: 'Invalid media ID' });

    const { caption, is_spicy, is_profile_eligible } = req.body;

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM media_assets WHERE id = ? AND deleted_at IS NULL',
      [mediaId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updates = [];
    const values = [];

    if (caption !== undefined) {
      updates.push('caption = ?');
      values.push(caption);
    }
    if (is_spicy !== undefined) {
      updates.push('is_spicy = ?');
      values.push(is_spicy ? 1 : 0);
    }
    if (is_profile_eligible !== undefined) {
      updates.push('is_profile_eligible = ?');
      values.push(is_profile_eligible ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(mediaId);
    const query = `UPDATE media_assets SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    const [media] = await pool.query(
      'SELECT id, contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy, is_profile_eligible, created_at FROM media_assets WHERE id = ?',
      [mediaId]
    );

    res.status(200).json(media[0]);
  } catch (err) {
    console.error('Update media error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Soft delete media
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id);
    if (isNaN(mediaId)) return res.status(400).json({ error: 'Invalid media ID' });

    const [existing] = await pool.query(
      'SELECT owner_user_id FROM media_assets WHERE id = ? AND deleted_at IS NULL',
      [mediaId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (existing[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('UPDATE media_assets SET deleted_at = NOW() WHERE id = ?', [mediaId]);

    res.status(200).json({ success: true, message: 'Media deleted' });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
