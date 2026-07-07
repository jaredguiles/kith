'use strict';

// Contact relationships: directed rows in contact_relationships rendered in
// BOTH directions (an inverse label is computed for the reverse direction).
// Mounted at /api → /api/contacts/:id/relationships + /api/relationships/:id.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

// relation_type (as stored, describing related_contact relative to contact)
// → inverse label shown when rendering the row from the other side.
const INVERSE_MAP = {
  spouse: 'spouse',
  partner: 'partner',
  parent: 'child',
  child: 'parent',
  sibling: 'sibling',
  friend: 'friend',
  colleague: 'colleague',
  introduced_by: 'introduced',
  ex: 'ex',
  family: 'family',
  other: 'other',
};

const RELATION_TYPES = Object.keys(INVERSE_MAP);

// GET /api/contacts/:id/relationships — both directions
router.get('/contacts/:id/relationships', requireContactAccess('id'), async (req, res, next) => {
  try {
    const cid = req.contact.id;
    const [forward, reverse] = await Promise.all([
      query(
        `SELECT cr.id, cr.relation_type, cr.notes, cr.created_at,
                c.id AS other_id, c.display_name, c.photo_url
         FROM contact_relationships cr
         JOIN contacts c ON c.id = cr.related_contact_id AND c.deleted_at IS NULL
         WHERE cr.contact_id = ?`,
        [cid]
      ),
      query(
        `SELECT cr.id, cr.relation_type, cr.notes, cr.created_at,
                c.id AS other_id, c.display_name, c.photo_url
         FROM contact_relationships cr
         JOIN contacts c ON c.id = cr.contact_id AND c.deleted_at IS NULL
         WHERE cr.related_contact_id = ?`,
        [cid]
      ),
    ]);

    const relationships = [
      ...forward.map((r) => ({
        id: r.id,
        other: { id: r.other_id, display_name: r.display_name, photo_url: r.photo_url },
        relation_type: r.relation_type,
        display_label: r.relation_type,
        inverse: false,
        notes: r.notes,
        created_at: r.created_at,
      })),
      ...reverse.map((r) => ({
        id: r.id,
        other: { id: r.other_id, display_name: r.display_name, photo_url: r.photo_url },
        relation_type: r.relation_type,
        display_label: INVERSE_MAP[r.relation_type] || r.relation_type,
        inverse: true,
        notes: r.notes,
        created_at: r.created_at,
      })),
    ];

    res.json({ relationships });
  } catch (err) { next(err); }
});

// POST /api/contacts/:id/relationships — { related_contact_id, relation_type, notes? }
router.post('/contacts/:id/relationships', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    const { related_contact_id, relation_type, notes } = req.body || {};
    const relatedId = Number(related_contact_id);
    if (!Number.isInteger(relatedId) || relatedId <= 0) {
      return res.status(400).json({ error: 'related_contact_id is required' });
    }
    if (!RELATION_TYPES.includes(relation_type)) {
      return res.status(400).json({ error: `relation_type must be one of: ${RELATION_TYPES.join(', ')}` });
    }
    if (relatedId === req.contact.id) return res.status(400).json({ error: 'A contact cannot be related to themselves' });

    // Both contacts must be accessible to the user (owner/admin/shared).
    const relatedFound = await contactAccess(req.user, relatedId);
    if (!relatedFound) return res.status(404).json({ error: 'Related contact not found' });

    // Duplicate in either direction → 409 (the unique key only guards one).
    const dupes = await query(
      `SELECT id FROM contact_relationships
       WHERE (contact_id = ? AND related_contact_id = ? AND relation_type = ?)
          OR (contact_id = ? AND related_contact_id = ? AND relation_type = ?)`,
      [req.contact.id, relatedId, relation_type,
       relatedId, req.contact.id, INVERSE_MAP[relation_type] || relation_type]
    );
    if (dupes.length) return res.status(409).json({ error: 'This relationship already exists' });

    let result;
    try {
      result = await query(
        'INSERT INTO contact_relationships (contact_id, related_contact_id, relation_type, notes) VALUES (?, ?, ?, ?)',
        [req.contact.id, relatedId, relation_type, notes ? String(notes).slice(0, 255) : null]
      );
    } catch (err) {
      if (err && err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'This relationship already exists' });
      throw err;
    }
    auditWrite(req.user.id, req.contact.id, 'create', 'relationship', result.insertId, null,
      { related_contact_id: relatedId, relation_type }, 'Added relationship');
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/relationships/:id — either side's owner (or admin) may remove
router.delete('/relationships/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Relationship not found' });
    const rows = await query('SELECT * FROM contact_relationships WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Relationship not found' });
    const rel = rows[0];

    const [a, b] = await Promise.all([
      contactAccess(req.user, rel.contact_id),
      contactAccess(req.user, rel.related_contact_id),
    ]);
    const canEdit = (f) => f && (f.access !== 'shared' || f.share.permissions === 'edit');
    if (!canEdit(a) && !canEdit(b)) return res.status(404).json({ error: 'Relationship not found' });

    await query('DELETE FROM contact_relationships WHERE id = ?', [id]);
    auditWrite(req.user.id, rel.contact_id, 'delete', 'relationship', id,
      { related_contact_id: rel.related_contact_id, relation_type: rel.relation_type }, null, 'Removed relationship');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
module.exports.INVERSE_MAP = INVERSE_MAP;
