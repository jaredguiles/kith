'use strict';

// Shared normalization helpers. All parsers emit records in the Normalized
// Import Format (SPEC §Data Import System).

/** Trim + collapse whitespace; empty → null. */
function cleanStr(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
}

/** Normalize a phone for matching: digits only, keep leading +. */
function normalizePhone(v) {
  if (!v) return null;
  const s = String(v).trim();
  const plus = s.startsWith('+') ? '+' : '';
  const digits = s.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return plus + digits;
}

function normalizeEmail(v) {
  const s = cleanStr(v);
  if (!s || !s.includes('@')) return null;
  return s.toLowerCase();
}

/** Accepts many date shapes → "YYYY-MM-DD" or null. */
function normalizeDate(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // MM/DD/YYYY
  if (m) return `${m[3]}-${String(m[1]).padStart(2, '0')}-${String(m[2]).padStart(2, '0')}`;
  m = s.match(/^(\d{8})$/); // vCard BDAY 19900415
  if (m) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  m = s.match(/^--(\d{2})-?(\d{2})$/); // vCard year-less --0415
  if (m) return `1900-${m[1]}-${m[2]}`;
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/** Unix seconds/millis or ISO → ISO timestamp string or null. */
function normalizeTimestamp(v) {
  if (!v && v !== 0) return null;
  if (typeof v === 'number') {
    const ms = v > 1e12 ? v : v * 1000;
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
  }
  const t = Date.parse(String(v));
  return isNaN(t) ? null : new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

/** Split a display name into first/last (best effort). */
function splitName(displayName) {
  const s = cleanStr(displayName);
  if (!s) return { first_name: null, last_name: null };
  const parts = s.split(' ');
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') };
}

/** Build a fully-shaped normalized record from partial data. */
function makeRecord(partial = {}) {
  const rec = {
    display_name: null,
    first_name: null,
    last_name: null,
    nickname: null,
    emails: [],       // [{label, email}]
    phones: [],       // [{label, phone}]
    birthday: null,
    location: null,
    bio: null,
    occupation: null,
    website: null,
    social_links: [], // [{platform, username, url}]
    messages: [],     // [{direction, content, sent_at}]
    media: [],        // [{type, source_url, local_path, caption, is_spicy}]
    spicy_data: null,
    source_id: null,
    ...partial,
  };
  // derive display name
  if (!rec.display_name) {
    rec.display_name = cleanStr([rec.first_name, rec.last_name].filter(Boolean).join(' '))
      || rec.nickname || rec.emails[0]?.email || rec.phones[0]?.phone || 'Unnamed';
  }
  if (!rec.first_name && !rec.last_name && rec.display_name !== 'Unnamed') {
    Object.assign(rec, splitName(rec.display_name));
  }
  // dedupe emails/phones
  const seenE = new Set();
  rec.emails = rec.emails.filter((e) => {
    const norm = normalizeEmail(e.email);
    if (!norm || seenE.has(norm)) return false;
    seenE.add(norm);
    e.email = norm;
    return true;
  });
  const seenP = new Set();
  rec.phones = rec.phones.filter((p) => {
    const norm = normalizePhone(p.phone);
    if (!norm || seenP.has(norm)) return false;
    seenP.add(norm);
    p.phone = norm;
    return true;
  });
  return rec;
}

module.exports = { cleanStr, normalizePhone, normalizeEmail, normalizeDate, normalizeTimestamp, splitName, makeRecord };
