/**
 * Contact match detection with confidence scoring
 */

const CONFIDENCE_THRESHOLD = 0.50;

/**
 * Calculate Levenshtein-like string similarity
 * Returns a score between 0 and 1
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;

  str1 = str1.toLowerCase().trim();
  str2 = str2.toLowerCase().trim();

  if (str1 === str2) return 1.0;

  // Levenshtein distance
  const matrix = [];

  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const distance = matrix[str2.length][str1.length];
  const maxLength = Math.max(str1.length, str2.length);

  return Math.max(0, 1 - (distance / maxLength));
}

/**
 * Normalize email for comparison
 * @param {string} email - Email address
 * @returns {string} Normalized email
 */
function normalizeEmail(email) {
  return email ? email.toLowerCase().trim() : '';
}

/**
 * Normalize phone number for comparison
 * Removes non-digit characters for comparison
 * @param {string} phone - Phone number
 * @returns {string} Normalized phone
 */
function normalizePhone(phone) {
  return phone ? phone.replace(/\D/g, '') : '';
}

/**
 * Find potential matches for a normalized record against existing contacts
 * @param {object} normalizedRecord - Normalized record to match
 * @param {string} userId - User ID
 * @param {object} pool - Database pool
 * @returns {Promise<{contact_id, confidence} | null>} Best match with confidence or null
 */
async function findMatch(normalizedRecord, userId, pool) {
  try {
    // Get all contacts for this user
    const [contacts] = await pool.query(
      `SELECT id, display_name, first_name, last_name FROM contacts WHERE user_id = ?`,
      [userId]
    );

    // Get emails and phones for all contacts
    const contactEmails = {};
    const contactPhones = {};
    const contactSocialLinks = {};

    const [emailRows] = await pool.query(
      `SELECT contact_id, email FROM contact_emails WHERE contact_id IN (?)`,
      [contacts.map(c => c.id)]
    );

    for (const row of emailRows) {
      if (!contactEmails[row.contact_id]) {
        contactEmails[row.contact_id] = [];
      }
      contactEmails[row.contact_id].push(normalizeEmail(row.email));
    }

    const [phoneRows] = await pool.query(
      `SELECT contact_id, phone FROM contact_phones WHERE contact_id IN (?)`,
      [contacts.map(c => c.id)]
    );

    for (const row of phoneRows) {
      if (!contactPhones[row.contact_id]) {
        contactPhones[row.contact_id] = [];
      }
      contactPhones[row.contact_id].push(normalizePhone(row.phone));
    }

    const [socialRows] = await pool.query(
      `SELECT contact_id, platform, username FROM social_links WHERE contact_id IN (?)`,
      [contacts.map(c => c.id)]
    );

    for (const row of socialRows) {
      if (!contactSocialLinks[row.contact_id]) {
        contactSocialLinks[row.contact_id] = [];
      }
      contactSocialLinks[row.contact_id].push({
        platform: row.platform.toLowerCase(),
        username: row.username.toLowerCase()
      });
    }

    // Score each contact
    let bestMatch = null;
    let bestScore = CONFIDENCE_THRESHOLD;

    for (const contact of contacts) {
      let score = 0;

      // Email matching
      if (normalizedRecord.emails && normalizedRecord.emails.length > 0) {
        const normalizedEmails = normalizedRecord.emails.map(e => normalizeEmail(e.value));
        const contactEmailsList = contactEmails[contact.id] || [];

        for (const email of normalizedEmails) {
          if (contactEmailsList.includes(email)) {
            score = Math.max(score, 0.95);
            break;
          }
        }
      }

      // Phone matching
      if (normalizedRecord.phones && normalizedRecord.phones.length > 0 && score < 0.95) {
        const normalizedPhones = normalizedRecord.phones.map(p => normalizePhone(p.value));
        const contactPhonesList = contactPhones[contact.id] || [];

        for (const phone of normalizedPhones) {
          if (phone && contactPhonesList.includes(phone)) {
            score = Math.max(score, 0.95);
            break;
          }
        }
      }

      // Exact name match
      if (score < 0.95) {
        if (normalizedRecord.display_name && contact.display_name) {
          if (normalizedRecord.display_name.toLowerCase() === contact.display_name.toLowerCase()) {
            score = Math.max(score, 0.80);
          }
        }
      }

      // Fuzzy name match
      if (score < 0.80 && normalizedRecord.display_name) {
        const nameScore = stringSimilarity(normalizedRecord.display_name, contact.display_name || '');
        if (nameScore > 0.55) {
          score = Math.max(score, nameScore);
        }
      }

      // Social link matching
      if (normalizedRecord.social_links && normalizedRecord.social_links.length > 0 && score < 0.95) {
        const contactLinks = contactSocialLinks[contact.id] || [];

        for (const link of normalizedRecord.social_links) {
          const platform = (link.platform || '').toLowerCase();
          const username = (link.username || '').toLowerCase();

          for (const contactLink of contactLinks) {
            if (contactLink.platform === platform && contactLink.username === username) {
              score = Math.max(score, 0.85);
              break;
            }
          }
        }
      }

      // Update best match
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          contact_id: contact.id,
          confidence: score
        };
      }
    }

    return bestMatch;
  } catch (error) {
    console.error('Error finding match:', error);
    return null;
  }
}

module.exports = {
  findMatch,
  stringSimilarity,
  normalizeEmail,
  normalizePhone,
  CONFIDENCE_THRESHOLD
};
