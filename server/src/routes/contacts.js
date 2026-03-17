import express from 'express';
import pool from '../database/connection.js';
import { updateSearchIndex } from '../services/searchIndex.js';

const router = express.Router();

// GET /api/contacts - List all contacts with pagination, sorting, filtering
router.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const sort = req.query.sort || 'display_name';
    const tag = req.query.tag;
    const group = req.query.group;
    const platform = req.query.platform;

    const offset = (page - 1) * limit;
    const connection = await pool.getConnection();

    let query = `
      SELECT c.*, MAX(t.occurred_at) as last_activity_date
      FROM contacts c
      LEFT JOIN timeline_events t ON c.id = t.contact_id AND t.deleted_at IS NULL
      WHERE c.deleted_at IS NULL
    `;
    const params = [];

    if (tag) {
      query += ` AND c.id IN (SELECT contact_id FROM contact_tags WHERE tag_id = ?)`;
      params.push(tag);
    }

    if (group) {
      query += ` AND c.id IN (SELECT contact_id FROM group_members WHERE group_id = ?)`;
      params.push(group);
    }

    if (platform) {
      query += ` AND c.id IN (SELECT contact_id FROM platform_profiles WHERE platform = ?)`;
      params.push(platform);
    }

    const validSortFields = ['display_name', 'created_at', 'updated_at', 'last_activity_date'];
    const sortField = validSortFields.includes(sort) ? sort : 'display_name';
    const sortDir = req.query.sortDir?.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    query += `
      GROUP BY c.id
      ORDER BY ${sortField} ${sortDir}
      LIMIT ? OFFSET ?
    `;
    params.push(limit, offset);

    const [contacts] = await connection.execute(query, params);

    // Get total count
    let countQuery = `SELECT COUNT(DISTINCT c.id) as total FROM contacts c`;
    const countParams = [];
    const whereConditions = [];

    if (tag) {
      whereConditions.push('c.id IN (SELECT contact_id FROM contact_tags WHERE tag_id = ?)');
      countParams.push(tag);
    }
    if (group) {
      whereConditions.push('c.id IN (SELECT contact_id FROM group_members WHERE group_id = ?)');
      countParams.push(group);
    }
    if (platform) {
      whereConditions.push('c.id IN (SELECT contact_id FROM platform_profiles WHERE platform = ?)');
      countParams.push(platform);
    }

    whereConditions.push('c.deleted_at IS NULL');

    if (whereConditions.length > 0) {
      countQuery += ' WHERE ' + whereConditions.join(' AND ');
    }

    const [[{ total }]] = await connection.execute(countQuery, countParams);

    // Enrich contacts with tags and groups for table display
    if (contacts.length > 0) {
      const contactIds = contacts.map((c) => c.id);
      const placeholders = contactIds.map(() => '?').join(',');

      const [tagRows] = await connection.execute(
        `SELECT ct.contact_id, t.id, t.name, t.color FROM contact_tags ct
         INNER JOIN tags t ON t.id = ct.tag_id
         WHERE ct.contact_id IN (${placeholders})`,
        contactIds
      );

      const [groupRows] = await connection.execute(
        `SELECT gm.contact_id, g.id, g.name FROM group_members gm
         INNER JOIN \`groups\` g ON g.id = gm.group_id
         WHERE gm.contact_id IN (${placeholders})`,
        contactIds
      );

      const tagsByContact = {};
      for (const row of tagRows) {
        if (!tagsByContact[row.contact_id]) tagsByContact[row.contact_id] = [];
        tagsByContact[row.contact_id].push({ id: row.id, name: row.name, color: row.color });
      }

      const groupsByContact = {};
      for (const row of groupRows) {
        if (!groupsByContact[row.contact_id]) groupsByContact[row.contact_id] = [];
        groupsByContact[row.contact_id].push({ id: row.id, name: row.name });
      }

      for (const contact of contacts) {
        contact.tags = tagsByContact[contact.id] || [];
        contact.groups = groupsByContact[contact.id] || [];
      }
    }

    connection.release();

    res.json({
      success: true,
      data: contacts,
      total,
      page,
      limit,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/search - Full-text search
router.get('/search', async (req, res, next) => {
  try {
    const q = req.query.q || '';
    if (!q || q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const connection = await pool.getConnection();
    const searchTerm = `%${q}%`;

    const [results] = await connection.execute(
      `SELECT DISTINCT c.*
       FROM contacts c
       LEFT JOIN contact_search_index csi ON c.id = csi.contact_id
       LEFT JOIN notes n ON c.id = n.contact_id AND n.deleted_at IS NULL
       LEFT JOIN messages m ON c.id = m.contact_id
       LEFT JOIN platform_profiles pp ON c.id = pp.contact_id
       WHERE c.deleted_at IS NULL AND (
         csi.search_text LIKE ?
         OR c.display_name LIKE ?
         OR c.username LIKE ?
         OR c.bio LIKE ?
         OR c.location LIKE ?
         OR n.content LIKE ?
         OR m.content LIKE ?
         OR pp.username LIKE ?
       )
       ORDER BY c.display_name
       LIMIT 50`,
      [searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    connection.release();

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/contacts/:id - Get single contact with full details
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    // Get contact
    const [contacts] = await connection.execute(
      'SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    if (contacts.length === 0) {
      connection.release();
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const contact = contacts[0];

    // Get platform profiles
    const [platforms] = await connection.execute(
      'SELECT * FROM platform_profiles WHERE contact_id = ?',
      [id]
    );

    // Get tags
    const [tagData] = await connection.execute(
      `SELECT t.* FROM tags t
       INNER JOIN contact_tags ct ON t.id = ct.tag_id
       WHERE ct.contact_id = ?`,
      [id]
    );

    // Get groups
    const [groupData] = await connection.execute(
      `SELECT g.* FROM groups g
       INNER JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.contact_id = ?`,
      [id]
    );

    // Get recent timeline (5 items)
    const [timeline] = await connection.execute(
      `SELECT * FROM timeline_events
       WHERE contact_id = ? AND deleted_at IS NULL
       ORDER BY occurred_at DESC
       LIMIT 5`,
      [id]
    );

    // Get upcoming reminders count
    const [[{ reminderCount }]] = await connection.execute(
      `SELECT COUNT(*) as reminderCount FROM reminders
       WHERE contact_id = ? AND completed_at IS NULL AND deleted_at IS NULL`,
      [id]
    );

    // Get media count
    const [[{ mediaCount }]] = await connection.execute(
      `SELECT COUNT(*) as mediaCount FROM media_assets
       WHERE contact_id = ? AND deleted_at IS NULL`,
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: {
        ...contact,
        platforms,
        tags: tagData,
        groups: groupData,
        timeline,
        upcomingReminders: reminderCount,
        mediaCount,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/contacts - Create contact
router.post('/', async (req, res, next) => {
  try {
    const {
      display_name,
      username,
      bio,
      age,
      location,
      photo_url,
      is_anonymous,
    } = req.body;

    if (!display_name) {
      return res.status(400).json({ success: false, error: 'display_name is required' });
    }

    const connection = await pool.getConnection();

    const [result] = await connection.execute(
      `INSERT INTO contacts (display_name, username, bio, age, location, photo_url, is_anonymous, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [display_name, username || null, bio || null, age || null, location || null, photo_url || null, is_anonymous ? 1 : 0]
    );

    const contactId = result.insertId;

    // Create search index
    await updateSearchIndex(contactId);

    const [[contact]] = await connection.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [contactId]
    );

    connection.release();

    res.status(201).json({
      success: true,
      data: contact,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/contacts/:id - Update contact
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      display_name,
      username,
      bio,
      age,
      location,
      photo_url,
      is_anonymous,
    } = req.body;

    const connection = await pool.getConnection();

    await connection.execute(
      `UPDATE contacts SET
       display_name = COALESCE(?, display_name),
       username = COALESCE(?, username),
       bio = COALESCE(?, bio),
       age = COALESCE(?, age),
       location = COALESCE(?, location),
       photo_url = COALESCE(?, photo_url),
       is_anonymous = COALESCE(?, is_anonymous),
       updated_at = NOW()
       WHERE id = ?`,
      [display_name, username, bio, age, location, photo_url, is_anonymous !== undefined ? (is_anonymous ? 1 : 0) : null, id]
    );

    // Update search index
    await updateSearchIndex(id);

    const [[contact]] = await connection.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    next(error);
  }
});

// PATCH /api/contacts/:id/spicy - Toggle spicy status
router.patch('/:id/spicy', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { is_spicy } = req.body;

    if (is_spicy === undefined) {
      return res.status(400).json({ success: false, error: 'is_spicy is required' });
    }

    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE contacts SET is_spicy = ?, updated_at = NOW() WHERE id = ?',
      [is_spicy ? 1 : 0, id]
    );

    const [[contact]] = await connection.execute(
      'SELECT * FROM contacts WHERE id = ?',
      [id]
    );

    connection.release();

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/contacts/:id - Soft delete
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await pool.getConnection();

    await connection.execute(
      'UPDATE contacts SET deleted_at = NOW() WHERE id = ?',
      [id]
    );

    connection.release();

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
