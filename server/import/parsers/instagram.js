const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse Instagram export ZIP file and return normalized records
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
    const seenIds = new Set();

    // Look for followers/following data
    for (const entry of entries) {
      // Skip directories
      if (entry.isDirectory) continue;

      const entryPath = entry.entryName.toLowerCase();

      // Look for followers/following JSON files
      if (entryPath.includes('followers') || entryPath.includes('following')) {
        if (entryPath.endsWith('.json')) {
          try {
            const content = entry.getData().toString('utf-8');
            const data = JSON.parse(content);

            // Instagram exports followers/following as arrays
            const items = Array.isArray(data) ? data : [data];

            for (const item of items) {
              const record = normalizeRecord(item);
              if (record && record.display_name) {
                // Deduplicate by username
                const id = item.username || record.display_name;
                if (!seenIds.has(id)) {
                  records.push(record);
                  seenIds.add(id);
                }
              }
            }
          } catch (error) {
            console.warn(`Error parsing Instagram JSON file ${entry.entryName}:`, error.message);
          }
        }
      }

      // Look for DMs/messages
      if (entryPath.includes('messages') && entryPath.endsWith('.json')) {
        try {
          const content = entry.getData().toString('utf-8');
          const data = JSON.parse(content);

          // Extract participant information from messages
          if (data.conversations && Array.isArray(data.conversations)) {
            for (const conversation of data.conversations) {
              if (conversation.participants && Array.isArray(conversation.participants)) {
                for (const participant of conversation.participants) {
                  const record = normalizeRecord(participant);
                  if (record && record.display_name) {
                    const id = participant.username || record.display_name;
                    if (!seenIds.has(id)) {
                      // Add messages for this participant
                      if (conversation.messages && Array.isArray(conversation.messages)) {
                        record.messages = conversation.messages
                          .filter(m => m.sender === participant.username)
                          .map(m => ({
                            platform: 'instagram',
                            content: m.content || '',
                            timestamp: m.timestamp_ms ? new Date(m.timestamp_ms).toISOString() : null
                          }));
                      }
                      records.push(record);
                      seenIds.add(id);
                    }
                  }
                }
              }
            }
          }
        } catch (error) {
          console.warn(`Error parsing Instagram messages file ${entry.entryName}:`, error.message);
        }
      }
    }

    console.log(`Parsed ${records.length} contacts from Instagram export: ${filename}`);
    return records;
  } catch (error) {
    console.error(`Error parsing Instagram export ${filename}:`, error);
    return [];
  }
}

/**
 * Normalize an Instagram record
 * @param {object} igRecord - Instagram data record
 * @returns {object} Normalized record
 */
function normalizeRecord(igRecord) {
  if (!igRecord || typeof igRecord !== 'object') {
    return null;
  }

  const record = {};

  // Name handling - Instagram typically has username and user profile name
  if (igRecord.name) {
    record.display_name = igRecord.name;
  }
  if (igRecord.full_name) {
    record.display_name = igRecord.full_name;
  }

  // Username fallback
  if (!record.display_name && igRecord.username) {
    record.display_name = igRecord.username;
  }

  // Email
  record.emails = [];
  if (igRecord.email) {
    record.emails.push({
      value: igRecord.email,
      type: 'personal'
    });
  }

  // Phone
  record.phones = [];
  if (igRecord.phone_number) {
    record.phones.push({
      value: igRecord.phone_number,
      type: 'mobile'
    });
  }

  // Biography
  if (igRecord.biography || igRecord.bio) {
    record.bio = igRecord.biography || igRecord.bio;
  }

  // Website
  if (igRecord.website) {
    record.website = igRecord.website;
  }

  // Location
  if (igRecord.location) {
    if (typeof igRecord.location === 'string') {
      record.location = igRecord.location;
    } else if (igRecord.location.name) {
      record.location = igRecord.location.name;
    }
  }

  // Social links - Instagram profile
  record.social_links = [];
  if (igRecord.username) {
    record.social_links.push({
      platform: 'instagram',
      username: igRecord.username,
      profile_url: `https://instagram.com/${igRecord.username}`
    });
  }

  // Media - profile picture
  record.media = [];
  if (igRecord.profile_pic_url) {
    record.media.push({
      type: 'photo',
      url: igRecord.profile_pic_url,
      timestamp: null
    });
  }

  // Messages (if included)
  record.messages = igRecord.messages || [];

  return record;
}

module.exports = {
  parse
};
