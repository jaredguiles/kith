'use strict';

// Background import processor — runs on a worker_thread (started from
// server/index.js). Polls import_jobs for `queued` every 5s, parses,
// normalizes, matches, stages, then sets `awaiting_review`.

const { workerData, parentPort } = require('node:worker_threads');
const path = require('node:path');
const fs = require('node:fs');
const mysql = require('mysql2/promise');

// Parsers
const parsers = {
  facebook: require('./parsers/facebook'),
  instagram: require('./parsers/instagram'),
  twitter: require('./parsers/twitter'),
  google_contacts: require('./parsers/google'),
  vcard: require('./parsers/vcard'),
  csv: require('./parsers/csv'),
};
const { findBestMatch } = require('./matcher');

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: String(process.env.DB_SSL) === 'true' ? { rejectUnauthorized: false } : undefined,
      connectionLimit: 3,
      dateStrings: true,
      charset: 'utf8mb4_unicode_ci',
    });
  }
  return pool;
}

async function q(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/** Load match candidates for a user's contacts (cleartext fields only). */
async function loadCandidates(userId) {
  const contacts = await q(
    'SELECT id, display_name, email, phone, location FROM contacts WHERE owner_user_id = ? AND deleted_at IS NULL',
    [userId]
  );
  if (!contacts.length) return [];
  const ids = contacts.map((c) => c.id);
  const ph = ids.map(() => '?').join(',');
  const [emails, phones, socials] = await Promise.all([
    q(`SELECT contact_id, email FROM contact_emails WHERE contact_id IN (${ph})`, ids),
    q(`SELECT contact_id, phone FROM contact_phones WHERE contact_id IN (${ph})`, ids),
    q(`SELECT contact_id, platform, username FROM social_links WHERE contact_id IN (${ph})`, ids),
  ]);
  const byId = new Map(contacts.map((c) => [c.id, { contact: c, emails: [], phones: [], socials: [] }]));
  for (const e of emails) byId.get(e.contact_id)?.emails.push(e);
  for (const p of phones) byId.get(p.contact_id)?.phones.push(p);
  for (const s of socials) byId.get(s.contact_id)?.socials.push(s);
  return [...byId.values()];
}

async function parseFiles(job, filePaths) {
  const parser = parsers[job.source_platform];
  if (!parser) throw new Error(`Unknown platform: ${job.source_platform}`);

  const allRecords = [];
  const allErrors = [];
  const mapping = job.column_mapping ? (typeof job.column_mapping === 'string' ? JSON.parse(job.column_mapping) : job.column_mapping) : null;

  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) {
      allErrors.push(`File missing: ${path.basename(filePath)}`);
      continue;
    }
    try {
      let result;
      if (parser.isZip || parser.isPath) {
        result = await parser.parse(filePath);
      } else if (job.source_platform === 'csv') {
        result = parser.parse(fs.readFileSync(filePath), mapping);
      } else {
        result = parser.parse(fs.readFileSync(filePath));
      }
      allRecords.push(...(result.records || []));
      allErrors.push(...(result.errors || []));
    } catch (err) {
      allErrors.push(`${path.basename(filePath)}: ${err.message}`);
    }
  }
  return { records: allRecords, errors: allErrors };
}

async function processJob(job) {
  console.log(`[import-worker] processing job ${job.id} (${job.source_platform})`);
  await q("UPDATE import_jobs SET status = 'processing' WHERE id = ?", [job.id]);

  try {
    const filePaths = job.file_paths ? (typeof job.file_paths === 'string' ? JSON.parse(job.file_paths) : job.file_paths) : [];
    const { records, errors } = await parseFiles(job, filePaths);

    if (!records.length) {
      const msg = errors.length ? errors.slice(0, 5).join('; ') : 'No records found in the uploaded file(s)';
      await q("UPDATE import_jobs SET status = 'error', error_message = ? WHERE id = ?", [msg.slice(0, 2000), job.id]);
      await notify(job.user_id, 'import_complete',
        `${platformLabel(job.source_platform)} import failed`, msg.slice(0, 300), '#/review');
      return;
    }

    await q('UPDATE import_jobs SET total_records = ? WHERE id = ?', [records.length, job.id]);

    const candidates = await loadCandidates(job.user_id);
    let processed = 0;

    for (const rec of records) {
      if (job.is_spicy_source) {
        rec.media = (rec.media || []).map((m) => ({ ...m, is_spicy: true }));
      }
      const match = findBestMatch(rec, candidates);
      await q(
        `INSERT INTO import_staging (import_job_id, source_platform, source_id, normalized_data, suggested_match_contact_id, match_confidence)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [job.id, job.source_platform, rec.source_id || null, JSON.stringify(rec),
         match ? match.contactId : null, match ? match.confidence : null]
      );
      processed += 1;
      if (processed % 25 === 0) {
        await q('UPDATE import_jobs SET processed_records = ? WHERE id = ?', [processed, job.id]);
      }
    }

    // parse errors recorded as error-status staging rows for review visibility
    for (const errMsg of errors.slice(0, 50)) {
      await q(
        `INSERT INTO import_staging (import_job_id, source_platform, normalized_data, review_status, error_message)
         VALUES (?, ?, ?, 'error', ?)`,
        [job.id, job.source_platform, JSON.stringify({}), String(errMsg).slice(0, 2000)]
      );
    }

    await q("UPDATE import_jobs SET status = 'awaiting_review', processed_records = ? WHERE id = ?", [processed, job.id]);
    await notify(job.user_id, 'import_review',
      `${platformLabel(job.source_platform)} import complete — ${records.length} profile${records.length === 1 ? '' : 's'} ready for review`,
      errors.length ? `${errors.length} file issue(s) noted` : null, '#/review');
    console.log(`[import-worker] job ${job.id} staged ${processed} records (${errors.length} errors)`);
  } catch (err) {
    console.error(`[import-worker] job ${job.id} failed:`, err.message);
    await q("UPDATE import_jobs SET status = 'error', error_message = ? WHERE id = ?", [String(err.message).slice(0, 2000), job.id]);
    await notify(job.user_id, 'import_complete', `${platformLabel(job.source_platform)} import failed`, String(err.message).slice(0, 300), '#/review');
  }
}

function platformLabel(p) {
  return { facebook: 'Facebook', instagram: 'Instagram', twitter: 'Twitter/X', google_contacts: 'Google Contacts', vcard: 'vCard', csv: 'CSV' }[p] || p;
}

async function notify(userId, type, title, body, link) {
  try {
    await q('INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)',
      [userId, type, title, body || null, link || null]);
  } catch (err) {
    console.error('[import-worker] notify failed:', err.message);
  }
}

async function poll() {
  try {
    const jobs = await q("SELECT * FROM import_jobs WHERE status = 'queued' ORDER BY id LIMIT 1");
    if (jobs.length) await processJob(jobs[0]);
  } catch (err) {
    console.error('[import-worker] poll error:', err.message);
  } finally {
    setTimeout(poll, 5000);
  }
}

console.log('[import-worker] started');
poll();
