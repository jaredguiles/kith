'use strict';

// Timeline, notes, reminders, messages.
// Timeline: per-contact chronological feed aggregating timeline_events rows,
// notes, events (via event_contacts), and message batches. Spicy filtered
// server-side. Spicy note/message content is field-encrypted (§7.E Layer C).

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireContactAccess, contactAccess, isAdmin } = require('../middleware/auth');
const { auditWrite } = require('../lib/audit');
const { spicyVisible } = require('./contacts');
const { encryptField, decryptField } = require('../lib/crypto');

// ------------------------------------------------------------- timeline
const timelineRouter = express.Router();
timelineRouter.use(requireAuth);

// GET /api/timeline?contact_id= — aggregated feed
timelineRouter.get('/', async (req, res, next) => {
  try {
    const contactId = Number(req.query.contact_id);
    if (!contactId) return res.status(400).json({ error: 'contact_id is required' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const showSpicy = (await spicyVisible(req.user)) &&
      (found.access !== 'shared' || found.share.share_scope === 'full_spicy');
    const spicyFilter = showSpicy ? '' : 'AND is_spicy = 0';

    const [manual, notes, events, msgBatches] = await Promise.all([
      query(`SELECT id, 'timeline' AS kind, type, title, description, is_spicy, occurred_at AS at, event_id
             FROM timeline_events WHERE contact_id = ? AND deleted_at IS NULL ${spicyFilter}`, [contactId]),
      query(`SELECT id, 'note' AS kind, 'note' AS type, NULL AS title, content AS description, is_spicy, created_at AS at, NULL AS event_id
             FROM notes WHERE contact_id = ? AND deleted_at IS NULL ${spicyFilter}`, [contactId]),
      query(`SELECT e.id, 'event' AS kind, e.type, e.title, e.description, e.is_spicy, COALESCE(e.starts_at, e.created_at) AS at, e.id AS event_id
             FROM events e JOIN event_contacts ec ON ec.event_id = e.id
             WHERE ec.contact_id = ? AND e.deleted_at IS NULL ${showSpicy ? '' : 'AND e.is_spicy = 0'}`, [contactId]),
      query(`SELECT MIN(id) AS id, 'message_batch' AS kind, platform AS type,
                    CONCAT(COUNT(*), ' messages') AS title, NULL AS description,
                    MAX(is_spicy) AS is_spicy, DATE(sent_at) AS at, NULL AS event_id
             FROM messages WHERE contact_id = ? ${spicyFilter}
             GROUP BY platform, DATE(sent_at)`, [contactId]),
    ]);

    const items = [...manual, ...notes, ...events, ...msgBatches]
      .map((it) => ({
        ...it,
        description: it.kind === 'note' && it.is_spicy ? decryptField(it.description) : it.description,
      }))
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));

    res.json({ timeline: items.slice(0, 200) });
  } catch (err) { next(err); }
});

// POST /api/timeline — manual entry
timelineRouter.post('/', async (req, res, next) => {
  try {
    const { contact_id, type, title, description, is_spicy, occurred_at } = req.body || {};
    const found = await contactAccess(req.user, Number(contact_id));
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') {
      return res.status(403).json({ error: 'Read-only access' });
    }
    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;
    const result = await query(
      `INSERT INTO timeline_events (contact_id, type, title, description, is_spicy, occurred_at)
       VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))`,
      [found.contact.id, type || 'note', title || null, description || null, spicyFlag, occurred_at || null]
    );
    auditWrite(req.user.id, found.contact.id, 'create', 'timeline_event', result.insertId, null, { type, title }, 'Added timeline entry');
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

// DELETE /api/timeline/:id — soft (manual entries only)
timelineRouter.delete('/:id', async (req, res, next) => {
  try {
    const rows = await query('SELECT * FROM timeline_events WHERE id = ? AND deleted_at IS NULL', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const found = await contactAccess(req.user, rows[0].contact_id);
    if (!found) return res.status(404).json({ error: 'Not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    await query('UPDATE timeline_events SET deleted_at = NOW() WHERE id = ?', [rows[0].id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------- notes
const notesRouter = express.Router();
notesRouter.use(requireAuth);

// GET /api/notes?contact_id=
notesRouter.get('/', async (req, res, next) => {
  try {
    const contactId = Number(req.query.contact_id);
    if (!contactId) return res.status(400).json({ error: 'contact_id is required' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const showSpicy = (await spicyVisible(req.user)) &&
      (found.access !== 'shared' || found.share.share_scope === 'full_spicy');
    const rows = await query(
      `SELECT * FROM notes WHERE contact_id = ? AND deleted_at IS NULL ${showSpicy ? '' : 'AND is_spicy = 0'} ORDER BY created_at DESC`,
      [contactId]
    );
    res.json({ notes: rows.map((n) => ({ ...n, content: n.is_spicy ? decryptField(n.content) : n.content })) });
  } catch (err) { next(err); }
});

// POST /api/notes
notesRouter.post('/', async (req, res, next) => {
  try {
    const { contact_id, content, is_spicy } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ error: 'Note content is required' });
    const found = await contactAccess(req.user, Number(contact_id));
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;
    const stored = spicyFlag ? encryptField(String(content)) : String(content);
    const result = await query(
      'INSERT INTO notes (contact_id, content, is_spicy) VALUES (?, ?, ?)',
      [found.contact.id, stored, spicyFlag]
    );
    auditWrite(req.user.id, found.contact.id, 'create', 'note', result.insertId, null, { is_spicy: spicyFlag }, 'Added note');
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

async function loadNote(req, res, next) {
  const rows = await query('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL', [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Note not found' });
  const found = await contactAccess(req.user, rows[0].contact_id);
  if (!found) return res.status(404).json({ error: 'Note not found' });
  if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
  if (rows[0].is_spicy && !(await spicyVisible(req.user))) return res.status(404).json({ error: 'Note not found' });
  req.note = rows[0];
  next();
}

// PUT /api/notes/:id
notesRouter.put('/:id', loadNote, async (req, res, next) => {
  try {
    const { content, is_spicy } = req.body || {};
    if (!content || !String(content).trim()) return res.status(400).json({ error: 'Note content is required' });
    let spicyFlag = is_spicy !== undefined ? (is_spicy ? 1 : 0) : req.note.is_spicy;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = req.note.is_spicy;
    const stored = spicyFlag ? encryptField(String(content)) : String(content);
    await query('UPDATE notes SET content = ?, is_spicy = ? WHERE id = ?', [stored, spicyFlag, req.note.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/notes/:id — soft
notesRouter.delete('/:id', loadNote, async (req, res, next) => {
  try {
    await query('UPDATE notes SET deleted_at = NOW() WHERE id = ?', [req.note.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ------------------------------------------------------------- reminders
const remindersRouter = express.Router();
remindersRouter.use(requireAuth);

// GET /api/reminders/due — due/upcoming (next 30d + overdue), plus all open
remindersRouter.get('/due', async (req, res, next) => {
  try {
    const rows = await query(
      `SELECT r.*, c.display_name AS contact_name FROM reminders r
       LEFT JOIN contacts c ON c.id = r.contact_id AND c.deleted_at IS NULL
       WHERE r.owner_user_id = ? AND r.deleted_at IS NULL AND r.completed_at IS NULL
       ORDER BY r.due_at ASC LIMIT 200`,
      [req.user.id]
    );
    res.json({ reminders: rows });
  } catch (err) { next(err); }
});

// POST /api/reminders
remindersRouter.post('/', async (req, res, next) => {
  try {
    const { title, description, due_at, contact_id } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (!due_at) return res.status(400).json({ error: 'Due date is required' });
    let cid = null;
    if (contact_id) {
      const found = await contactAccess(req.user, Number(contact_id));
      if (found) cid = found.contact.id;
    }
    const result = await query(
      'INSERT INTO reminders (owner_user_id, contact_id, title, description, due_at) VALUES (?, ?, ?, ?, ?)',
      [req.user.id, cid, String(title).trim(), description || null, due_at]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

async function loadReminder(req, res, next) {
  const rows = await query('SELECT * FROM reminders WHERE id = ? AND deleted_at IS NULL', [Number(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Reminder not found' });
  if (rows[0].owner_user_id !== req.user.id && !isAdmin(req.user)) return res.status(404).json({ error: 'Reminder not found' });
  req.reminder = rows[0];
  next();
}

// PUT /api/reminders/:id
remindersRouter.put('/:id', loadReminder, async (req, res, next) => {
  try {
    const { title, description, due_at, contact_id } = req.body || {};
    const updates = [];
    const params = [];
    if (title && String(title).trim()) { updates.push('title = ?'); params.push(String(title).trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description || null); }
    if (due_at) { updates.push('due_at = ?'); params.push(due_at); }
    if (contact_id !== undefined) {
      let cid = null;
      if (contact_id) {
        const found = await contactAccess(req.user, Number(contact_id));
        if (found) cid = found.contact.id;
      }
      updates.push('contact_id = ?'); params.push(cid);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.reminder.id);
    await query(`UPDATE reminders SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/reminders/:id/complete
remindersRouter.post('/:id/complete', loadReminder, async (req, res, next) => {
  try {
    await query('UPDATE reminders SET completed_at = NOW() WHERE id = ?', [req.reminder.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/reminders/:id — soft
remindersRouter.delete('/:id', loadReminder, async (req, res, next) => {
  try {
    await query('UPDATE reminders SET deleted_at = NOW() WHERE id = ?', [req.reminder.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// -------------------------------------------------------------- messages
const messagesRouter = express.Router();
messagesRouter.use(requireAuth);

// GET /api/messages?contact_id=
messagesRouter.get('/', async (req, res, next) => {
  try {
    const contactId = Number(req.query.contact_id);
    if (!contactId) return res.status(400).json({ error: 'contact_id is required' });
    const found = await contactAccess(req.user, contactId);
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.share_scope === 'basic') {
      return res.status(403).json({ error: 'Not available for this share scope' });
    }
    const showSpicy = (await spicyVisible(req.user)) &&
      (found.access !== 'shared' || found.share.share_scope === 'full_spicy');
    const rows = await query(
      `SELECT * FROM messages WHERE contact_id = ? ${showSpicy ? '' : 'AND is_spicy = 0'} ORDER BY sent_at DESC LIMIT 500`,
      [contactId]
    );
    res.json({ messages: rows.map((m) => ({ ...m, content: m.is_spicy ? decryptField(m.content) : m.content })) });
  } catch (err) { next(err); }
});

// POST /api/messages — manual entry (D10)
messagesRouter.post('/', async (req, res, next) => {
  try {
    const { contact_id, platform, direction, content, is_spicy, sent_at } = req.body || {};
    const found = await contactAccess(req.user, Number(contact_id));
    if (!found) return res.status(404).json({ error: 'Contact not found' });
    if (found.access === 'shared' && found.share.permissions !== 'edit') return res.status(403).json({ error: 'Read-only access' });
    let spicyFlag = is_spicy ? 1 : 0;
    if (spicyFlag && !(await spicyVisible(req.user))) spicyFlag = 0;
    const stored = spicyFlag ? encryptField(String(content || '')) : (content || null);
    const result = await query(
      'INSERT INTO messages (contact_id, platform, direction, content, is_spicy, sent_at) VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))',
      [found.contact.id, platform || null, direction === 'out' ? 'out' : 'in', stored, spicyFlag, sent_at || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) { next(err); }
});

module.exports = { timelineRouter, notesRouter, remindersRouter, messagesRouter };
