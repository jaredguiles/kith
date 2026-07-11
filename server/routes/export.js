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
// GEDCOM 5.5.1 (hand-rolled). INDI records from contacts; FAM units derived
// from parent/partner relationship edges (children grouped by parent-pair).
// ---------------------------------------------------------------------------
const GED_PARENT = ['parent', 'mother', 'father', 'step_parent', 'adoptive_parent', 'foster_parent'];
const GED_CHILD = ['child', 'son', 'daughter', 'step_child', 'adopted_child', 'foster_child'];
const GED_PARTNER = ['spouse', 'husband', 'wife', 'partner'];
const GED_PEDI = {
  step_parent: 'step', step_child: 'step',
  adoptive_parent: 'adopted', adopted_child: 'adopted',
  foster_parent: 'foster', foster_child: 'foster',
};

/** 'YYYY-MM-DD' → '15 APR 1990' */
function gedDate(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Value with newlines → GEDCOM CONT continuation lines at `level`. */
function gedText(level, tag, value) {
  const parts = String(value).split(/\r\n|\r|\n/);
  const out = [`${level} ${tag} ${parts[0]}`.trimEnd()];
  for (const p of parts.slice(1)) out.push(`${level + 1} CONT ${p}`.trimEnd());
  return out;
}

/**
 * Build GEDCOM 5.5.1 text for a set of contacts + their family-typed
 * relationship rows. Family units (FAM) are derived: each child's parent set
 * (1–2 parents) plus each partner couple forms a unit; children attach to
 * the unit matching their parent-pair.
 */
function buildGedcom(contacts, relRows) {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const indiRef = (id) => `@I${id}@`;

  // normalize edges (same semantics as the family-tree route)
  const parentsOf = new Map();  // child id → Map(parent id → pedigree|null)
  const couples = new Map();    // 'lo:hi' → [a, b]
  const addParent = (parentId, childId, pedigree) => {
    if (!byId.has(parentId) || !byId.has(childId)) return;
    if (!parentsOf.has(childId)) parentsOf.set(childId, new Map());
    if (!parentsOf.get(childId).has(parentId)) parentsOf.get(childId).set(parentId, pedigree || null);
  };
  for (const r of relRows) {
    const t = r.relation_type;
    if (GED_PARENT.includes(t)) addParent(r.related_contact_id, r.contact_id, GED_PEDI[t]);
    else if (GED_CHILD.includes(t)) addParent(r.contact_id, r.related_contact_id, GED_PEDI[t]);
    else if (GED_PARTNER.includes(t) && byId.has(r.contact_id) && byId.has(r.related_contact_id)) {
      const [lo, hi] = [r.contact_id, r.related_contact_id].sort((a, b) => a - b);
      couples.set(`${lo}:${hi}`, [lo, hi]);
    }
  }

  // family units: key = sorted parent ids (or single parent id)
  const famUnits = new Map(); // key → { partners: [ids], children: [{id, pedigree}] }
  const famKey = (ids) => [...ids].sort((a, b) => a - b).join(':');
  for (const [childId, parents] of parentsOf) {
    const key = famKey([...parents.keys()]);
    if (!famUnits.has(key)) famUnits.set(key, { partners: [...parents.keys()], children: [] });
    // pedigree: any non-birth qualifier among this child's parent edges
    const pedigree = [...parents.values()].find(Boolean) || null;
    famUnits.get(key).children.push({ id: childId, pedigree });
  }
  for (const [key, [a, b]] of couples) {
    if (!famUnits.has(key)) famUnits.set(key, { partners: [a, b], children: [] });
  }

  // assign FAM xrefs + reverse indexes for FAMS/FAMC
  const famRefs = new Map();
  let famNo = 1;
  for (const key of famUnits.keys()) famRefs.set(key, `@F${famNo++}@`);
  const famsOf = new Map(); // person id → [fam xref] (as partner)
  const famcOf = new Map(); // person id → [{ ref, pedigree }] (as child)
  for (const [key, unit] of famUnits) {
    const ref = famRefs.get(key);
    for (const p of unit.partners) {
      if (!famsOf.has(p)) famsOf.set(p, []);
      famsOf.get(p).push(ref);
    }
    for (const ch of unit.children) {
      if (!famcOf.has(ch.id)) famcOf.set(ch.id, []);
      famcOf.get(ch.id).push({ ref, pedigree: ch.pedigree });
    }
  }

  const lines = [
    '0 HEAD',
    '1 SOUR Kith',
    '2 NAME Kith Personal CRM',
    '1 GEDC',
    '2 VERS 5.5.1',
    '2 FORM LINEAGE-LINKED',
    '1 CHAR UTF-8',
    `1 DATE ${gedDate(new Date().toISOString())}`,
  ];

  const SEX_OUT = { male: 'M', female: 'F', intersex: 'X' };
  for (const c of contacts) {
    lines.push(`0 ${indiRef(c.id)} INDI`);
    const given = [c.first_name, c.middle_name].filter(Boolean).join(' ');
    const surname = c.last_name || '';
    if (given || surname) {
      lines.push(`1 NAME ${given} /${surname}/`.replace(/\s+\//, ' /'));
      if (given) lines.push(`2 GIVN ${given}`);
      if (surname) lines.push(`2 SURN ${surname}`);
      if (c.nickname) lines.push(`2 NICK ${c.nickname}`);
    } else {
      lines.push(`1 NAME ${c.display_name || 'Unknown'} //`);
    }
    if (c.maiden_name) {
      lines.push(`1 NAME ${given} /${c.maiden_name}/`.replace(/\s+\//, ' /'));
      lines.push('2 TYPE maiden');
    }
    const sex = SEX_OUT[String(c.sex || '').toLowerCase()];
    if (sex) lines.push(`1 SEX ${sex}`);
    if (c.birthday || c.place_of_birth) {
      lines.push('1 BIRT');
      const bd = gedDate(c.birthday);
      if (bd) lines.push(`2 DATE ${bd}`);
      if (c.place_of_birth) lines.push(`2 PLAC ${c.place_of_birth}`);
    }
    if (c.is_deceased) {
      lines.push('1 DEAT Y');
      const dd = gedDate(c.date_of_death);
      if (dd) lines.push(`2 DATE ${dd}`);
      if (c.place_of_death) lines.push(`2 PLAC ${c.place_of_death}`);
    }
    if (c.occupation) lines.push(`1 OCCU ${c.occupation}`);
    if (c.religion) lines.push(`1 RELI ${c.religion}`);
    if (c.nationality) lines.push(`1 NATI ${c.nationality}`);
    if (c.email) lines.push(`1 EMAIL ${c.email}`);
    if (c.phone) lines.push(`1 PHON ${c.phone}`);
    if (c.bio) lines.push(...gedText(1, 'NOTE', c.bio));
    for (const { ref, pedigree } of famcOf.get(c.id) || []) {
      lines.push(`1 FAMC ${ref}`);
      if (pedigree) lines.push(`2 PEDI ${pedigree}`);
    }
    for (const ref of famsOf.get(c.id) || []) lines.push(`1 FAMS ${ref}`);
  }

  for (const [key, unit] of famUnits) {
    lines.push(`0 ${famRefs.get(key)} FAM`);
    // HUSB/WIFE by sex when known, else slot order (GEDCOM 5.5.1 has no
    // neutral partner tag; readers accept either slot for same-sex couples)
    const partners = unit.partners.map((id) => byId.get(id)).filter(Boolean);
    const male = partners.find((p) => String(p.sex).toLowerCase() === 'male');
    const female = partners.find((p) => String(p.sex).toLowerCase() === 'female' && p !== male);
    const rest = partners.filter((p) => p !== male && p !== female);
    const slots = [];
    if (male) slots.push(['HUSB', male]);
    if (female) slots.push(['WIFE', female]);
    for (const p of rest) slots.push([slots.some(([t]) => t === 'HUSB') ? 'WIFE' : 'HUSB', p]);
    for (const [tag, p] of slots.slice(0, 2)) lines.push(`1 ${tag} ${indiRef(p.id)}`);
    for (const ch of unit.children) lines.push(`1 CHIL ${indiRef(ch.id)}`);
  }

  lines.push('0 TRLR');
  return lines.join('\r\n') + '\r\n';
}

// GET /api/export/gedcom?ids=1,2,3 | ?all=1 — family-typed relationships
// among the exported set become FAM units.
router.get('/gedcom', async (req, res, next) => {
  try {
    const contacts = await resolveContacts(req, res);
    if (!contacts) return;
    if (contacts.length === 0) return res.status(404).json({ error: 'No exportable contacts found' });

    const ids = contacts.map((c) => c.id);
    const ph = ids.map(() => '?').join(',');
    const famTypes = [...GED_PARENT, ...GED_CHILD, ...GED_PARTNER];
    const tph = famTypes.map(() => '?').join(',');
    const relRows = await query(
      `SELECT contact_id, related_contact_id, relation_type FROM contact_relationships
       WHERE relation_type IN (${tph}) AND contact_id IN (${ph}) AND related_contact_id IN (${ph})`,
      [...famTypes, ...ids, ...ids]
    );

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="kith-family-${new Date().toISOString().slice(0, 10)}.ged"`);
    res.send(buildGedcom(contacts, relRows));
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
      if (t === 'users') rows.forEach((r) => { delete r.password_hash; delete r.totp_secret; });
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
module.exports.buildGedcom = buildGedcom; // exported for tests
