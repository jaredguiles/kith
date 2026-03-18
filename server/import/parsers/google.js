const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const vcard4 = require('vcard4-parser');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse Google Takeout ZIP file and return normalized records
 * @param {string} jobId - Import job ID
 * @param {string} filename - Original filename
 * @returns {Promise<Array>} Array of normalized records
 */
async function parse(jobId, filename) {
  try {
    // Read the ZIP file
    const filepath = path.join(MEDIA_PATH, 'imports', jobId.toString(), filename);
    const zipBuffer = await fs.readFile(filepath);

    // Extract ZIP
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const records = [];

    // Google Takeout structure: Contacts/contacts.vcf or Contacts/*.vcf
    for (const entry of entries) {
      // Skip directories
      if (entry.isDirectory) continue;

      const entryPath = entry.entryName.toLowerCase();

      // Look for vCard files
      if (entryPath.includes('contacts') && entryPath.endsWith('.vcf')) {
        try {
          const content = entry.getData().toString('utf-8');

          // Parse vCard content
          const vcards = vcard4.parse(content);
          const vcardArray = Array.isArray(vcards) ? vcards : [vcards];

          for (const vcard of vcardArray) {
            if (vcard) {
              const record = normalizeVCard(vcard);
              if (record) {
                records.push(record);
              }
            }
          }
        } catch (error) {
          console.warn(`Error parsing Google vCard file ${entry.entryName}:`, error.message);
        }
      }

      // Look for JSON contacts files (some Takeouts include JSON)
      if (entryPath.includes('contacts') && entryPath.endsWith('.json')) {
        try {
          const content = entry.getData().toString('utf-8');
          const data = JSON.parse(content);

          const items = Array.isArray(data) ? data : (data.contacts || [data]);

          for (const item of items) {
            const record = normalizeJsonRecord(item);
            if (record) {
              records.push(record);
            }
          }
        } catch (error) {
          console.warn(`Error parsing Google JSON file ${entry.entryName}:`, error.message);
        }
      }
    }

    console.log(`Parsed ${records.length} contacts from Google Takeout: ${filename}`);
    return records;
  } catch (error) {
    console.error(`Error parsing Google Takeout ${filename}:`, error);
    return [];
  }
}

/**
 * Normalize a vCard from Google Takeout
 * @param {object} vcard - Parsed vCard object
 * @returns {object} Normalized record
 */
function normalizeVCard(vcard) {
  const record = {};

  try {
    // Name handling
    if (vcard.fn) {
      record.display_name = vcard.fn();
    } else if (vcard.n) {
      const n = vcard.n();
      const parts = [];
      if (n.givenName) {
        record.first_name = n.givenName;
        parts.push(n.givenName);
      }
      if (n.familyName) {
        record.last_name = n.familyName;
        parts.push(n.familyName);
      }
      if (parts.length > 0) {
        record.display_name = parts.join(' ');
      }
    }

    // Nickname
    if (vcard.nickname) {
      const nickname = vcard.nickname();
      if (nickname) {
        record.nickname = nickname;
      }
    }

    // Birthday
    if (vcard.bday) {
      const bday = vcard.bday();
      if (bday) {
        record.birthday = bday;
      }
    }

    // Email addresses
    record.emails = [];
    if (vcard.email) {
      const emails = Array.isArray(vcard.email) ? vcard.email : [vcard.email];
      for (const emailFunc of emails) {
        try {
          const email = emailFunc();
          if (email && email.value) {
            record.emails.push({
              value: email.value,
              type: email.type ? email.type.join(',') : 'personal'
            });
          }
        } catch (e) {
          // Skip malformed emails
        }
      }
    }

    // Phone numbers
    record.phones = [];
    if (vcard.tel) {
      const phones = Array.isArray(vcard.tel) ? vcard.tel : [vcard.tel];
      for (const phoneFunc of phones) {
        try {
          const phone = phoneFunc();
          if (phone && phone.value) {
            record.phones.push({
              value: phone.value,
              type: phone.type ? phone.type.join(',') : 'voice'
            });
          }
        } catch (e) {
          // Skip malformed phones
        }
      }
    }

    // Address (location)
    if (vcard.adr) {
      try {
        const adr = Array.isArray(vcard.adr) ? vcard.adr[0] : vcard.adr;
        const address = adr();
        const parts = [];

        if (address.streetAddress) parts.push(address.streetAddress);
        if (address.locality) parts.push(address.locality);
        if (address.region) parts.push(address.region);
        if (address.postalCode) parts.push(address.postalCode);
        if (address.country) parts.push(address.country);

        if (parts.length > 0) {
          record.location = parts.join(', ');
        }
      } catch (e) {
        // Skip malformed addresses
      }
    }

    // Organization (occupation)
    if (vcard.org) {
      try {
        const org = vcard.org();
        if (org && org[0]) {
          record.occupation = org[0];
        }
      } catch (e) {
        // Skip malformed org
      }
    }

    // Title
    if (vcard.title) {
      try {
        const title = vcard.title();
        if (title && !record.occupation) {
          record.occupation = title;
        }
      } catch (e) {
        // Skip malformed title
      }
    }

    // Note (bio)
    if (vcard.note) {
      try {
        const note = vcard.note();
        if (note) {
          record.bio = note;
        }
      } catch (e) {
        // Skip malformed note
      }
    }

    // URL (website)
    if (vcard.url) {
      try {
        const url = Array.isArray(vcard.url) ? vcard.url[0] : vcard.url;
        const urlValue = url();
        if (urlValue && urlValue.value) {
          record.website = urlValue.value;
        }
      } catch (e) {
        // Skip malformed URL
      }
    }

    // Photo (media)
    record.media = [];
    if (vcard.photo) {
      try {
        const photos = Array.isArray(vcard.photo) ? vcard.photo : [vcard.photo];
        for (const photoFunc of photos) {
          const photo = photoFunc();
          if (photo && photo.value) {
            record.media.push({
              type: 'photo',
              url: photo.value,
              timestamp: null
            });
          }
        }
      } catch (e) {
        // Skip malformed photos
      }
    }

    // Social links
    record.social_links = [];

    return record;
  } catch (error) {
    console.warn('Error normalizing vCard:', error.message);
    return null;
  }
}

/**
 * Normalize a JSON contact record from Google
 * @param {object} jsonRecord - JSON contact data
 * @returns {object} Normalized record
 */
function normalizeJsonRecord(jsonRecord) {
  if (!jsonRecord || typeof jsonRecord !== 'object') {
    return null;
  }

  const record = {};

  // Name handling
  if (jsonRecord.name) {
    record.display_name = jsonRecord.name;
  }
  if (jsonRecord.given_name) {
    record.first_name = jsonRecord.given_name;
  }
  if (jsonRecord.family_name) {
    record.last_name = jsonRecord.family_name;
  }

  // Build display name
  if (!record.display_name) {
    const parts = [];
    if (record.first_name) parts.push(record.first_name);
    if (record.last_name) parts.push(record.last_name);
    if (parts.length > 0) {
      record.display_name = parts.join(' ');
    }
  }

  // Email
  record.emails = [];
  if (jsonRecord.email) {
    const emails = Array.isArray(jsonRecord.email) ? jsonRecord.email : [jsonRecord.email];
    for (const email of emails) {
      if (typeof email === 'string') {
        record.emails.push({ value: email, type: 'personal' });
      } else if (email.value) {
        record.emails.push({ value: email.value, type: email.type || 'personal' });
      }
    }
  }

  // Phone
  record.phones = [];
  if (jsonRecord.phone) {
    const phones = Array.isArray(jsonRecord.phone) ? jsonRecord.phone : [jsonRecord.phone];
    for (const phone of phones) {
      if (typeof phone === 'string') {
        record.phones.push({ value: phone, type: 'mobile' });
      } else if (phone.value) {
        record.phones.push({ value: phone.value, type: phone.type || 'mobile' });
      }
    }
  }

  // Location
  if (jsonRecord.address || jsonRecord.location) {
    record.location = jsonRecord.address || jsonRecord.location;
  }

  // Birthday
  if (jsonRecord.birthday || jsonRecord.birth_date) {
    record.birthday = jsonRecord.birthday || jsonRecord.birth_date;
  }

  // Bio
  if (jsonRecord.bio || jsonRecord.notes) {
    record.bio = jsonRecord.bio || jsonRecord.notes;
  }

  // Occupation
  if (jsonRecord.occupation || jsonRecord.job_title) {
    record.occupation = jsonRecord.occupation || jsonRecord.job_title;
  }

  // Website
  if (jsonRecord.website || jsonRecord.url) {
    record.website = jsonRecord.website || jsonRecord.url;
  }

  // Social links
  record.social_links = [];
  if (jsonRecord.social_links && Array.isArray(jsonRecord.social_links)) {
    record.social_links = jsonRecord.social_links.map(l => ({
      platform: l.platform || '',
      username: l.username || '',
      profile_url: l.profile_url || l.url || ''
    })).filter(l => l.platform && l.username);
  }

  // Media
  record.media = [];
  if (jsonRecord.photo || jsonRecord.picture) {
    record.media.push({
      type: 'photo',
      url: jsonRecord.photo || jsonRecord.picture,
      timestamp: null
    });
  }

  return record;
}

module.exports = {
  parse
};
