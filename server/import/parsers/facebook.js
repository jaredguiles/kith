const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse Facebook export ZIP file and return normalized records
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

    // Look for contact/friends data in typical Facebook export structure
    for (const entry of entries) {
      // Skip directories
      if (entry.isDirectory) continue;

      const entryPath = entry.entryName.toLowerCase();

      // Look for contacts/friends JSON files
      if (
        entryPath.includes('friends') ||
        entryPath.includes('contacts') ||
        entryPath.includes('connections')
      ) {
        if (entryPath.endsWith('.json')) {
          try {
            const content = entry.getData().toString('utf-8');
            const data = JSON.parse(content);

            // Handle various data structures
            if (Array.isArray(data)) {
              records.push(...data.map(item => normalizeRecord(item)));
            } else if (data.friends && Array.isArray(data.friends)) {
              records.push(...data.friends.map(item => normalizeRecord(item)));
            } else if (data.contacts && Array.isArray(data.contacts)) {
              records.push(...data.contacts.map(item => normalizeRecord(item)));
            } else if (typeof data === 'object') {
              records.push(normalizeRecord(data));
            }
          } catch (error) {
            console.warn(`Error parsing Facebook JSON file ${entry.entryName}:`, error.message);
          }
        }
      }
    }

    console.log(`Parsed ${records.length} contacts from Facebook export: ${filename}`);
    return records.filter(r => r); // Filter out any null records
  } catch (error) {
    console.error(`Error parsing Facebook export ${filename}:`, error);
    return [];
  }
}

/**
 * Normalize a Facebook record
 * @param {object} fbRecord - Facebook data record
 * @returns {object} Normalized record
 */
function normalizeRecord(fbRecord) {
  if (!fbRecord || typeof fbRecord !== 'object') {
    return null;
  }

  const record = {};

  // Name handling - Facebook may provide name or first_name/last_name
  if (fbRecord.name) {
    record.display_name = fbRecord.name;
  }
  if (fbRecord.first_name) {
    record.first_name = fbRecord.first_name;
  }
  if (fbRecord.last_name) {
    record.last_name = fbRecord.last_name;
  }

  // Build display name if not provided
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
  if (fbRecord.email) {
    record.emails.push({
      value: fbRecord.email,
      type: 'personal'
    });
  }

  // Phone
  record.phones = [];
  if (fbRecord.phone) {
    record.phones.push({
      value: fbRecord.phone,
      type: 'mobile'
    });
  }
  if (fbRecord.mobile) {
    record.phones.push({
      value: fbRecord.mobile,
      type: 'mobile'
    });
  }

  // Location/address
  if (fbRecord.location) {
    const parts = [];
    if (fbRecord.location.name) {
      record.location = fbRecord.location.name;
    } else if (typeof fbRecord.location === 'string') {
      record.location = fbRecord.location;
    }
  }

  // Birthday
  if (fbRecord.birthday) {
    record.birthday = fbRecord.birthday;
  }

  // Website
  if (fbRecord.website) {
    record.website = fbRecord.website;
  }

  // Bio/about
  if (fbRecord.bio) {
    record.bio = fbRecord.bio;
  }
  if (fbRecord.about) {
    record.bio = fbRecord.about;
  }

  // Occupation/work
  if (fbRecord.work) {
    if (typeof fbRecord.work === 'string') {
      record.occupation = fbRecord.work;
    } else if (fbRecord.work.position) {
      record.occupation = fbRecord.work.position;
    } else if (fbRecord.work[0] && fbRecord.work[0].position) {
      record.occupation = fbRecord.work[0].position;
    }
  }

  // Social links - Facebook profile
  record.social_links = [];
  if (fbRecord.id) {
    record.social_links.push({
      platform: 'facebook',
      username: fbRecord.id,
      profile_url: `https://facebook.com/${fbRecord.id}`
    });
  }

  // Media
  record.media = [];
  if (fbRecord.picture && typeof fbRecord.picture === 'string') {
    record.media.push({
      type: 'photo',
      url: fbRecord.picture,
      timestamp: null
    });
  }

  return record;
}

module.exports = {
  parse
};
