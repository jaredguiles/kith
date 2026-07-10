'use strict';

// Kith — Express entry point.
// Phase 0: boots Express, serves the SPA shell placeholder, exposes /api/health.

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');

const { initDatabase } = require('./database/init');
const { getPool } = require('./database/connection');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

// Traefik is the single reverse-proxy hop in front of the app; trust it so
// req.ip reflects the real client IP from X-Forwarded-For (login throttling
// in middleware/auth.js keys on req.ip).
app.set('trust proxy', 1);

// ---------------------------------------------------------------------------
// Production safety: refuse to start with placeholder secrets (§7.4 / SPEC).
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV === 'production') {
  const bad = (v) => !v || /changeme/i.test(v);
  if (bad(process.env.JWT_SECRET)) {
    console.error('FATAL: JWT_SECRET is missing or a placeholder. Refusing to start in production.');
    process.exit(1);
  }
  if (bad(process.env.FIELD_ENCRYPTION_KEY)) {
    console.error('FATAL: FIELD_ENCRYPTION_KEY is missing or a placeholder. Refusing to start in production.');
    process.exit(1);
  }
  // §7.E: the field key must be a real 32-byte base64 key in production.
  const keyBuf = Buffer.from(process.env.FIELD_ENCRYPTION_KEY, 'base64');
  if (keyBuf.length !== 32) {
    console.error('FATAL: FIELD_ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32).');
    process.exit(1);
  }
  if (process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Security headers (§7.12): strict CSP, no unsafe-inline scripts.
// ---------------------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"], // strict: no unsafe-inline scripts (§7.12)
        // 'unsafe-inline' for STYLE only: the design system sets dynamic colors
        // (tag dots, pride-flag gradients, accent overrides) via style attributes.
        // Script injection remains fully blocked, which is the CSP's XSS backstop.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'"],
        mediaSrc: ["'self'", 'blob:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Outside production the app may be served over plain HTTP (dev
        // instance has no TLS). upgrade-insecure-requests would force every
        // asset to https:// and render a blank page, so disable it (and HSTS)
        // unless NODE_ENV=production.
        upgradeInsecureRequests: IS_PROD ? [] : null,
      },
    },
    hsts: IS_PROD,
    crossOriginEmbedderPolicy: false,
    // COOP is ignored by browsers on untrustworthy (plain-HTTP) origins and
    // only produces console noise on the dev instance — send it in prod only.
    crossOriginOpenerPolicy: IS_PROD,
  })
);

app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Health — deep check: pings the DB (cheap SELECT 1, short timeout).
// Returns 200 when the DB answers, 503 when it does not. Never throws.
// ---------------------------------------------------------------------------
app.get('/api/health', async (req, res) => {
  let timer = null;
  try {
    // .catch on the query promise: if the timeout wins the race and the query
    // rejects later, it must not surface as an unhandled rejection.
    const ping = getPool().query('SELECT 1');
    await Promise.race([
      ping,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 2000);
        timer.unref();
      }).then(() => {
        ping.catch(() => { /* swallow late rejection */ });
        throw new Error('db health timeout');
      }),
    ]);
    res.json({ status: 'ok', db: 'up' });
  } catch (err) {
    console.error('[health] DB ping failed:', err.message);
    res.status(503).json({ status: 'degraded', db: 'down' });
  } finally {
    if (timer) clearTimeout(timer);
  }
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/auth', require('./routes/auth'));
// ICS feed authenticates via ?token= (calendar apps can't send headers) — must
// mount BEFORE any bare-'/api' router whose router.use(requireAuth) would
// intercept /api/ics/* and 401 it.
app.use('/api/ics', require('./routes/ics'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/contacts', require('./routes/contacts'));
const { contactSatellites, satelliteItems } = require('./routes/satellites');
app.use('/api/contacts/:id', contactSatellites);
app.use('/api', satelliteItems);
const { tagsRouter, contactTags } = require('./routes/tags');
app.use('/api/tags', tagsRouter);
app.use('/api/contacts/:id/tags', contactTags);
app.use('/api/groups', require('./routes/groups'));
app.use('/api/events', require('./routes/events'));
const { timelineRouter, notesRouter, remindersRouter, messagesRouter } = require('./routes/timeline');
app.use('/api/timeline', timelineRouter);
app.use('/api/notes', notesRouter);
app.use('/api/reminders', remindersRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/media', require('./routes/media'));
app.use('/api/immich', require('./routes/immich'));
app.use('/api/contacts/:id/spicy', require('./routes/spicy'));
const { shareRouter, mergeRouter, auditRouter, changelogRouter } = require('./routes/sharing');
app.use('/api/contacts/:id/share', shareRouter);
app.use('/api/contacts/:id/merge', mergeRouter);
app.use('/api/audit-log', auditRouter);
app.use('/api/changelog', changelogRouter);
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api', require('./routes/interactions'));
app.use('/api/push', require('./routes/push'));
app.use('/api', require('./routes/dashboard'));
app.use('/api/import', require('./routes/import'));
app.use('/api', require('./routes/relationships'));
app.use('/api', require('./routes/dates'));
app.use('/api', require('./routes/gifts'));
app.use('/api/tokens', require('./routes/tokens'));
app.use('/api/ics', require('./routes/ics'));
app.use('/api/calendar', require('./routes/calendar'));
app.use('/api/journal', require('./routes/journal'));
// Concurrently developed routers (geo/export/trash/search) — mounted here;
// files are owned by another workstream and land in the same release.
app.use('/api/geo', require('./routes/geo'));
app.use('/api/export', require('./routes/export'));
app.use('/api/trash', require('./routes/trash'));
app.use('/api/search', require('./routes/search'));

// ---------------------------------------------------------------------------
// API 404 + global JSON error handler (never leak stack traces)
// ---------------------------------------------------------------------------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('[error]', req.method, req.originalUrl, err.message);
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong' });
});

// ---------------------------------------------------------------------------
// Static SPA (no build step — vanilla files in server/public)
// ---------------------------------------------------------------------------
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// SPA fallback for client-side routes (never for /api/*)
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ---------------------------------------------------------------------------
// Boot: init DB (schema + seed + migrations), then listen. Retry a few times —
// the dev DB container may still be warming up.
// ---------------------------------------------------------------------------
let server = null;
let importWorker = null;
let shuttingDown = false;

async function boot() {
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await initDatabase();
      break;
    } catch (err) {
      if (attempt === maxAttempts) {
        console.error('FATAL: database init failed:', err.message);
        process.exit(1);
      }
      console.warn(`[boot] DB init attempt ${attempt}/${maxAttempts} failed (${err.code || err.message}); retrying in 3s`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  server = app.listen(PORT, () => {
    console.log(`Kith listening on :${PORT} (${process.env.NODE_ENV || 'development'})`);
  });

  startImportWorker();
  startScheduler();
}

// ---------------------------------------------------------------------------
// Scheduler — croner jobs for daily nudges (08:00), weekly digests (08:15),
// and the trash purge (03:00), plus a boot catch-up. Replaces the previous
// setInterval trash-purge sweeper (migrated into lib/scheduler.js, Job C).
// ---------------------------------------------------------------------------
function startScheduler() {
  try {
    require('./lib/scheduler').startScheduler(getPool());
  } catch (err) {
    console.error('[scheduler] failed to start:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Import worker — in-process worker_thread (§3.2). Restarts on crash.
// ---------------------------------------------------------------------------
function startImportWorker() {
  const { Worker } = require('node:worker_threads');
  const workerPath = path.join(__dirname, 'import', 'worker.js');
  const worker = new Worker(workerPath);
  importWorker = worker;
  worker.on('error', (err) => console.error('[import-worker] error:', err.message));
  worker.on('exit', (code) => {
    if (importWorker === worker) importWorker = null;
    if (code !== 0 && !shuttingDown) {
      console.error(`[import-worker] exited with code ${code}; restarting in 10s`);
      setTimeout(startImportWorker, 10000);
    }
  });
}

// ---------------------------------------------------------------------------
// Graceful shutdown: stop accepting connections, terminate the import worker,
// drain the DB pool, then exit 0. Force-exit after 10s if cleanup hangs.
// ---------------------------------------------------------------------------
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] received ${signal}; closing`);

  const forceTimer = setTimeout(() => {
    console.error('[shutdown] cleanup timed out after 10s; forcing exit');
    process.exit(1);
  }, 10000);
  forceTimer.unref();

  try {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try { require('./lib/scheduler').stopScheduler(); } catch { /* ignore */ }
    if (importWorker) {
      await importWorker.terminate().catch(() => { /* ignore */ });
      importWorker = null;
    }
    await getPool().end().catch((err) => console.error('[shutdown] pool.end failed:', err.message));
    console.log('[shutdown] clean exit');
    process.exit(0);
  } catch (err) {
    console.error('[shutdown] error during cleanup:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Process-level error handlers: log unhandled rejections; exit on uncaught
// exceptions (state is unknown — restart policy brings the container back).
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason instanceof Error ? reason.stack : reason);
});

process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err);
  process.exit(1);
});

boot().catch((err) => {
  console.error('FATAL: boot failed:', err.stack || err);
  process.exit(1);
});
