import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, initDb } from './db.js';
import authRouter from './routes/auth.js';
import contactsRouter from './routes/contacts.js';
import groupsRouter from './routes/groups.js';
import tagsRouter from './routes/tags.js';
import usersRouter from './routes/users.js';
import settingsRouter from './routes/settings.js';
import mediaRouter from './routes/media.js';
import healthRouter from './routes/health.js';
import { authenticate } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use('/media', express.static('/media'));

app.use('/api/auth', authRouter);
app.use('/api/contacts', authenticate, contactsRouter);
app.use('/api/groups', authenticate, groupsRouter);
app.use('/api/tags', authenticate, tagsRouter);
app.use('/api/users', usersRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/media', mediaRouter);
app.use('/api/health', healthRouter);

const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(publicPath, 'index.html'));
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

async function testDbConnection() {
  try {
    const result = await query('SELECT 1 as ping');
    console.log('Database connection successful');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

async function start() {
  try {
    const connected = await testDbConnection();
    if (!connected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }

    await initDb();

    app.listen(PORT, () => {
      console.log(`Kith server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
