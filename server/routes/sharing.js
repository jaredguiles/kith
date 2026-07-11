'use strict';

// Sharing + merge (mounted under /api/contacts) and audit-log read routes.

const express = require('express');
const { query, withTransaction } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite, changelogWrite } = require('../lib/audit');
const { rebuildSearchIndex } = require('../lib/contacts');
const { CONTACT_FIELDS } = require('../lib/contacts');

// ------------------------------------------------------------ share router
const shareRouter = express.Router({ mergeParams: true });
shareRouter.use(requireAuth);

// POST /api/contacts/:id/share — { user_id, permissions, share_scope }
shareRouter.post('/', requireContactAccess('id'), async (req, res, next) => {
  try {
    if (req.contactAccess === 'shared') return res.status(403).json({ error: 'Only the owner can share a contact' });
    const { user_id, permissions, share_scope } = req.body || {};
    const targetId = Number(user_id);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'user_id is required' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot share a contact with yourself' });

    const targets = await query('SELECT id, username FROM users WHERE id = ? AND is_active = 1', [targetId]);
    if (!targets.length) return res.status(404).json({ error: 'User not found' });

    const perm = permissions === 'edit' ? 'edit' : 'read';
    const scope = ['basic', 'full', 'full_spicy'].includes(share_scope) ? share_scope : 'basic';

    await query(
      `INSERT INTO shared_contacts (contact_id, shared_by_user_id, shared_with_user_id, permissions, share_scope)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE permissions = VALUES(permissions), share_scope = VALUES(share_scope), acknowledged_at = NULL`,
      [req.contact.id, req.user.id, targetId, perm, scope]
    );

    // "Shared" tag on the contact — the system Shared group is a smart group
    // linked to this tag (groups.tag_id), so tagging alone puts the contact
    // in the Shared group; no group_members write needed.
    const sharedTag = await query("SELECT id FROM tags WHERE name = 'Shared' AND owner_user_id IS NULL LIMIT 1");
    if (sharedTag.length) await query('INSERT IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)', [req.contact.id, sharedTag[0].id]);

    // notification for the recipient
    await query(
      `INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'share_received', ?, ?, ?)`,
      [targetId, `${req.user.display_name || req.user.username} shared a contact with you`,
       `${req.contact.display_name} (${scope} access)`, `#/contacts/${req.contact.id}`]
    );

    auditWrite(req.user.id, req.contact.id, 'share', 'contact', req.contact.id, null,
      { shared_with: targetId, permissions: perm, share_scope: scope }, `Shared ${req.contact.display_name}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/contacts/:id/share/:userId
shareRouter.delete('/:userId', requireContactAccess('id'), async (req, res, next) => {
  try {
    if (req.contactAccess === 'shared') return res.status(403).json({ error: 'Only the owner can unshare a contact' });
    const targetId = Number(req.params.userId);
    if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: 'Invalid user id' });
    await query('DELETE FROM shared_contacts WHERE contact_id = ? AND shared_with_user_id = ?', [req.contact.id, targetId]);
    auditWrite(req.user.id, req.contact.id, 'unshare', 'contact', req.contact.id, null,
      { unshared_from: targetId }, `Unshared ${req.contact.display_name}`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// GET /api/contacts/:id/share — current shares (owner view)
shareRouter.get('/', requireContactAccess('id'), async (req, res, next) => {
  try {
    if (req.contactAccess === 'shared') return res.status(403).json({ error: 'Only the owner can view shares' });
    const rows = await query(
      `SELECT sc.*, u.username, u.display_name FROM shared_contacts sc
       JOIN users u ON u.id = sc.shared_with_user_id WHERE sc.contact_id = ?`,
      [req.contact.id]
    );
    res.json({ shares: rows });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------ merge router
const mergeRouter = express.Router({ mergeParams: true });
mergeRouter.use(requireAuth);

// POST /api/contacts/:id/merge/:otherId — body: { field_choices: {field: 'a'|'b'|customValue} }
// :id = winner (A), :otherId = loser (B). Union of satellites; loser soft-deleted.
mergeRouter.post('/:otherId', requireContactAccess('id', { edit: true }), async (req, res, next) => {
  try {
    const winner = req.contact;
    const otherId = Number(req.params.otherId);
    if (!Number.isInteger(otherId) || otherId <= 0) return res.status(404).json({ error: 'Other contact not found' });
    if (otherId === winner.id) return res.status(400).json({ error: 'Cannot merge a contact into itself' });
    const foundB = await contactAccess(req.user, otherId);
    if (!foundB) return res.status(404).json({ error: 'Other contact not found' });
    if (foundB.access === 'shared') return res.status(403).json({ error: 'You can only merge contacts you own' });
    const loser = foundB.contact;

    const { field_choices = {} } = req.body || {};

    // Resolve winning field values
    const updates = {};
    const diffs = [];
    for (const f of CONTACT_FIELDS) {
      if (f === 'is_favorite' || f === 'is_spicy' || f === 'is_anonymous') continue;
      const choice = field_choices[f];
      let newVal;
      if (choice === 'b') newVal = loser[f];
      else if (choice === 'a' || choice === undefined) {
        // default: keep A, fill empty A fields from B
        newVal = winner[f] !== null && winner[f] !== '' ? winner[f] : loser[f];
      } else newVal = choice; // custom value
      if (String(newVal ?? '') !== String(winner[f] ?? '')) {
        updates[f] = newVal;
        diffs.push({ field: f, oldValue: winner[f] == null ? null : String(winner[f]), newValue: newVal == null ? null : String(newVal) });
      }
    }
    // boolean flags: OR
    for (const b of ['is_favorite', 'is_spicy', 'is_anonymous']) {
      const merged = winner[b] || loser[b] ? 1 : 0;
      if (merged !== winner[b]) updates[b] = merged;
    }

    await withTransaction(async (conn) => {
      if (Object.keys(updates).length) {
        const cols = Object.keys(updates);
        await conn.execute(
          `UPDATE contacts SET ${cols.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
          [...cols.map((k) => updates[k] ?? null), winner.id]
        );
      }

      // Re-point satellite references (additive union). INSERT IGNORE dedupes join tables.
      await conn.execute('UPDATE contact_emails SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE contact_phones SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE contact_addresses SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE social_links SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE notes SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE timeline_events SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE messages SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE media_assets SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('UPDATE reminders SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('INSERT IGNORE INTO contact_tags (contact_id, tag_id) SELECT ?, tag_id FROM contact_tags WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('DELETE FROM contact_tags WHERE contact_id = ?', [loser.id]);
      await conn.execute('INSERT IGNORE INTO group_members (group_id, contact_id) SELECT group_id, ? FROM group_members WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('DELETE FROM group_members WHERE contact_id = ?', [loser.id]);
      await conn.execute('INSERT IGNORE INTO event_contacts (event_id, contact_id) SELECT event_id, ? FROM event_contacts WHERE contact_id = ?', [winner.id, loser.id]);
      await conn.execute('DELETE FROM event_contacts WHERE contact_id = ?', [loser.id]);

      // spicy profile: keep winner's if present, else move loser's
      const [winnerSpicy] = await conn.execute('SELECT id FROM spicy_profiles WHERE contact_id = ?', [winner.id]);
      if (!winnerSpicy.length) {
        await conn.execute('UPDATE spicy_profiles SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);
      } else {
        await conn.execute('DELETE FROM spicy_profiles WHERE contact_id = ?', [loser.id]);
      }

      // changelog history from loser re-points for provenance
      await conn.execute('UPDATE contact_field_changelog SET contact_id = ? WHERE contact_id = ?', [winner.id, loser.id]);

      // loser soft-deleted
      await conn.execute('UPDATE contacts SET deleted_at = NOW() WHERE id = ?', [loser.id]);
    });

    await rebuildSearchIndex(winner.id);

    // Full audit capture (both originals preserved → merge recovery)
    auditWrite(req.user.id, winner.id, 'merge', 'contact', winner.id,
      { winner: sanitizeForAudit(winner), loser: sanitizeForAudit(loser) },
      { kept: updates },
      `Merged ${loser.display_name} into ${winner.display_name}`);
    changelogWrite(winner.id, req.user.id, 'merge', diffs);

    res.json({ ok: true, winner_id: winner.id });
  } catch (err) { next(err); }
});

function sanitizeForAudit(contact) {
  const out = {};
  for (const f of ['id', ...CONTACT_FIELDS]) out[f] = contact[f];
  return out;
}

// -------------------------------------------------------------- audit read
const auditRouter = express.Router();
auditRouter.use(requireAuth);

// GET /api/audit-log?contact_id= | ?entity_type=&entity_id=
auditRouter.get('/', async (req, res, next) => {
  try {
    const { contact_id, entity_type, entity_id } = req.query;
    const where = [];
    const params = [];
    if (contact_id) {
      const found = await contactAccess(req.user, Number(contact_id));
      if (!found) return res.status(404).json({ error: 'Contact not found' });
      if (found.access === 'shared' && found.share.share_scope === 'basic') {
        return res.status(403).json({ error: 'Not available for this share scope' });
      }
      where.push('a.contact_id = ?');
      params.push(Number(contact_id));
    } else if (entity_type && entity_id) {
      if (!isAdmin(req.user)) return res.status(403).json({ error: 'Admin access required' });
      where.push('a.entity_type = ? AND a.entity_id = ?');
      params.push(entity_type, Number(entity_id));
    } else if (isAdmin(req.user)) {
      where.push('1=1');
    } else {
      return res.status(400).json({ error: 'contact_id is required' });
    }
    const rows = await query(
      `SELECT a.*, u.username AS user_username FROM audit_log a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${where.join(' AND ')} ORDER BY a.created_at DESC, a.id DESC LIMIT 200`,
      params
    );
    res.json({ entries: rows });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------ changelog read
const changelogRouter = express.Router();
changelogRouter.use(requireAuth);

// GET /api/changelog?contact_id=
changelogRouter.get('/', async (req, res, next) => {
  try {
    const contactId = Number(req.query.contact_id);
    if (!contactId) return res.status(400).json({ error: 'contact_id is required' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const rows = await query(
      `SELECT cl.*, u.username AS user_username FROM contact_field_changelog cl
       LEFT JOIN users u ON u.id = cl.user_id
       WHERE cl.contact_id = ? ORDER BY cl.changed_at DESC, cl.id DESC LIMIT 500`,
      [contactId]
    );
    res.json({ changelog: rows });
  } catch (err) { next(err); }
});

module.exports = { shareRouter, mergeRouter, auditRouter, changelogRouter };
