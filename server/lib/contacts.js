'use strict';

// Contact helpers: display_name build, zodiac calc, search-index rebuild,
// share-scope field filtering.

const { query } = require('../database/connection');

const ZODIAC = [
  ['Capricorn', 1, 19], ['Aquarius', 2, 18], ['Pisces', 3, 20], ['Aries', 4, 19],
  ['Taurus', 5, 20], ['Gemini', 6, 20], ['Cancer', 7, 22], ['Leo', 8, 22],
  ['Virgo', 9, 22], ['Libra', 10, 22], ['Scorpio', 11, 21], ['Sagittarius', 12, 21],
  ['Capricorn', 12, 31],
];

function zodiacFromBirthday(birthday) {
  if (!birthday) return null;
  const m = String(birthday).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const month = Number(m[2]), day = Number(m[3]);
  for (const [sign, mm, dd] of ZODIAC) {
    if (month < mm || (month === mm && day <= dd)) return sign;
  }
  return 'Capricorn';
}

function buildDisplayName({ display_name, first_name, last_name, nickname, email, phone }) {
  if (display_name && String(display_name).trim()) return String(display_name).trim();
  const full = [first_name, last_name].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (nickname) return String(nickname).trim();
  if (email) return String(email).trim();
  if (phone) return String(phone).trim();
  return 'Unnamed';
}

/**
 * Rebuild contact_search_index for a contact. Cleartext SFW fields ONLY —
 * never spicy content (§7.E). Fire-and-forget safe; callers may await.
 */
async function rebuildSearchIndex(contactId) {
  const contacts = await query('SELECT * FROM contacts WHERE id = ?', [contactId]);
  if (contacts.length === 0) return;
  const c = contacts[0];
  const [emails, phones, socials, tags, notes] = await Promise.all([
    query('SELECT email FROM contact_emails WHERE contact_id = ?', [contactId]),
    query('SELECT phone FROM contact_phones WHERE contact_id = ?', [contactId]),
    query('SELECT platform, username FROM social_links WHERE contact_id = ?', [contactId]),
    query('SELECT t.name FROM tags t JOIN contact_tags ct ON ct.tag_id = t.id WHERE ct.contact_id = ?', [contactId]),
    query('SELECT content FROM notes WHERE contact_id = ? AND is_spicy = 0 AND deleted_at IS NULL', [contactId]),
  ]);

  const parts = [
    c.display_name, c.first_name, c.middle_name, c.last_name, c.nickname,
    c.email, c.phone, c.bio, c.location, c.occupation, c.company,
    c.notes_text,
    ...emails.map((r) => r.email),
    ...phones.map((r) => r.phone),
    ...socials.flatMap((r) => [r.platform, r.username]),
    ...tags.map((r) => r.name),
    ...notes.map((r) => r.content),
  ].filter(Boolean);

  const text = parts.join(' ').slice(0, 60000);
  await query(
    'INSERT INTO contact_search_index (contact_id, search_text) VALUES (?, ?) ON DUPLICATE KEY UPDATE search_text = VALUES(search_text)',
    [contactId, text]
  );
}

function rebuildSearchIndexAsync(contactId) {
  rebuildSearchIndex(contactId).catch((err) => console.error('[search-index] rebuild failed:', err.message));
}

/**
 * Mark a contact as "contacted" for keep-in-touch tracking. Moves
 * last_contacted_at forward only (GREATEST) so backdated interactions never
 * regress it. Fire-and-forget safe — never throws.
 * @param {number} contactId
 * @param {string|Date} [when] optional timestamp; defaults to NOW()
 */
async function touchContact(contactId, when) {
  try {
    const id = Number(contactId);
    if (!Number.isInteger(id) || id <= 0) return;
    if (when != null) {
      const d = when instanceof Date ? when : new Date(when);
      if (Number.isNaN(d.getTime())) return;
      const ts = d.toISOString().slice(0, 19).replace('T', ' ');
      await query(
        "UPDATE contacts SET last_contacted_at = GREATEST(COALESCE(last_contacted_at, '1970-01-01'), ?) WHERE id = ?",
        [ts, id]
      );
    } else {
      await query(
        "UPDATE contacts SET last_contacted_at = GREATEST(COALESCE(last_contacted_at, '1970-01-01'), NOW()) WHERE id = ?",
        [id]
      );
    }
  } catch (err) {
    console.error('[touch-contact] failed:', err.message);
  }
}

/**
 * Cheap date/datetime validation for user-supplied date strings.
 * Accepts `YYYY-MM-DD` optionally followed by a time part
 * (`THH:MM[:SS[.mmm]][Z]` or ` HH:MM[:SS]`). Returns false for anything
 * that doesn't match the shape or doesn't parse to a real date
 * (e.g. 2024-02-31). Empty/null handling is the caller's concern.
 */
function isValidDate(value) {
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?Z?)?$/);
  if (!m) return false;
  const d = new Date(s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return false;
  // Guard JS Date rollover (2024-02-31 → Mar 2): components must round-trip.
  const day = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return day.getUTCFullYear() === Number(m[1]) &&
         day.getUTCMonth() + 1 === Number(m[2]) &&
         day.getUTCDate() === Number(m[3]);
}

// Fields a `basic`-scope share recipient may see (SPEC §Sharing)
const BASIC_FIELDS = ['id', 'display_name', 'first_name', 'last_name', 'email', 'phone', 'photo_url', 'is_favorite', 'created_at', 'updated_at'];

/**
 * Filter a contact row by share scope for a recipient. `full` strips nothing
 * except spicy signal handled elsewhere; `basic` keeps identity fields only.
 */
function filterContactByScope(contact, scope) {
  if (!scope || scope === 'full' || scope === 'full_spicy') return contact;
  const out = {};
  for (const f of BASIC_FIELDS) out[f] = contact[f];
  out.share_scope = scope;
  return out;
}

// Editable contact columns (whitelist — never accept arbitrary keys)
const CONTACT_FIELDS = [
  'display_name', 'first_name', 'middle_name', 'last_name', 'nickname', 'maiden_name', 'email', 'phone',
  'birthday', 'place_of_birth', 'hometown', 'is_deceased', 'date_of_death', 'place_of_death',
  'age', 'sex', 'gender_identity', 'pronouns', 'orientation', 'relationship_status',
  'location', 'photo_url', 'bio', 'occupation', 'education', 'company', 'website',
  'zodiac_sign', 'languages', 'ethnicity', 'religion', 'nationality', 'how_we_met', 'met_date', 'rating',
  'relationship_type', 'is_favorite', 'is_spicy', 'is_anonymous', 'notes_text',
  'keep_in_touch_days',
];

module.exports = {
  zodiacFromBirthday,
  buildDisplayName,
  rebuildSearchIndex,
  rebuildSearchIndexAsync,
  touchContact,
  isValidDate,
  filterContactByScope,
  CONTACT_FIELDS,
  BASIC_FIELDS,
};
