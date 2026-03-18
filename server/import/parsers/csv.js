const fs = require('fs').promises;
const path = require('path');
const { parse: csvParseSync } = require('csv-parse/sync');

const MEDIA_PATH = process.env.MEDIA_PATH || '/media';

/**
 * Parse CSV files and return normalized records
 * @param {string} jobId - Import job ID
 * @param {string} filename - Original filename
 * @param {object} columnMapping - Mapping of CSV columns to normalized fields
 * @returns {Promise<Array>} Array of normalized records
 */
async function parse(jobId, filename, columnMapping = null) {
  try {
    // Read the file
    const filepath = path.join(MEDIA_PATH, 'imports', jobId.toString(), filename);
    const content = await fs.readFile(filepath, 'utf-8');

    // Parse CSV
    const records = parseCsv(content, columnMapping);

    console.log(`Parsed ${records.length} contacts from CSV file: ${filename}`);
    return records;
  } catch (error) {
    console.error(`Error parsing CSV file ${filename}:`, error);
    return [];
  }
}

/**
 * Parse CSV content and return normalized records
 * @param {string} content - CSV content
 * @param {object} columnMapping - Optional mapping of CSV columns to normalized fields
 * @returns {Array} Normalized records
 */
function parseCsv(content, columnMapping = null) {
  try {
    // Parse CSV with auto-detection of delimiter
    const rows = csvParseSync(content, {
      skip_empty_lines: true,
      trim: true
    });

    if (rows.length === 0) {
      return [];
    }

    // Extract headers from first row
    const headers = rows[0];
    const dataRows = rows.slice(1);

    // Default column mapping if not provided
    const mapping = columnMapping || detectColumnMapping(headers);

    // Convert rows to records
    const records = [];

    for (const row of dataRows) {
      const record = {};

      // Create a map of header -> value
      const rowMap = {};
      for (let i = 0; i < headers.length && i < row.length; i++) {
        rowMap[headers[i].toLowerCase().trim()] = row[i];
      }

      // Apply column mapping
      for (const [csvHeader, normalizedField] of Object.entries(mapping)) {
        const value = rowMap[csvHeader.toLowerCase().trim()];

        if (!value) continue;

        switch (normalizedField) {
          case 'display_name':
            record.display_name = value;
            break;
          case 'first_name':
            record.first_name = value;
            break;
          case 'last_name':
            record.last_name = value;
            break;
          case 'nickname':
            record.nickname = value;
            break;
          case 'birthday':
            record.birthday = value;
            break;
          case 'location':
            record.location = value;
            break;
          case 'bio':
            record.bio = value;
            break;
          case 'occupation':
            record.occupation = value;
            break;
          case 'website':
            record.website = value;
            break;
          case 'email':
            if (!record.emails) record.emails = [];
            record.emails.push({ value, type: 'personal' });
            break;
          case 'phone':
            if (!record.phones) record.phones = [];
            record.phones.push({ value, type: 'mobile' });
            break;
        }
      }

      // Ensure required fields
      if (!record.emails) record.emails = [];
      if (!record.phones) record.phones = [];
      if (!record.social_links) record.social_links = [];
      if (!record.media) record.media = [];

      records.push(record);
    }

    return records;
  } catch (error) {
    console.error('Error parsing CSV:', error);
    return [];
  }
}

/**
 * Detect column mapping from headers
 * @param {Array} headers - CSV headers
 * @returns {object} Mapping of headers to normalized fields
 */
function detectColumnMapping(headers) {
  const mapping = {};

  const patterns = {
    display_name: /^(name|full_?name|contact_?name)$/i,
    first_name: /^(first_?name|given_?name|fname)$/i,
    last_name: /^(last_?name|family_?name|surname|lname)$/i,
    nickname: /^(nickname|short_?name)$/i,
    email: /^(email|email_?address|e_?mail|mail)$/i,
    phone: /^(phone|phone_?number|mobile|cell|telephone)$/i,
    birthday: /^(birthday|birth_?date|dob|date_?of_?birth)$/i,
    location: /^(location|city|address|street)$/i,
    bio: /^(bio|biography|notes|note|description)$/i,
    occupation: /^(occupation|job|title|position)$/i,
    website: /^(website|web|url|homepage)$/i
  };

  for (const header of headers) {
    const normalized = header.toLowerCase().trim();

    for (const [field, pattern] of Object.entries(patterns)) {
      if (pattern.test(normalized)) {
        mapping[header] = field;
        break;
      }
    }
  }

  return mapping;
}

module.exports = {
  parse,
  parseCsv,
  detectColumnMapping
};
