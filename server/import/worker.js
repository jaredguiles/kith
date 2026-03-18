const pool = require('../database/connection');
const { normalizeRecord, validateNormalizedRecord } = require('./normalizer');
const { findMatch } = require('./matcher');

// Platform-specific parsers
const parsers = {
  facebook: require('./parsers/facebook'),
  instagram: require('./parsers/instagram'),
  twitter: require('./parsers/twitter'),
  google_contacts: require('./parsers/google'),
  vcard: require('./parsers/vcard'),
  csv: require('./parsers/csv')
};

let workerInterval = null;

/**
 * Start the import worker
 * Polls for queued jobs and processes them
 */
function startImportWorker() {
  if (workerInterval) {
    console.warn('Import worker already running');
    return;
  }

  console.log('Starting import worker...');

  workerInterval = setInterval(() => {
    processQueuedJobs();
  }, 5000); // Poll every 5 seconds

  // Run immediately on startup
  processQueuedJobs();
}

/**
 * Stop the import worker
 */
function stopImportWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
    console.log('Import worker stopped');
  }
}

/**
 * Main job processor loop
 */
async function processQueuedJobs() {
  try {
    const result = await pool.query(
      `SELECT id, user_id, source_platform, status
       FROM import_jobs
       WHERE status = 'queued'
       LIMIT 1
       FOR UPDATE SKIP LOCKED`
    );

    if (result.rows.length === 0) {
      return; // No jobs to process
    }

    const job = result.rows[0];
    await processImportJob(job);
  } catch (error) {
    console.error('Error processing queued jobs:', error);
  }
}

/**
 * Process a single import job
 */
async function processImportJob(job) {
  const { id: jobId, user_id: userId, source_platform } = job;

  try {
    // Mark as processing
    await pool.query(
      `UPDATE import_jobs SET status = 'processing' WHERE id = $1`,
      [jobId]
    );

    console.log(`Processing import job ${jobId} from ${source_platform}`);

    // Get the parser for this platform
    const parser = parsers[source_platform];
    if (!parser) {
      throw new Error(`No parser available for platform: ${source_platform}`);
    }

    // Get uploaded files
    const filesResult = await pool.query(
      `SELECT id, original_filename FROM import_files WHERE import_job_id = $1`,
      [jobId]
    );

    if (filesResult.rows.length === 0) {
      throw new Error('No files found for import job');
    }

    // Parse files
    let rawRecords = [];
    for (const file of filesResult.rows) {
      try {
        const records = await parser.parse(jobId, file.original_filename);
        rawRecords = rawRecords.concat(records);
      } catch (error) {
        console.error(`Error parsing file ${file.original_filename}:`, error);
        // Continue processing other files
      }
    }

    console.log(`Parsed ${rawRecords.length} raw records from ${filesResult.rows.length} files`);

    // Normalize and match records
    let successCount = 0;
    let errorCount = 0;

    for (const rawRecord of rawRecords) {
      try {
        // Normalize record
        const normalized = normalizeRecord(rawRecord, source_platform);

        // Validate normalized record
        if (!validateNormalizedRecord(normalized)) {
          console.warn('Normalized record failed validation:', normalized);
          errorCount++;
          continue;
        }

        // Find potential matches
        const match = await findMatch(normalized, userId, pool);

        // Create staging record
        await pool.query(
          `INSERT INTO import_staging
           (import_job_id, source_platform, normalized_data, review_status, suggested_contact_id, confidence_score, is_spicy_source)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            jobId,
            source_platform,
            JSON.stringify(normalized),
            'pending',
            match ? match.contact_id : null,
            match ? match.confidence : 0,
            ['snapchat', 'tiktok'].includes(source_platform)
          ]
        );

        successCount++;
      } catch (error) {
        console.error('Error processing record:', error);
        errorCount++;
      }
    }

    console.log(`Successfully created ${successCount} staging records, ${errorCount} failed`);

    // Update job status
    await pool.query(
      `UPDATE import_jobs
       SET status = 'awaiting_review', total_records = $1, processed_records = $2
       WHERE id = $3`,
      [rawRecords.length, successCount, jobId]
    );

    console.log(`Import job ${jobId} completed: ${successCount}/${rawRecords.length} records`);
  } catch (error) {
    console.error(`Error processing import job ${jobId}:`, error);

    try {
      await pool.query(
        `UPDATE import_jobs SET status = 'failed' WHERE id = $1`,
        [jobId]
      );
    } catch (updateError) {
      console.error('Error updating job status to failed:', updateError);
    }
  }
}

module.exports = {
  startImportWorker,
  stopImportWorker,
  processImportJob
};
