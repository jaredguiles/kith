/**
 * Normalize raw data from various sources into a standard contact format
 */

/**
 * Normalize a record from a specific platform to the standard format
 * @param {object} rawData - Raw parsed data from the source platform
 * @param {string} platform - The source platform (facebook, instagram, twitter, google_contacts, vcard, csv)
 * @returns {object} Normalized record
 */
function normalizeRecord(rawData, platform) {
  if (!rawData) {
    return createEmptyNormalized();
  }

  const normalized = createEmptyNormalized();

  // Common fields that most platforms provide
  if (rawData.display_name) normalized.display_name = rawData.display_name;
  if (rawData.first_name) normalized.first_name = rawData.first_name;
  if (rawData.last_name) normalized.last_name = rawData.last_name;
  if (rawData.name && !normalized.display_name) {
    normalized.display_name = rawData.name;
  }

  if (rawData.nickname) normalized.nickname = rawData.nickname;
  if (rawData.birthday) normalized.birthday = rawData.birthday;
  if (rawData.location) normalized.location = rawData.location;
  if (rawData.bio) normalized.bio = rawData.bio;
  if (rawData.occupation) normalized.occupation = rawData.occupation;
  if (rawData.website) normalized.website = rawData.website;

  // Emails
  if (Array.isArray(rawData.emails)) {
    normalized.emails = rawData.emails.map(e => {
      if (typeof e === 'string') {
        return { value: e, type: 'personal' };
      }
      return {
        value: e.value || e.email || '',
        type: e.type || 'personal'
      };
    }).filter(e => e.value);
  }

  // Phones
  if (Array.isArray(rawData.phones)) {
    normalized.phones = rawData.phones.map(p => {
      if (typeof p === 'string') {
        return { value: p, type: 'mobile' };
      }
      return {
        value: p.value || p.number || '',
        type: p.type || 'mobile'
      };
    }).filter(p => p.value);
  }

  // Social links
  if (Array.isArray(rawData.social_links)) {
    normalized.social_links = rawData.social_links.map(s => ({
      platform: s.platform || '',
      username: s.username || '',
      profile_url: s.profile_url || s.url || ''
    })).filter(s => s.platform && s.username);
  }

  // Messages
  if (Array.isArray(rawData.messages)) {
    normalized.messages = rawData.messages.map(m => ({
      platform: m.platform || platform,
      content: m.content || m.message || '',
      timestamp: m.timestamp || m.date || null
    }));
  }

  // Media
  if (Array.isArray(rawData.media)) {
    normalized.media = rawData.media.map(m => ({
      type: m.type || 'photo',
      url: m.url || m.path || '',
      timestamp: m.timestamp || null
    })).filter(m => m.url);
  }

  // Spicy/sensitive data
  if (rawData.spicy_data) {
    normalized.spicy_data = rawData.spicy_data;
  }

  // Ensure display_name is set
  if (!normalized.display_name) {
    if (normalized.first_name && normalized.last_name) {
      normalized.display_name = `${normalized.first_name} ${normalized.last_name}`.trim();
    } else if (normalized.first_name) {
      normalized.display_name = normalized.first_name;
    } else if (normalized.last_name) {
      normalized.display_name = normalized.last_name;
    }
  }

  return normalized;
}

/**
 * Validate that a normalized record has required fields
 * @param {object} record - Normalized record
 * @returns {boolean} True if valid
 */
function validateNormalizedRecord(record) {
  if (!record || typeof record !== 'object') {
    return false;
  }

  // Must have at least a display name or email or phone
  const hasDisplay = record.display_name && record.display_name.trim();
  const hasEmail = record.emails && record.emails.length > 0;
  const hasPhone = record.phones && record.phones.length > 0;

  return hasDisplay || hasEmail || hasPhone;
}

/**
 * Create an empty normalized record template
 * @returns {object} Empty normalized record
 */
function createEmptyNormalized() {
  return {
    display_name: '',
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
    media: [],
    spicy_data: null
  };
}

module.exports = {
  normalizeRecord,
  validateNormalizedRecord,
  createEmptyNormalized
};
