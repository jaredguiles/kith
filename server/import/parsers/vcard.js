const fs = require('fs').promises;
const path = require('path');
const vcard4 = require('vcard4-parser');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse vCard files and return normalized records
 * @param {string} jobId - Import job ID
 * @param {string} filename - Original filename
 * @returns {Promise<Array>} Array of normalized records
 */
async function parse(jobId, filename) {
  try {
    // Read the file
    const filepath = path.join(MEDIA_PATH, 'imports', jobId.toString(), filename);
    const content = await fs.readFile(filepath, 'utf-8');

    // Parse vCard content
    const vcards = vcard4.parse(content);

    // Handle single vcard or array
    const vcardArray = Array.isArray(vcards) ? vcards : [vcards];

    // Normalize each vcard
    const records = vcardArray
      .filter(vcard => vcard) // Filter out null/undefined
      .map(vcard => normalizeVCard(vcard));

    console.log(`Parsed ${records.length} contacts from vcard file: ${filename}`);
    return records;
  } catch (error) {
    console.error(`Error parsing vcard file ${filename}:`, error);
    return [];
  }
}

/**
 * Normalize a single vCard object
 * @param {object} vcard - Parsed vCard object
 * @returns {object} Normalized record
 */
function normalizeVCard(vcard) {
  const record = {};

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

  // Social links (if stored as URLs with types)
  record.social_links = [];

  return record;
}

module.exports = {
  parse
};
