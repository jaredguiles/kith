const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Setup multer
const upload = multer({
  dest: process.env.MEDIA_PATH || '/media',
  limits: { fileSize: parseInt(process.env.MAX_UPLOAD_SIZE || 52428800) }
});

// GET /api/media?contact_id= - List media
router.get('/', requireAuth, async (req, res) => {
  try {
    const contactId = req.query.contact_id;
    const type = req.query.type;
    const spicy = req.query.spicy;
    const spicyMode = req.headers['x-spicy-mode'] === 'true';

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

    let query = `
      SELECT id, contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy, is_profile_eligible, created_at
      FROM media_assets
      WHERE contact_id = ? AND deleted_at IS NULL`;
    const params = [contactId];

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    if (spicy !== undefined) {
      query += ' AND is_spicy = ?';
      params.push(spicy === 'true' ? 1 : 0);
    }

    // Filter spicy unless spicy mode
    if (!spicyMode) {
      query += ' AND is_spicy = 0';
    }

    query += ' ORDER BY created_at DESC';

    const [media] = await pool.query(query, params);
    res.json(media);
  } catch (err) {
    console.error('Get media error:', err);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// POST /api/media - Upload media
router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { contact_id, type, caption, is_spicy } = req.body;

    if (!contact_id || !type) {
      // Clean up uploaded file
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'contact_id and type are required' });
    }

    // Verify contact ownership
    const [contact] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ?',
      [contact_id]
    );

    if (!contact || contact.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contact[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'Access denied' });
    }

    // For now, just store the file path. Video thumbnail generation is a future enhancement
    const [result] = await pool.query(
      `INSERT INTO media_assets (contact_id, owner_user_id, type, file_path, caption, is_spicy, is_profile_eligible)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [contact_id, req.user.id, type, req.file.path, caption || null, is_spicy ? 1 : 0]
    );

    const [media] = await pool.query(
      `SELECT id, contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy, is_profile_eligible, created_at
       FROM media_assets WHERE id = ?`,
      [result.insertId]
    );

    res.status(201).json(media[0]);
  } catch (err) {
    console.error('Upload media error:', err);
    if (req.file) {
      fs.unlink(req.file.path, () => {});
    }
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

// PUT /api/media/:id - Update media
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const mediaId = req.params.id;
    const { caption, is_spicy } = req.body;

    // Get media to verify ownership
    const [media] = await pool.query(
      'SELECT owner_user_id FROM media_assets WHERE id = ?',
      [mediaId]
    );

    if (!media || media.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (caption !== undefined) {
      updateFields.push('caption = ?');
      updateValues.push(caption);
    }
    if (is_spicy !== undefined) {
      updateFields.push('is_spicy = ?');
      updateValues.push(is_spicy ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(mediaId);
    const query = `UPDATE media_assets SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      `SELECT id, contact_id, owner_user_id, type, file_path, thumbnail_path, caption, is_spicy, is_profile_eligible, created_at
       FROM media_assets WHERE id = ?`,
      [mediaId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update media error:', err);
    res.status(500).json({ error: 'Failed to update media' });
  }
});

// DELETE /api/media/:id - Soft delete
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const mediaId = req.params.id;

    // Get media to verify ownership
    const [media] = await pool.query(
      'SELECT owner_user_id FROM media_assets WHERE id = ?',
      [mediaId]
    );

    if (!media || media.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'UPDATE media_assets SET deleted_at = NOW() WHERE id = ?',
      [mediaId]
    );

    res.json({ message: 'Media deleted' });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Failed to delete media' });
  }
});

module.exports = router;
