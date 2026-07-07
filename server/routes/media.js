'use strict';

// Media: upload (multer → MEDIA_PATH), list, update, soft delete, and
// AUTHENTICATED file serving (§7.13 — never express.static on the media dir).
// Video thumbnails via fluent-ffmpeg (frame ~1s → JPEG beside the file).
// Spicy captions are field-encrypted (§7.E); blobs are not (documented risk).

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const { query } = require('../database/connection');
const { requireAuth, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { spicyVisible } = require('./contacts');
const { encryptField, decryptField } = require('../lib/crypto');

const router = express.Router();
router.use(requireAuth);

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';
const MAX_UPLOAD = Number(process.env.MAX_UPLOAD_SIZE || 52428800);

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp' };
const VIDEO_TYPES = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'video/x-matroska': '.mkv' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(MEDIA_PATH, 'kith');
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename: (req, file, cb) => {
    const ext = IMAGE_TYPES[file.mimetype] || VIDEO_TYPES[file.mimetype] || '';
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD, files: 10 },
  fileFilter: (req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype] || VIDEO_TYPES[file.mimetype]) return cb(null, true);
    cb(new Error('Only images (jpeg/png/gif/webp) and videos (mp4/mov/webm/mkv) are allowed'));
  },
});

/** Resolve a stored relative path inside MEDIA_PATH, guarding traversal. */
function resolveMediaPath(relPath) {
  const abs = path.resolve(MEDIA_PATH, relPath);
  const root = path.resolve(MEDIA_PATH);
  if (!abs.startsWith(root + path.sep) && abs !== root) return null;
  return abs;
}

/** Access check for a media row: owner, admin, or via contact share. */
async function mediaAccess(user, media) {
  if (media.owner_user_id === user.id) return { access: 'owner' };
  if (isAdmin(user)) return { access: 'admin' };
  if (media.contact_id) {
    const found = await contactAccess(user, media.contact_id);
    if (found && found.access === 'shared') {
      const scope = found.share.share_scope;
      if (scope === 'full' || scope === 'full_spicy') return { access: 'shared', scope };
      // basic scope exposes photo_url — allow read of exactly the contact's
      // current (non-spicy) profile photo so the avatar renders.
      // photo_url is always the authenticated media route: /api/media/:id/file
      if (scope === 'basic' && !media.is_spicy &&
          found.contact.photo_url === `/api/media/${media.id}/file`) {
        return { access: 'shared', scope };
      }
    }
  }
  return null;
}

async function loadMedia(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid media id' });
    const rows = await query('SELECT * FROM media_assets WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Media not found' });
    const media = rows[0];
    const access = await mediaAccess(req.user, media);
    if (!access) return res.status(404).json({ error: 'Media not found' });
    // spicy gate: spicy media requires active spicy mode (and full_spicy scope for shares)
    if (media.is_spicy) {
      const visible = await spicyVisible(req.user);
      if (!visible) return res.status(404).json({ error: 'Media not found' });
      if (access.access === 'shared' && access.scope !== 'full_spicy') return res.status(404).json({ error: 'Media not found' });
    }
    req.media = media;
    req.mediaAccessInfo = access;
    next();
  } catch (err) { next(err); }
}

// GET /api/media?contact_id=&type=&spicy=
router.get('/', async (req, res, next) => {
  try {
    const { contact_id, type, spicy } = req.query;
    const where = ['m.deleted_at IS NULL'];
    const params = [];

    if (contact_id) {
      const cidNum = Number(contact_id);
      if (!Number.isInteger(cidNum) || cidNum <= 0) return res.status(404).json({ error: 'Contact not found' });
      const found = await contactAccess(req.user, cidNum);
      if (!found) return res.status(404).json({ error: 'Contact not found' });
      if (found.access === 'shared' && found.share.share_scope === 'basic') {
        return res.json({ media: [] });
      }
      where.push('m.contact_id = ?');
      params.push(cidNum);
      if (found.access === 'shared' && found.share.share_scope !== 'full_spicy') where.push('m.is_spicy = 0');
    } else if (!isAdmin(req.user)) {
      where.push('m.owner_user_id = ?');
      params.push(req.user.id);
    }

    const showSpicy = await spicyVisible(req.user);
    if (!showSpicy) where.push('m.is_spicy = 0');
    else if (spicy === '1') where.push('m.is_spicy = 1');
    else if (spicy === '0') where.push('m.is_spicy = 0');

    if (type === 'photo' || type === 'video') { where.push('m.type = ?'); params.push(type); }

    const rows = await query(
      `SELECT m.* FROM media_assets m WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC LIMIT 500`,
      params
    );
    res.json({
      media: rows.map((m) => ({
        ...m,
        caption: m.is_spicy ? decryptField(m.caption) : m.caption,
        file_path: undefined, thumbnail_path: undefined, // never expose fs paths
        has_thumbnail: Boolean(m.thumbnail_path),
      })),
    });
  } catch (err) { next(err); }
});

// POST /api/media — upload (multipart: files[], contact_id?, caption?, is_spicy?)
router.post('/', (req, res, next) => {
  upload.array('files', 10)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });

    let contactId = null;
    if (req.body.contact_id) {
      const found = await contactAccess(req.user, Number(req.body.contact_id));
      if (!found) return res.status(404).json({ error: 'Contact not found' });
      if (found.access === 'shared' && found.share.permissions !== 'edit') {
        return res.status(403).json({ error: 'Read-only access to this contact' });
      }
      contactId = found.contact.id;
    }

    let spicyFlag = req.body.is_spicy === 'true' || req.body.is_spicy === '1' ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;

    const caption = req.body.caption ? String(req.body.caption) : null;
    const storedCaption = spicyFlag && caption ? encryptField(caption) : caption;

    const created = [];
    for (const file of req.files) {
      const isVideo = Boolean(VIDEO_TYPES[file.mimetype]);
      const relPath = path.relative(MEDIA_PATH, file.path);
      const result = await query(
        `INSERT INTO media_assets (contact_id, owner_user_id, type, file_path, caption, is_spicy)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [contactId, req.user.id, isVideo ? 'video' : 'photo', relPath, storedCaption, spicyFlag]
      );
      created.push(result.insertId);

      if (isVideo) generateThumbnail(file.path, result.insertId);
      auditWrite(req.user.id, contactId, 'create', 'media', result.insertId, null,
        { type: isVideo ? 'video' : 'photo', is_spicy: spicyFlag }, 'Uploaded media');
    }
    res.status(201).json({ ids: created });
  } catch (err) { next(err); }
});

/** Generate a JPEG thumbnail at ~1s beside the video file; update the row. */
function generateThumbnail(videoPath, mediaId) {
  const thumbPath = videoPath.replace(/\.[^.]+$/, '') + '.thumb.jpg';
  ffmpeg(videoPath)
    .on('end', async () => {
      try {
        const rel = path.relative(MEDIA_PATH, thumbPath);
        await query('UPDATE media_assets SET thumbnail_path = ? WHERE id = ?', [rel, mediaId]);
      } catch (err) {
        console.error('[thumbnail] DB update failed:', err.message);
      }
    })
    .on('error', (err) => console.error('[thumbnail] generation failed:', err.message))
    .screenshots({
      timestamps: [1],
      filename: path.basename(thumbPath),
      folder: path.dirname(thumbPath),
      size: '480x?',
    });
}

// GET /api/media/:id/file — authenticated bytes
router.get('/:id/file', loadMedia, (req, res) => {
  const abs = resolveMediaPath(req.media.file_path);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
  res.sendFile(abs);
});

// GET /api/media/:id/thumbnail — authenticated thumbnail (videos)
router.get('/:id/thumbnail', loadMedia, (req, res) => {
  const rel = req.media.thumbnail_path || req.media.file_path;
  const abs = resolveMediaPath(rel);
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ error: 'File missing' });
  res.sendFile(abs);
});

// PUT /api/media/:id — caption, spicy flag, contact link, profile eligibility
router.put('/:id', loadMedia, async (req, res, next) => {
  try {
    if (req.mediaAccessInfo.access === 'shared') return res.status(403).json({ error: 'Read-only access' });
    const b = req.body || {};
    const updates = [];
    const params = [];

    let spicyFlag = req.media.is_spicy;
    if ('is_spicy' in b) {
      const wanted = b.is_spicy ? 1 : 0;
      if (wanted === 1 && !(await spicyVisible(req.user))) { /* keep */ } else spicyFlag = wanted;
      updates.push('is_spicy = ?');
      params.push(spicyFlag);
    }
    if ('caption' in b) {
      const cap = b.caption ? String(b.caption) : null;
      updates.push('caption = ?');
      params.push(spicyFlag && cap ? encryptField(cap) : cap);
    } else if ('is_spicy' in b) {
      // re-encode existing caption to match the new spicy state
      const plain = req.media.is_spicy ? decryptField(req.media.caption) : req.media.caption;
      updates.push('caption = ?');
      params.push(spicyFlag && plain ? encryptField(plain) : plain);
    }
    if ('is_profile_eligible' in b) { updates.push('is_profile_eligible = ?'); params.push(b.is_profile_eligible ? 1 : 0); }
    if ('contact_id' in b) {
      let cid = null;
      if (b.contact_id) {
        const found = await contactAccess(req.user, Number(b.contact_id));
        if (!found) return res.status(404).json({ error: 'Contact not found' });
        // mirror the upload check: no re-parenting onto read-only shared contacts
        if (found.access === 'shared' && found.share.permissions !== 'edit') {
          return res.status(403).json({ error: 'Read-only access to this contact' });
        }
        cid = found.contact.id;
      }
      updates.push('contact_id = ?');
      params.push(cid);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.media.id);
    await query(`UPDATE media_assets SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/media/:id — soft
router.delete('/:id', loadMedia, async (req, res, next) => {
  try {
    if (req.mediaAccessInfo.access === 'shared') return res.status(403).json({ error: 'Read-only access' });
    await query('UPDATE media_assets SET deleted_at = NOW() WHERE id = ?', [req.media.id]);
    auditWrite(req.user.id, req.media.contact_id, 'delete', 'media', req.media.id, null, null, 'Deleted media');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
