const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, isAdminRole } = require('../middleware/auth');

// Helper to check spicy access
async function hasSpicyAccess(userId, contactId, requiredScope) {
  // Check if spicy is enabled
  const [settings] = await pool.query(
    "SELECT value FROM app_settings WHERE `key` = 'spicy_enabled'"
  );

  if (!settings || settings.length === 0 || settings[0].value !== '1') {
    return false;
  }

  // Get contact and verify ownership
  const [contact] = await pool.query(
    'SELECT owner_user_id FROM contacts WHERE id = ?',
    [contactId]
  );

  if (!contact || contact.length === 0) {
    return false;
  }

  // Owner or admin always has access
  if (contact[0].owner_user_id === userId || isAdminRole(contact[0].owner_user_id)) {
    return true;
  }

  // Check shared access for read-only
  if (requiredScope === 'full_spicy') {
    const [shared] = await pool.query(
      `SELECT permissions FROM shared_contacts
       WHERE contact_id = ? AND shared_with_user_id = ? AND share_scope = 'full_spicy'`,
      [contactId, userId]
    );
    return shared && shared.length > 0;
  }

  return false;
}

// GET /api/contacts/:id/spicy - Get spicy profile for contact
router.get('/:id/spicy', requireAuth, async (req, res) => {
  try {
    const contactId = req.params.id;

    // Check spicy access
    const hasAccess = await hasSpicyAccess(req.user.id, contactId, 'full_spicy');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Spicy profile not accessible' });
    }

    const [profile] = await pool.query(
      'SELECT * FROM spicy_profiles WHERE contact_id = ?',
      [contactId]
    );

    if (!profile || profile.length === 0) {
      return res.status(404).json({ error: 'Spicy profile not found' });
    }

    res.json(profile[0]);
  } catch (err) {
    console.error('Get spicy profile error:', err);
    res.status(500).json({ error: 'Failed to fetch spicy profile' });
  }
});

// PUT /api/contacts/:id/spicy - Create or update spicy profile
router.put('/:id/spicy', requireAuth, async (req, res) => {
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

    const {
      spicy_type, orientation, role_preference, positions, kinks, turn_ons, turn_offs,
      boundaries, safe_word, protection_preference, hiv_status, on_prep, prep_since,
      last_tested_date, sti_notes, body_type, body_notes, endowment, grooming,
      spicy_rating, chemistry_rating, would_repeat, spicy_notes, last_encounter, encounter_count
    } = req.body;

    // Insert or update spicy profile
    await pool.query(
      `INSERT INTO spicy_profiles (
        contact_id, spicy_type, orientation, role_preference, positions, kinks, turn_ons, turn_offs,
        boundaries, safe_word, protection_preference, hiv_status, on_prep, prep_since,
        last_tested_date, sti_notes, body_type, body_notes, endowment, grooming,
        spicy_rating, chemistry_rating, would_repeat, spicy_notes, last_encounter, encounter_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        spicy_type = VALUES(spicy_type), orientation = VALUES(orientation),
        role_preference = VALUES(role_preference), positions = VALUES(positions),
        kinks = VALUES(kinks), turn_ons = VALUES(turn_ons), turn_offs = VALUES(turn_offs),
        boundaries = VALUES(boundaries), safe_word = VALUES(safe_word),
        protection_preference = VALUES(protection_preference), hiv_status = VALUES(hiv_status),
        on_prep = VALUES(on_prep), prep_since = VALUES(prep_since),
        last_tested_date = VALUES(last_tested_date), sti_notes = VALUES(sti_notes),
        body_type = VALUES(body_type), body_notes = VALUES(body_notes),
        endowment = VALUES(endowment), grooming = VALUES(grooming),
        spicy_rating = VALUES(spicy_rating), chemistry_rating = VALUES(chemistry_rating),
        would_repeat = VALUES(would_repeat), spicy_notes = VALUES(spicy_notes),
        last_encounter = VALUES(last_encounter), encounter_count = VALUES(encounter_count)`,
      [
        contactId, spicy_type || null, orientation || null, role_preference || null,
        positions || null, kinks || null, turn_ons || null, turn_offs || null,
        boundaries || null, safe_word || null, protection_preference || null,
        hiv_status || null, on_prep || null, prep_since || null, last_tested_date || null,
        sti_notes || null, body_type || null, body_notes || null, endowment || null,
        grooming || null, spicy_rating || null, chemistry_rating || null, would_repeat || null,
        spicy_notes || null, last_encounter || null, encounter_count || null
      ]
    );

    // Set contact is_spicy = 1
    await pool.query(
      'UPDATE contacts SET is_spicy = 1 WHERE id = ?',
      [contactId]
    );

    const [profile] = await pool.query(
      'SELECT * FROM spicy_profiles WHERE contact_id = ?',
      [contactId]
    );

    res.status(200).json(profile[0]);
  } catch (err) {
    console.error('Update spicy profile error:', err);
    res.status(500).json({ error: 'Failed to update spicy profile' });
  }
});

module.exports = router;
