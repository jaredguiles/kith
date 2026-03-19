import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

const mediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const contactId = req.params.id;
    const uploadDir = `/media/contacts/${contactId}`;
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${uuidv4()}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage: mediaStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

async function canAccessContact(userId, contactId, requireOwner = false) {
  const contacts = await query('SELECT owner_user_id FROM contacts WHERE id = ? AND deleted_at IS NULL', [contactId]);

  if (contacts.length === 0) {
    return false;
  }

  const contact = contacts[0];

  if (contact.owner_user_id === userId) {
    return true;
  }

  if (!requireOwner) {
    const shared = await query(
      'SELECT id FROM shared_contacts WHERE contact_id = ? AND shared_with_user_id = ?',
      [contactId, userId]
    );
    if (shared.length > 0) {
      return true;
    }
  }

  return false;
}

async function buildContactResponse(contact) {
  const emails = await query('SELECT id, label, email, is_primary FROM contact_emails WHERE contact_id = ?', [
    contact.id,
  ]);
  const phones = await query('SELECT id, label, phone, is_primary FROM contact_phones WHERE contact_id = ?', [
    contact.id,
  ]);
  const addresses = await query('SELECT id, label, street, city, state, zip, country, is_primary FROM contact_addresses WHERE contact_id = ?', [
    contact.id,
  ]);
  const socialLinks = await query('SELECT id, platform, url, username FROM social_links WHERE contact_id = ?', [
    contact.id,
  ]);
  const tags = await query(
    'SELECT t.id, t.name, t.color FROM tags t INNER JOIN contact_tags ct ON t.id = ct.tag_id WHERE ct.contact_id = ?',
    [contact.id]
  );
  const groups = await query(
    'SELECT g.id, g.name, g.color, g.icon FROM groups g INNER JOIN group_members gm ON g.id = gm.group_id WHERE gm.contact_id = ?',
    [contact.id]
  );
  const timeline = await query(
    'SELECT id, entry_type, title, content, entry_date, is_spicy, created_at FROM timeline_entries WHERE contact_id = ? ORDER BY entry_date DESC LIMIT 10',
    [contact.id]
  );
  const mediaCount = await query('SELECT COUNT(*) as count FROM media WHERE contact_id = ?', [contact.id]);

  return {
    ...contact,
    emails,
    phones,
    addresses,
    social_links: socialLinks,
    tags,
    groups,
    timeline,
    media_count: mediaCount[0].count,
  };
}

router.get('/', authenticate, async (req, res) => {
  try {
    const { search, relationship_type, group, tag, is_favorite, is_spicy, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = 'WHERE c.deleted_at IS NULL';
    const params = [];

    if (req.user.role !== 'admin' && req.user.role !== 'main_admin') {
      whereClause += ' AND (c.owner_user_id = ? OR EXISTS (SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ?))';
      params.push(req.user.id, req.user.id);
    }

    if (search) {
      whereClause += ' AND (c.display_name LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (relationship_type) {
      whereClause += ' AND c.relationship_type = ?';
      params.push(relationship_type);
    }

    if (is_favorite === 'true') {
      whereClause += ' AND c.is_favorite = 1';
    }

    if (is_spicy === 'true') {
      whereClause += ' AND c.is_spicy = 1';
    }

    let baseQuery = `SELECT c.*,
      (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_email,
      (SELECT phone FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) as primary_phone
      FROM contacts c ${whereClause}`;

    if (group) {
      baseQuery += ` AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.contact_id = c.id AND gm.group_id = ?)`;
      params.push(parseInt(group));
    }

    if (tag) {
      baseQuery += ` AND EXISTS (SELECT 1 FROM contact_tags ct WHERE ct.contact_id = c.id AND ct.tag_id = ?)`;
      params.push(parseInt(tag));
    }

    const countResult = await query(`SELECT COUNT(*) as count FROM (${baseQuery}) as counted`, params);
    const total = countResult[0].count;

    baseQuery += ` ORDER BY c.display_name ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);

    const contacts = await query(baseQuery, params);

    res.json({
      contacts,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error('List contacts error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { display_name, first_name, last_name, email, phone, birthday, relationship_type, is_favorite, is_spicy } =
      req.body;

    const finalDisplayName = display_name || `${first_name || ''} ${last_name || ''}`.trim();

    if (!finalDisplayName) {
      return res.status(400).json({ error: 'Display name or first/last name required' });
    }

    const result = await query(
      'INSERT INTO contacts (owner_user_id, display_name, first_name, last_name, email, phone, birthday, relationship_type, is_favorite, is_spicy) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, finalDisplayName, first_name, last_name, email, phone, birthday, relationship_type, is_favorite || 0, is_spicy || 0]
    );

    const newContacts = await query('SELECT * FROM contacts WHERE id = ?', [result.insertId]);
    const contact = await buildContactResponse(newContacts[0]);

    res.status(201).json({ contact });
  } catch (err) {
    console.error('Create contact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const contacts = await query('SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL', [contactId]);

    if (contacts.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const contact = await buildContactResponse(contacts[0]);

    if (contact.is_spicy) {
      const spicyProfiles = await query('SELECT * FROM spicy_profiles WHERE contact_id = ?', [contactId]);
      contact.spicy_profile = spicyProfiles.length > 0 ? spicyProfiles[0] : null;
    }

    res.json({ contact });
  } catch (err) {
    console.error('Get contact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const {
      display_name,
      first_name,
      last_name,
      nickname,
      email,
      phone,
      birthday,
      age,
      sex,
      pronouns,
      orientation,
      relationship_status,
      location,
      bio,
      occupation,
      company,
      website,
      zodiac_sign,
      languages,
      ethnicity,
      how_we_met,
      met_date,
      rating,
      relationship_type,
      is_favorite,
      is_spicy,
      is_anonymous,
      notes_text,
    } = req.body;

    const updates = [];
    const values = [];

    if (display_name !== undefined) {
      updates.push('display_name = ?');
      values.push(display_name);
    }
    if (first_name !== undefined) {
      updates.push('first_name = ?');
      values.push(first_name);
    }
    if (last_name !== undefined) {
      updates.push('last_name = ?');
      values.push(last_name);
    }
    if (nickname !== undefined) {
      updates.push('nickname = ?');
      values.push(nickname);
    }
    if (email !== undefined) {
      updates.push('email = ?');
      values.push(email);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      values.push(phone);
    }
    if (birthday !== undefined) {
      updates.push('birthday = ?');
      values.push(birthday);
    }
    if (age !== undefined) {
      updates.push('age = ?');
      values.push(age);
    }
    if (sex !== undefined) {
      updates.push('sex = ?');
      values.push(sex);
    }
    if (pronouns !== undefined) {
      updates.push('pronouns = ?');
      values.push(pronouns);
    }
    if (orientation !== undefined) {
      updates.push('orientation = ?');
      values.push(orientation);
    }
    if (relationship_status !== undefined) {
      updates.push('relationship_status = ?');
      values.push(relationship_status);
    }
    if (location !== undefined) {
      updates.push('location = ?');
      values.push(location);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio);
    }
    if (occupation !== undefined) {
      updates.push('occupation = ?');
      values.push(occupation);
    }
    if (company !== undefined) {
      updates.push('company = ?');
      values.push(company);
    }
    if (website !== undefined) {
      updates.push('website = ?');
      values.push(website);
    }
    if (zodiac_sign !== undefined) {
      updates.push('zodiac_sign = ?');
      values.push(zodiac_sign);
    }
    if (languages !== undefined) {
      updates.push('languages = ?');
      values.push(languages);
    }
    if (ethnicity !== undefined) {
      updates.push('ethnicity = ?');
      values.push(ethnicity);
    }
    if (how_we_met !== undefined) {
      updates.push('how_we_met = ?');
      values.push(how_we_met);
    }
    if (met_date !== undefined) {
      updates.push('met_date = ?');
      values.push(met_date);
    }
    if (rating !== undefined) {
      updates.push('rating = ?');
      values.push(rating);
    }
    if (relationship_type !== undefined) {
      updates.push('relationship_type = ?');
      values.push(relationship_type);
    }
    if (is_favorite !== undefined) {
      updates.push('is_favorite = ?');
      values.push(is_favorite ? 1 : 0);
    }
    if (is_spicy !== undefined) {
      updates.push('is_spicy = ?');
      values.push(is_spicy ? 1 : 0);
    }
    if (is_anonymous !== undefined) {
      updates.push('is_anonymous = ?');
      values.push(is_anonymous ? 1 : 0);
    }
    if (notes_text !== undefined) {
      updates.push('notes_text = ?');
      values.push(notes_text);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(contactId);

    await query(`UPDATE contacts SET ${updates.join(', ')} WHERE id = ?`, values);

    const updatedContacts = await query('SELECT * FROM contacts WHERE id = ?', [contactId]);
    const contact = await buildContactResponse(updatedContacts[0]);

    res.json({ contact });
  } catch (err) {
    console.error('Update contact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('UPDATE contacts SET deleted_at = NOW() WHERE id = ?', [contactId]);

    res.json({ message: 'Contact deleted' });
  } catch (err) {
    console.error('Delete contact error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/emails', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const emails = await query('SELECT id, label, email, is_primary FROM contact_emails WHERE contact_id = ?', [
      contactId,
    ]);

    res.json({ emails });
  } catch (err) {
    console.error('Get emails error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/emails', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { label, email, is_primary } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email required' });
    }

    const result = await query('INSERT INTO contact_emails (contact_id, label, email, is_primary) VALUES (?, ?, ?, ?)', [
      contactId,
      label,
      email,
      is_primary ? 1 : 0,
    ]);

    res.status(201).json({ id: result.insertId, label, email, is_primary: is_primary ? 1 : 0 });
  } catch (err) {
    console.error('Create email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/emails/:emailId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM contact_emails WHERE id = ? AND contact_id = ?', [parseInt(req.params.emailId), contactId]);

    res.json({ message: 'Email deleted' });
  } catch (err) {
    console.error('Delete email error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/phones', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const phones = await query('SELECT id, label, phone, is_primary FROM contact_phones WHERE contact_id = ?', [
      contactId,
    ]);

    res.json({ phones });
  } catch (err) {
    console.error('Get phones error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/phones', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { label, phone, is_primary } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'Phone required' });
    }

    const result = await query('INSERT INTO contact_phones (contact_id, label, phone, is_primary) VALUES (?, ?, ?, ?)', [
      contactId,
      label,
      phone,
      is_primary ? 1 : 0,
    ]);

    res.status(201).json({ id: result.insertId, label, phone, is_primary: is_primary ? 1 : 0 });
  } catch (err) {
    console.error('Create phone error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/phones/:phoneId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM contact_phones WHERE id = ? AND contact_id = ?', [parseInt(req.params.phoneId), contactId]);

    res.json({ message: 'Phone deleted' });
  } catch (err) {
    console.error('Delete phone error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/addresses', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const addresses = await query(
      'SELECT id, label, street, city, state, zip, country, is_primary FROM contact_addresses WHERE contact_id = ?',
      [contactId]
    );

    res.json({ addresses });
  } catch (err) {
    console.error('Get addresses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/addresses', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { label, street, city, state, zip, country, is_primary } = req.body;

    const result = await query(
      'INSERT INTO contact_addresses (contact_id, label, street, city, state, zip, country, is_primary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [contactId, label, street, city, state, zip, country, is_primary ? 1 : 0]
    );

    res.status(201).json({ id: result.insertId, label, street, city, state, zip, country, is_primary: is_primary ? 1 : 0 });
  } catch (err) {
    console.error('Create address error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/addresses/:addressId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM contact_addresses WHERE id = ? AND contact_id = ?', [parseInt(req.params.addressId), contactId]);

    res.json({ message: 'Address deleted' });
  } catch (err) {
    console.error('Delete address error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/social-links', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const socialLinks = await query('SELECT id, platform, url, username FROM social_links WHERE contact_id = ?', [
      contactId,
    ]);

    res.json({ social_links: socialLinks });
  } catch (err) {
    console.error('Get social links error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/social-links', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { platform, url, username } = req.body;

    if (!platform) {
      return res.status(400).json({ error: 'Platform required' });
    }

    const result = await query('INSERT INTO social_links (contact_id, platform, url, username) VALUES (?, ?, ?, ?)', [
      contactId,
      platform,
      url,
      username,
    ]);

    res.status(201).json({ id: result.insertId, platform, url, username });
  } catch (err) {
    console.error('Create social link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/social-links/:linkId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM social_links WHERE id = ? AND contact_id = ?', [parseInt(req.params.linkId), contactId]);

    res.json({ message: 'Social link deleted' });
  } catch (err) {
    console.error('Delete social link error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/tags', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const tags = await query(
      'SELECT t.id, t.name, t.color FROM tags t INNER JOIN contact_tags ct ON t.id = ct.tag_id WHERE ct.contact_id = ?',
      [contactId]
    );

    res.json({ tags });
  } catch (err) {
    console.error('Get tags error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/tags', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { tag_id } = req.body;

    if (!tag_id) {
      return res.status(400).json({ error: 'Tag ID required' });
    }

    await query('INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', [contactId, tag_id]);

    res.status(201).json({ message: 'Tag added' });
  } catch (err) {
    console.error('Add tag error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/tags/:tagId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?', [contactId, parseInt(req.params.tagId)]);

    res.json({ message: 'Tag removed' });
  } catch (err) {
    console.error('Remove tag error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/groups', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const groups = await query(
      'SELECT g.id, g.name, g.color, g.icon FROM groups g INNER JOIN group_members gm ON g.id = gm.group_id WHERE gm.contact_id = ?',
      [contactId]
    );

    res.json({ groups });
  } catch (err) {
    console.error('Get groups error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/groups', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { group_id } = req.body;

    if (!group_id) {
      return res.status(400).json({ error: 'Group ID required' });
    }

    await query('INSERT IGNORE INTO group_members (group_id, contact_id) VALUES (?, ?)', [group_id, contactId]);

    res.status(201).json({ message: 'Contact added to group' });
  } catch (err) {
    console.error('Add to group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/groups/:groupId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM group_members WHERE group_id = ? AND contact_id = ?', [parseInt(req.params.groupId), contactId]);

    res.json({ message: 'Contact removed from group' });
  } catch (err) {
    console.error('Remove from group error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/timeline', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);
    const { page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const countResult = await query('SELECT COUNT(*) as count FROM timeline_entries WHERE contact_id = ?', [contactId]);
    const total = countResult[0].count;

    const entries = await query(
      'SELECT id, entry_type, title, content, entry_date, is_spicy, created_at FROM timeline_entries WHERE contact_id = ? ORDER BY entry_date DESC LIMIT ? OFFSET ?',
      [contactId, parseInt(limit), offset]
    );

    res.json({
      entries,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (err) {
    console.error('Get timeline error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/timeline', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { entry_type, title, content, entry_date, is_spicy } = req.body;

    if (!entry_type) {
      return res.status(400).json({ error: 'Entry type required' });
    }

    const result = await query(
      'INSERT INTO timeline_entries (contact_id, user_id, entry_type, title, content, entry_date, is_spicy) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [contactId, req.user.id, entry_type, title, content, entry_date || new Date(), is_spicy || 0]
    );

    res.status(201).json({ id: result.insertId, entry_type, title, content, entry_date, is_spicy });
  } catch (err) {
    console.error('Create timeline entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/timeline/:entryId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await query('DELETE FROM timeline_entries WHERE id = ? AND contact_id = ?', [parseInt(req.params.entryId), contactId]);

    res.json({ message: 'Timeline entry deleted' });
  } catch (err) {
    console.error('Delete timeline entry error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/spicy', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const contacts = await query('SELECT is_spicy FROM contacts WHERE id = ?', [contactId]);

    if (contacts.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contacts[0].is_spicy) {
      return res.status(403).json({ error: 'Spicy profile not enabled for this contact' });
    }

    const spicyProfiles = await query('SELECT * FROM spicy_profiles WHERE contact_id = ?', [contactId]);

    if (spicyProfiles.length === 0) {
      return res.json({ spicy_profile: null });
    }

    res.json({ spicy_profile: spicyProfiles[0] });
  } catch (err) {
    console.error('Get spicy profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id/spicy', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const contacts = await query('SELECT is_spicy FROM contacts WHERE id = ?', [contactId]);

    if (contacts.length === 0) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (!contacts[0].is_spicy) {
      return res.status(403).json({ error: 'Spicy profile not enabled for this contact' });
    }

    const {
      spicy_type,
      orientation,
      role_preference,
      positions,
      kinks,
      turn_ons,
      turn_offs,
      boundaries,
      safe_word,
      protection_preference,
      hiv_status,
      on_prep,
      prep_since,
      last_tested_date,
      sti_notes,
      body_type,
      body_notes,
      endowment,
      grooming,
      spicy_rating,
      chemistry_rating,
      would_repeat,
      spicy_notes,
      last_encounter,
      encounter_count,
    } = req.body;

    const spicyProfiles = await query('SELECT id FROM spicy_profiles WHERE contact_id = ?', [contactId]);

    if (spicyProfiles.length === 0) {
      await query(
        'INSERT INTO spicy_profiles (contact_id, spicy_type, orientation, role_preference, positions, kinks, turn_ons, turn_offs, boundaries, safe_word, protection_preference, hiv_status, on_prep, prep_since, last_tested_date, sti_notes, body_type, body_notes, endowment, grooming, spicy_rating, chemistry_rating, would_repeat, spicy_notes, last_encounter, encounter_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          contactId,
          spicy_type,
          orientation,
          role_preference,
          positions,
          kinks,
          turn_ons,
          turn_offs,
          boundaries,
          safe_word,
          protection_preference,
          hiv_status,
          on_prep,
          prep_since,
          last_tested_date,
          sti_notes,
          body_type,
          body_notes,
          endowment,
          grooming,
          spicy_rating,
          chemistry_rating,
          would_repeat,
          spicy_notes,
          last_encounter,
          encounter_count,
        ]
      );
    } else {
      const updates = [];
      const values = [];

      if (spicy_type !== undefined) {
        updates.push('spicy_type = ?');
        values.push(spicy_type);
      }
      if (orientation !== undefined) {
        updates.push('orientation = ?');
        values.push(orientation);
      }
      if (role_preference !== undefined) {
        updates.push('role_preference = ?');
        values.push(role_preference);
      }
      if (positions !== undefined) {
        updates.push('positions = ?');
        values.push(positions);
      }
      if (kinks !== undefined) {
        updates.push('kinks = ?');
        values.push(kinks);
      }
      if (turn_ons !== undefined) {
        updates.push('turn_ons = ?');
        values.push(turn_ons);
      }
      if (turn_offs !== undefined) {
        updates.push('turn_offs = ?');
        values.push(turn_offs);
      }
      if (boundaries !== undefined) {
        updates.push('boundaries = ?');
        values.push(boundaries);
      }
      if (safe_word !== undefined) {
        updates.push('safe_word = ?');
        values.push(safe_word);
      }
      if (protection_preference !== undefined) {
        updates.push('protection_preference = ?');
        values.push(protection_preference);
      }
      if (hiv_status !== undefined) {
        updates.push('hiv_status = ?');
        values.push(hiv_status);
      }
      if (on_prep !== undefined) {
        updates.push('on_prep = ?');
        values.push(on_prep);
      }
      if (prep_since !== undefined) {
        updates.push('prep_since = ?');
        values.push(prep_since);
      }
      if (last_tested_date !== undefined) {
        updates.push('last_tested_date = ?');
        values.push(last_tested_date);
      }
      if (sti_notes !== undefined) {
        updates.push('sti_notes = ?');
        values.push(sti_notes);
      }
      if (body_type !== undefined) {
        updates.push('body_type = ?');
        values.push(body_type);
      }
      if (body_notes !== undefined) {
        updates.push('body_notes = ?');
        values.push(body_notes);
      }
      if (endowment !== undefined) {
        updates.push('endowment = ?');
        values.push(endowment);
      }
      if (grooming !== undefined) {
        updates.push('grooming = ?');
        values.push(grooming);
      }
      if (spicy_rating !== undefined) {
        updates.push('spicy_rating = ?');
        values.push(spicy_rating);
      }
      if (chemistry_rating !== undefined) {
        updates.push('chemistry_rating = ?');
        values.push(chemistry_rating);
      }
      if (would_repeat !== undefined) {
        updates.push('would_repeat = ?');
        values.push(would_repeat);
      }
      if (spicy_notes !== undefined) {
        updates.push('spicy_notes = ?');
        values.push(spicy_notes);
      }
      if (last_encounter !== undefined) {
        updates.push('last_encounter = ?');
        values.push(last_encounter);
      }
      if (encounter_count !== undefined) {
        updates.push('encounter_count = ?');
        values.push(encounter_count);
      }

      if (updates.length > 0) {
        values.push(contactId);
        await query(`UPDATE spicy_profiles SET ${updates.join(', ')} WHERE contact_id = ?`, values);
      }
    }

    const updatedSpicy = await query('SELECT * FROM spicy_profiles WHERE contact_id = ?', [contactId]);

    res.json({ spicy_profile: updatedSpicy[0] });
  } catch (err) {
    console.error('Update spicy profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/media', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const media = await query(
      'SELECT id, filename, original_filename, file_path, file_type, file_size, platform, is_spicy, caption, created_at FROM media WHERE contact_id = ? ORDER BY created_at DESC',
      [contactId]
    );

    res.json({ media });
  } catch (err) {
    console.error('Get media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/media', authenticate, upload.single('file'), async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File required' });
    }

    const { caption, platform, is_spicy } = req.body;
    const fileType = req.file.mimetype;

    const result = await query(
      'INSERT INTO media (contact_id, user_id, filename, original_filename, file_path, file_type, file_size, platform, is_spicy, caption) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        contactId,
        req.user.id,
        req.file.filename,
        req.file.originalname,
        `/media/contacts/${contactId}/${req.file.filename}`,
        fileType,
        req.file.size,
        platform,
        is_spicy ? 1 : 0,
        caption,
      ]
    );

    res.status(201).json({
      id: result.insertId,
      filename: req.file.filename,
      original_filename: req.file.originalname,
      file_path: `/media/contacts/${contactId}/${req.file.filename}`,
      file_type: fileType,
      file_size: req.file.size,
      platform,
      is_spicy: is_spicy ? 1 : 0,
      caption,
    });
  } catch (err) {
    console.error('Upload media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/media/:mediaId', authenticate, async (req, res) => {
  try {
    const contactId = parseInt(req.params.id);

    const canAccess = await canAccessContact(req.user.id, contactId, true);
    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const mediaRecords = await query('SELECT file_path FROM media WHERE id = ? AND contact_id = ?', [
      parseInt(req.params.mediaId),
      contactId,
    ]);

    if (mediaRecords.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const filePath = mediaRecords[0].file_path;

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await query('DELETE FROM media WHERE id = ? AND contact_id = ?', [parseInt(req.params.mediaId), contactId]);

    res.json({ message: 'Media deleted' });
  } catch (err) {
    console.error('Delete media error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
