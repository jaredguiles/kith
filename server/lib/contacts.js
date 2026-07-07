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
    c.display_name, c.first_name, c.last_name, c.nickname,
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
  'display_name', 'first_name', 'last_name', 'nickname', 'email', 'phone',
  'birthday', 'age', 'sex', 'pronouns', 'orientation', 'relationship_status',
  'location', 'photo_url', 'bio', 'occupation', 'company', 'website',
  'zodiac_sign', 'languages', 'ethnicity', 'how_we_met', 'met_date', 'rating',
  'relationship_type', 'is_favorite', 'is_spicy', 'is_anonymous', 'notes_text',
];

module.exports = {
  zodiacFromBirthday,
  buildDisplayName,
  rebuildSearchIndex,
  rebuildSearchIndexAsync,
  filterContactByScope,
  CONTACT_FIELDS,
  BASIC_FIELDS,
};
