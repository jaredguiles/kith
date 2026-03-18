const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const pool = require('../database/connection');
const { requireAuth, requireExtensionAuth } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 10
  }
});

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * POST /upload
 * File upload import endpoint
 */
router.post('/upload', requireAuth, upload.array('files', 10), async (req, res) => {
  try {
    const { source_platform } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!source_platform) {
      return res.status(400).json({ error: 'source_platform is required' });
    }

    const validPlatforms = ['facebook', 'instagram', 'twitter', 'google_contacts', 'vcard', 'csv'];
    if (!validPlatforms.includes(source_platform)) {
      return res.status(400).json({ error: `Invalid source_platform: ${source_platform}` });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'At least one file is required' });
    }

    // Create import job record
    const [rows] = await pool.query(
      `INSERT INTO import_jobs (user_id, source_platform, status, total_records, processed_records)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, source_platform, 'queued', 0, 0]
    );

    const importJobId = rows.insertId;

    // Store uploaded files temporarily
    const jobDir = path.join(MEDIA_PATH, 'imports', importJobId.toString());
    await fs.mkdir(jobDir, { recursive: true });

    for (const file of req.files) {
      const filePath = path.join(jobDir, file.originalname);
      await fs.writeFile(filePath, file.buffer);
    }

    // Store file metadata in database
    for (const file of req.files) {
      await pool.query(
        `INSERT INTO import_files (import_job_id, original_filename, file_size)
         VALUES (?, ?, ?)`,
        [importJobId, file.originalname, file.size]
      );
    }

    res.json({ import_job_id: importJobId });
  } catch (error) {
    console.error('Upload import error:', error);
    res.status(500).json({ error: 'Failed to process import upload' });
  }
});

/**
 * POST /extension
 * Receive data from Chrome extension
 */
router.post('/extension', requireExtensionAuth, async (req, res) => {
  try {
    const { source_platform, records = [], media_uploads = [] } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!source_platform) {
      return res.status(400).json({ error: 'source_platform is required' });
    }

    const validPlatforms = ['facebook', 'instagram', 'twitter', 'snapchat', 'tiktok', 'threads'];
    if (!validPlatforms.includes(source_platform)) {
      return res.status(400).json({ error: `Invalid source_platform: ${source_platform}` });
    }

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: 'records array is required' });
    }

    // Create import job
    const [rows] = await pool.query(
      `INSERT INTO import_jobs (user_id, source_platform, status, total_records, processed_records)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, source_platform, 'awaiting_review', records.length, records.length]
    );

    const importJobId = rows.insertId;

    // Process media uploads
    const mediaMap = {};
    if (Array.isArray(media_uploads) && media_uploads.length > 0) {
      const platformDir = path.join(MEDIA_PATH, 'PersonalExports', source_platform.charAt(0).toUpperCase() + source_platform.slice(1));
      await fs.mkdir(platformDir, { recursive: true });

      for (const upload of media_uploads) {
        const { key, base64Data } = upload;
        if (key && base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          const filename = `${crypto.randomBytes(8).toString('hex')}_${key}`;
          const filepath = path.join(platformDir, filename);
          await fs.writeFile(filepath, buffer);
          mediaMap[key] = filepath;
        }
      }
    }

    // Create import_staging records
    for (const record of records) {
      // Add media paths to record
      if (record.media && Array.isArray(record.media)) {
        record.media = record.media.map(m => ({
          ...m,
          path: mediaMap[m.key] || m.path
        }));
      }

      // Auto-set is_spicy_source for snapchat/tiktok
      const isSpicySource = ['snapchat', 'tiktok'].includes(source_platform);

      await pool.query(
        `INSERT INTO import_staging (import_job_id, source_platform, normalized_data, is_spicy_source, review_status, match_confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [importJobId, source_platform, JSON.stringify(record), isSpicySource, 'pending', 0]
      );
    }

    res.json({ import_job_id: importJobId });
  } catch (error) {
    console.error('Extension import error:', error);
    res.status(500).json({ error: 'Failed to process extension import' });
  }
});

/**
 * GET /jobs
 * List all import jobs for current user
 */
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT id, source_platform, status, total_records, processed_records, created_at
       FROM import_jobs
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 100`,
      [userId]
    );

    res.json(rows);
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to retrieve import jobs' });
  }
});

/**
 * GET /jobs/:id
 * Get status and progress for specific job
 */
router.get('/jobs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [rows] = await pool.query(
      `SELECT id, source_platform, status, total_records, processed_records, created_at, completed_at
       FROM import_jobs
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const job = rows[0];

    // Get staging record counts by review status
    const [stagingRows] = await pool.query(
      `SELECT review_status, COUNT(*) as count
       FROM import_staging
       WHERE import_job_id = ?
       GROUP BY review_status`,
      [id]
    );

    const stagingCounts = {};
    for (const row of stagingRows) {
      stagingCounts[row.review_status] = parseInt(row.count, 10);
    }

    res.json({
      ...job,
      staging_counts: stagingCounts
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to retrieve job' });
  }
});

/**
 * GET /review
 * List pending import_staging records
 */
router.get('/review', requireAuth, async (req, res) => {
  try {
    const { job_id } = req.query;
    const userId = req.user.id;

    let query = `
      SELECT s.id, s.import_job_id, s.source_platform, s.normalized_data,
             s.is_spicy_source, s.review_status, s.match_confidence, s.suggested_match_contact_id,
             s.created_at
      FROM import_staging s
      JOIN import_jobs j ON s.import_job_id = j.id
      WHERE j.user_id = ? AND s.review_status = 'pending'
    `;

    const params = [userId];

    if (job_id) {
      query += ` AND s.import_job_id = ?`;
      params.push(job_id);
    }

    query += ` ORDER BY s.created_at ASC LIMIT 1000`;

    const result = await pool.query(query, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Get review records error:', error);
    res.status(500).json({ error: 'Failed to retrieve review records' });
  }
});

/**
 * PUT /review/:id
 * Set decision on staging record
 */
router.put('/review/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { review_status, suggested_match_contact_id, merge_field_decisions } = req.body;
    const userId = req.user.id;

    // Validate review_status
    const validStatuses = ['approved_new', 'approved_merge', 'skipped'];
    if (!validStatuses.includes(review_status)) {
      return res.status(400).json({ error: 'Invalid review_status' });
    }

    // Verify ownership
    const [stagingRows] = await pool.query(
      `SELECT s.id FROM import_staging s
       JOIN import_jobs j ON s.import_job_id = j.id
       WHERE s.id = ? AND j.user_id = ?`,
      [id, userId]
    );

    const stagingResult = { rows: stagingRows };

    if (stagingResult.rows.length === 0) {
      return res.status(404).json({ error: 'Staging record not found' });
    }

    // Update staging record
    await pool.query(
      `UPDATE import_staging
       SET review_status = ?, suggested_match_contact_id = ?, merge_field_decisions = ?
       WHERE id = ?`,
      [review_status, suggested_match_contact_id || null, JSON.stringify(merge_field_decisions || {}), id]
    );

    res.json({ success: true, id: parseInt(id, 10) });
  } catch (error) {
    console.error('Update review error:', error);
    res.status(500).json({ error: 'Failed to update review decision' });
  }
});

/**
 * POST /jobs/:id/finalize
 * Commit all reviewed decisions for a job
 */
router.post('/jobs/:id/finalize', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify job ownership
    const [jobRows] = await pool.query(
      `SELECT id FROM import_jobs
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (jobRows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Begin transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get all reviewed staging records
      const [stagingRows] = await client.query(
        `SELECT id, normalized_data, review_status, suggested_match_contact_id, merge_field_decisions
         FROM import_staging
         WHERE import_job_id = ? AND review_status IN ('approved_new', 'approved_merge')`,
        [id]
      );

      const stagingResult = { rows: stagingRows };

      let processedCount = 0;

      for (const record of stagingResult.rows) {
        const normalizedData = record.normalized_data;

        if (record.review_status === 'approved_new') {
          // Create new contact
          const [contactRows] = await client.query(
            `INSERT INTO contacts (user_id, display_name, first_name, last_name, nickname,
                                   birthday, location, bio, occupation, website)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              normalizedData.display_name || '',
              normalizedData.first_name || null,
              normalizedData.last_name || null,
              normalizedData.nickname || null,
              normalizedData.birthday || null,
              normalizedData.location || null,
              normalizedData.bio || null,
              normalizedData.occupation || null,
              normalizedData.website || null
            ]
          );

          const contactId = contactRows.insertId;

          // Add emails
          if (normalizedData.emails && Array.isArray(normalizedData.emails)) {
            for (const email of normalizedData.emails) {
              await client.query(
                `INSERT INTO contact_emails (contact_id, email, label)
                 VALUES (?, ?, ?)`,
                [contactId, email.value, email.type || 'personal']
              );
            }
          }

          // Add phones
          if (normalizedData.phones && Array.isArray(normalizedData.phones)) {
            for (const phone of normalizedData.phones) {
              await client.query(
                `INSERT INTO contact_phones (contact_id, phone, label)
                 VALUES (?, ?, ?)`,
                [contactId, phone.value, phone.type || 'mobile']
              );
            }
          }

          // Add social links
          if (normalizedData.social_links && Array.isArray(normalizedData.social_links)) {
            for (const link of normalizedData.social_links) {
              await client.query(
                `INSERT INTO social_links (contact_id, platform, username, url)
                 VALUES (?, ?, ?, ?)`,
                [contactId, link.platform, link.username, link.profile_url]
              );
            }
          }

          // Write changelog
          await client.query(
            `INSERT INTO contact_changelogs (contact_id, action, change_details)
             VALUES (?, ?, ?)`,
            [contactId, 'imported', JSON.stringify({ import_job_id: id, source_platform: record.review_status })]
          );
        } else if (record.review_status === 'approved_merge' && record.suggested_contact_id) {
          // Merge into existing contact
          const contactId = record.suggested_contact_id;
          const decisions = record.merge_field_decisions || {};

          // Apply merge decisions based on field decisions
          const updateFields = {};
          if (decisions.display_name) updateFields.display_name = normalizedData.display_name;
          if (decisions.first_name) updateFields.first_name = normalizedData.first_name;
          if (decisions.last_name) updateFields.last_name = normalizedData.last_name;
          if (decisions.nickname) updateFields.nickname = normalizedData.nickname;
          if (decisions.birthday) updateFields.birthday = normalizedData.birthday;
          if (decisions.location) updateFields.location = normalizedData.location;
          if (decisions.bio) updateFields.bio = normalizedData.bio;
          if (decisions.occupation) updateFields.occupation = normalizedData.occupation;
          if (decisions.website) updateFields.website = normalizedData.website;

          // Build dynamic update query
          if (Object.keys(updateFields).length > 0) {
            const setClauses = [];
            const values = [];
            let paramIndex = 1;

            for (const [field, value] of Object.entries(updateFields)) {
              setClauses.push(`${field} = ?`);
              values.push(value);
            }

            values.push(contactId);
            const setClause = setClauses.join(', ');

            await client.query(
              `UPDATE contacts SET ${setClause} WHERE id = ?`,
              values
            );
          }

          // Merge emails
          if (decisions.emails && normalizedData.emails && Array.isArray(normalizedData.emails)) {
            for (const email of normalizedData.emails) {
              const [existsRows] = await client.query(
                `SELECT id FROM contact_emails WHERE contact_id = ? AND email = ?`,
                [contactId, email.value]
              );

              if (existsRows.length === 0) {
                await client.query(
                  `INSERT INTO contact_emails (contact_id, email, label)
                   VALUES (?, ?, ?)`,
                  [contactId, email.value, email.type || 'personal']
                );
              }
            }
          }

          // Merge phones
          if (decisions.phones && normalizedData.phones && Array.isArray(normalizedData.phones)) {
            for (const phone of normalizedData.phones) {
              const [existsRows] = await client.query(
                `SELECT id FROM contact_phones WHERE contact_id = ? AND phone = ?`,
                [contactId, phone.value]
              );

              if (existsRows.length === 0) {
                await client.query(
                  `INSERT INTO contact_phones (contact_id, phone, label)
                   VALUES (?, ?, ?)`,
                  [contactId, phone.value, phone.type || 'mobile']
                );
              }
            }
          }

          // Merge social links
          if (decisions.social_links && normalizedData.social_links && Array.isArray(normalizedData.social_links)) {
            for (const link of normalizedData.social_links) {
              const [existsRows] = await client.query(
                `SELECT id FROM social_links WHERE contact_id = ? AND platform = ? AND username = ?`,
                [contactId, link.platform, link.username]
              );

              if (existsRows.length === 0) {
                await client.query(
                  `INSERT INTO social_links (contact_id, platform, username, url)
                   VALUES (?, ?, ?, ?)`,
                  [contactId, link.platform, link.username, link.profile_url]
                );
              }
            }
          }

          // Write changelog
          await client.query(
            `INSERT INTO contact_changelogs (contact_id, action, change_details)
             VALUES (?, ?, ?)`,
            [contactId, 'merged_import', JSON.stringify({ import_job_id: id })]
          );
        }

        processedCount++;
      }

      // Mark job as complete
      await client.query(
        `UPDATE import_jobs
         SET status = 'completed', completed_at = NOW()
         WHERE id = ?`,
        [id]
      );

      await client.query('COMMIT');
      res.json({ success: true, processed_count: processedCount });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Finalize import error:', error);
    res.status(500).json({ error: 'Failed to finalize import' });
  }
});

/**
 * DELETE /jobs/:id
 * Cancel pending job and delete staged records
 */
router.delete('/jobs/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Verify ownership
    const [jobRows] = await pool.query(
      `SELECT id FROM import_jobs
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    if (jobRows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Delete staging records
    await pool.query(
      `DELETE FROM import_staging WHERE import_job_id = ?`,
      [id]
    );

    // Delete job
    await pool.query(
      `DELETE FROM import_jobs WHERE id = ?`,
      [id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

module.exports = router;
