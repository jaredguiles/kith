'use strict';

// Streaming ZIP extraction via yauzl with zip-slip validation (§5).
// Extracts entries matching a predicate into memory (bounded) — platform
// export JSON/CSV/VCF files are small relative to the media they ship with,
// so we only read matching data files, never media blobs.

const yauzl = require('yauzl');
const path = require('node:path');

const MAX_ENTRY_BYTES = 100 * 1024 * 1024; // 100 MB per data file cap

/** Validate an entry name against zip-slip (no absolute paths, no ..). */
function safeEntryName(name) {
  if (!name || name.includes('\0')) return false;
  const norm = path.posix.normalize(name.replace(/\\/g, '/'));
  return !norm.startsWith('/') && !norm.startsWith('..') && !norm.includes('../');
}

/**
 * Read matching entries from a zip file.
 * matcher(entryName) → boolean. Returns [{ name, buffer }].
 */
function readZipEntries(zipPath, matcher, { maxEntries = 200 } = {}) {
  return new Promise((resolve, reject) => {
    const results = [];
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) return reject(new Error(`Not a valid zip file: ${err.message}`));
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        const name = entry.fileName;
        if (/\/$/.test(name) || !safeEntryName(name) || !matcher(name) || results.length >= maxEntries) {
          return zipfile.readEntry();
        }
        if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
          return zipfile.readEntry(); // skip oversized data files
        }
        zipfile.openReadStream(entry, (err2, stream) => {
          if (err2) return zipfile.readEntry();
          const chunks = [];
          let total = 0;
          stream.on('data', (c) => {
            total += c.length;
            if (total > MAX_ENTRY_BYTES) { stream.destroy(); return; }
            chunks.push(c);
          });
          stream.on('end', () => {
            results.push({ name, buffer: Buffer.concat(chunks) });
            zipfile.readEntry();
          });
          stream.on('error', () => zipfile.readEntry());
        });
      });
      zipfile.on('end', () => resolve(results));
      zipfile.on('error', (e) => reject(e));
    });
  });
}

/** List entry names (for diagnostics). */
function listZipEntries(zipPath, limit = 2000) {
  return new Promise((resolve, reject) => {
    const names = [];
    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) return reject(err);
      zipfile.readEntry();
      zipfile.on('entry', (entry) => {
        if (names.length < limit) names.push(entry.fileName);
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(names));
      zipfile.on('error', reject);
    });
  });
}

/** Facebook/Instagram exports mojibake fix: latin1-encoded UTF-8 in JSON strings. */
function fixFbEncoding(value) {
  if (typeof value !== 'string') return value;
  try {
    return Buffer.from(value, 'latin1').toString('utf8');
  } catch {
    return value;
  }
}

function deepFixEncoding(obj) {
  if (typeof obj === 'string') return fixFbEncoding(obj);
  if (Array.isArray(obj)) return obj.map(deepFixEncoding);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepFixEncoding(v);
    return out;
  }
  return obj;
}

module.exports = { readZipEntries, listZipEntries, safeEntryName, deepFixEncoding };
