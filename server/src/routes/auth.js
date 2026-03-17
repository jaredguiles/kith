import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../database/connection.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'kith-default-secret-change-me';
const JWT_EXPIRES = '7d';

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const connection = await pool.getConnection();
    const [users] = await connection.execute(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND is_active = 1',
      [username, username]
    );
    connection.release();

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Update last login
    const conn2 = await pool.getConnection();
    await conn2.execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    conn2.release();

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          display_name: user.display_name,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me - check current session
router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const connection = await pool.getConnection();
    const [users] = await connection.execute(
      'SELECT id, username, email, display_name, role, last_login_at, created_at FROM users WHERE id = ? AND is_active = 1',
      [decoded.id]
    );
    connection.release();

    if (users.length === 0) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: users[0] });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
    next(error);
  }
});

// PUT /api/auth/password - change own password
router.put('/password', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, error: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters' });
    }

    const connection = await pool.getConnection();
    const [users] = await connection.execute('SELECT * FROM users WHERE id = ?', [decoded.id]);

    if (users.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, users[0].password_hash);
    if (!valid) {
      connection.release();
      return res.status(401).json({ success: false, error: 'Current password is incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await connection.execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?', [hash, decoded.id]);
    connection.release();

    res.json({ success: true, message: 'Password updated' });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
    next(error);
  }
});

export default router;
