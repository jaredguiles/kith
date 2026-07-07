'use strict';

// Import routes: upload, legacy CSV w/ column mapping, jobs, review, finalize.

const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const multer = require('multer');
const { query, withTransaction } = require('../database/connection');
const { requireAuth, isAdmin } = require('../middleware/auth');
const { auditWrite, changelogWrite } = require('../lib/audit');
const { rebuildSearchIndex, buildDisplayName, zodiacFromBirthday } = require('../lib/contacts');
const { encryptField, decryptField } = require('../lib/crypto');
const { spicyVisible } = require('./contacts');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const IMPORT_MAX = Number(process.env.IMPORT_MAX_UPLOAD_SIZE || 2147483648);
const PLATFORMS = ['facebook', 'instagram', 'twitter', 'google_contacts', 'vcard', 'csv'];
const ALLOWED_EXT = ['.zip', '.vcf', '.vcard', '.csv', '.json'];

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_PATH, 'imports');
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: IMPORT_MAX, files: 20 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) return cb(null, true);
    cb(new Error(`Unsupported file type ${ext} — use .zip, .vcf, .csv`));
  },
});

// POST /api/import/upload — files[], source_platform, is_spicy_source, column_mapping?
router.post('/upload', (req, res, next) => {
  upload.array('files', 20)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
    const platform = req.body.source_platform;
    if (!PLATFORMS.includes(platform)) return res.status(400).json({ error: 'Unknown source platform' });

    let spicySource = req.body.is_spicy_source === 'true' || req.body.is_spicy_source === '1';
    if (spicySource && !(await spicyVisible(req.user))) spicySource = false;

    let mapping = null;
    if (req.body.column_mapping) {
      try { mapping = JSON.parse(req.body.column_mapping); } catch { /* ignore bad mapping */ }
    }

    const result = await query(
      `INSERT INTO import_jobs (user_id, source_platform, status, filename, file_paths, column_mapping, is_spicy_source)
       VALUES (?, ?, 'queued', ?, ?, ?, ?)`,
      [req.user.id, platform,
       req.files.map((f) => f.originalname).join(', ').slice(0, 250),
       JSON.stringify(req.files.map((f) => f.path)),
       mapping ? JSON.stringify(mapping) : null,
       spicySource ? 1 : 0]
    );
    auditWrite(req.user.id, null, 'import', 'import_job', result.insertId, null,
      { platform, files: req.files.length }, `Started ${platform} import`);
    res.status(201).json({ import_job_id: result.insertId });
  } catch (err) { next(err); }
});

// POST /api/import/csv — legacy: peek headers OR submit with mapping
router.post('/csv', (req, res, next) => {
  upload.array('files', 1)(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.files?.length) return res.status(400).json({ error: 'No file uploaded' });
    const filePath = req.files[0].path;

    if (req.body.peek === 'true' || req.body.peek === '1') {
      // return headers + auto-mapping for the mapping UI. Only the first 64KB
      // and the first 2 rows are parsed — the frontend re-uploads the file for
      // the real run, so the peek temp file is deleted here.
      try {
        const csvParser = require('../import/parsers/csv');
        const { parse: csvParse } = require('csv-parse/sync');
        let buf;
        const fd = fs.openSync(filePath, 'r');
        try {
          const chunk = Buffer.alloc(64 * 1024);
          const bytes = fs.readSync(fd, chunk, 0, chunk.length, 0);
          buf = chunk.subarray(0, bytes);
        } finally {
          fs.closeSync(fd);
        }
        // drop a potentially truncated trailing line from the partial read
        const text = buf.toString('utf8');
        const lastNl = text.lastIndexOf('\n');
        const headText = lastNl > 0 && buf.length === 64 * 1024 ? text.slice(0, lastNl) : text;
        let rows;
        try {
          rows = csvParse(headText, {
            columns: true, skip_empty_lines: true, relax_column_count: true,
            relax_quotes: true, bom: true, trim: true, to: 2,
          });
        } catch (err) {
          return res.status(400).json({ error: `CSV parse failed: ${err.message}` });
        }
        const headers = rows.length ? Object.keys(rows[0]) : [];
        if (!headers.length) return res.status(400).json({ error: 'CSV contains no data rows' });
        return res.json({
          headers,
          sample_count: rows.length,
          auto_map: headers.reduce((acc, h) => {
            const auto = csvParser.AUTO_MAP[String(h).toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim()];
            if (auto) acc[h] = auto;
            return acc;
          }, {}),
        });
      } finally {
        fs.unlink(filePath, () => {}); // peek file is never consumed — clean it up
      }
    }

    let mapping = null;
    if (req.body.column_mapping) {
      try { mapping = JSON.parse(req.body.column_mapping); } catch { /* ignore */ }
    }
    const result = await query(
      `INSERT INTO import_jobs (user_id, source_platform, status, filename, file_paths, column_mapping, is_spicy_source)
       VALUES (?, 'csv', 'queued', ?, ?, ?, 0)`,
      [req.user.id, req.files[0].originalname.slice(0, 250), JSON.stringify([filePath]), mapping ? JSON.stringify(mapping) : null]
    );
    res.status(201).json({ import_job_id: result.insertId });
  } catch (err) { next(err); }
});

// GET /api/import/jobs
router.get('/jobs', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT id, source_platform, status, filename, is_spicy_source, total_records, processed_records,
              new_contacts, merged_contacts, skipped_records, error_message, created_at, completed_at
       FROM import_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ jobs: rows });
  } catch (err) { next(err); }
});

async function loadJob(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Import job not found' });
  const rows = await query('SELECT * FROM import_jobs WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Import job not found' });
  if (rows[0].user_id !== req.user.id && !isAdmin(req.user)) return res.status(404).json({ error: 'Import job not found' });
  req.job = rows[0];
  next();
}

// GET /api/import/jobs/:id
router.get('/jobs/:id', loadJob, (req, res) => {
  res.json({ job: req.job });
});

// DELETE /api/import/jobs/:id — cancel + remove staged rows + files
router.delete('/jobs/:id', loadJob, async (req, res, next) => {
  try {
    await query('DELETE FROM import_staging WHERE import_job_id = ?', [req.job.id]);
    await query('DELETE FROM import_jobs WHERE id = ?', [req.job.id]);
    // best-effort file cleanup
    try {
      const paths = req.job.file_paths ? JSON.parse(req.job.file_paths) : [];
      for (const p of paths) fs.unlink(p, () => {});
    } catch { /* ignore */ }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * Decode a staging row's normalized_data into a record object.
 * Spicy jobs store the JSON encrypted (a JSON-string-wrapped token); cleartext
 * jobs store plain JSON. Handles both driver shapes (string vs pre-parsed).
 */
function decodeNormalizedData(raw, isSpicy) {
  let val = raw;
  if (typeof raw === 'string') {
    try { val = JSON.parse(raw); }
    catch { val = raw; } // mysql2 pre-parsed JSON column → raw may already be the token string
  }
  if (isSpicy && typeof val === 'string') {
    const plain = decryptField(val);
    try { val = JSON.parse(plain); } catch { val = {}; }
  }
  return val && typeof val === 'object' ? val : {};
}

// GET /api/import/review?job_id=
router.get('/review', async (req, res, next) => {
  try {
    const jobId = Number(req.query.job_id);
    const where = ['j.user_id = ?'];
    const params = [req.user.id];
    if (jobId) { where.push('s.import_job_id = ?'); params.push(jobId); }
    // all records for jobs still awaiting review (decided rows keep the job's
    // Finalize visible); once a job completes its rows drop out of this view
    where.push("j.status = 'awaiting_review'");
    const rows = await query(
      `SELECT s.*, j.source_platform AS job_platform, j.is_spicy_source, c.display_name AS match_name, c.email AS match_email, c.location AS match_location
       FROM import_staging s
       JOIN import_jobs j ON j.id = s.import_job_id
       LEFT JOIN contacts c ON c.id = s.suggested_match_contact_id AND c.deleted_at IS NULL
       WHERE ${where.join(' AND ')}
       ORDER BY s.import_job_id DESC, s.match_confidence DESC, s.id
       LIMIT 500`,
      params
    );
    res.json({
      records: rows.map((r) => ({
        ...r,
        normalized_data: decodeNormalizedData(r.normalized_data, Boolean(r.is_spicy_source)),
      })),
    });
  } catch (err) { next(err); }
});

// PUT /api/import/review/:id — decision on one staging record
router.put('/review/:id', async (req, res, next) => {
  try {
    const stagingId = Number(req.params.id);
    if (!Number.isInteger(stagingId) || stagingId <= 0) return res.status(404).json({ error: 'Record not found' });
    const rows = await query(
      `SELECT s.*, j.user_id AS job_user FROM import_staging s JOIN import_jobs j ON j.id = s.import_job_id WHERE s.id = ?`,
      [stagingId]
    );
    if (!rows.length || (rows[0].job_user !== req.user.id && !isAdmin(req.user))) {
      return res.status(404).json({ error: 'Record not found' });
    }
    const { review_status, suggested_match_contact_id, merge_field_decisions } = req.body || {};
    if (!['pending', 'approved_new', 'approved_merge', 'skipped'].includes(review_status)) {
      return res.status(400).json({ error: 'Invalid review status' });
    }
    // validate the merge target at write time (avoid FK 500s at finalize)
    let targetId = null;
    if (suggested_match_contact_id !== undefined && suggested_match_contact_id !== null) {
      targetId = Number(suggested_match_contact_id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        return res.status(400).json({ error: 'Invalid merge target contact id' });
      }
      const targets = await query(
        'SELECT id, owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL', [targetId]);
      if (!targets.length) return res.status(404).json({ error: 'Merge target contact not found' });
      if (targets[0].owner_user_id !== rows[0].job_user && !isAdmin(req.user)) {
        return res.status(404).json({ error: 'Merge target contact not found' });
      }
    }
    if (review_status === 'approved_merge' && !targetId && !rows[0].suggested_match_contact_id) {
      return res.status(400).json({ error: 'A merge target is required' });
    }
    await query(
      `UPDATE import_staging SET review_status = ?, suggested_match_contact_id = COALESCE(?, suggested_match_contact_id),
              merge_field_decisions = ?, reviewed_at = NOW() WHERE id = ?`,
      [review_status, targetId,
       merge_field_decisions ? JSON.stringify(merge_field_decisions) : null, rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Contact columns an import record can set
const IMPORT_CONTACT_FIELDS = ['display_name', 'first_name', 'last_name', 'nickname', 'email', 'phone', 'birthday', 'location', 'bio', 'occupation', 'company', 'website', 'sex'];

/** Create a brand-new contact from a normalized record. */
async function createFromRecord(conn, rec, job) {
  const data = {};
  for (const f of IMPORT_CONTACT_FIELDS) if (rec[f]) data[f] = rec[f];
  if (rec.emails?.[0] && !data.email) data.email = rec.emails[0].email;
  if (rec.phones?.[0] && !data.phone) data.phone = rec.phones[0].phone;
  data.display_name = buildDisplayName(data);
  if (data.birthday) data.zodiac_sign = zodiacFromBirthday(data.birthday);

  const cols = Object.keys(data);
  const [r] = await conn.execute(
    `INSERT INTO contacts (owner_user_id, is_spicy, ${cols.join(', ')}) VALUES (?, ?, ${cols.map(() => '?').join(', ')})`,
    [job.user_id, job.is_spicy_source ? 1 : 0, ...cols.map((k) => data[k])]
  );
  const contactId = r.insertId;
  await applySatellites(conn, contactId, rec, job);
  changelogWrite(contactId, job.user_id, `import_${platformKey(job.source_platform)}`,
    Object.entries(data).map(([field, v]) => ({ field, oldValue: null, newValue: String(v) })), job.id);
  return contactId;
}

/** Apply emails/phones/socials/messages to a contact (additive, deduped). */
async function applySatellites(conn, contactId, rec, job) {
  const [existingEmails] = await conn.execute('SELECT email FROM contact_emails WHERE contact_id = ?', [contactId]);
  const haveE = new Set(existingEmails.map((e) => e.email.toLowerCase()));
  for (const e of rec.emails || []) {
    if (haveE.has(e.email.toLowerCase())) continue;
    await conn.execute('INSERT INTO contact_emails (contact_id, label, email) VALUES (?, ?, ?)', [contactId, e.label || 'personal', e.email]);
  }
  const [existingPhones] = await conn.execute('SELECT phone FROM contact_phones WHERE contact_id = ?', [contactId]);
  const haveP = new Set(existingPhones.map((p) => p.phone));
  for (const p of rec.phones || []) {
    if (haveP.has(p.phone)) continue;
    await conn.execute('INSERT INTO contact_phones (contact_id, label, phone) VALUES (?, ?, ?)', [contactId, p.label || 'mobile', p.phone]);
  }
  const [existingSocials] = await conn.execute('SELECT platform, username FROM social_links WHERE contact_id = ?', [contactId]);
  const haveS = new Set(existingSocials.map((s) => `${s.platform}|${s.username}`.toLowerCase()));
  for (const s of rec.social_links || []) {
    const key = `${s.platform}|${s.username}`.toLowerCase();
    if (haveS.has(key)) continue;
    await conn.execute('INSERT INTO social_links (contact_id, platform, url, username) VALUES (?, ?, ?, ?)',
      [contactId, s.platform || null, s.url || null, s.username || null]);
  }
  // messages → batch insert (spicy per job flag, encrypted if spicy)
  const spicy = job.is_spicy_source ? 1 : 0;
  for (const m of (rec.messages || []).slice(0, 1000)) {
    const content = spicy ? encryptField(String(m.content || '')) : (m.content || null);
    await conn.execute(
      'INSERT INTO messages (contact_id, platform, direction, content, is_spicy, sent_at) VALUES (?, ?, ?, ?, ?, ?)',
      [contactId, platformKey(job.source_platform), m.direction === 'out' ? 'out' : 'in', content, spicy, m.sent_at || null]
    );
  }
  if ((rec.messages || []).length) {
    await conn.execute(
      `INSERT INTO timeline_events (contact_id, type, title, description, is_spicy, occurred_at)
       VALUES (?, 'import', ?, NULL, ?, NOW())`,
      [contactId, `Imported ${rec.messages.length} messages from ${platformKey(job.source_platform)}`, spicy]
    );
  }
}

/** Merge a record into an existing contact honoring merge_field_decisions. */
async function mergeIntoContact(conn, rec, target, job, decisions) {
  const updates = {};
  const diffs = [];
  for (const f of IMPORT_CONTACT_FIELDS) {
    const imported = rec[f] ?? (f === 'email' ? rec.emails?.[0]?.email : f === 'phone' ? rec.phones?.[0]?.phone : null);
    if (imported === null || imported === undefined || imported === '') continue;
    const existing = target[f];
    const decision = decisions?.[f];
    let finalVal;
    if (decision === 'existing') continue;
    else if (decision === 'imported') finalVal = imported;
    else if (decision !== undefined && decision !== null) finalVal = decision; // custom value
    else if (existing === null || existing === '' || existing === undefined) finalVal = imported; // auto-fill empty
    else continue; // conflict without decision → keep existing
    if (String(finalVal) !== String(existing ?? '')) {
      updates[f] = finalVal;
      diffs.push({ field: f, oldValue: existing == null ? null : String(existing), newValue: String(finalVal) });
    }
  }
  if (Object.keys(updates).length) {
    if (updates.birthday && !updates.zodiac_sign) updates.zodiac_sign = zodiacFromBirthday(updates.birthday);
    const cols = Object.keys(updates);
    await conn.execute(
      `UPDATE contacts SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
      [...cols.map((k) => updates[k]), target.id]
    );
  }
  if (job.is_spicy_source) {
    await conn.execute('UPDATE contacts SET is_spicy = 1 WHERE id = ?', [target.id]);
  }
  await applySatellites(conn, target.id, rec, job);
  if (diffs.length) {
    changelogWrite(target.id, job.user_id, `import_${platformKey(job.source_platform)}`, diffs, job.id);
  }
  return target.id;
}

function platformKey(p) {
  return p === 'google_contacts' ? 'google' : p;
}

// POST /api/import/jobs/:id/finalize
router.post('/jobs/:id/finalize', loadJob, async (req, res, next) => {
  // Atomic claim: only one finalize can move the job out of awaiting_review.
  // ('processing' is reused as the in-flight state — the status enum has no
  // dedicated 'finalizing' value; the worker's crash recovery restores jobs
  // with reviewed rows back to awaiting_review, never re-queues them.)
  const claim = await query(
    "UPDATE import_jobs SET status = 'processing' WHERE id = ? AND status = 'awaiting_review'",
    [req.job.id]
  ).catch((err) => { next(err); return null; });
  if (claim === null) return;
  if (!claim.affectedRows) return res.status(409).json({ error: 'Job is not awaiting review' });

  try {
    // final_contact_id IS NULL skips rows already committed by a previous
    // (crashed/partial) finalize → idempotent retry
    const staged = await query(
      `SELECT * FROM import_staging
       WHERE import_job_id = ? AND final_contact_id IS NULL
         AND review_status IN ('approved_new','approved_merge','skipped','pending','error')`,
      [req.job.id]
    );

    let created = 0, merged = 0, skipped = 0;
    const touched = new Set();

    for (const row of staged) {
      if (row.review_status === 'pending' || row.review_status === 'skipped' || row.review_status === 'error') {
        if (row.review_status !== 'error') {
          await query("UPDATE import_staging SET review_status = 'skipped', reviewed_at = COALESCE(reviewed_at, NOW()) WHERE id = ?", [row.id]);
        }
        skipped += 1;
        continue;
      }
      const rec = decodeNormalizedData(row.normalized_data, Boolean(req.job.is_spicy_source));
      try {
        await withTransaction(async (conn) => {
          if (row.review_status === 'approved_new') {
            const id = await createFromRecord(conn, rec, req.job);
            await conn.execute('UPDATE import_staging SET final_contact_id = ? WHERE id = ?', [id, row.id]);
            touched.add(id);
            created += 1;
          } else if (row.review_status === 'approved_merge') {
            const [targets] = await conn.execute(
              'SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL', [row.suggested_match_contact_id]);
            if (!targets.length) throw new Error('Merge target missing');
            const target = targets[0];
            if (target.owner_user_id !== req.job.user_id && !isAdmin(req.user)) throw new Error('Merge target not owned');
            const decisions = row.merge_field_decisions
              ? (typeof row.merge_field_decisions === 'string' ? JSON.parse(row.merge_field_decisions) : row.merge_field_decisions)
              : null;
            const id = await mergeIntoContact(conn, rec, target, req.job, decisions);
            await conn.execute('UPDATE import_staging SET final_contact_id = ? WHERE id = ?', [id, row.id]);
            touched.add(id);
            merged += 1;
          }
        });
      } catch (err) {
        console.error(`[import] finalize record ${row.id} failed:`, err.message);
        await query("UPDATE import_staging SET review_status = 'error', error_message = ? WHERE id = ?", [err.message.slice(0, 1000), row.id]);
        skipped += 1;
      }
    }

    // search-index rebuild is best-effort — an index error must not abort a
    // finalize whose per-record commits already happened
    for (const id of touched) {
      try { await rebuildSearchIndex(id); }
      catch (err) { console.error(`[import] rebuildSearchIndex(${id}) failed:`, err.message); }
    }

    await query(
      `UPDATE import_jobs SET status = 'complete', new_contacts = ?, merged_contacts = ?, skipped_records = ?, completed_at = NOW() WHERE id = ?`,
      [created, merged, skipped, req.job.id]
    );
    // staged data now lives in real tables — blank the (potentially sensitive)
    // normalized payloads regardless of spicy flag
    await query("UPDATE import_staging SET normalized_data = '{}' WHERE import_job_id = ?", [req.job.id]);
    // best-effort upload cleanup
    try {
      const paths = req.job.file_paths ? JSON.parse(req.job.file_paths) : [];
      for (const p of paths) fs.unlink(p, () => {});
    } catch { /* ignore */ }

    await query('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)', [
      req.job.user_id, 'import_complete',
      `Import finalized — ${created} new, ${merged} merged, ${skipped} skipped`,
      null, '#/contacts',
    ]);
    auditWrite(req.user.id, null, 'import', 'import_job', req.job.id, null,
      { created, merged, skipped }, 'Finalized import');
    res.json({ ok: true, created, merged, skipped });
  } catch (err) {
    // release the claim so finalize can be retried (per-record commits that
    // already happened are protected by final_contact_id IS NULL)
    try {
      await query("UPDATE import_jobs SET status = 'awaiting_review' WHERE id = ? AND status = 'processing'", [req.job.id]);
    } catch { /* ignore */ }
    next(err);
  }
});

module.exports = router;
