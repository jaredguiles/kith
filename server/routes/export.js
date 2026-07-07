'use strict';

// Data export: vCard 3.0, CSV, and the admin JSON backup (moved verbatim from
// routes/dashboard.js GET /api/export — the mount point stays /api/export).

const express = require('express');
const { query } = require('../database/connection');
const { requireAuth, requireAdmin, isAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------------------------------------------------------------------------
// Shared: resolve which contacts the request may export.
// ?ids=1,2,3 or ?all=1. Owned contacts only (admins may export any).
// ---------------------------------------------------------------------------
async function resolveContacts(req, res) {
  const { ids, all } = req.query;
  const admin = isAdmin(req.user);

  if (all === '1' || all === 'true') {
    const where = admin ? '' : 'AND owner_user_id = ?';
    const params = admin ? [] : [req.user.id];
    return query(`SELECT * FROM contacts WHERE deleted_at IS NULL ${where} ORDER BY display_name`, params);
  }

  if (!ids) {
    res.status(400).json({ error: 'Provide ?ids=1,2,3 or ?all=1' });
    return null;
  }
  const idList = String(ids).split(',').map((s) => Number(s.trim()));
  if (idList.length === 0 || idList.some((n) => !Number.isInteger(n) || n <= 0)) {
    res.status(400).json({ error: 'ids must be a comma-separated list of positive integers' });
    return null;
  }
  if (idList.length > 1000) {
    res.status(400).json({ error: 'Too many ids (max 1000)' });
    return null;
  }
  const ph = idList.map(() => '?').join(',');
  const where = admin ? '' : 'AND owner_user_id = ?';
  const params = admin ? idList : [...idList, req.user.id];
  return query(`SELECT * FROM contacts WHERE id IN (${ph}) AND deleted_at IS NULL ${where} ORDER BY display_name`, params);
}

async function loadSatellites(contactIds) {
  const ph = contactIds.map(() => '?').join(',');
  const [emails, phones, addresses] = await Promise.all([
    query(`SELECT * FROM contact_emails WHERE contact_id IN (${ph}) ORDER BY is_primary DESC, id`, contactIds),
    query(`SELECT * FROM contact_phones WHERE contact_id IN (${ph}) ORDER BY is_primary DESC, id`, contactIds),
    query(`SELECT * FROM contact_addresses WHERE contact_id IN (${ph}) ORDER BY is_primary DESC, id`, contactIds),
  ]);
  const group = (rows) => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.contact_id)) map.set(r.contact_id, []);
      map.get(r.contact_id).push(r);
    }
    return map;
  };
  return { emails: group(emails), phones: group(phones), addresses: group(addresses) };
}

// ---------------------------------------------------------------------------
// vCard 3.0 (hand-rolled — escape \ ; , and newlines per RFC 2426)
// ---------------------------------------------------------------------------
function vesc(v) {
  return String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

function contactToVcard(c, emails, phones, addresses) {
  const lines = ['BEGIN:VCARD', 'VERSION:3.0'];
  lines.push(`FN:${vesc(c.display_name)}`);
  lines.push(`N:${vesc(c.last_name)};${vesc(c.first_name)};${vesc(c.middle_name)};;`);
  if (c.nickname) lines.push(`NICKNAME:${vesc(c.nickname)}`);

  // emails: satellites + scalar (deduped)
  const seenEmails = new Set();
  const pushEmail = (email, label, primary) => {
    const key = String(email).toLowerCase();
    if (!email || seenEmails.has(key)) return;
    seenEmails.add(key);
    const type = label ? `;TYPE=${String(label).replace(/[^A-Za-z0-9-]/g, '').toUpperCase() || 'INTERNET'}` : ';TYPE=INTERNET';
    lines.push(`EMAIL${type}${primary ? ';TYPE=PREF' : ''}:${vesc(email)}`);
  };
  for (const e of emails) pushEmail(e.email, e.label, e.is_primary);
  pushEmail(c.email, null, emails.length === 0);

  // phones: satellites + scalar (deduped)
  const seenPhones = new Set();
  const pushPhone = (phone, label, primary) => {
    const key = String(phone).replace(/\D/g, '');
    if (!phone || seenPhones.has(key)) return;
    seenPhones.add(key);
    const type = label ? `;TYPE=${String(label).replace(/[^A-Za-z0-9-]/g, '').toUpperCase() || 'VOICE'}` : ';TYPE=VOICE';
    lines.push(`TEL${type}${primary ? ';TYPE=PREF' : ''}:${vesc(phone)}`);
  };
  for (const p of phones) pushPhone(p.phone, p.label, p.is_primary);
  pushPhone(c.phone, null, phones.length === 0);

  for (const a of addresses) {
    const type = a.label ? `;TYPE=${String(a.label).replace(/[^A-Za-z0-9-]/g, '').toUpperCase() || 'HOME'}` : '';
    lines.push(`ADR${type}:;;${vesc(a.street)};${vesc(a.city)};${vesc(a.state)};${vesc(a.zip)};${vesc(a.country)}`);
  }

  if (c.birthday) lines.push(`BDAY:${String(c.birthday).slice(0, 10)}`);
  if (c.company) lines.push(`ORG:${vesc(c.company)}`);
  if (c.occupation) lines.push(`TITLE:${vesc(c.occupation)}`);
  if (c.website) lines.push(`URL:${vesc(c.website)}`);
  if (c.bio) lines.push(`NOTE:${vesc(c.bio)}`);
  lines.push('END:VCARD');
  return lines.join('\r\n');
}

// GET /api/export/vcf?ids=1,2,3 | ?all=1
router.get('/vcf', async (req, res, next) => {
  try {
    const contacts = await resolveContacts(req, res);
    if (!contacts) return; // 400 already sent
    if (contacts.length === 0) return res.status(404).json({ error: 'No exportable contacts found' });

    const sat = await loadSatellites(contacts.map((c) => c.id));
    const cards = contacts.map((c) => contactToVcard(
      c,
      sat.emails.get(c.id) || [],
      sat.phones.get(c.id) || [],
      sat.addresses.get(c.id) || []
    ));

    res.setHeader('Content-Type', 'text/vcard; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kith-contacts.vcf"');
    res.send(cards.join('\r\n') + '\r\n');
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// CSV (RFC 4180-style quoting)
// ---------------------------------------------------------------------------
const CSV_COLUMNS = [
  'id', 'display_name', 'first_name', 'middle_name', 'last_name', 'nickname',
  'primary_email', 'primary_phone', 'birthday', 'location', 'occupation',
  'company', 'website', 'relationship_type', 'how_we_met', 'met_date',
  'rating', 'is_favorite', 'bio', 'created_at',
];

function csvCell(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/export/csv?ids=1,2,3 | ?all=1
router.get('/csv', async (req, res, next) => {
  try {
    const contacts = await resolveContacts(req, res);
    if (!contacts) return;
    if (contacts.length === 0) return res.status(404).json({ error: 'No exportable contacts found' });

    const sat = await loadSatellites(contacts.map((c) => c.id));
    const lines = [CSV_COLUMNS.join(',')];
    for (const c of contacts) {
      const pe = (sat.emails.get(c.id) || [])[0]?.email || c.email || '';
      const pp = (sat.phones.get(c.id) || [])[0]?.phone || c.phone || '';
      const row = { ...c, primary_email: pe, primary_phone: pp };
      lines.push(CSV_COLUMNS.map((col) => csvCell(row[col])).join(','));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="kith-contacts.csv"');
    res.send(lines.join('\r\n') + '\r\n');
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/export/backup — admin-only full data export (JSON).
// Moved VERBATIM from routes/dashboard.js GET /api/export (same behavior,
// including import_staging exclusion and *_hash redactions).
// ---------------------------------------------------------------------------
router.get('/backup', requireAdmin, async (req, res, next) => {
  try {
    const tables = [
      'users', 'contacts', 'contact_emails', 'contact_phones', 'contact_addresses',
      'social_links', 'tags', 'contact_tags', 'groups', 'group_members',
      'shared_contacts', 'events', 'event_contacts', 'event_media', 'timeline_events',
      'notes', 'reminders', 'messages', 'media_assets', 'audit_log',
      'contact_field_changelog', 'import_jobs', 'app_settings',
      'preferences', 'spicy_profiles',
      // 'import_staging' intentionally excluded: raw/normalized third-party
      // dumps (message bodies etc.) don't belong in a backup export
    ];
    const dump = { exported_at: new Date().toISOString(), version: 1, tables: {} };
    for (const t of tables) {
      let rows = await query(`SELECT * FROM \`${t}\``);
      if (t === 'users') rows.forEach((r) => { delete r.password_hash; });
      if (t === 'preferences') {
        // never export secret hashes (spicy_pin_hash and any future *_hash keys)
        rows = rows.filter((r) => !/_hash$/.test(String(r.key)));
      }
      // belt-and-braces: strip any *_hash column from every table
      rows.forEach((r) => { for (const k of Object.keys(r)) if (/_hash$/.test(k)) delete r[k]; });
      dump.tables[t] = rows;
    }
    // Note: spicy_profiles + spicy note/message content export as CIPHERTEXT —
    // restoring requires the same FIELD_ENCRYPTION_KEY. Documented in README.
    res.setHeader('Content-Disposition', `attachment; filename="kith-export-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json(dump);
  } catch (err) { next(err); }
});

module.exports = router;
