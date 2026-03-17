import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cron from 'node-cron';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { testConnection } from './database/connection.js';
import { initializeDatabase } from './database/init.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

// Routes
import contactsRouter from './routes/contacts.js';
import timelineRouter from './routes/timeline.js';
import notesRouter from './routes/notes.js';
import messagesRouter from './routes/messages.js';
import mediaRouter from './routes/media.js';
import remindersRouter from './routes/reminders.js';
import tagsRouter from './routes/tags.js';
import groupsRouter from './routes/groups.js';
import platformsRouter from './routes/platforms.js';
import preferencesRouter from './routes/preferences.js';
import webhooksRouter from './routes/webhooks.js';
import authRouter from './routes/auth.js';
import usersRouter from './routes/users.js';
import { requireAuth, requireAdmin } from './middleware/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan('combined'));

// Static files for React frontend
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// Serve media files from the storage layer MediaCore mount (/media in container)
const mediaPath = process.env.MEDIA_PATH || '/media';
app.use('/media', express.static(mediaPath, {
  maxAge: '30d',
  immutable: true,
  setHeaders: (res) => {
    res.set('Access-Control-Allow-Origin', '*');
  }
}));

// Public API Routes (no auth required)
app.use('/api/auth', authRouter);
app.use('/api/webhooks', webhooksRouter);

// Protected API Routes (any authenticated user can read)
app.use('/api/contacts', requireAuth, contactsRouter);
app.use('/api/timeline', requireAuth, timelineRouter);
app.use('/api/notes', requireAuth, notesRouter);
app.use('/api/messages', requireAuth, messagesRouter);
app.use('/api/media', requireAuth, mediaRouter);
app.use('/api/reminders', requireAuth, remindersRouter);
app.use('/api/tags', requireAuth, tagsRouter);
app.use('/api/groups', requireAuth, groupsRouter);
app.use('/api/platforms', requireAuth, platformsRouter);
app.use('/api/preferences', requireAuth, preferencesRouter);

// Admin-only routes
app.use('/api/users', usersRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is healthy' });
});

// SPA fallback - serve index.html for all unmatched routes
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(publicPath, 'index.html'), (err) => {
      if (err) {
        notFoundHandler(req, res);
      }
    });
  } else {
    notFoundHandler(req, res);
  }
});

// Error handling
app.use(errorHandler);

// Cron job: Check for due reminders every 5 minutes
cron.schedule('*/5 * * * *', async () => {
  try {
    const connection = await pool.getConnection();
    const [dueReminders] = await connection.execute(
      `SELECT r.id, r.title, c.display_name, r.due_at
       FROM reminders r
       JOIN contacts c ON r.contact_id = c.id
       WHERE r.completed_at IS NULL AND r.deleted_at IS NULL
       AND r.due_at <= NOW()
       AND (r.last_notified_at IS NULL OR r.last_notified_at < DATE_SUB(NOW(), INTERVAL 1 HOUR))`
    );

    if (dueReminders.length > 0) {
      console.log(`[REMINDERS] ${dueReminders.length} reminders are due:`);
      dueReminders.forEach(reminder => {
        console.log(`  - "${reminder.title}" for ${reminder.display_name} (due: ${reminder.due_at})`);
      });

      // Update last_notified_at to prevent spam
      await connection.execute(
        `UPDATE reminders SET last_notified_at = NOW()
         WHERE id IN (${dueReminders.map(() => '?').join(',')})`,
        dueReminders.map(r => r.id)
      );
    }

    connection.release();
  } catch (error) {
    console.error('[CRON] Error checking reminders:', error.message);
  }
});

// Start server
async function startServer() {
  // Test database connection
  const dbConnected = await testConnection();

  if (!dbConnected) {
    console.error('Failed to connect to database. Exiting.');
    process.exit(1);
  }

  // Auto-create tables if they don't exist
  await initializeDatabase();

  app.listen(PORT, () => {
    console.log(`✓ Kith CRM server running on http://localhost:${PORT}`);
    console.log(`✓ Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log(`✓ API available at http://localhost:${PORT}/api`);
    console.log(`✓ Frontend served from ${publicPath}`);
  });
}

startServer();
