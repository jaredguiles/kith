const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse Twitter export ZIP file and return normalized records
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

    // Look for followers/following data and direct messages
    for (const entry of entries) {
      // Skip directories
      if (entry.isDirectory) continue;

      const entryPath = entry.entryName.toLowerCase();

      // Twitter export structure: data/followers.js, data/following.js, data/direct-messages/*, etc
      if (entryPath.includes('followers') || entryPath.includes('following')) {
        if (entryPath.endsWith('.js') || entryPath.endsWith('.json')) {
          try {
            let content = entry.getData().toString('utf-8');

            // Twitter exports as .js files with a variable assignment
            // e.g., "window.YTD.followers.part0 = [...]"
            // Extract JSON if it's wrapped
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              content = jsonMatch[0];
            }

            const data = JSON.parse(content);
            const items = Array.isArray(data) ? data : [data];

            for (const item of items) {
              const record = normalizeRecord(item);
              if (record && record.display_name) {
                const id = (item.following && item.following[0] && item.following[0].userLink) ||
                          (item.follower && item.follower[0] && item.follower[0].userLink) ||
                          record.display_name;
                if (!seenIds.has(id)) {
                  records.push(record);
                  seenIds.add(id);
                }
              }
            }
          } catch (error) {
            console.warn(`Error parsing Twitter JS file ${entry.entryName}:`, error.message);
          }
        }
      }

      // Parse direct messages
      if (entryPath.includes('direct-messages') && (entryPath.endsWith('.js') || entryPath.endsWith('.json'))) {
        try {
          let content = entry.getData().toString('utf-8');

          // Extract JSON if wrapped in JavaScript
          const jsonMatch = content.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            content = jsonMatch[0];
          }

          const data = JSON.parse(content);
          const messages = Array.isArray(data) ? data : [data];

          for (const message of messages) {
            // Extract participant info from DM
            if (message.dmConversation && message.dmConversation[0]) {
              const conv = message.dmConversation[0];

              if (conv.messages && Array.isArray(conv.messages)) {
                const participants = new Map();

                // Collect all participants from messages
                for (const msg of conv.messages) {
                  if (msg.message && msg.message[0]) {
                    const m = msg.message[0];
                    const sender = m.senderID || m.senderName;
                    const recipient = m.recipientID || m.recipientName;

                    if (sender && !participants.has(sender)) {
                      participants.set(sender, {
                        username: sender,
                        messages: []
                      });
                    }
                    if (recipient && !participants.has(recipient)) {
                      participants.set(recipient, {
                        username: recipient,
                        messages: []
                      });
                    }

                    // Assign messages
                    if (m.senderID === sender || m.senderName === sender) {
                      if (participants.has(sender)) {
                        participants.get(sender).messages.push(m);
                      }
                    }
                  }
                }

                // Convert to records
                for (const [id, participant] of participants) {
                  const record = normalizeRecord(participant);
                  if (record && record.display_name) {
                    if (!seenIds.has(id)) {
                      // Add messages
                      if (participant.messages && participant.messages.length > 0) {
                        record.messages = participant.messages.map(m => ({
                          platform: 'twitter',
                          content: m.text || m.message || '',
                          timestamp: m.timestamp ? new Date(parseInt(m.timestamp)).toISOString() : null
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
          console.warn(`Error parsing Twitter DM file ${entry.entryName}:`, error.message);
        }
      }
    }

    console.log(`Parsed ${records.length} contacts from Twitter export: ${filename}`);
    return records;
  } catch (error) {
    console.error(`Error parsing Twitter export ${filename}:`, error);
    return [];
  }
}

/**
 * Normalize a Twitter record
 * @param {object} twitterRecord - Twitter data record
 * @returns {object} Normalized record
 */
function normalizeRecord(twitterRecord) {
  if (!twitterRecord || typeof twitterRecord !== 'object') {
    return null;
  }

  const record = {};

  // Handle Twitter's nested structure
  // followers/following format: { follower: [{ userLink: "username" }] }
  let userInfo = twitterRecord;

  if (twitterRecord.follower && twitterRecord.follower[0]) {
    userInfo = twitterRecord.follower[0];
  } else if (twitterRecord.following && twitterRecord.following[0]) {
    userInfo = twitterRecord.following[0];
  }

  // Username handling
  let username = userInfo.userLink || userInfo.username || userInfo.handle;
  if (username && username.startsWith('@')) {
    username = username.substring(1);
  }

  // Name
  if (userInfo.name) {
    record.display_name = userInfo.name;
  } else if (username) {
    record.display_name = username;
  }

  // Email
  record.emails = [];
  if (userInfo.email) {
    record.emails.push({
      value: userInfo.email,
      type: 'personal'
    });
  }

  // Phone
  record.phones = [];
  if (userInfo.phone) {
    record.phones.push({
      value: userInfo.phone,
      type: 'mobile'
    });
  }

  // Bio/description
  if (userInfo.description || userInfo.bio) {
    record.bio = userInfo.description || userInfo.bio;
  }

  // Location
  if (userInfo.location) {
    record.location = userInfo.location;
  }

  // Website/URL
  if (userInfo.website || userInfo.url) {
    record.website = userInfo.website || userInfo.url;
  }

  // Social links - Twitter profile
  record.social_links = [];
  if (username) {
    record.social_links.push({
      platform: 'twitter',
      username: username,
      profile_url: `https://twitter.com/${username}`
    });
  }

  // Media - profile image
  record.media = [];
  if (userInfo.profile_image || userInfo.profileImage) {
    record.media.push({
      type: 'photo',
      url: userInfo.profile_image || userInfo.profileImage,
      timestamp: null
    });
  }

  // Messages (if included from DMs)
  record.messages = userInfo.messages || [];

  return record;
}

module.exports = {
  parse
};
