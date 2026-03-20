const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// GET /api/changelog?contact_id= - Get field changelog for contact
router.get('/', requireAuth, async (req, res) => {
  try {
    const contactId = req.query.contact_id;

    if (!contactId) {
      return res.status(400).json({ error: 'contact_id parameter is required' });
    }

    // Verify contact ownership
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

    const [changelog] = await pool.query(
      `SELECT id, contact_id, user_id, import_job_id, source, field_name, old_value, new_value, changed_at
       FROM contact_field_changelog
       WHERE contact_id = ?
       ORDER BY changed_at DESC`,
      [contactId]
    );

    res.json(changelog);
  } catch (err) {
    console.error('Get changelog error:', err);
    res.status(500).json({ error: 'Failed to fetch changelog' });
  }
});

module.exports = router;
