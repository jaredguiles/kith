import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = '/media';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    const { contact_id, caption, platform, is_spicy } = req.body;

    if (!contact_id) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'Contact ID required' });
    }

    const contactId = parseInt(contact_id);
    const contacts = await query('SELECT owner_user_id FROM contacts WHERE id = ?', [contactId]);

    if (contacts.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contacts[0].owner_user_id !== req.user.id) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: 'Access denied' });
    }

    const fileType = req.file.mimetype;

    const result = await query(
      'INSERT INTO media (contact_id, user_id, filename, original_filename, file_path, file_type, file_size, platform, is_spicy, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        contactId,
        req.user.id,
        req.file.filename,
        req.file.originalname,
        `/media/${req.file.filename}`,
        fileType,
        req.file.size,
        platform,
        is_spicy ? 1 : 0,
        caption,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      filename: req.file.filename,
      original_filename: req.file.originalname,
      file_path: `/media/${req.file.filename}`,
      file_type: fileType,
      file_size: req.file.size,
      platform,
      is_spicy: is_spicy ? 1 : 0,
      caption,
    });
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error('Upload media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id);

    const mediaRecords = await query('SELECT * FROM media WHERE id = ?', [mediaId]);

    if (mediaRecords.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const media = mediaRecords[0];
    const contacts = await query('SELECT owner_user_id FROM contacts WHERE id = ?', [media.contact_id]);

    if (contacts.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contacts[0].owner_user_id !== req.user.id && media.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = media.file_path.startsWith('/') ? media.file_path : `/${media.file_path}`;
    const fullPath = filePath;

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.sendFile(fullPath);
  } catch (err) {
    console.error('Get media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const mediaId = parseInt(req.params.id);

    const mediaRecords = await query('SELECT * FROM media WHERE id = ?', [mediaId]);

    if (mediaRecords.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const media = mediaRecords[0];
    const contacts = await query('SELECT owner_user_id FROM contacts WHERE id = ?', [media.contact_id]);

    if (contacts.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (contacts[0].owner_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const filePath = media.file_path.startsWith('/') ? media.file_path : `/${media.file_path}`;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await query('DELETE FROM media WHERE id = ?', [mediaId]);

    res.json({ message: 'Media deleted' });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
