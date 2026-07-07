'use strict';

// CSV parser with column mapping. When no mapping is provided, headers are
// auto-detected against common column names (Monica, Google CSV, generic).

const { parse: csvParse } = require('csv-parse/sync');
const { makeRecord, cleanStr } = require('../normalizer');

// header → normalized field auto-detection (lowercased, stripped)
const AUTO_MAP = {
  'first name': 'first_name', firstname: 'first_name', 'given name': 'first_name', first: 'first_name',
  'last name': 'last_name', lastname: 'last_name', 'family name': 'last_name', surname: 'last_name', last: 'last_name',
  name: 'display_name', 'full name': 'display_name', 'display name': 'display_name',
  nickname: 'nickname', 'nick name': 'nickname',
  email: 'email', 'email address': 'email', 'e-mail': 'email', 'e-mail address': 'email',
  'e-mail 1 - value': 'email', 'email 1 - value': 'email',
  phone: 'phone', 'phone number': 'phone', mobile: 'phone', 'phone 1 - value': 'phone', telephone: 'phone',
  birthday: 'birthday', birthdate: 'birthday', 'date of birth': 'birthday', dob: 'birthday',
  location: 'location', city: 'location', address: 'location', 'address 1 - formatted': 'location',
  bio: 'bio', notes: 'bio', note: 'bio', description: 'bio',
  occupation: 'occupation', 'job title': 'occupation', job: 'occupation', 'organization 1 - title': 'occupation',
  company: 'company', organization: 'company', 'organization 1 - name': 'company',
  website: 'website', url: 'website', 'website 1 - value': 'website',
  gender: 'sex',
  instagram: 'social_instagram', twitter: 'social_twitter', facebook: 'social_facebook',
  linkedin: 'social_linkedin', snapchat: 'social_snapchat',
};

function normHeader(h) {
  return String(h || '').toLowerCase().replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse CSV → { records, errors, headers }.
 * mapping (optional): { csvHeader: normalizedField } from the column-mapping UI.
 */
function parseCsv(input, mapping = null) {
  const text = Buffer.isBuffer(input) ? input.toString('utf8') : String(input);
  const errors = [];
  let rows;
  try {
    rows = csvParse(text, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      bom: true,
      trim: true,
    });
  } catch (err) {
    return { records: [], errors: [`CSV parse failed: ${err.message}`], headers: [] };
  }
  if (!rows.length) return { records: [], errors: ['CSV contains no data rows'], headers: [] };

  const headers = Object.keys(rows[0]);
  const effectiveMap = {};
  if (mapping && typeof mapping === 'object' && Object.keys(mapping).length) {
    for (const [header, field] of Object.entries(mapping)) {
      if (field) effectiveMap[header] = field;
    }
  } else {
    for (const h of headers) {
      const auto = AUTO_MAP[normHeader(h)];
      if (auto) effectiveMap[h] = auto;
    }
  }

  if (!Object.keys(effectiveMap).length) {
    return { records: [], errors: ['No recognizable columns — provide a column mapping'], headers };
  }

  const records = [];
  rows.forEach((row, i) => {
    try {
      const rec = { emails: [], phones: [], social_links: [] };
      for (const [header, field] of Object.entries(effectiveMap)) {
        const value = cleanStr(row[header]);
        if (!value) continue;
        if (field === 'email') rec.emails.push({ label: 'personal', email: value });
        else if (field === 'phone') rec.phones.push({ label: 'mobile', phone: value });
        else if (field.startsWith('social_')) {
          rec.social_links.push({ platform: field.slice(7), username: value.replace(/^@/, ''), url: null });
        } else if (field === 'birthday') {
          const { normalizeDate } = require('../normalizer');
          rec.birthday = normalizeDate(value);
        } else {
          rec[field] = value;
        }
      }
      const made = makeRecord(rec);
      if (made.display_name !== 'Unnamed' || made.emails.length || made.phones.length) records.push(made);
    } catch (err) {
      errors.push(`Row ${i + 2}: ${err.message}`);
    }
  });

  return { records, errors, headers };
}

module.exports = { parse: parseCsv, extensions: ['.csv'], AUTO_MAP };
