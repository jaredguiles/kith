const jwt = require('jsonwebtoken');
const pool = require('../database/connection');

function isAdminRole(role) {
  return role === 'main_admin' || role === 'admin';
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: 'Missing authorization header' });
    }

    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid authorization scheme' });
    }

    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    // Check if it's an extension token
    if (token.startsWith('ext_')) {
      try {
        const result = await pool.query(
          "SELECT value FROM app_settings WHERE key = 'extension_token'"
        );

        if (result.rows.length > 0 && result.rows[0].value === token) {
          // Extension token is valid, set user as main_admin (id=1)
          req.user = {
            id: 1,
            username: 'admin',
            role: 'main_admin'
          };
          return next();
        } else {
          return res.status(401).json({ error: 'Invalid extension token' });
        }
      } catch (err) {
        console.error('Extension token validation error:', err);
        return res.status(401).json({ error: 'Token validation failed' });
      }
    }

    // Standard JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };

    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    console.error('Auth middleware error:', err);
    res.status(401).json({ error: 'Authentication failed' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!isAdminRole(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

function requireOwnerOrAdmin(entityUserId) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (req.user.id !== entityUserId && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireOwnerOrAdmin,
  isAdminRole
};
