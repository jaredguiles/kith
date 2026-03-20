require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./database/init');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/tags', require('./routes/tags'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/socials', require('./routes/socials'));
app.use('/api/contacts', require('./routes/spicy'));  // nested under /api/contacts/:id/spicy
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
app.use('/api', require('./routes/health'));
// Contact sub-routes for emails, phones, addresses
app.use('/api', require('./routes/contactDetails'));

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../dist')));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../dist/index.html'));
    }
  });
}

const PORT = process.env.PORT || 3000;

async function start() {
  try {
    await initDatabase();
    console.log('Database initialized');
    app.listen(PORT, () => {
      console.log(`Kith server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
