const fs = require('fs').promises;
const path = require('path');
const vcardParser = require('vcard-parser');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse vCard files and return normalized records
 */
async function parse(jobId, filename) {
  try {
    const filepath = path.join(MEDIA_PATH, 'imports', jobId.toString(), filename);
    const content = await fs.readFile(filepath, 'utf-8');

    // Split multi-contact vcf files on BEGIN:VCARD boundaries
    const vcardBlocks = content.split(/(?=BEGIN:VCARD)/i).filter(b => b.trim());

    const records = [];
    for (const block of vcardBlocks) {
      try {
        const parsed = vcardParser.parse(block);
        if (parsed) {
          records.push(normalizeVCard(parsed));
        }
      } catch (e) {
        // Skip malformed individual cards
      }
    }

    console.log(`[vcard] Parsed ${records.length} contacts from: ${filename}`);
    return records;
  } catch (error) {
    console.error(`[vcard] Error parsing ${filename}:`, error.message);
    return [];
  }
}

/**
 * Normalize a parsed vCard object to the Kith import format
 */
function normalizeVCard(vcard) {
  const record = {
    display_name: null,
    first_name: null,
    last_name: null,
    nickname: null,
    emails: [],
    phones: [],
    birthday: null,
    location: null,
    bio: null,
    occupation: null,
    website: null,
    social_links: [],
    messages: [],
    media: []
  };

  // FN (formatted name)
  if (vcard.fn && vcard.fn[0]) {
    record.display_name = vcard.fn[0].value || null;
  }

  // N (structured name)
  if (vcard.n && vcard.n[0] && vcard.n[0].value) {
    const parts = vcard.n[0].value.split(';');
    if (parts[0]) record.last_name = parts[0].trim() || null;
    if (parts[1]) record.first_name = parts[1].trim() || null;
  }

  // Build display_name if not set
  if (!record.display_name && (record.first_name || record.last_name)) {
    record.display_name = [record.first_name, record.last_name].filter(Boolean).join(' ');
  }

  // NICKNAME
  if (vcard.nickname && vcard.nickname[0]) {
    record.nickname = vcard.nickname[0].value || null;
  }

  // BDAY
  if (vcard.bday && vcard.bday[0]) {
    record.birthday = vcard.bday[0].value || null;
  }

  // EMAIL
  if (vcard.email) {
    for (const entry of vcard.email) {
      if (entry.value) {
        const label = (entry.meta && entry.meta.type) ? entry.meta.type[0].toLowerCase() : 'personal';
        record.emails.push({ label, email: entry.value });
      }
    }
  }

  // TEL
  if (vcard.tel) {
    for (const entry of vcard.tel) {
      if (entry.value) {
        const label = (entry.meta && entry.meta.type) ? entry.meta.type[0].toLowerCase() : 'mobile';
        record.phones.push({ label, phone: entry.value });
      }
    }
  }

  // ADR (address → location string)
  if (vcard.adr && vcard.adr[0] && vcard.adr[0].value) {
    const parts = vcard.adr[0].value.split(';').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) {
      record.location = parts.join(', ');
    }
  }

  // ORG
  if (vcard.org && vcard.org[0]) {
    record.occupation = vcard.org[0].value || null;
  }

  // TITLE
  if (vcard.title && vcard.title[0] && !record.occupation) {
    record.occupation = vcard.title[0].value || null;
  }

  // NOTE → bio
  if (vcard.note && vcard.note[0]) {
    record.bio = vcard.note[0].value || null;
  }

  // URL → website
  if (vcard.url && vcard.url[0]) {
    record.website = vcard.url[0].value || null;
  }

  return record;
}

module.exports = { parse };
