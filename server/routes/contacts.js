const express = require('express');
const router = express.Router();
const pool = require('../database/connection');
const { requireAuth, requireAdmin, isAdminRole } = require('../middleware/auth');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get zodiac sign from birthday
 */
function getZodiacSign(birthday) {
  const date = new Date(birthday);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Aries';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Taurus';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'Gemini';
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Cancer';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Leo';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Virgo';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Libra';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Scorpio';
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Sagittarius';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Capricorn';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Aquarius';
  return 'Pisces';
}

/**
 * Fire-and-forget audit logging
 */
function logAudit(userId, contactId, action, entityType, entityId, oldValues, newValues, description) {
  pool.query(
    `INSERT INTO audit_log (user_id, contact_id, action, entity_type, entity_id, old_values, new_values, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, contactId, action, entityType, entityId, JSON.stringify(oldValues), JSON.stringify(newValues), description]
  ).catch(err => {
    console.error('Audit log error:', err);
  });
}

/**
 * Log individual field changes
 */
async function logFieldChange(contactId, userId, source, fieldName, oldValue, newValue) {
  try {
    await pool.query(
      `INSERT INTO contact_field_changelog (contact_id, user_id, source, field_name, old_value, new_value, changed_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [contactId, userId, source, fieldName, oldValue, newValue]
    );
  } catch (err) {
    console.error('Field change log error:', err);
  }
}

/**
 * Update search index for a contact
 */
async function updateSearchIndex(contactId) {
  try {
    const [contact] = await pool.query(
      `SELECT display_name, first_name, last_name, nickname, email, phone, bio, location, occupation, company, notes_text
       FROM contacts WHERE id = ?`,
      [contactId]
    );

    if (!contact) return;

    // Concatenate searchable fields
    const searchableFields = [
      contact.display_name,
      contact.first_name,
      contact.last_name,
      contact.nickname,
      contact.email,
      contact.phone,
      contact.bio,
      contact.location,
      contact.occupation,
      contact.company,
      contact.notes_text
    ].filter(f => f).join(' ');

    // Get tag names
    const [tags] = await pool.query(
      `SELECT GROUP_CONCAT(name SEPARATOR ' ') as tag_text
       FROM contact_tags ct
       JOIN tags t ON ct.tag_id = t.id
       WHERE ct.contact_id = ?`,
      [contactId]
    );

    const tagText = tags[0]?.tag_text || '';
    const searchText = `${searchableFields} ${tagText}`.trim();

    await pool.query(
      `INSERT INTO contact_search_index (contact_id, search_text) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE search_text = ?`,
      [contactId, searchText, searchText]
    );
  } catch (err) {
    console.error('Search index update error:', err);
  }
}

/**
 * Check if user has access to a contact
 */
async function checkContactAccess(contactId, userId, accessType = 'read') {
  try {
    // Check if user is owner
    const [ownerCheck] = await pool.query(
      `SELECT id FROM contacts WHERE id = ? AND owner_user_id = ? AND deleted_at IS NULL`,
      [contactId, userId]
    );
    if (ownerCheck.length > 0) return true;

    // Check if user is admin
    const [adminCheck] = await pool.query(
      `SELECT id FROM contacts WHERE id = ? AND deleted_at IS NULL`,
      [contactId]
    );
    if (adminCheck.length > 0) {
      const user = await getUserRole(userId);
      if (user && user.role === 'admin') return true;
    }

    // Check if shared with user
    const [shareCheck] = await pool.query(
      `SELECT id FROM shared_contacts
       WHERE contact_id = ? AND user_id = ? AND (permissions = ? OR permissions = ?)`,
      [contactId, userId, 'read', accessType === 'edit' ? 'edit' : 'read']
    );
    if (shareCheck.length > 0) return true;

    return false;
  } catch (err) {
    console.error('Contact access check error:', err);
    return false;
  }
}

/**
 * Get user role (helper for admin checks)
 */
async function getUserRole(userId) {
  try {
    const [user] = await pool.query(
      `SELECT role FROM users WHERE id = ?`,
      [userId]
    );
    return user[0] || null;
  } catch (err) {
    console.error('Get user role error:', err);
    return null;
  }
}

/**
 * Fetch contact with tags
 */
async function getContactWithTags(contactId) {
  const [contact] = await pool.query(
    `SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL`,
    [contactId]
  );

  if (contact.length === 0) return null;

  const contactData = contact[0];

  // Get tags
  const [tags] = await pool.query(
    `SELECT t.id, t.name, t.color FROM tags t
     JOIN contact_tags ct ON t.id = ct.tag_id
     WHERE ct.contact_id = ?`,
    [contactId]
  );

  contactData.tags = tags;
  return contactData;
}

/**
 * Fetch contact with all related data (full detail view)
 */
async function getContactDetail(contactId, includeSpicy = false) {
  const contact = await getContactWithTags(contactId);
  if (!contact) return null;

  // Get groups
  const [groups] = await pool.query(
    `SELECT g.id, g.name, g.icon, g.color FROM groups g
     JOIN group_members gm ON g.id = gm.group_id
     WHERE gm.contact_id = ?`,
    [contactId]
  );
  contact.groups = groups;

  // Get social links
  const [socialLinks] = await pool.query(
    `SELECT id, platform, url, username FROM social_links WHERE contact_id = ?`,
    [contactId]
  );
  contact.social_links = socialLinks;

  // Get emails
  const [emails] = await pool.query(
    `SELECT id, address, type FROM emails WHERE contact_id = ?`,
    [contactId]
  );
  contact.emails = emails;

  // Get phones
  const [phones] = await pool.query(
    `SELECT id, number, type FROM phones WHERE contact_id = ?`,
    [contactId]
  );
  contact.phones = phones;

  // Get addresses
  const [addresses] = await pool.query(
    `SELECT id, street, city, state, zip, country, type FROM addresses WHERE contact_id = ?`,
    [contactId]
  );
  contact.addresses = addresses;

  // Get spicy profile if requested
  if (includeSpicy && contact.spicy_enabled) {
    const [spicy] = await pool.query(
      `SELECT * FROM spicy_profiles WHERE contact_id = ?`,
      [contactId]
    );
    if (spicy.length > 0) contact.spicy_profile = spicy[0];
  }

  // Get stats
  const [stats] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM notes WHERE contact_id = ?) as note_count,
       (SELECT COUNT(*) FROM events WHERE contact_id = ?) as event_count,
       (SELECT COUNT(*) FROM media_assets WHERE contact_id = ?) as media_count`,
    [contactId, contactId, contactId]
  );
  contact.stats = stats[0];

  return contact;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET / - List contacts with filters and pagination
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { search, tag, group, favorites, sort = 'display_name', sortDir = 'ASC', page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const isAdmin = isAdminRole(req.user);

    let query = `
      SELECT c.*,
             GROUP_CONCAT(DISTINCT t.id) as tag_ids,
             GROUP_CONCAT(DISTINCT t.name) as tag_names,
             GROUP_CONCAT(DISTINCT t.color) as tag_colors,
             IF(sc.id IS NOT NULL, 1, 0) as is_shared
      FROM contacts c
      LEFT JOIN contact_tags ct ON c.id = ct.contact_id
      LEFT JOIN tags t ON ct.tag_id = t.id
      LEFT JOIN shared_contacts sc ON c.id = sc.contact_id AND sc.shared_with_user_id = ?
      WHERE c.deleted_at IS NULL
    `;
    let params = [req.user.id];

    // Access control
    if (!isAdmin) {
      query += ` AND (c.owner_user_id = ? OR sc.id IS NOT NULL)`;
      params.push(req.user.id);
    }

    // Filters
    if (search) {
      query += ` AND c.id IN (
        SELECT contact_id FROM contact_search_index WHERE search_text LIKE ?
      )`;
      params.push(`%${search}%`);
    }

    if (tag) {
      query += ` AND c.id IN (
        SELECT ct.contact_id FROM contact_tags ct
        JOIN tags t ON ct.tag_id = t.id
        WHERE t.name = ?
      )`;
      params.push(tag);
    }

    if (group) {
      query += ` AND c.id IN (
        SELECT contact_id FROM group_members WHERE group_id = ?
      )`;
      params.push(group);
    }

    if (favorites === 'true') {
      query += ` AND c.is_favorite = 1`;
    }

    // Grouping for aggregates
    query += ` GROUP BY c.id`;

    // Sorting
    const validSortFields = ['display_name', 'first_name', 'last_name', 'created_at', 'updated_at'];
    const sortField = validSortFields.includes(sort) ? sort : 'display_name';
    const sortDirection = sortDir.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    query += ` ORDER BY ${sortField} ${sortDirection}`;

    // Pagination
    query += ` LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const [contacts] = await pool.query(query, params);

    // Transform tags back to array
    const transformedContacts = contacts.map(c => ({
      ...c,
      tags: c.tag_ids ? c.tag_ids.split(',').map((id, idx) => ({
        id,
        name: c.tag_names.split(',')[idx],
        color: c.tag_colors.split(',')[idx]
      })) : []
    }));

    res.json(transformedContacts);
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: 'Failed to list contacts' });
  }
});

/**
 * GET /:id - Get full contact detail
 */
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const spicyMode = req.get('X-Spicy-Mode') === 'true';

    // Check access
    const hasAccess = await checkContactAccess(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contact = await getContactDetail(id, spicyMode);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(contact);
  } catch (error) {
    console.error('Get contact detail error:', error);
    res.status(500).json({ error: 'Failed to fetch contact' });
  }
});

/**
 * POST / - Create contact
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      first_name, last_name, nickname, email, phone, bio, location, occupation, company,
      birthday, notes_text, tags, groups, ...otherFields
    } = req.body;

    // Auto-build display_name if not provided
    let displayName = req.body.display_name;
    if (!displayName) {
      displayName = [first_name, last_name].filter(Boolean).join(' ').trim() || nickname || 'Unnamed Contact';
    }

    // Calculate zodiac if birthday provided
    let zodiacSign = null;
    if (birthday) {
      zodiacSign = getZodiacSign(birthday);
    }

    // Insert contact
    const [result] = await pool.query(
      `INSERT INTO contacts (
        owner_user_id, first_name, last_name, nickname, display_name,
        email, phone, bio, location, occupation, company, birthday,
        zodiac_sign, notes_text, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        req.user.id, first_name, last_name, nickname, displayName,
        email, phone, bio, location, occupation, company, birthday,
        zodiacSign, notes_text
      ]
    );

    const contactId = result.insertId;

    // Handle tags
    if (Array.isArray(tags) && tags.length > 0) {
      for (const tagId of tags) {
        await pool.query(
          `INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
          [contactId, tagId]
        );
      }
    }

    // Handle groups
    if (Array.isArray(groups) && groups.length > 0) {
      for (const groupId of groups) {
        await pool.query(
          `INSERT INTO group_members (group_id, contact_id) VALUES (?, ?)`,
          [groupId, contactId]
        );
      }
    }

    // Update search index
    await updateSearchIndex(contactId);

    // Log audit
    logAudit(req.user.id, contactId, 'CREATE', 'contact', contactId, {}, { first_name, last_name, email }, 'Contact created');

    // Return created contact
    const contact = await getContactWithTags(contactId);
    res.status(201).json(contact);
  } catch (error) {
    console.error('Create contact error:', error);
    res.status(500).json({ error: 'Failed to create contact' });
  }
});

/**
 * PUT /:id - Update contact
 */
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      first_name, last_name, nickname, email, phone, bio, location, occupation, company,
      birthday, notes_text, tags, groups, ...otherFields
    } = req.body;

    // Check access
    const hasAccess = await checkContactAccess(id, req.user.id, 'edit');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get old values
    const oldContact = await getContactWithTags(id);
    if (!oldContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Prepare update fields
    const updateFields = {};
    const params = [];

    if (first_name !== undefined) {
      updateFields.first_name = first_name;
      params.push(first_name);
    }
    if (last_name !== undefined) {
      updateFields.last_name = last_name;
      params.push(last_name);
    }
    if (nickname !== undefined) {
      updateFields.nickname = nickname;
      params.push(nickname);
    }
    if (email !== undefined) {
      updateFields.email = email;
      params.push(email);
    }
    if (phone !== undefined) {
      updateFields.phone = phone;
      params.push(phone);
    }
    if (bio !== undefined) {
      updateFields.bio = bio;
      params.push(bio);
    }
    if (location !== undefined) {
      updateFields.location = location;
      params.push(location);
    }
    if (occupation !== undefined) {
      updateFields.occupation = occupation;
      params.push(occupation);
    }
    if (company !== undefined) {
      updateFields.company = company;
      params.push(company);
    }
    if (notes_text !== undefined) {
      updateFields.notes_text = notes_text;
      params.push(notes_text);
    }

    // Recalculate display_name if name fields changed
    if (first_name !== undefined || last_name !== undefined) {
      const fn = first_name !== undefined ? first_name : oldContact.first_name;
      const ln = last_name !== undefined ? last_name : oldContact.last_name;
      const nn = nickname !== undefined ? nickname : oldContact.nickname;
      const newDisplayName = [fn, ln].filter(Boolean).join(' ').trim() || nn || 'Unnamed Contact';
      updateFields.display_name = newDisplayName;
      params.push(newDisplayName);
    }

    // Recalculate zodiac if birthday changed
    if (birthday !== undefined) {
      updateFields.birthday = birthday;
      updateFields.zodiac_sign = getZodiacSign(birthday);
      params.push(birthday);
      params.push(updateFields.zodiac_sign);
    }

    // Build update query
    const setClauses = Object.keys(updateFields).map((key, idx) => {
      if (key === 'zodiac_sign') return `${key} = ?`;
      return `${key} = ?`;
    });

    if (setClauses.length > 0) {
      params.push(id);
      await pool.query(
        `UPDATE contacts SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = ?`,
        params
      );
    }

    // Log field changes
    for (const [key, newValue] of Object.entries(updateFields)) {
      const oldValue = oldContact[key];
      if (oldValue !== newValue) {
        await logFieldChange(id, req.user.id, 'direct_edit', key, oldValue, newValue);
      }
    }

    // Handle tags (sync)
    if (Array.isArray(tags)) {
      await pool.query(`DELETE FROM contact_tags WHERE contact_id = ?`, [id]);
      for (const tagId of tags) {
        await pool.query(
          `INSERT INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
          [id, tagId]
        );
      }
    }

    // Handle groups (sync)
    if (Array.isArray(groups)) {
      await pool.query(`DELETE FROM group_members WHERE contact_id = ?`, [id]);
      for (const groupId of groups) {
        await pool.query(
          `INSERT INTO group_members (group_id, contact_id) VALUES (?, ?)`,
          [groupId, id]
        );
      }
    }

    // Update search index
    await updateSearchIndex(id);

    // Log audit
    logAudit(req.user.id, id, 'UPDATE', 'contact', id, oldContact, updateFields, 'Contact updated');

    // Return updated contact
    const contact = await getContactWithTags(id);
    res.json(contact);
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Failed to update contact' });
  }
});

/**
 * DELETE /:id - Soft delete contact
 */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check access (owner or admin only)
    const hasAccess = await checkContactAccess(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Get contact before delete
    const contact = await getContactWithTags(id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Soft delete
    await pool.query(
      `UPDATE contacts SET deleted_at = NOW() WHERE id = ?`,
      [id]
    );

    // Log audit
    logAudit(req.user.id, id, 'DELETE', 'contact', id, contact, {}, 'Contact deleted');

    res.json({ message: 'Contact deleted' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Failed to delete contact' });
  }
});

/**
 * POST /:id/merge/:otherId - Merge two contacts
 */
router.post('/:id/merge/:otherId', requireAuth, async (req, res) => {
  try {
    const { id, otherId } = req.params;
    const { field_decisions } = req.body;

    // Check access to both contacts
    const hasAccessA = await checkContactAccess(id, req.user.id);
    const hasAccessB = await checkContactAccess(otherId, req.user.id);
    if (!hasAccessA || !hasAccessB) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contactA = await getContactWithTags(id);
    const contactB = await getContactWithTags(otherId);
    if (!contactA || !contactB) {
      return res.status(404).json({ error: 'One or both contacts not found' });
    }

    // Apply field decisions
    const updateFields = {};
    if (field_decisions) {
      for (const [field, decision] of Object.entries(field_decisions)) {
        if (decision === 'A') {
          updateFields[field] = contactA[field];
        } else if (decision === 'B') {
          updateFields[field] = contactB[field];
        } else {
          updateFields[field] = decision;
        }
      }
    }

    // Update contact A with decided fields
    if (Object.keys(updateFields).length > 0) {
      const setClauses = Object.keys(updateFields).map(() => '? = ?').join(', ');
      const params = [];
      for (const [key, value] of Object.entries(updateFields)) {
        params.push(key);
        params.push(value);
      }
      params.push(id);

      await pool.query(
        `UPDATE contacts SET ${Object.keys(updateFields).map(k => `${k} = ?`).join(', ')}, updated_at = NOW() WHERE id = ?`,
        [...Object.values(updateFields), id]
      );
    }

    // Merge tags
    const [tagsB] = await pool.query(
      `SELECT tag_id FROM contact_tags WHERE contact_id = ?`,
      [otherId]
    );
    for (const tag of tagsB) {
      await pool.query(
        `INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)`,
        [id, tag.tag_id]
      );
    }

    // Merge groups
    const [groupsB] = await pool.query(
      `SELECT group_id FROM group_members WHERE contact_id = ?`,
      [otherId]
    );
    for (const group of groupsB) {
      await pool.query(
        `INSERT IGNORE INTO group_members (group_id, contact_id) VALUES (?, ?)`,
        [group.group_id, id]
      );
    }

    // Merge social links
    const [linksB] = await pool.query(
      `SELECT * FROM social_links WHERE contact_id = ?`,
      [otherId]
    );
    for (const link of linksB) {
      await pool.query(
        `UPDATE social_links SET contact_id = ? WHERE id = ?`,
        [id, link.id]
      );
    }

    // Re-point notes, events, media, messages, timeline_events
    await pool.query(`UPDATE notes SET contact_id = ? WHERE contact_id = ?`, [id, otherId]);
    await pool.query(`UPDATE events SET contact_id = ? WHERE contact_id = ?`, [id, otherId]);
    await pool.query(`UPDATE media_assets SET contact_id = ? WHERE contact_id = ?`, [id, otherId]);
    await pool.query(`UPDATE messages SET contact_id = ? WHERE contact_id = ?`, [id, otherId]);
    await pool.query(`UPDATE timeline_events SET contact_id = ? WHERE contact_id = ?`, [id, otherId]);

    // Soft delete losing contact
    await pool.query(
      `UPDATE contacts SET deleted_at = NOW() WHERE id = ?`,
      [otherId]
    );

    // Log field changes with source='merge'
    for (const [field, decision] of Object.entries(field_decisions || {})) {
      await logFieldChange(id, req.user.id, 'merge', field, contactB[field], updateFields[field] || contactA[field]);
    }

    // Log audit
    logAudit(req.user.id, id, 'MERGE', 'contact', otherId, { contactA, contactB }, { contactA: updateFields }, 'Contacts merged');

    const mergedContact = await getContactDetail(id);
    res.json(mergedContact);
  } catch (error) {
    console.error('Merge contacts error:', error);
    res.status(500).json({ error: 'Failed to merge contacts' });
  }
});

/**
 * POST /:id/share - Share contact with user
 */
router.post('/:id/share', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, permissions, share_scope } = req.body;

    // Check access (owner or admin)
    const hasAccess = await checkContactAccess(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contact = await getContactWithTags(id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Validate permissions
    if (!['read', 'edit'].includes(permissions)) {
      return res.status(400).json({ error: 'Invalid permissions' });
    }

    // Validate share_scope
    if (!['basic', 'full', 'full_spicy'].includes(share_scope)) {
      return res.status(400).json({ error: 'Invalid share_scope' });
    }

    // Insert share
    await pool.query(
      `INSERT INTO shared_contacts (contact_id, user_id, permissions, share_scope, shared_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE permissions = ?, share_scope = ?, shared_at = NOW()`,
      [id, user_id, permissions, share_scope, permissions, share_scope]
    );

    // Log audit
    logAudit(req.user.id, id, 'SHARE', 'contact', id, {}, { user_id, permissions, share_scope }, 'Contact shared');

    res.json({ message: 'Contact shared successfully' });
  } catch (error) {
    console.error('Share contact error:', error);
    res.status(500).json({ error: 'Failed to share contact' });
  }
});

/**
 * DELETE /:id/share/:userId - Unshare contact
 */
router.delete('/:id/share/:userId', requireAuth, async (req, res) => {
  try {
    const { id, userId } = req.params;

    // Check access (owner or admin)
    const hasAccess = await checkContactAccess(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contact = await getContactWithTags(id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Delete share
    await pool.query(
      `DELETE FROM shared_contacts WHERE contact_id = ? AND user_id = ?`,
      [id, userId]
    );

    // Log audit
    logAudit(req.user.id, id, 'UNSHARE', 'contact', id, { user_id: userId }, {}, 'Contact unshared');

    res.json({ message: 'Contact unshared' });
  } catch (error) {
    console.error('Unshare contact error:', error);
    res.status(500).json({ error: 'Failed to unshare contact' });
  }
});

/**
 * PUT /:id/photo - Set profile photo
 */
router.put('/:id/photo', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { media_id } = req.body;

    // Check access
    const hasAccess = await checkContactAccess(id, req.user.id, 'edit');
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contact = await getContactWithTags(id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Get file_path from media_assets
    const [media] = await pool.query(
      `SELECT file_path FROM media_assets WHERE id = ?`,
      [media_id]
    );

    if (media.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const photoUrl = media[0].file_path;
    const oldPhotoUrl = contact.photo_url;

    // Update contact photo
    await pool.query(
      `UPDATE contacts SET photo_url = ?, updated_at = NOW() WHERE id = ?`,
      [photoUrl, id]
    );

    // Log field change
    await logFieldChange(id, req.user.id, 'photo_upload', 'photo_url', oldPhotoUrl, photoUrl);

    // Log audit
    logAudit(req.user.id, id, 'UPDATE', 'contact', id, { photo_url: oldPhotoUrl }, { photo_url: photoUrl }, 'Photo updated');

    res.json({ photo_url: photoUrl });
  } catch (error) {
    console.error('Set photo error:', error);
    res.status(500).json({ error: 'Failed to set photo' });
  }
});

/**
 * PUT /:id/favorite - Toggle favorite
 */
router.put('/:id/favorite', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check access
    const hasAccess = await checkContactAccess(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const contact = await getContactWithTags(id);
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Toggle favorite
    const newValue = contact.is_favorite ? 0 : 1;
    await pool.query(
      `UPDATE contacts SET is_favorite = ?, updated_at = NOW() WHERE id = ?`,
      [newValue, id]
    );

    // Log field change
    await logFieldChange(id, req.user.id, 'favorite_toggle', 'is_favorite', contact.is_favorite, newValue);

    res.json({ is_favorite: newValue === 1 });
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({ error: 'Failed to toggle favorite' });
  }
});

/**
 * GET /:id/changelog - Field change history
 */
router.get('/:id/changelog', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;

    // Check access
    const hasAccess = await checkContactAccess(id, req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [changelog] = await pool.query(
      `SELECT * FROM contact_field_changelog
       WHERE contact_id = ?
       ORDER BY changed_at DESC`,
      [id]
    );

    res.json(changelog);
  } catch (error) {
    console.error('Get changelog error:', error);
    res.status(500).json({ error: 'Failed to fetch changelog' });
  }
});

module.exports = router;
