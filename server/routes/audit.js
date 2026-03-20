const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireAdmin, isAdminRole } = require('../middleware/auth');

// GET /api/audit-log?contact_id= or ?entity_type=&entity_id= - Get audit log
router.get('/', requireAuth, async (req, res) => {
  try {
    const contactId = req.query.contact_id;
    const entityType = req.query.entity_type;
    const entityId = req.query.entity_id;

    let query = 'SELECT id, user_id, contact_id, action, entity_type, entity_id, old_values, new_values, description, created_at FROM audit_log';
    const params = [];
    const conditions = [];

    // Admin only OR own contacts
    if (!isAdminRole(req.user.role)) {
      conditions.push('contact_id IN (SELECT id FROM contacts WHERE owner_user_id = ?)');
      params.push(req.user.id);
    }

    if (contactId) {
      // Verify contact ownership if filtering by contact
      const [contact] = await pool.query(
        'SELECT owner_user_id FROM contacts WHERE id = ?',
        [contactId]
      );

      if (!contact || contact.length === 0) {
        return res.status(404).json({ error: 'Contact not found' });
      }

      if (contact[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      conditions.push('contact_id = ?');
      params.push(contactId);
    }

    if (entityType) {
      conditions.push('entity_type = ?');
      params.push(entityType);
    }

    if (entityId) {
      conditions.push('entity_id = ?');
      params.push(entityId);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY created_at DESC';

    const [logs] = await pool.query(query, params);
    res.json(logs);
  } catch (err) {
    console.error('Get audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

module.exports = router;
