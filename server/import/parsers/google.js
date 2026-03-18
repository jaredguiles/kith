const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const vcardParser = require('vcard-parser');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse Google Takeout ZIP file and return normalized records
 */
async function parse(jobId, filename) {
  try {
    const filepath = path.join(MEDIA_PATH, 'imports', jobId.toString(), filename);
    const zipBuffer = await fs.readFile(filepath);

    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const records = [];

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const entryPath = entry.entryName.toLowerCase();

      // vCard files
      if (entryPath.includes('contacts') && entryPath.endsWith('.vcf')) {
        try {
          const content = entry.getData().toString('utf-8');
          // Split multi-contact vcf on BEGIN:VCARD boundaries
          const vcardBlocks = content.split(/(?=BEGIN:VCARD)/i).filter(b => b.trim());
          for (const block of vcardBlocks) {
            try {
              const parsed = vcardParser.parse(block);
              if (parsed) {
                const record = normalizeVCard(parsed);
                if (record && record.display_name) records.push(record);
              }
            } catch (e) { /* skip malformed card */ }
          }
        } catch (error) {
          console.warn(`[google] Error parsing vCard ${entry.entryName}:`, error.message);
        }
      }

      // JSON contacts files (some Takeouts include JSON)
      if (entryPath.includes('contacts') && entryPath.endsWith('.json')) {
        try {
          const content = entry.getData().toString('utf-8');
          const data = JSON.parse(content);
          const items = Array.isArray(data) ? data : (data.contacts || [data]);
          for (const item of items) {
            const record = normalizeJsonRecord(item);
            if (record && record.display_name) records.push(record);
          }
        } catch (error) {
          console.warn(`[google] Error parsing JSON ${entry.entryName}:`, error.message);
        }
      }
    }

    console.log(`[google] Parsed ${records.length} contacts from: ${filename}`);
    return records;
  } catch (error) {
    console.error(`[google] Error parsing ${filename}:`, error.message);
    return [];
  }
}

/**
 * Normalize a parsed vCard object (vcard-parser format)
 */
function normalizeVCard(vcard) {
  const record = {
    display_name: null, first_name: null, last_name: null, nickname: null,
    emails: [], phones: [], birthday: null, location: null, bio: null,
    occupation: null, website: null, social_links: [], messages: [], media: []
  };

  try {
    if (vcard.fn && vcard.fn[0]) record.display_name = vcard.fn[0].value || null;

    if (vcard.n && vcard.n[0] && vcard.n[0].value) {
      const parts = vcard.n[0].value.split(';');
      if (parts[0]) record.last_name = parts[0].trim() || null;
      if (parts[1]) record.first_name = parts[1].trim() || null;
    }

    if (!record.display_name && (record.first_name || record.last_name)) {
      record.display_name = [record.first_name, record.last_name].filter(Boolean).join(' ');
    }

    if (vcard.nickname && vcard.nickname[0]) record.nickname = vcard.nickname[0].value || null;
    if (vcard.bday && vcard.bday[0]) record.birthday = vcard.bday[0].value || null;

    if (vcard.email) {
      for (const entry of vcard.email) {
        if (entry.value) {
          const label = (entry.meta && entry.meta.type) ? entry.meta.type[0].toLowerCase() : 'personal';
          record.emails.push({ label, email: entry.value });
        }
      }
    }

    if (vcard.tel) {
      for (const entry of vcard.tel) {
        if (entry.value) {
          const label = (entry.meta && entry.meta.type) ? entry.meta.type[0].toLowerCase() : 'mobile';
          record.phones.push({ label, phone: entry.value });
        }
      }
    }

    if (vcard.adr && vcard.adr[0] && vcard.adr[0].value) {
      const parts = vcard.adr[0].value.split(';').map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) record.location = parts.join(', ');
    }

    if (vcard.org && vcard.org[0]) record.occupation = vcard.org[0].value || null;
    if (vcard.title && vcard.title[0] && !record.occupation) record.occupation = vcard.title[0].value || null;
    if (vcard.note && vcard.note[0]) record.bio = vcard.note[0].value || null;
    if (vcard.url && vcard.url[0]) record.website = vcard.url[0].value || null;

    return record;
  } catch (error) {
    console.warn('[google] Error normalizing vCard:', error.message);
    return null;
  }
}

/**
 * Normalize a JSON contact record from Google
 */
function normalizeJsonRecord(item) {
  if (!item || typeof item !== 'object') return null;

  const record = {
    display_name: null, first_name: null, last_name: null, nickname: null,
    emails: [], phones: [], birthday: null, location: null, bio: null,
    occupation: null, website: null, social_links: [], messages: [], media: []
  };

  record.display_name = item.name || item.displayName || null;
  record.first_name = item.given_name || item.givenName || null;
  record.last_name = item.family_name || item.familyName || null;

  if (!record.display_name && (record.first_name || record.last_name)) {
    record.display_name = [record.first_name, record.last_name].filter(Boolean).join(' ');
  }

  if (item.email) {
    const emails = Array.isArray(item.email) ? item.email : [item.email];
    for (const e of emails) {
      if (typeof e === 'string') record.emails.push({ label: 'personal', email: e });
      else if (e.value) record.emails.push({ label: e.type || 'personal', email: e.value });
    }
  }

  if (item.phone) {
    const phones = Array.isArray(item.phone) ? item.phone : [item.phone];
    for (const p of phones) {
      if (typeof p === 'string') record.phones.push({ label: 'mobile', phone: p });
      else if (p.value) record.phones.push({ label: p.type || 'mobile', phone: p.value });
    }
  }

  record.location = item.address || item.location || null;
  record.birthday = item.birthday || item.birth_date || null;
  record.bio = item.bio || item.notes || null;
  record.occupation = item.occupation || item.job_title || null;
  record.website = item.website || item.url || null;

  return record;
}

module.exports = { parse };
