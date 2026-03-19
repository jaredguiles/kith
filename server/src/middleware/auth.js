import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-prod';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'main_admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
}

export function requireMainAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== 'main_admin') {
    return res.status(403).json({ error: 'Main admin access required' });
  }

  next();
}

export function generateToken(userId, username, role, displayName) {
  const token = jwt.sign(
    {
      id: userId,
      username,
      role,
      display_name: displayName,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return token;
}
