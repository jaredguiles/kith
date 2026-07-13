'use strict';

// One-way push of Kith's SFW data to any CardDAV/CalDAV server (e.g. Radicale).
//
//   Kith MariaDB  ──(this module)──▶  the DAV server  ──▶ phone
//
// Kith's DB stays the source of truth. We hand-roll VCARD 4.0 + VCALENDAR
// (RFC 6350 / RFC 5545) and PUT them by stable UID so the push is idempotent
// (PUT overwrites). The calendar helpers mirror server/routes/ics.js.
//
// SAFETY: never pushes spicy/confidential data. is_spicy contacts are skipped
// entirely; is_spicy events are excluded; the encrypted spicy layer is never
// read here. Only cleartext SFW columns are emitted.
//
// This module NEVER throws to its callers — every public entry point is fully
// try/caught and returns a summary object with counts.

const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');
const { query } = require('../database/connection');

// --------------------------------------------------------------- env / config

const DAV_URL = String(process.env.DAV_URL || '').replace(/\/+$/, ''); // no trailing slash
const DAV_USER = process.env.DAV_USER || 'kith';
const DAV_PASS = process.env.DAV_PASS || '';
const DAV_SYNC_ENABLED = String(process.env.DAV_SYNC_ENABLED) === 'true';

// Collection paths under the user principal. the DAV server auto-creates parent
// principals; we MKCOL the two collections with proper resourcetype first.
const ADDRESSBOOK_PATH = `/${encodeURIComponent(DAV_USER)}/addressbook`;
const CALENDAR_PATH = `/${encodeURIComponent(DAV_USER)}/calendar`;

// ============================================================================
// RFC 5545 / 6350 text helpers
// ============================================================================

/** Escape TEXT values for both VCARD and VCALENDAR (\ ; , and newlines). */
function davEscape(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Fold a content line at 75 octets (UTF-8 aware). Continuation lines begin
 * with a single space; join with CRLF. (RFC 5545 §3.1 / RFC 6350 §3.2.)
 */
function foldLine(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let start = 0;
  let first = true;
  while (start < bytes.length) {
    const limit = first ? 75 : 74; // continuation lines start with a space
    let end = Math.min(start + limit, bytes.length);
    // never split a UTF-8 multibyte sequence
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((first ? '' : ' ') + bytes.subarray(start, end).toString('utf8'));
    start = end;
    first = false;
  }
  return out.join('\r\n');
}

/** Assemble content lines: fold each, join with CRLF, trailing CRLF. */
function assemble(lines) {
  return lines.filter((l) => l != null && l !== '').map(foldLine).join('\r\n') + '\r\n';
}

/** 'YYYY-MM-DD HH:MM:SS' (DB, treated as UTC) → 'YYYYMMDDTHHMMSSZ'. */
function toUtcStamp(dt) {
  const m = String(dt || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ]?(\d{2})?:?(\d{2})?:?(\d{2})?/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}T${m[4] || '00'}${m[5] || '00'}${m[6] || '00'}Z`;
}

/** 'YYYY-MM-DD…' → 'YYYYMMDD' (all-day / DATE values). */
function toDateStamp(d) {
  const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}`;
}

const nowStamp = () => toUtcStamp(new Date().toISOString().slice(0, 19).replace('T', ' '));

// ============================================================================
// VCARD 4.0 builder
// ============================================================================

/**
 * Build a VCARD 4.0 string for a contact + its satellite rows.
 * @param {object} c        row from contacts
 * @param {object[]} emails contact_emails rows
 * @param {object[]} phones contact_phones rows
 * @param {object[]} addrs  contact_addresses rows
 * @returns {string} folded VCARD text with CRLF endings
 */
function buildVCard(c, emails, phones, addrs) {
  const uid = `kith-contact-${c.id}`;
  const lines = ['BEGIN:VCARD', 'VERSION:4.0', `PRODID:-//Kith//Personal CRM//EN`, `UID:${uid}`];

  // FN (required). display_name is NOT NULL in the schema, but guard anyway.
  const fn = c.display_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || 'Unnamed';
  lines.push(`FN:${davEscape(fn)}`);

  // N: Family;Given;Additional;Prefixes;Suffixes  (structured — components are
  // ';'-separated and are NOT escaped-comma; each component is TEXT-escaped).
  const n = [c.last_name, c.first_name, c.middle_name, '', '']
    .map((v) => davEscape(v || ''))
    .join(';');
  lines.push(`N:${n}`);

  if (c.nickname) lines.push(`NICKNAME:${davEscape(c.nickname)}`);

  // Emails: all rows, plus the legacy scalar contacts.email if not duplicated.
  const emailSeen = new Set();
  for (const e of emails) {
    if (!e.email) continue;
    const key = e.email.toLowerCase();
    if (emailSeen.has(key)) continue;
    emailSeen.add(key);
    const type = e.label ? `;TYPE=${davEscape(e.label)}` : '';
    const pref = e.is_primary ? ';PREF=1' : '';
    lines.push(`EMAIL${type}${pref}:${davEscape(e.email)}`);
  }
  if (c.email && !emailSeen.has(String(c.email).toLowerCase())) {
    lines.push(`EMAIL:${davEscape(c.email)}`);
  }

  // Phones: all rows, plus legacy scalar contacts.phone if not duplicated.
  const phoneSeen = new Set();
  for (const p of phones) {
    if (!p.phone) continue;
    const key = p.phone.replace(/\D/g, '');
    if (key && phoneSeen.has(key)) continue;
    if (key) phoneSeen.add(key);
    const type = p.label ? `;TYPE=${davEscape(p.label)}` : '';
    const pref = p.is_primary ? ';PREF=1' : '';
    lines.push(`TEL${type}${pref}:${davEscape(p.phone)}`);
  }
  if (c.phone && !phoneSeen.has(String(c.phone).replace(/\D/g, ''))) {
    lines.push(`TEL:${davEscape(c.phone)}`);
  }

  // Addresses: ADR structured = PO;Ext;Street;City;State;Zip;Country
  for (const a of addrs) {
    if (!(a.street || a.city || a.state || a.zip || a.country)) continue;
    const adr = ['', '', a.street, a.city, a.state, a.zip, a.country]
      .map((v) => davEscape(v || ''))
      .join(';');
    const type = a.label ? `;TYPE=${davEscape(a.label)}` : '';
    const pref = a.is_primary ? ';PREF=1' : '';
    lines.push(`ADR${type}${pref}:${adr}`);
  }

  // BDAY (VALUE=DATE, YYYYMMDD)
  const bday = toDateStamp(c.birthday);
  if (bday) lines.push(`BDAY;VALUE=DATE:${bday}`);

  // ORG / TITLE
  if (c.company) lines.push(`ORG:${davEscape(c.company)}`);
  if (c.occupation) lines.push(`TITLE:${davEscape(c.occupation)}`);

  // URL
  if (c.website) lines.push(`URL:${davEscape(c.website)}`);

  // NOTE — combine bio + notes_text (SFW cleartext only).
  const note = [c.bio, c.notes_text].filter(Boolean).join('\n\n');
  if (note) lines.push(`NOTE:${davEscape(note)}`);

  // PHOTO (optional) — reference by URI. Only if it's an absolute http(s) URL;
  // relative /media paths aren't resolvable by the phone, so skip those.
  if (c.photo_url && /^https?:\/\//i.test(c.photo_url)) {
    lines.push(`PHOTO;VALUE=URI:${davEscape(c.photo_url)}`);
  }

  lines.push(`REV:${nowStamp()}`);
  lines.push('END:VCARD');
  return assemble(lines);
}

// ============================================================================
// VCALENDAR builders (single-component .ics per source row)
// ============================================================================

function wrapCalendar(componentLines, name) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kith//Personal CRM//EN',
    'CALSCALE:GREGORIAN',
    name ? `X-WR-CALNAME:${davEscape(name)}` : null,
    ...componentLines,
    'END:VCALENDAR',
  ];
  return assemble(lines);
}

/** Timed event → VEVENT. Returns { uid, ics } or null if no start. */
function buildEventIcs(e, stamp) {
  const dtstart = toUtcStamp(e.starts_at);
  if (!dtstart) return null;
  const uid = `kith-event-${e.id}`;
  const dtend = toUtcStamp(e.ends_at);
  const comp = [
    'BEGIN:VEVENT',
    `UID:${uid}@kith`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dtstart}`,
    dtend ? `DTEND:${dtend}` : null,
    `SUMMARY:${davEscape(e.title)}`,
    e.description ? `DESCRIPTION:${davEscape(e.description)}` : null,
    e.location ? `LOCATION:${davEscape(e.location)}` : null,
    'END:VEVENT',
  ].filter(Boolean);
  return { uid, ics: wrapCalendar(comp, e.title) };
}

/** Birthday → all-day yearly-recurring VEVENT. */
function buildBirthdayIcs(b, stamp) {
  const d = toDateStamp(b.birthday);
  if (!d) return null;
  const uid = `kith-birthday-${b.id}`;
  const comp = [
    'BEGIN:VEVENT',
    `UID:${uid}@kith`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    'RRULE:FREQ=YEARLY',
    `SUMMARY:${davEscape(`🎂 ${b.display_name}'s birthday`)}`,
    'END:VEVENT',
  ];
  return { uid, ics: wrapCalendar(comp, 'Birthday') };
}

/** important_date → all-day VEVENT (yearly RRULE when recurring). */
function buildDateIcs(idate, stamp) {
  const d = toDateStamp(idate.date);
  if (!d) return null;
  const uid = `kith-date-${idate.id}`;
  const comp = [
    'BEGIN:VEVENT',
    `UID:${uid}@kith`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${d}`,
    idate.recurring ? 'RRULE:FREQ=YEARLY' : null,
    `SUMMARY:${davEscape(`${idate.label} — ${idate.display_name}`)}`,
    'END:VEVENT',
  ].filter(Boolean);
  return { uid, ics: wrapCalendar(comp, idate.label) };
}

/** Open reminder → VTODO with a due date. */
function buildReminderIcs(r, stamp) {
  const due = toUtcStamp(r.due_at);
  if (!due) return null;
  const uid = `kith-reminder-${r.id}`;
  const comp = [
    'BEGIN:VTODO',
    `UID:${uid}@kith`,
    `DTSTAMP:${stamp}`,
    `DUE:${due}`,
    `SUMMARY:${davEscape(`⏰ ${r.title}`)}`,
    r.description ? `DESCRIPTION:${davEscape(r.description)}` : null,
    'STATUS:NEEDS-ACTION',
    'END:VTODO',
  ].filter(Boolean);
  return { uid, ics: wrapCalendar(comp, r.title) };
}

// ============================================================================
// DAV HTTP client (node:http/https, any method — MKCOL/PROPFIND/PUT/DELETE)
// ============================================================================

function davRequest(method, path, { body, headers } = {}) {
  return new Promise((resolve, reject) => {
    let base;
    try {
      base = new URL(DAV_URL);
    } catch (err) {
      return reject(new Error(`invalid DAV_URL: ${err.message}`));
    }
    const isHttps = base.protocol === 'https:';
    const lib = isHttps ? https : http;
    const auth = 'Basic ' + Buffer.from(`${DAV_USER}:${DAV_PASS}`).toString('base64');
    const payload = body != null ? Buffer.from(body, 'utf8') : null;

    const req = lib.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port || (isHttps ? 443 : 80),
        method,
        path: (base.pathname === '/' ? '' : base.pathname) + path,
        headers: {
          Authorization: auth,
          ...(payload ? { 'Content-Length': payload.length } : {}),
          ...(headers || {}),
        },
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') })
        );
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('DAV request timeout')));
    if (payload) req.write(payload);
    req.end();
  });
}

/** Ensure a collection exists (MKCOL with resourcetype). Idempotent. */
async function ensureCollection(path, kind) {
  // Probe first — if it already exists, skip the MKCOL.
  try {
    const probe = await davRequest('PROPFIND', path + '/', {
      headers: { Depth: '0', 'Content-Type': 'application/xml' },
      body: '<?xml version="1.0"?><propfind xmlns="DAV:"><prop><resourcetype/></prop></propfind>',
    });
    if (probe.status === 207 || probe.status === 200) return true;
  } catch { /* fall through to create */ }

  // Extended MKCOL with the right resourcetype so the DAV server tags it as an
  // addressbook or calendar collection (RFC 5689).
  const xmlns =
    kind === 'addressbook'
      ? 'xmlns:C="urn:ietf:params:xml:ns:carddav"'
      : 'xmlns:C="urn:ietf:params:xml:ns:caldav"';
  const restype =
    kind === 'addressbook'
      ? '<C:addressbook/>'
      : '<C:calendar/>';
  const body =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<D:mkcol xmlns:D="DAV:" ${xmlns}>` +
    `<D:set><D:prop><D:resourcetype><D:collection/>${restype}</D:resourcetype>` +
    `<D:displayname>Kith ${kind}</D:displayname></D:prop></D:set></D:mkcol>`;
  const res = await davRequest('MKCOL', path + '/', {
    body,
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
  // 201 created; 405 = already exists (race); either is fine.
  if (res.status === 201 || res.status === 405) return true;
  throw new Error(`MKCOL ${path} failed: ${res.status} ${res.body.slice(0, 200)}`);
}

/** PUT a resource by UID. Returns true on 2xx. */
async function putResource(collectionPath, uid, ext, content, contentType) {
  const res = await davRequest('PUT', `${collectionPath}/${uid}.${ext}`, {
    body: content,
    headers: { 'Content-Type': contentType },
  });
  if (res.status >= 200 && res.status < 300) return true;
  throw new Error(`PUT ${uid}.${ext} failed: ${res.status} ${res.body.slice(0, 200)}`);
}

// ============================================================================
// Data loading (SFW only)
// ============================================================================

/** Load one SFW contact + satellites. Returns null if missing/spicy/deleted. */
async function loadContact(contactId) {
  const rows = await query(
    `SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL AND is_spicy = 0`,
    [contactId]
  );
  if (!rows.length) return null;
  const c = rows[0];
  const [emails, phones, addrs] = await Promise.all([
    query('SELECT label, email, is_primary FROM contact_emails WHERE contact_id = ?', [c.id]),
    query('SELECT label, phone, is_primary FROM contact_phones WHERE contact_id = ?', [c.id]),
    query(
      'SELECT label, street, city, state, zip, country, is_primary FROM contact_addresses WHERE contact_id = ?',
      [c.id]
    ),
  ]);
  return { c, emails, phones, addrs };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Push a single contact to the addressbook by UID. Never throws.
 * @param {number} contactId
 * @returns {Promise<{ok:boolean, action:string, reason?:string}>}
 */
async function syncContactToDav(contactId) {
  try {
    if (!DAV_SYNC_ENABLED) return { ok: false, action: 'skipped', reason: 'DAV_SYNC_ENABLED=false' };
    if (!DAV_URL || !DAV_PASS) return { ok: false, action: 'skipped', reason: 'DAV_URL/DAV_PASS not set' };
    const id = Number(contactId);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, action: 'skipped', reason: 'bad id' };

    const loaded = await loadContact(id);
    if (!loaded) {
      // Contact is gone or spicy → remove it from the addressbook if present.
      try {
        await davRequest('DELETE', `${ADDRESSBOOK_PATH}/kith-contact-${id}.vcf`);
      } catch { /* ignore */ }
      return { ok: true, action: 'deleted', reason: 'missing/spicy' };
    }

    await ensureCollection(ADDRESSBOOK_PATH, 'addressbook');
    const vcf = buildVCard(loaded.c, loaded.emails, loaded.phones, loaded.addrs);
    await putResource(ADDRESSBOOK_PATH, `kith-contact-${id}`, 'vcf', vcf, 'text/vcard; charset=utf-8');
    return { ok: true, action: 'pushed' };
  } catch (err) {
    console.error(`[davsync] syncContactToDav(${contactId}) failed:`, err.message);
    return { ok: false, action: 'error', reason: err.message };
  }
}

/**
 * Full push of all SFW contacts + calendar items. Never throws.
 * @returns {Promise<object>} summary counts
 */
async function syncAllToDav() {
  const summary = {
    ok: false,
    contacts: 0,
    events: 0,
    birthdays: 0,
    dates: 0,
    reminders: 0,
    errors: 0,
    skipped: false,
  };
  try {
    if (!DAV_SYNC_ENABLED) {
      console.log('[davsync] skipped: DAV_SYNC_ENABLED is not true');
      summary.skipped = true;
      return summary;
    }
    if (!DAV_URL || !DAV_PASS) {
      console.warn('[davsync] skipped: DAV_URL or DAV_PASS not configured');
      summary.skipped = true;
      return summary;
    }

    const stamp = nowStamp();

    // ---- Contacts (addressbook) --------------------------------------------
    await ensureCollection(ADDRESSBOOK_PATH, 'addressbook');
    const contacts = await query(
      `SELECT * FROM contacts WHERE deleted_at IS NULL AND is_spicy = 0`
    );
    // Batch satellite loads (avoid 3 queries per contact — audit L10).
    const satEmails = new Map();
    const satPhones = new Map();
    const satAddrs = new Map();
    if (contacts.length) {
      const ids = contacts.map((c) => c.id);
      const ph = ids.map(() => '?').join(',');
      const [allEmails, allPhones, allAddrs] = await Promise.all([
        query(`SELECT contact_id, label, email, is_primary FROM contact_emails WHERE contact_id IN (${ph})`, ids),
        query(`SELECT contact_id, label, phone, is_primary FROM contact_phones WHERE contact_id IN (${ph})`, ids),
        query(
          `SELECT contact_id, label, street, city, state, zip, country, is_primary FROM contact_addresses WHERE contact_id IN (${ph})`,
          ids
        ),
      ]);
      const groupBy = (rows, map) => {
        for (const r of rows) {
          if (!map.has(r.contact_id)) map.set(r.contact_id, []);
          map.get(r.contact_id).push(r);
        }
      };
      groupBy(allEmails, satEmails);
      groupBy(allPhones, satPhones);
      groupBy(allAddrs, satAddrs);
    }
    for (const c of contacts) {
      try {
        const vcf = buildVCard(c, satEmails.get(c.id) || [], satPhones.get(c.id) || [], satAddrs.get(c.id) || []);
        await putResource(ADDRESSBOOK_PATH, `kith-contact-${c.id}`, 'vcf', vcf, 'text/vcard; charset=utf-8');
        summary.contacts += 1;
      } catch (err) {
        summary.errors += 1;
        console.error(`[davsync] contact ${c.id} push failed:`, err.message);
      }
    }

    // ---- Calendar (events, birthdays, important_dates, reminders) ----------
    await ensureCollection(CALENDAR_PATH, 'calendar');

    const [events, birthdays, dates, reminders] = await Promise.all([
      // SFW events only (is_spicy excluded, cancelled excluded, has a start).
      query(
        `SELECT id, title, description, location, starts_at, ends_at FROM events
         WHERE deleted_at IS NULL AND is_spicy = 0 AND status != 'cancelled' AND starts_at IS NOT NULL`
      ),
      // Birthdays only from SFW, non-deleted contacts.
      query(
        `SELECT c.id, c.display_name, c.birthday FROM contacts c
         WHERE c.birthday IS NOT NULL AND c.deleted_at IS NULL AND c.is_spicy = 0`
      ),
      // Important dates joined to SFW, non-deleted contacts.
      query(
        `SELECT d.id, d.label, d.date, d.recurring, c.display_name FROM important_dates d
         JOIN contacts c ON c.id = d.contact_id
         WHERE c.deleted_at IS NULL AND c.is_spicy = 0`
      ),
      // Open (not completed, not deleted) reminders.
      query(
        `SELECT r.id, r.title, r.description, r.due_at FROM reminders r
         WHERE r.deleted_at IS NULL AND r.completed_at IS NULL AND r.due_at IS NOT NULL`
      ),
    ]);

    const pushIcs = async (built, counterKey) => {
      if (!built) return;
      try {
        await putResource(CALENDAR_PATH, built.uid, 'ics', built.ics, 'text/calendar; charset=utf-8');
        summary[counterKey] += 1;
      } catch (err) {
        summary.errors += 1;
        console.error(`[davsync] ${built.uid} push failed:`, err.message);
      }
    };

    for (const e of events) await pushIcs(buildEventIcs(e, stamp), 'events');
    for (const b of birthdays) await pushIcs(buildBirthdayIcs(b, stamp), 'birthdays');
    for (const d of dates) await pushIcs(buildDateIcs(d, stamp), 'dates');
    for (const r of reminders) await pushIcs(buildReminderIcs(r, stamp), 'reminders');

    // NOTE: deletion of removed calendar/contact UIDs on a full sync is NOT
    // performed here (no server-side diff of the remote collection). Deletes of
    // individual contacts are handled by syncContactToDav (DELETE on missing).
    // A future enhancement could PROPFIND the collection and DELETE orphans.

    summary.ok = summary.errors === 0;
    console.log(
      `[davsync] full push complete — contacts:${summary.contacts} events:${summary.events} ` +
      `birthdays:${summary.birthdays} dates:${summary.dates} reminders:${summary.reminders} ` +
      `errors:${summary.errors}`
    );
    return summary;
  } catch (err) {
    summary.errors += 1;
    console.error('[davsync] syncAllToDav failed:', err.message);
    return summary;
  }
}

module.exports = {
  syncAllToDav,
  syncContactToDav,
  // exported for tests / reuse
  _internal: {
    buildVCard,
    buildEventIcs,
    buildBirthdayIcs,
    buildDateIcs,
    buildReminderIcs,
    davEscape,
    foldLine,
  },
};
