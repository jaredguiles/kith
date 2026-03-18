const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireAdmin, requireContactAccess, getSpicyEnabled } = require('../middleware/auth');

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate zodiac sign from birthday
 */
function calculateZodiacSign(birthday) {
  if (!birthday) return null;
  const date = new Date(birthday);
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const zodiacSigns = [
    { name: 'Capricorn', start: [12, 22], end: [1, 19] },
    { name: 'Aquarius', start: [1, 20], end: [2, 18] },
    { name: 'Pisces', start: [2, 19], end: [3, 20] },
    { name: 'Aries', start: [3, 21], end: [4, 19] },
    { name: 'Taurus', start: [4, 20], end: [5, 20] },
    { name: 'Gemini', start: [5, 21], end: [6, 20] },
    { name: 'Cancer', start: [6, 21], end: [7, 22] },
    { name: 'Leo', start: [7, 23], end: [8, 22] },
    { name: 'Virgo', start: [8, 23], end: [9, 22] },
    { name: 'Libra', start: [9, 23], end: [10, 22] },
    { name: 'Scorpio', start: [10, 23], end: [11, 21] },
    { name: 'Sagittarius', start: [11, 22], end: [12, 21] }
  ];

  for (const sign of zodiacSigns) {
    const [startMonth, startDay] = sign.start;
    const [endMonth, endDay] = sign.end;

    if (startMonth > endMonth) {
      // Sign wraps year boundary (Capricorn)
      if ((month === startMonth && day >= startDay) || (month === endMonth && day <= endDay)) {
        return sign.name;
      }
    } else {
      if ((month === startMonth && day >= startDay) || (month === endMonth && day <= endDay)) {
        return sign.name;
      }
    }
  }

  return null;
}

/**
 * Update contact search index
 */
async function updateContactSearchIndex(contactId) {
  try {
    const [contact] = await pool.query(
      `SELECT display_name, email, phone, bio, location, notes_text FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [contactId]
    );

    if (contact.length === 0) return;

    const [tags] = await pool.query(
      `SELECT t.name FROM tags t
       JOIN contact_tags ct ON t.id = ct.tag_id
       WHERE ct.contact_id = ?`,
      [contactId]
    );

    const searchParts = [
      contact[0].display_name,
      contact[0].email,
      contact[0].phone,
      contact[0].bio,
      contact[0].location,
      contact[0].notes_text,
      ...tags.map(t => t.name)
    ].filter(x => x).join(' ');

    const [existing] = await pool.query(
      'SELECT contact_id FROM contact_search_index WHERE contact_id = ?',
      [contactId]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE contact_search_index SET search_text = ? WHERE contact_id = ?',
        [searchParts, contactId]
      );
    } else {
      await pool.query(
        'INSERT INTO contact_search_index (contact_id, search_text) VALUES (?, ?)',
        [contactId, searchParts]
      );
    }
  } catch (err) {
    console.error('Update search index error:', err);
  }
}

/**
 * Log audit event (fire-and-forget, non-blocking)
 */
async function logAudit(userId, contactId, action, entityType, entityId, oldValues, newValues, description) {
  try {
    await pool.query(
      'INSERT INTO audit_log (user_id, contact_id, action, entity_type, entity_id, old_values, new_values, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [userId, contactId, action, entityType, entityId, oldValues ? JSON.stringify(oldValues) : null, newValues ? JSON.stringify(newValues) : null, description]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

/**
 * Log field changelog
 */
async function logFieldChange(contactId, userId, source, fieldName, oldValue, newValue) {
  try {
    await pool.query(
      'INSERT INTO contact_field_changelog (contact_id, user_id, source, field_name, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
      [contactId, userId, source, fieldName, oldValue, newValue]
    );
  } catch (err) {
    console.error('Field changelog error:', err);
  }
}

/**
 * Load full contact with related data
 */
async function loadFullContact(contactId) {
  const [contact] = await pool.query(
    'SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL',
    [contactId]
  );

  if (contact.length === 0) return null;

  const contactData = contact[0];

  const [tags] = await pool.query(
    'SELECT t.id, t.name, t.color FROM tags t JOIN contact_tags ct ON t.id = ct.tag_id WHERE ct.contact_id = ?',
    [contactId]
  );

  const [groups] = await pool.query(
    'SELECT g.id, g.name FROM `groups` g JOIN group_members gm ON g.id = gm.group_id WHERE gm.contact_id = ?',
    [contactId]
  );

  const [socials] = await pool.query(
    'SELECT id, platform, url, username FROM social_links WHERE contact_id = ?',
    [contactId]
  );

  return {
    ...contactData,
    tags,
    groups,
    social_links: socials
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /
 * List contacts scoped to user (unless admin)
 * Query params: ?tag=, ?group=, ?search=, ?sort=, ?sortDir=, ?favorites=, ?spicy=, ?limit=, ?offset=
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { tag, group, search, sort, sortDir, favorites, limit = 100, offset = 0 } = req.query;
    const spicyEnabled = await getSpicyEnabled();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'main_admin';

    let query = 'SELECT c.id, c.owner_user_id, c.display_name, c.first_name, c.last_name, c.email, c.phone, c.birthday, c.location, c.photo_url, c.is_favorite, c.created_at FROM contacts c WHERE c.deleted_at IS NULL';
    const values = [];

    if (!isAdmin) {
      query += ' AND c.owner_user_id = ?';
      values.push(req.user.id);
    }

    if (!spicyEnabled) {
      query += ' AND c.is_spicy = 0';
    }

    if (tag) {
      query += ` AND c.id IN (SELECT ct.contact_id FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id WHERE t.name = ?)`;
      values.push(tag);
    }

    if (group) {
      query += ` AND c.id IN (SELECT gm.contact_id FROM group_members gm JOIN \`groups\` g ON gm.group_id = g.id WHERE g.name = ?)`;
      values.push(group);
    }

    if (search) {
      query += ` AND c.id IN (SELECT contact_id FROM contact_search_index WHERE MATCH(search_text) AGAINST(? IN BOOLEAN MODE))`;
      values.push(search);
    }

    if (favorites === 'true') {
      query += ' AND c.is_favorite = 1';
    }

    const sortField = sort && ['display_name', 'created_at', 'birthday'].includes(sort) ? sort : 'created_at';
    const direction = sortDir && sortDir.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    query += ` ORDER BY c.${sortField} ${direction} LIMIT ? OFFSET ?`;
    values.push(parseInt(limit), parseInt(offset));

    const [rows] = await pool.query(query, values);

    const countQuery = `SELECT COUNT(*) as total FROM contacts c WHERE c.deleted_at IS NULL` +
      (!isAdmin ? ' AND c.owner_user_id = ?' : '') +
      (!spicyEnabled ? ' AND c.is_spicy = 0' : '') +
      (tag ? ` AND c.id IN (SELECT ct.contact_id FROM contact_tags ct JOIN tags t ON ct.tag_id = t.id WHERE t.name = ?)` : '') +
      (group ? ` AND c.id IN (SELECT gm.contact_id FROM group_members gm JOIN \`groups\` g ON gm.group_id = g.id WHERE g.name = ?)` : '') +
      (search ? ` AND c.id IN (SELECT contact_id FROM contact_search_index WHERE MATCH(search_text) AGAINST(? IN BOOLEAN MODE))` : '');

    const countValues = [];
    if (!isAdmin) countValues.push(req.user.id);
    if (tag) countValues.push(tag);
    if (group) countValues.push(group);
    if (search) countValues.push(search);

    const [countResult] = await pool.query(countQuery, countValues);

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('List contacts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /:id
 * Get full contact detail with tags, groups, social_links
 */
router.get('/:id', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const contact = await loadFullContact(contactId);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.status(200).json(contact);
  } catch (err) {
    console.error('Get contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /
 * Create contact
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { display_name: reqDisplayName, first_name, last_name, email, phone, birthday, ...otherFields } = req.body;

    const displayName = reqDisplayName || `${first_name || ''} ${last_name || ''}`.trim() || 'Unnamed Contact';
    const zodiacSign = calculateZodiacSign(birthday);

    const [result] = await pool.query(
      `INSERT INTO contacts (owner_user_id, display_name, first_name, last_name, email, phone, birthday, zodiac_sign, is_spicy)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, displayName, first_name || null, last_name || null, email || null, phone || null, birthday || null, zodiacSign, otherFields.is_spicy ? 1 : 0]
    );

    const contactId = result.insertId;

    // Update search index
    await updateContactSearchIndex(contactId);

    // Log audit
    logAudit(req.user.id, contactId, 'create', 'contact', contactId, null, { display_name: displayName }, 'Contact created');

    const contact = await loadFullContact(contactId);
    res.status(201).json(contact);
  } catch (err) {
    console.error('Create contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id
 * Update contact (with audit logging and field changelog)
 */
router.put('/:id', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const [existing] = await pool.query(
      'SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const oldContact = existing[0];
    const updates = [];
    const values = [];
    const changes = {};

    // List of updatable fields
    const updatableFields = [
      'display_name', 'first_name', 'last_name', 'nickname', 'email', 'phone', 'birthday',
      'age', 'sex', 'pronouns', 'orientation', 'relationship_status', 'location', 'photo_url',
      'bio', 'occupation', 'company', 'website', 'languages', 'ethnicity', 'how_we_met',
      'met_date', 'rating', 'relationship_type', 'is_favorite', 'is_spicy', 'notes_text'
    ];

    for (const field of updatableFields) {
      if (req.body[field] !== undefined) {
        updates.push(`${field} = ?`);
        const newValue = req.body[field];
        values.push(newValue);
        changes[field] = { old: oldContact[field], new: newValue };
      }
    }

    // Auto-calculate zodiac if birthday is being updated
    if (req.body.birthday !== undefined) {
      const zodiacSign = calculateZodiacSign(req.body.birthday);
      if (!updates.some(u => u.includes('zodiac_sign'))) {
        updates.push('zodiac_sign = ?');
        values.push(zodiacSign);
        changes.zodiac_sign = { old: oldContact.zodiac_sign, new: zodiacSign };
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(contactId);
    const query = `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`;

    await pool.query(query, values);

    // Log field changes
    for (const [field, change] of Object.entries(changes)) {
      await logFieldChange(contactId, req.user.id, 'api', field, change.old, change.new);
    }

    // Update search index
    await updateContactSearchIndex(contactId);

    // Log audit
    logAudit(req.user.id, contactId, 'update', 'contact', contactId, oldContact, changes, 'Contact updated');

    const contact = await loadFullContact(contactId);
    res.status(200).json(contact);
  } catch (err) {
    console.error('Update contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id
 * Soft delete contact
 */
router.delete('/:id', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const [existing] = await pool.query(
      'SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await pool.query('UPDATE contacts SET deleted_at = NOW() WHERE id = ?', [contactId]);

    logAudit(req.user.id, contactId, 'delete', 'contact', contactId, null, null, 'Contact deleted');

    res.status(200).json({ success: true, message: 'Contact deleted' });
  } catch (err) {
    console.error('Delete contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /:id/merge/:otherId
 * Merge two contacts with field_decisions
 */
router.post('/:id/merge/:otherId', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const otherId = parseInt(req.params.otherId);

    if (isNaN(contactId) || isNaN(otherId)) {
      return res.status(400).json({ error: 'Invalid contact IDs' });
    }

    if (contactId === otherId) {
      return res.status(400).json({ error: 'Cannot merge contact with itself' });
    }

    const { field_decisions } = req.body;

    const [winner] = await pool.query(
      'SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    const [loser] = await pool.query(
      'SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [otherId]
    );

    if (winner.length === 0 || loser.length === 0) {
      return res.status(404).json({ error: 'One or both contacts not found' });
    }

    // Apply field decisions
    if (field_decisions && typeof field_decisions === 'object') {
      const updates = [];
      const values = [];

      for (const [field, decision] of Object.entries(field_decisions)) {
        if (decision === 'winner') {
          // Keep winner's value
        } else if (decision === 'loser') {
          updates.push(`${field} = ?`);
          values.push(loser[0][field]);
        }
      }

      if (updates.length > 0) {
        values.push(contactId);
        const query = `UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`;
        await pool.query(query, values);
      }
    }

    // Union tags
    const [loserTags] = await pool.query(
      'SELECT tag_id FROM contact_tags WHERE contact_id = ?',
      [otherId]
    );

    for (const tag of loserTags) {
      try {
        await pool.query(
          'INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)',
          [contactId, tag.tag_id]
        );
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }

    // Union groups
    const [loserGroups] = await pool.query(
      'SELECT group_id FROM group_members WHERE contact_id = ?',
      [otherId]
    );

    for (const group of loserGroups) {
      try {
        await pool.query(
          'INSERT INTO group_members (group_id, contact_id) VALUES (?, ?)',
          [group.group_id, contactId]
        );
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }

    // Union socials
    const [loserSocials] = await pool.query(
      'SELECT * FROM social_links WHERE contact_id = ?',
      [otherId]
    );

    for (const social of loserSocials) {
      await pool.query(
        'INSERT INTO social_links (contact_id, platform, url, username) VALUES (?, ?, ?, ?)',
        [contactId, social.platform, social.url, social.username]
      );
    }

    // Append notes
    if (loser[0].notes_text) {
      const newNotes = (winner[0].notes_text || '') + '\n[Merged from contact ' + otherId + ']\n' + loser[0].notes_text;
      await pool.query(
        'UPDATE contacts SET notes_text = ? WHERE id = ?',
        [newNotes, contactId]
      );
    }

    // Soft delete loser
    await pool.query('UPDATE contacts SET deleted_at = NOW() WHERE id = ?', [otherId]);

    // Update search index
    await updateContactSearchIndex(contactId);

    logAudit(req.user.id, contactId, 'merge', 'contact', otherId, { source: otherId }, null, `Merged contact ${otherId} into ${contactId}`);

    const contact = await loadFullContact(contactId);
    res.status(200).json(contact);
  } catch (err) {
    console.error('Merge contacts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /:id/share
 * Share contact with another user
 */
router.post('/:id/share', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const { user_id, permissions, share_scope } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id required' });
    }

    const [targetUser] = await pool.query(
      'SELECT id FROM users WHERE id = ? AND is_active = 1',
      [parseInt(user_id)]
    );

    if (targetUser.length === 0) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    const [existing] = await pool.query(
      'SELECT id FROM shared_contacts WHERE contact_id = ? AND shared_with_user_id = ?',
      [contactId, parseInt(user_id)]
    );

    if (existing.length > 0) {
      return res.status(409).json({ error: 'Contact already shared with this user' });
    }

    const [result] = await pool.query(
      'INSERT INTO shared_contacts (contact_id, shared_by_user_id, shared_with_user_id, permissions, share_scope) VALUES (?, ?, ?, ?, ?)',
      [contactId, req.user.id, parseInt(user_id), permissions || 'read', share_scope || 'basic']
    );

    const [share] = await pool.query(
      'SELECT id, contact_id, shared_by_user_id, shared_with_user_id, permissions, share_scope, created_at FROM shared_contacts WHERE id = ?',
      [result.insertId]
    );

    res.status(201).json(share[0]);
  } catch (err) {
    console.error('Share contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * DELETE /:id/share/:userId
 * Unshare contact from user
 */
router.delete('/:id/share/:userId', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    if (isNaN(contactId) || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid contact or user ID' });
    }

    const [existing] = await pool.query(
      'SELECT shared_by_user_id FROM shared_contacts WHERE contact_id = ? AND shared_with_user_id = ?',
      [contactId, userId]
    );

    if (existing.length === 0) {
      return res.status(404).json({ error: 'Share not found' });
    }

    if (existing[0].shared_by_user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await pool.query(
      'DELETE FROM shared_contacts WHERE contact_id = ? AND shared_with_user_id = ?',
      [contactId, userId]
    );

    res.status(200).json({ success: true, message: 'Contact unshared' });
  } catch (err) {
    console.error('Unshare contact error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id/photo
 * Set profile photo from media
 */
router.put('/:id/photo', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const { media_id } = req.body;

    if (!media_id) {
      return res.status(400).json({ error: 'media_id required' });
    }

    const [media] = await pool.query(
      'SELECT file_path FROM media_assets WHERE id = ? AND deleted_at IS NULL',
      [parseInt(media_id)]
    );

    if (media.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    await pool.query(
      'UPDATE contacts SET photo_url = ? WHERE id = ?',
      [media[0].file_path, contactId]
    );

    const contact = await loadFullContact(contactId);
    res.status(200).json(contact);
  } catch (err) {
    console.error('Set photo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * PUT /:id/favorite
 * Toggle is_favorite
 */
router.put('/:id/favorite', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const [contact] = await pool.query(
      'SELECT is_favorite FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [contactId]
    );

    if (contact.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const newFavorite = contact[0].is_favorite ? 0 : 1;

    await pool.query(
      'UPDATE contacts SET is_favorite = ? WHERE id = ?',
      [newFavorite, contactId]
    );

    const updatedContact = await loadFullContact(contactId);
    res.status(200).json(updatedContact);
  } catch (err) {
    console.error('Toggle favorite error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /:id/changelog
 * Get field-level change history for contact
 */
router.get('/:id/changelog', requireAuth, requireContactAccess, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    if (isNaN(contactId)) return res.status(400).json({ error: 'Invalid contact ID' });

    const { limit = 100, offset = 0 } = req.query;

    const [rows] = await pool.query(
      'SELECT id, contact_id, user_id, import_job_id, source, field_name, old_value, new_value, changed_at FROM contact_field_changelog WHERE contact_id = ? ORDER BY changed_at DESC LIMIT ? OFFSET ?',
      [contactId, parseInt(limit), parseInt(offset)]
    );

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as total FROM contact_field_changelog WHERE contact_id = ?',
      [contactId]
    );

    res.status(200).json({
      data: rows,
      total: countResult[0].total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error('Get changelog error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
