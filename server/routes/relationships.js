'use strict';

// Contact relationships: directed rows in contact_relationships rendered in
// BOTH directions (an inverse label is computed for the reverse direction).
// Mounted at /api → /api/contacts/:id/relationships + /api/relationships/:id.

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');

const router = express.Router();
router.use(requireAuth);

// relation_type (as stored, describing related_contact relative to contact)
// → the stored relation_type of the reverse-direction row shown on the other
// side. The map is CLOSED: every value that appears as an inverse is also a
// key with its own inverse, so the auto-computed reverse type is always a
// valid RELATION_TYPE (and the duplicate-check lookup in the opposite
// direction always resolves to a storable type).
const INVERSE_MAP = {
  // --- Immediate family: parents/children ---
  parent: 'child',
  mother: 'child',
  father: 'child',
  child: 'parent',
  son: 'parent',
  daughter: 'parent',
  // --- Immediate family: siblings ---
  sibling: 'sibling',
  brother: 'sibling',
  sister: 'sibling',
  // --- Spouses / partners ---
  spouse: 'spouse',
  husband: 'spouse',
  wife: 'spouse',
  partner: 'partner',
  ex: 'ex',
  // --- Grandparents / grandchildren ---
  grandparent: 'grandchild',
  grandmother: 'grandchild',
  grandfather: 'grandchild',
  grandchild: 'grandparent',
  grandson: 'grandparent',
  granddaughter: 'grandparent',
  // --- Extended blood ---
  aunt_uncle: 'niece_nephew',
  aunt: 'niece_nephew',
  uncle: 'niece_nephew',
  niece_nephew: 'aunt_uncle',
  niece: 'aunt_uncle',
  nephew: 'aunt_uncle',
  cousin: 'cousin',
  // --- In-laws ---
  parent_in_law: 'child_in_law',
  mother_in_law: 'child_in_law',
  father_in_law: 'child_in_law',
  child_in_law: 'parent_in_law',
  son_in_law: 'parent_in_law',
  daughter_in_law: 'parent_in_law',
  sibling_in_law: 'sibling_in_law',
  brother_in_law: 'sibling_in_law',
  sister_in_law: 'sibling_in_law',
  // --- Step / adoptive / foster family ---
  step_parent: 'step_child',
  step_child: 'step_parent',
  step_sibling: 'step_sibling',
  adoptive_parent: 'adopted_child',
  adopted_child: 'adoptive_parent',
  foster_parent: 'foster_child',
  foster_child: 'foster_parent',
  // --- God family ---
  godparent: 'godchild',
  godchild: 'godparent',
  // --- Social / professional ---
  friend: 'friend',
  best_friend: 'best_friend',
  colleague: 'colleague',
  coworker: 'colleague',
  boss: 'report',
  manager: 'report',
  report: 'boss',
  mentor: 'mentee',
  mentee: 'mentor',
  neighbor: 'neighbor',
  roommate: 'roommate',
  acquaintance: 'acquaintance',
  introduced_by: 'introduced',
  introduced: 'introduced_by',
  // --- Generic ---
  family: 'family',
  other: 'other',
};

const RELATION_TYPES = Object.keys(INVERSE_MAP);

// Human-readable labels for display (both directions). Falls back to a
// title-cased version of the raw key when a label is not listed.
const DISPLAY_LABELS = {
  parent: 'Parent', mother: 'Mother', father: 'Father',
  child: 'Child', son: 'Son', daughter: 'Daughter',
  sibling: 'Sibling', brother: 'Brother', sister: 'Sister',
  spouse: 'Spouse', husband: 'Husband', wife: 'Wife',
  partner: 'Partner', ex: 'Ex',
  grandparent: 'Grandparent', grandmother: 'Grandmother', grandfather: 'Grandfather',
  grandchild: 'Grandchild', grandson: 'Grandson', granddaughter: 'Granddaughter',
  aunt_uncle: 'Aunt/Uncle', aunt: 'Aunt', uncle: 'Uncle',
  niece_nephew: 'Niece/Nephew', niece: 'Niece', nephew: 'Nephew',
  cousin: 'Cousin',
  parent_in_law: 'Parent-in-law', mother_in_law: 'Mother-in-law', father_in_law: 'Father-in-law',
  child_in_law: 'Child-in-law', son_in_law: 'Son-in-law', daughter_in_law: 'Daughter-in-law',
  sibling_in_law: 'Sibling-in-law', brother_in_law: 'Brother-in-law', sister_in_law: 'Sister-in-law',
  step_parent: 'Step-parent', step_child: 'Step-child', step_sibling: 'Step-sibling',
  adoptive_parent: 'Adoptive parent', adopted_child: 'Adopted child',
  foster_parent: 'Foster parent', foster_child: 'Foster child',
  godparent: 'Godparent', godchild: 'Godchild',
  friend: 'Friend', best_friend: 'Best friend',
  colleague: 'Colleague', coworker: 'Coworker',
  boss: 'Boss', manager: 'Manager', report: 'Report',
  mentor: 'Mentor', mentee: 'Mentee',
  neighbor: 'Neighbor', roommate: 'Roommate', acquaintance: 'Acquaintance',
  introduced_by: 'Introduced by', introduced: 'Introduced',
  family: 'Family', other: 'Other',
};

const labelFor = (t) => DISPLAY_LABELS[t] || String(t || '')
  .split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

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
        display_label: labelFor(r.relation_type),
        inverse: false,
        notes: r.notes,
        created_at: r.created_at,
      })),
      ...reverse.map((r) => ({
        id: r.id,
        other: { id: r.other_id, display_name: r.display_name, photo_url: r.photo_url },
        relation_type: r.relation_type,
        display_label: labelFor(INVERSE_MAP[r.relation_type] || r.relation_type),
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

// ------------------------------------------------------------- family tree
// Normalized family edge types. A stored relation_type describes
// related_contact relative to contact: (A, B, 'mother') → B is A's parent.
const REL_PARENT = ['parent', 'mother', 'father', 'step_parent', 'adoptive_parent', 'foster_parent'];  // related IS contact's parent
const REL_CHILD = ['child', 'son', 'daughter', 'step_child', 'adopted_child', 'foster_child'];         // related IS contact's child
const REL_SIBLING = ['sibling', 'brother', 'sister', 'step_sibling'];
const REL_PARTNER = ['spouse', 'husband', 'wife', 'partner'];
const FAMILY_TYPES = [...REL_PARENT, ...REL_CHILD, ...REL_SIBLING, ...REL_PARTNER];

// GET /api/contacts/:id/family-tree — the connected family component around
// a person: people + normalized edges (parent → child, partner, sibling).
// BFS over family-typed relationship rows, depth/size capped; every included
// person passes the same access rule as the contacts list (own/shared/admin).
router.get('/contacts/:id/family-tree', requireContactAccess('id'), async (req, res, next) => {
  try {
    const rootId = req.contact.id;
    const MAX_PEOPLE = 400, MAX_DEPTH = 10;
    const visited = new Set([rootId]);
    let frontier = [rootId];
    const rawEdges = [];
    const seenEdge = new Set();

    for (let depth = 0; depth < MAX_DEPTH && frontier.length && visited.size < MAX_PEOPLE; depth++) {
      const ph = frontier.map(() => '?').join(',');
      const tph = FAMILY_TYPES.map(() => '?').join(',');
      const rows = await query(
        `SELECT cr.id, cr.contact_id, cr.related_contact_id, cr.relation_type
         FROM contact_relationships cr
         JOIN contacts a ON a.id = cr.contact_id AND a.deleted_at IS NULL
         JOIN contacts b ON b.id = cr.related_contact_id AND b.deleted_at IS NULL
         WHERE cr.relation_type IN (${tph})
           AND (cr.contact_id IN (${ph}) OR cr.related_contact_id IN (${ph}))`,
        [...FAMILY_TYPES, ...frontier, ...frontier]
      );
      const next = [];
      for (const r of rows) {
        if (seenEdge.has(r.id)) continue;
        seenEdge.add(r.id);
        rawEdges.push(r);
        for (const cid of [r.contact_id, r.related_contact_id]) {
          if (!visited.has(cid) && visited.size < MAX_PEOPLE) {
            visited.add(cid);
            next.push(cid);
          }
        }
      }
      frontier = next;
    }

    // Access filter — same rule as the contacts list (own + shared-in, or admin).
    const ids = [...visited];
    const idPh = ids.map(() => '?').join(',');
    const scope = isAdmin(req.user)
      ? ''
      : `AND (c.owner_user_id = ${Number(req.user.id)} OR EXISTS (
           SELECT 1 FROM shared_contacts sc WHERE sc.contact_id = c.id AND sc.shared_with_user_id = ${Number(req.user.id)}))`;
    const people = await query(
      `SELECT c.id, c.display_name, c.first_name, c.last_name, c.photo_url,
              c.birthday, c.is_deceased, c.date_of_death, c.orientation,
              c.sex, c.gender_identity
       FROM contacts c
       WHERE c.id IN (${idPh}) AND c.deleted_at IS NULL ${scope}`,
      ids
    );
    const allowed = new Set(people.map((p) => p.id));

    // Normalize edges: parent → child direction; partner/sibling symmetric.
    const edges = [];
    const dedupe = new Set();
    const pushEdge = (type, from, to, step) => {
      const key = type === 'parent' ? `par:${from}:${to}` : `${type}:${Math.min(from, to)}:${Math.max(from, to)}`;
      if (dedupe.has(key)) return;
      dedupe.add(key);
      edges.push({ type, from, to, ...(step ? { step: true } : {}) });
    };
    for (const r of rawEdges) {
      if (!allowed.has(r.contact_id) || !allowed.has(r.related_contact_id)) continue;
      const step = r.relation_type.startsWith('step_');
      if (REL_PARENT.includes(r.relation_type)) pushEdge('parent', r.related_contact_id, r.contact_id, step);
      else if (REL_CHILD.includes(r.relation_type)) pushEdge('parent', r.contact_id, r.related_contact_id, step);
      else if (REL_SIBLING.includes(r.relation_type)) pushEdge('sibling', r.contact_id, r.related_contact_id, step);
      else if (REL_PARTNER.includes(r.relation_type)) pushEdge('partner', r.contact_id, r.related_contact_id, false);
    }

    res.json({
      root: rootId,
      people: people.map((p) => ({ ...p, is_deceased: Boolean(p.is_deceased) })),
      edges,
      truncated: visited.size >= MAX_PEOPLE,
    });
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
module.exports.DISPLAY_LABELS = DISPLAY_LABELS;
