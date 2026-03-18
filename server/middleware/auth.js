const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// Verify JWT and attach user to req
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, username, role }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Require admin or main_admin role
function requireAdmin(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'main_admin')) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Require main_admin role specifically
function requireMainAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'main_admin') {
    return res.status(403).json({ error: 'Main admin access required' });
  }
  next();
}

// Verify contact ownership or admin access
async function requireContactAccess(req, res, next) {
  const contactId = parseInt(req.params.id || req.params.contactId);
  if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

  try {
    const [rows] = await pool.query(
      'SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Contact not found' });

    const isOwner = rows[0].owner_user_id === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    // Check if contact is shared with user
    let isShared = false;
    if (!isOwner && !isAdmin) {
      const [shared] = await pool.query(
        'SELECT id FROM shared_contacts WHERE contact_id = ? AND shared_with_user_id = ?',
        [contactId, req.user.id]
      );
      isShared = shared.length > 0;
    }

    if (!isOwner && !isAdmin && !isShared) {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.contactOwnerId = rows[0].owner_user_id;
    req.isContactOwner = isOwner;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}

// Authenticate via extension API token (for Chrome extension)
async function requireExtensionAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Extension token required' });
  }
  const token = header.slice(7);

  try {
    // First try as a regular JWT
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (e) {
      // Not a JWT — check as extension token
    }

    const [settings] = await pool.query(
      "SELECT value FROM app_settings WHERE `key` = 'extension_api_token'"
    );
    if (settings.length === 0 || !settings[0].value) {
      return res.status(401).json({ error: 'Extension token not configured' });
    }

    const storedToken = JSON.parse(settings[0].value);
    if (token !== storedToken) {
      return res.status(401).json({ error: 'Invalid extension token' });
    }

    // Extension requests run as the main admin user
    const [users] = await pool.query(
      "SELECT id, username, role FROM users WHERE role = 'main_admin' AND is_active = 1 LIMIT 1"
    );
    if (users.length === 0) {
      return res.status(500).json({ error: 'No admin user found' });
    }
    req.user = users[0];
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
}

// Helper to check if spicy features are enabled
async function getSpicyEnabled() {
  try {
    const [rows] = await pool.query(
      "SELECT value FROM app_settings WHERE `key` = 'spicy_enabled'"
    );
    if (rows.length === 0) return true;
    return JSON.parse(rows[0].value) === true;
  } catch {
    return true;
  }
}

// Middleware to gate spicy endpoints
async function requireSpicyEnabled(req, res, next) {
  const enabled = await getSpicyEnabled();
  if (!enabled) {
    return res.status(403).json({ error: 'Spicy features are disabled' });
  }
  next();
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireMainAdmin,
  requireContactAccess,
  requireExtensionAuth,
  requireSpicyEnabled,
  getSpicyEnabled,
  JWT_SECRET
};
