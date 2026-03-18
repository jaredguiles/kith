require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/init');
const { startImportWorker } = require('./import/worker');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '100mb' })); // Large limit for base64 media uploads
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Serve media files (the storage layer mount)
const mediaPath = process.env.MEDIA_PATH || '/media';
app.use('/media', express.static(mediaPath));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/socials', require('./routes/socials'));
app.use('/api/spicy', require('./routes/spicy'));
app.use('/api/events', require('./routes/events'));
app.use('/api/timeline', require('./routes/timeline'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/reminders', require('./routes/reminders'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/media', require('./routes/media'));
app.use('/api/audit-log', require('./routes/audit'));
app.use('/api/changelog', require('./routes/changelog'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/preferences', require('./routes/preferences'));
app.use('/api/import', require('./routes/import'));
app.use('/api/health', require('./routes/health'));

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).json({ error: 'API endpoint not found' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    await initDatabase();
    startImportWorker();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Kith] Server running on port ${PORT}`);
      console.log(`[Kith] Media path: ${mediaPath}`);
    });
  } catch (err) {
    console.error('[Kith] Failed to start:', err.message);
    process.exit(1);
  }
}

start();
