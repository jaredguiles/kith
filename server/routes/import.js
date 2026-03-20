const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth } = require('../middleware/auth');
const multer = require('multer');

// Setup multer for file uploads
const upload = multer({ dest: '/tmp/imports' });

// POST /api/import/upload - File upload import
router.post('/upload', requireAuth, upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const { source_platform } = req.body;

    if (!source_platform) {
      return res.status(400).json({ error: 'source_platform is required' });
    }

    // Create import job for each file
    const jobs = [];
    for (const file of req.files) {
      const [result] = await pool.query(
        `INSERT INTO import_jobs (user_id, source_platform, filename, status, total_records)
         VALUES (?, ?, ?, 'queued', 0)`,
        [req.user.id, source_platform, file.originalname]
      );

      jobs.push({
        id: result.insertId,
        filename: file.originalname,
        status: 'queued'
      });
    }

    res.status(201).json(jobs);
  } catch (err) {
    console.error('Upload import error:', err);
    res.status(500).json({ error: 'Failed to upload import' });
  }
});

// POST /api/import/extension - Chrome extension import
router.post('/extension', requireAuth, async (req, res) => {
  try {
    const { source_platform, records, media_uploads } = req.body;

    if (!source_platform || !records || !Array.isArray(records)) {
      return res.status(400).json({ error: 'source_platform and records array are required' });
    }

    // Create import job
    const [jobResult] = await pool.query(
      `INSERT INTO import_jobs (user_id, source_platform, status, total_records)
       VALUES (?, ?, 'queued', ?)`,
      [req.user.id, source_platform, records.length]
    );

    const jobId = jobResult.insertId;

    // Create staging records for each record
    for (const record of records) {
      await pool.query(
        `INSERT INTO import_staging (import_job_id, source_platform, source_id, normalized_data, review_status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [jobId, source_platform, record.source_id || null, JSON.stringify(record)]
      );
    }

    res.status(201).json({
      job_id: jobId,
      total_records: records.length,
      status: 'queued'
    });
  } catch (err) {
    console.error('Extension import error:', err);
    res.status(500).json({ error: 'Failed to process extension import' });
  }
});

// GET /api/import/jobs - List import jobs for user
router.get('/jobs', requireAuth, async (req, res) => {
  try {
    const [jobs] = await pool.query(
      `SELECT id, user_id, source_platform, status, filename, total_records, processed_records,
              new_contacts, merged_contacts, skipped_records, error_message, created_at, completed_at
       FROM import_jobs WHERE user_id = ? ORDER BY created_at DESC`,
      [req.user.id]
    );

    res.json(jobs);
  } catch (err) {
    console.error('Get import jobs error:', err);
    res.status(500).json({ error: 'Failed to fetch import jobs' });
  }
});

// GET /api/import/jobs/:id - Job detail with counts
router.get('/jobs/:id', requireAuth, async (req, res) => {
  try {
    const jobId = req.params.id;

    const [job] = await pool.query(
      `SELECT id, user_id, source_platform, status, filename, total_records, processed_records,
              new_contacts, merged_contacts, skipped_records, error_message, created_at, completed_at
       FROM import_jobs WHERE id = ? AND user_id = ?`,
      [jobId, req.user.id]
    );

    if (!job || job.length === 0) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    // Get counts
    const [stagingCounts] = await pool.query(
      `SELECT review_status, COUNT(*) as count FROM import_staging WHERE import_job_id = ? GROUP BY review_status`,
      [jobId]
    );

    const counts = {};
    stagingCounts.forEach(row => {
      counts[row.review_status] = row.count;
    });

    res.json({
      ...job[0],
      staging_counts: counts
    });
  } catch (err) {
    console.error('Get import job error:', err);
    res.status(500).json({ error: 'Failed to fetch import job' });
  }
});

// GET /api/import/review - List pending import staging records
router.get('/review', requireAuth, async (req, res) => {
  try {
    const jobId = req.query.job_id;

    let query = `
      SELECT id, import_job_id, source_platform, source_id, normalized_data, suggested_match_contact_id,
             match_confidence, review_status, merge_field_decisions, final_contact_id, reviewed_at, created_at
      FROM import_staging
      WHERE review_status = 'pending'`;
    const params = [];

    if (jobId) {
      // Verify job ownership
      const [job] = await pool.query(
        'SELECT user_id FROM import_jobs WHERE id = ?',
        [jobId]
      );

      if (!job || job.length === 0) {
        return res.status(404).json({ error: 'Import job not found' });
      }

      if (job[0].user_id !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }

      query += ' AND import_job_id = ?';
      params.push(jobId);
    } else {
      // Get all pending records for user's jobs
      query += ' AND import_job_id IN (SELECT id FROM import_jobs WHERE user_id = ?)';
      params.push(req.user.id);
    }

    query += ' ORDER BY created_at ASC';

    const [records] = await pool.query(query, params);
    res.json(records);
  } catch (err) {
    console.error('Get review records error:', err);
    res.status(500).json({ error: 'Failed to fetch review records' });
  }
});

// PUT /api/import/review/:id - Set decision
router.put('/review/:id', requireAuth, async (req, res) => {
  try {
    const stagingId = req.params.id;
    const { review_status, suggested_match_contact_id, merge_field_decisions } = req.body;

    if (!review_status) {
      return res.status(400).json({ error: 'review_status is required' });
    }

    // Verify ownership via job
    const [staging] = await pool.query(
      `SELECT ims.import_job_id, ij.user_id
       FROM import_staging ims
       JOIN import_jobs ij ON ims.import_job_id = ij.id
       WHERE ims.id = ?`,
      [stagingId]
    );

    if (!staging || staging.length === 0) {
      return res.status(404).json({ error: 'Staging record not found' });
    }

    if (staging[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update staging record
    await pool.query(
      `UPDATE import_staging
       SET review_status = ?, suggested_match_contact_id = ?, merge_field_decisions = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [review_status, suggested_match_contact_id || null, merge_field_decisions ? JSON.stringify(merge_field_decisions) : null, stagingId]
    );

    const [updated] = await pool.query(
      `SELECT id, import_job_id, source_platform, source_id, normalized_data, suggested_match_contact_id,
              match_confidence, review_status, merge_field_decisions, final_contact_id, reviewed_at, created_at
       FROM import_staging WHERE id = ?`,
      [stagingId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update review decision error:', err);
    res.status(500).json({ error: 'Failed to update decision' });
  }
});

// POST /api/import/jobs/:id/finalize - Commit all reviewed decisions
router.post('/jobs/:id/finalize', requireAuth, async (req, res) => {
  try {
    const jobId = req.params.id;

    // Verify job ownership
    const [job] = await pool.query(
      'SELECT user_id FROM import_jobs WHERE id = ?',
      [jobId]
    );

    if (!job || job.length === 0) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    if (job[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get all reviewed staging records
    const [stagingRecords] = await pool.query(
      `SELECT id, review_status, normalized_data, suggested_match_contact_id, merge_field_decisions
       FROM import_staging
       WHERE import_job_id = ? AND review_status != 'pending'`,
      [jobId]
    );

    let newCount = 0;
    let mergedCount = 0;
    let skippedCount = 0;

    for (const record of stagingRecords) {
      if (record.review_status === 'approved_new') {
        // Create new contact
        const data = JSON.parse(record.normalized_data);
        const [result] = await pool.query(
          `INSERT INTO contacts (owner_user_id, display_name, email, phone, bio)
           VALUES (?, ?, ?, ?, ?)`,
          [req.user.id, data.display_name || null, data.email || null, data.phone || null, data.bio || null]
        );

        newCount++;
        await pool.query(
          'UPDATE import_staging SET final_contact_id = ? WHERE id = ?',
          [result.insertId, record.id]
        );
      } else if (record.review_status === 'approved_merge') {
        // Merge into existing contact
        mergedCount++;
        await pool.query(
          'UPDATE import_staging SET final_contact_id = ? WHERE id = ?',
          [record.suggested_match_contact_id, record.id]
        );
      } else if (record.review_status === 'skipped') {
        skippedCount++;
      }
    }

    // Update job status
    await pool.query(
      `UPDATE import_jobs
       SET status = 'complete', processed_records = ?, new_contacts = ?, merged_contacts = ?,
           skipped_records = ?, completed_at = NOW()
       WHERE id = ?`,
      [stagingRecords.length, newCount, mergedCount, skippedCount, jobId]
    );

    const [updated] = await pool.query(
      `SELECT id, user_id, source_platform, status, filename, total_records, processed_records,
              new_contacts, merged_contacts, skipped_records, error_message, created_at, completed_at
       FROM import_jobs WHERE id = ?`,
      [jobId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Finalize import error:', err);
    res.status(500).json({ error: 'Failed to finalize import' });
  }
});

// DELETE /api/import/jobs/:id - Cancel job
router.delete('/jobs/:id', requireAuth, async (req, res) => {
  try {
    const jobId = req.params.id;

    // Verify job ownership
    const [job] = await pool.query(
      'SELECT user_id FROM import_jobs WHERE id = ?',
      [jobId]
    );

    if (!job || job.length === 0) {
      return res.status(404).json({ error: 'Import job not found' });
    }

    if (job[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete staging records
    await pool.query('DELETE FROM import_staging WHERE import_job_id = ?', [jobId]);

    // Delete job
    await pool.query('DELETE FROM import_jobs WHERE id = ?', [jobId]);

    res.json({ message: 'Import job cancelled' });
  } catch (err) {
    console.error('Delete import job error:', err);
    res.status(500).json({ error: 'Failed to cancel import job' });
  }
});

module.exports = router;
