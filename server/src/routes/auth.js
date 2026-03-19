import express from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authenticate, generateToken } from '../middleware/auth.js';

const router = express.Router();

async function ensureAdminExists() {
  const result = await query('SELECT COUNT(*) as count FROM users');
  if (result[0].count === 0) {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@kith.local';
    const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';

    const hashedPassword = await bcrypt.hash(adminPassword, 10);

    await query(
      'INSERT INTO users (username, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [adminUsername, adminEmail, 'Admin User', hashedPassword, 'main_admin']
    );

    console.log(`Created main_admin user: ${adminUsername}`);
  }
}

router.post('/login', async (req, res) => {
  try {
    await ensureAdminExists();

    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const users = await query(
      'SELECT id, username, email, display_name, password_hash, role FROM users WHERE username = ? OR email = ?',
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken(user.id, user.username, user.role, user.display_name);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/register', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'main_admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { username, email, display_name, password, role = 'user' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await query(
      'INSERT INTO users (username, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [username, email, display_name || username, hashedPassword, role]
    );

    const newUsers = await query('SELECT id, username, email, display_name, role FROM users WHERE username = ?', [
      username,
    ]);
    const newUser = newUsers[0];

    res.status(201).json({
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email,
        display_name: newUser.display_name,
        role: newUser.role,
      },
    });
  } catch (err) {
    console.error('Register error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const users = await query('SELECT id, username, email, display_name, role, is_active FROM users WHERE id = ?', [
      req.user.id,
    ]);

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: users[0] });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
