const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireContactAccess, requireSpicyEnabled } = require('../middleware/auth');

/**
 * GET /contacts/:id/spicy
 * Get spicy profile for contact (requireSpicyEnabled)
 */
router.get('/contacts/:id/spicy', requireAuth, requireContactAccess, requireSpicyEnabled, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const [rows] = await pool.query(
      `SELECT id, contact_id, spicy_type, orientation, role_preference, positions, kinks, turn_ons, turn_offs,
              boundaries, safe_word, protection_preference, hiv_status, on_prep, prep_since, last_tested_date,
              sti_notes, body_type, body_notes, endowment, grooming, spicy_rating, chemistry_rating, would_repeat,
              spicy_notes, last_encounter, encounter_count, created_at, updated_at
       FROM spicy_profiles WHERE contact_id = ?`,
      [contactId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Spicy profile not found' });
    }

    res.status(200).json(rows[0]);
  } catch (err) {
    console.error('Get spicy profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /contacts/:id/spicy
 * Create or update spicy profile (upsert, requireSpicyEnabled)
 */
router.put('/contacts/:id/spicy', requireAuth, requireContactAccess, requireSpicyEnabled, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const {
      spicy_type, orientation, role_preference, positions, kinks, turn_ons, turn_offs,
      boundaries, safe_word, protection_preference, hiv_status, on_prep, prep_since, last_tested_date,
      sti_notes, body_type, body_notes, endowment, grooming, spicy_rating, chemistry_rating, would_repeat,
      spicy_notes, last_encounter, encounter_count
    } = req.body;

    const [existing] = await pool.query(
      'SELECT id FROM spicy_profiles WHERE contact_id = ?',
      [contactId]
    );

    if (existing.length > 0) {
      // Update
      const updates = [];
      const values = [];

      if (spicy_type !== undefined) { updates.push('spicy_type = ?'); values.push(spicy_type); }
      if (orientation !== undefined) { updates.push('orientation = ?'); values.push(orientation); }
      if (role_preference !== undefined) { updates.push('role_preference = ?'); values.push(role_preference); }
      if (positions !== undefined) { updates.push('positions = ?'); values.push(positions); }
      if (kinks !== undefined) { updates.push('kinks = ?'); values.push(kinks); }
      if (turn_ons !== undefined) { updates.push('turn_ons = ?'); values.push(turn_ons); }
      if (turn_offs !== undefined) { updates.push('turn_offs = ?'); values.push(turn_offs); }
      if (boundaries !== undefined) { updates.push('boundaries = ?'); values.push(boundaries); }
      if (safe_word !== undefined) { updates.push('safe_word = ?'); values.push(safe_word); }
      if (protection_preference !== undefined) { updates.push('protection_preference = ?'); values.push(protection_preference); }
      if (hiv_status !== undefined) { updates.push('hiv_status = ?'); values.push(hiv_status); }
      if (on_prep !== undefined) { updates.push('on_prep = ?'); values.push(on_prep); }
      if (prep_since !== undefined) { updates.push('prep_since = ?'); values.push(prep_since); }
      if (last_tested_date !== undefined) { updates.push('last_tested_date = ?'); values.push(last_tested_date); }
      if (sti_notes !== undefined) { updates.push('sti_notes = ?'); values.push(sti_notes); }
      if (body_type !== undefined) { updates.push('body_type = ?'); values.push(body_type); }
      if (body_notes !== undefined) { updates.push('body_notes = ?'); values.push(body_notes); }
      if (endowment !== undefined) { updates.push('endowment = ?'); values.push(endowment); }
      if (grooming !== undefined) { updates.push('grooming = ?'); values.push(grooming); }
      if (spicy_rating !== undefined) { updates.push('spicy_rating = ?'); values.push(spicy_rating); }
      if (chemistry_rating !== undefined) { updates.push('chemistry_rating = ?'); values.push(chemistry_rating); }
      if (would_repeat !== undefined) { updates.push('would_repeat = ?'); values.push(would_repeat); }
      if (spicy_notes !== undefined) { updates.push('spicy_notes = ?'); values.push(spicy_notes); }
      if (last_encounter !== undefined) { updates.push('last_encounter = ?'); values.push(last_encounter); }
      if (encounter_count !== undefined) { updates.push('encounter_count = ?'); values.push(encounter_count); }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(contactId);
      const query = `UPDATE spicy_profiles SET ${updates.join(', ')} WHERE contact_id = ?`;
      await pool.query(query, values);
    } else {
      // Insert
      await pool.query(
        `INSERT INTO spicy_profiles (contact_id, spicy_type, orientation, role_preference, positions, kinks,
         turn_ons, turn_offs, boundaries, safe_word, protection_preference, hiv_status, on_prep, prep_since,
         last_tested_date, sti_notes, body_type, body_notes, endowment, grooming, spicy_rating, chemistry_rating,
         would_repeat, spicy_notes, last_encounter, encounter_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [contactId, spicy_type || null, orientation || null, role_preference || null, positions || null, kinks || null,
         turn_ons || null, turn_offs || null, boundaries || null, safe_word || null, protection_preference || null,
         hiv_status || null, on_prep || null, prep_since || null, last_tested_date || null, sti_notes || null,
         body_type || null, body_notes || null, endowment || null, grooming || null, spicy_rating || null,
         chemistry_rating || null, would_repeat || null, spicy_notes || null, last_encounter || null, encounter_count || null]
      );
    }

    const [result] = await pool.query(
      `SELECT id, contact_id, spicy_type, orientation, role_preference, positions, kinks, turn_ons, turn_offs,
              boundaries, safe_word, protection_preference, hiv_status, on_prep, prep_since, last_tested_date,
              sti_notes, body_type, body_notes, endowment, grooming, spicy_rating, chemistry_rating, would_repeat,
              spicy_notes, last_encounter, encounter_count, created_at, updated_at
       FROM spicy_profiles WHERE contact_id = ?`,
      [contactId]
    );

    res.status(200).json(result[0]);
  } catch (err) {
    console.error('Upsert spicy profile error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
