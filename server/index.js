'use strict';

// Kith — Express entry point.
// Phase 0: boots Express, serves the SPA shell placeholder, exposes /api/health.

require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');

const { initDatabase } = require('./database/init');

const app = express();
const PORT = Number(process.env.PORT || 3000);

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
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// ---------------------------------------------------------------------------
// API routes
// ---------------------------------------------------------------------------
app.use('/api/auth', require('./routes/auth'));
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
app.use('/api/contacts/:id/spicy', require('./routes/spicy'));
const { shareRouter, mergeRouter, auditRouter, changelogRouter } = require('./routes/sharing');
app.use('/api/contacts/:id/share', shareRouter);
app.use('/api/contacts/:id/merge', mergeRouter);
app.use('/api/audit-log', auditRouter);
app.use('/api/changelog', changelogRouter);
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api', require('./routes/dashboard'));

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

  app.listen(PORT, () => {
    console.log(`Kith listening on :${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

boot();
