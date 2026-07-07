'use strict';

// Google Contacts / Takeout parser — accepts .vcf directly or a Takeout .zip
// containing Contacts vCards/CSV.

const path = require('node:path');
const { readZipEntries } = require('../ziputil');
const vcard = require('./vcard');
const csv = require('./csv');

const VCF_IN_ZIP = /(^|\/)(Contacts|contacts)[^/]*\/.*\.vcf$/i;
const ANY_VCF = /\.vcf$/i;
const CSV_IN_ZIP = /(^|\/)(Contacts|contacts)[^/]*\/.*\.csv$/i;

async function parseGoogle(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.vcf') {
    const fs = require('node:fs');
    return vcard.parse(fs.readFileSync(filePath));
  }

  if (ext === '.csv') {
    const fs = require('node:fs');
    return csv.parse(fs.readFileSync(filePath));
  }

  // .zip Takeout
  const errors = [];
  let entries;
  try {
    entries = await readZipEntries(filePath, (n) => VCF_IN_ZIP.test(n) || ANY_VCF.test(n) || CSV_IN_ZIP.test(n));
  } catch (err) {
    return { records: [], errors: [`Could not read archive: ${err.message}`] };
  }
  if (!entries.length) {
    return { records: [], errors: ['No contacts found in the Takeout archive (.vcf/.csv) — format not supported'] };
  }

  const records = [];
  for (const { name, buffer } of entries) {
    try {
      const result = name.toLowerCase().endsWith('.csv') ? csv.parse(buffer) : vcard.parse(buffer);
      records.push(...result.records);
      errors.push(...result.errors.map((e) => `${name}: ${e}`));
    } catch (err) {
      errors.push(`${name}: ${err.message}`);
    }
  }
  return { records, errors };
}

module.exports = { parse: parseGoogle, extensions: ['.vcf', '.csv', '.zip'], isPath: true };
