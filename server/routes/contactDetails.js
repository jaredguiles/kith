const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// ============================================================================
// EMAILS
// ============================================================================

// GET /api/contacts/:id/emails - List emails
router.get('/contacts/:id/emails', requireAuth, async (req, res) => {
  try {
    const contactId = req.params.id;

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

    const [emails] = await pool.query(
      'SELECT id, contact_id, label, email, is_primary, created_at FROM contact_emails WHERE contact_id = ? ORDER BY created_at DESC',
      [contactId]
    );

    res.json(emails);
  } catch (err) {
    console.error('Get emails error:', err);
    res.status(500).json({ error: 'Failed to fetch emails' });
  }
});

// POST /api/contacts/:id/emails - Add email
router.post('/contacts/:id/emails', requireAuth, async (req, res) => {
  try {
    const contactId = req.params.id;
    const { label, email, is_primary } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'email is required' });
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

    const [result] = await pool.query(
      'INSERT INTO contact_emails (contact_id, label, email, is_primary) VALUES (?, ?, ?, ?)',
      [contactId, label || null, email, is_primary ? 1 : 0]
    );

    const [emailRecord] = await pool.query(
      'SELECT id, contact_id, label, email, is_primary, created_at FROM contact_emails WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(emailRecord[0]);
  } catch (err) {
    console.error('Add email error:', err);
    res.status(500).json({ error: 'Failed to add email' });
  }
});

// PUT /api/emails/:id - Update email
router.put('/emails/:id', requireAuth, async (req, res) => {
  try {
    const emailId = req.params.id;
    const { label, email, is_primary } = req.body;

    // Get email to verify ownership
    const [emailRecord] = await pool.query(
      `SELECT ce.id, c.owner_user_id FROM contact_emails ce JOIN contacts c ON ce.contact_id = c.id WHERE ce.id = ?`,
      [emailId]
    );

    if (!emailRecord || emailRecord.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (emailRecord[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (label !== undefined) {
      updateFields.push('label = ?');
      updateValues.push(label);
    }
    if (email !== undefined) {
      updateFields.push('email = ?');
      updateValues.push(email);
    }
    if (is_primary !== undefined) {
      updateFields.push('is_primary = ?');
      updateValues.push(is_primary ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(emailId);
    const query = `UPDATE contact_emails SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      'SELECT id, contact_id, label, email, is_primary, created_at FROM contact_emails WHERE id = ?',
      [emailId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update email error:', err);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

// DELETE /api/emails/:id - Delete email
router.delete('/emails/:id', requireAuth, async (req, res) => {
  try {
    const emailId = req.params.id;

    // Get email to verify ownership
    const [emailRecord] = await pool.query(
      `SELECT ce.id, c.owner_user_id FROM contact_emails ce JOIN contacts c ON ce.contact_id = c.id WHERE ce.id = ?`,
      [emailId]
    );

    if (!emailRecord || emailRecord.length === 0) {
      return res.status(404).json({ error: 'Email not found' });
    }

    if (emailRecord[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM contact_emails WHERE id = ?', [emailId]);

    res.json({ message: 'Email deleted' });
  } catch (err) {
    console.error('Delete email error:', err);
    res.status(500).json({ error: 'Failed to delete email' });
  }
});

// ============================================================================
// PHONES
// ============================================================================

// GET /api/contacts/:id/phones - List phones
router.get('/contacts/:id/phones', requireAuth, async (req, res) => {
  try {
    const contactId = req.params.id;

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

    const [phones] = await pool.query(
      'SELECT id, contact_id, label, phone, is_primary, created_at FROM contact_phones WHERE contact_id = ? ORDER BY created_at DESC',
      [contactId]
    );

    res.json(phones);
  } catch (err) {
    console.error('Get phones error:', err);
    res.status(500).json({ error: 'Failed to fetch phones' });
  }
});

// POST /api/contacts/:id/phones - Add phone
router.post('/contacts/:id/phones', requireAuth, async (req, res) => {
  try {
    const contactId = req.params.id;
    const { label, phone, is_primary } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
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

    const [result] = await pool.query(
      'INSERT INTO contact_phones (contact_id, label, phone, is_primary) VALUES (?, ?, ?, ?)',
      [contactId, label || null, phone, is_primary ? 1 : 0]
    );

    const [phoneRecord] = await pool.query(
      'SELECT id, contact_id, label, phone, is_primary, created_at FROM contact_phones WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(phoneRecord[0]);
  } catch (err) {
    console.error('Add phone error:', err);
    res.status(500).json({ error: 'Failed to add phone' });
  }
});

// PUT /api/phones/:id - Update phone
router.put('/phones/:id', requireAuth, async (req, res) => {
  try {
    const phoneId = req.params.id;
    const { label, phone, is_primary } = req.body;

    // Get phone to verify ownership
    const [phoneRecord] = await pool.query(
      `SELECT cp.id, c.owner_user_id FROM contact_phones cp JOIN contacts c ON cp.contact_id = c.id WHERE cp.id = ?`,
      [phoneId]
    );

    if (!phoneRecord || phoneRecord.length === 0) {
      return res.status(404).json({ error: 'Phone not found' });
    }

    if (phoneRecord[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (label !== undefined) {
      updateFields.push('label = ?');
      updateValues.push(label);
    }
    if (phone !== undefined) {
      updateFields.push('phone = ?');
      updateValues.push(phone);
    }
    if (is_primary !== undefined) {
      updateFields.push('is_primary = ?');
      updateValues.push(is_primary ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(phoneId);
    const query = `UPDATE contact_phones SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      'SELECT id, contact_id, label, phone, is_primary, created_at FROM contact_phones WHERE id = ?',
      [phoneId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update phone error:', err);
    res.status(500).json({ error: 'Failed to update phone' });
  }
});

// DELETE /api/phones/:id - Delete phone
router.delete('/phones/:id', requireAuth, async (req, res) => {
  try {
    const phoneId = req.params.id;

    // Get phone to verify ownership
    const [phoneRecord] = await pool.query(
      `SELECT cp.id, c.owner_user_id FROM contact_phones cp JOIN contacts c ON cp.contact_id = c.id WHERE cp.id = ?`,
      [phoneId]
    );

    if (!phoneRecord || phoneRecord.length === 0) {
      return res.status(404).json({ error: 'Phone not found' });
    }

    if (phoneRecord[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM contact_phones WHERE id = ?', [phoneId]);

    res.json({ message: 'Phone deleted' });
  } catch (err) {
    console.error('Delete phone error:', err);
    res.status(500).json({ error: 'Failed to delete phone' });
  }
});

// ============================================================================
// ADDRESSES
// ============================================================================

// GET /api/contacts/:id/addresses - List addresses
router.get('/contacts/:id/addresses', requireAuth, async (req, res) => {
  try {
    const contactId = req.params.id;

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

    const [addresses] = await pool.query(
      'SELECT id, contact_id, label, street, city, state, zip, country, is_primary, created_at FROM contact_addresses WHERE contact_id = ? ORDER BY created_at DESC',
      [contactId]
    );

    res.json(addresses);
  } catch (err) {
    console.error('Get addresses error:', err);
    res.status(500).json({ error: 'Failed to fetch addresses' });
  }
});

// POST /api/contacts/:id/addresses - Add address
router.post('/contacts/:id/addresses', requireAuth, async (req, res) => {
  try {
    const contactId = req.params.id;
    const { label, street, city, state, zip, country, is_primary } = req.body;

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

    const [result] = await pool.query(
      'INSERT INTO contact_addresses (contact_id, label, street, city, state, zip, country, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [contactId, label || null, street || null, city || null, state || null, zip || null, country || null, is_primary ? 1 : 0]
    );

    const [addressRecord] = await pool.query(
      'SELECT id, contact_id, label, street, city, state, zip, country, is_primary, created_at FROM contact_addresses WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(addressRecord[0]);
  } catch (err) {
    console.error('Add address error:', err);
    res.status(500).json({ error: 'Failed to add address' });
  }
});

// PUT /api/addresses/:id - Update address
router.put('/addresses/:id', requireAuth, async (req, res) => {
  try {
    const addressId = req.params.id;
    const { label, street, city, state, zip, country, is_primary } = req.body;

    // Get address to verify ownership
    const [addressRecord] = await pool.query(
      `SELECT ca.id, c.owner_user_id FROM contact_addresses ca JOIN contacts c ON ca.contact_id = c.id WHERE ca.id = ?`,
      [addressId]
    );

    if (!addressRecord || addressRecord.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    if (addressRecord[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updateFields = [];
    const updateValues = [];

    if (label !== undefined) {
      updateFields.push('label = ?');
      updateValues.push(label);
    }
    if (street !== undefined) {
      updateFields.push('street = ?');
      updateValues.push(street);
    }
    if (city !== undefined) {
      updateFields.push('city = ?');
      updateValues.push(city);
    }
    if (state !== undefined) {
      updateFields.push('state = ?');
      updateValues.push(state);
    }
    if (zip !== undefined) {
      updateFields.push('zip = ?');
      updateValues.push(zip);
    }
    if (country !== undefined) {
      updateFields.push('country = ?');
      updateValues.push(country);
    }
    if (is_primary !== undefined) {
      updateFields.push('is_primary = ?');
      updateValues.push(is_primary ? 1 : 0);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateValues.push(addressId);
    const query = `UPDATE contact_addresses SET ${updateFields.join(', ')} WHERE id = ?`;
    await pool.query(query, updateValues);

    const [updated] = await pool.query(
      'SELECT id, contact_id, label, street, city, state, zip, country, is_primary, created_at FROM contact_addresses WHERE id = ?',
      [addressId]
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Update address error:', err);
    res.status(500).json({ error: 'Failed to update address' });
  }
});

// DELETE /api/addresses/:id - Delete address
router.delete('/addresses/:id', requireAuth, async (req, res) => {
  try {
    const addressId = req.params.id;

    // Get address to verify ownership
    const [addressRecord] = await pool.query(
      `SELECT ca.id, c.owner_user_id FROM contact_addresses ca JOIN contacts c ON ca.contact_id = c.id WHERE ca.id = ?`,
      [addressId]
    );

    if (!addressRecord || addressRecord.length === 0) {
      return res.status(404).json({ error: 'Address not found' });
    }

    if (addressRecord[0].owner_user_id !== req.user.id && !isAdminRole(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query('DELETE FROM contact_addresses WHERE id = ?', [addressId]);

    res.json({ message: 'Address deleted' });
  } catch (err) {
    console.error('Delete address error:', err);
    res.status(500).json({ error: 'Failed to delete address' });
  }
});

module.exports = router;
