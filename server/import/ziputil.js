'use strict';

// Streaming ZIP extraction via yauzl with zip-slip validation (§5).
// Extracts entries matching a predicate into memory (bounded) — platform
// export JSON/CSV/VCF files are small relative to the media they ship with,
// so we only read matching data files, never media blobs.

const yauzl = require('yauzl');
const path = require('node:path');

const MAX_ENTRY_BYTES = 100 * 1024 * 1024;   // 100 MB per data file cap
const MAX_TOTAL_BYTES = 200 * 1024 * 1024;   // 200 MB aggregate extraction cap (zip-bomb guard)
const MAX_SCANNED_ENTRIES = 50000;           // stop walking the central directory after this many
const READ_TIMEOUT_MS = 5 * 60 * 1000;       // overall wall-clock cap for one archive

/** Validate an entry name against zip-slip (no absolute paths, no ..). */
function safeEntryName(name) {
  if (!name || name.includes('\0')) return false;
  const norm = path.posix.normalize(name.replace(/\\/g, '/'));
  return !norm.startsWith('/') && !norm.startsWith('..') && !norm.includes('../');
}

/**
 * Read matching entries from a zip file.
 * matcher(entryName) → boolean. Returns [{ name, buffer }].
 *
 * Bounded (zip-bomb guards):
 *  - per-entry cap (MAX_ENTRY_BYTES): oversized data files are skipped
 *  - aggregate cap (maxTotalBytes): exceeding it rejects the whole archive
 *  - central-directory walk cap (MAX_SCANNED_ENTRIES) and early resolve once
 *    maxEntries have been collected
 *  - overall wall-clock timeout (READ_TIMEOUT_MS)
 */
function readZipEntries(zipPath, matcher, { maxEntries = 200, maxTotalBytes = MAX_TOTAL_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    const results = [];
    let totalBytes = 0;
    let scanned = 0;
    let settled = false;
    let zf = null;
    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { zf?.close(); } catch { /* already closed */ }
      if (err) reject(err); else resolve(results);
    };
    const timer = setTimeout(
      () => finish(new Error('Archive read timed out (5 minutes) — file too large or malformed')),
      READ_TIMEOUT_MS
    );

    yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, (err, zipfile) => {
      if (err) return finish(new Error(`Not a valid zip file: ${err.message}`));
      zf = zipfile;
      zipfile.on('end', () => finish());
      zipfile.on('error', (e) => finish(e));
      zipfile.on('entry', (entry) => {
        if (settled) return;
        scanned += 1;
        if (scanned > MAX_SCANNED_ENTRIES) return finish(); // stop walking a pathological directory
        const name = entry.fileName;
        if (/\/$/.test(name) || !safeEntryName(name) || !matcher(name)) {
          return zipfile.readEntry();
        }
        if (entry.uncompressedSize > MAX_ENTRY_BYTES) {
          return zipfile.readEntry(); // skip oversized data files
        }
        if (totalBytes + entry.uncompressedSize > maxTotalBytes) {
          return finish(new Error(
            `Archive data exceeds the ${Math.round(maxTotalBytes / 1024 / 1024)} MB extraction limit — refusing to process`
          ));
        }
        zipfile.openReadStream(entry, (err2, stream) => {
          if (settled) { try { stream?.destroy(); } catch { /* ignore */ } return; }
          if (err2) return zipfile.readEntry();
          const chunks = [];
          let total = 0;
          stream.on('data', (c) => {
            if (settled) { stream.destroy(); return; }
            total += c.length;
            totalBytes += c.length;
            if (total > MAX_ENTRY_BYTES || totalBytes > maxTotalBytes) {
              stream.destroy();
              return finish(new Error(
                `Archive data exceeds the ${Math.round(maxTotalBytes / 1024 / 1024)} MB extraction limit — refusing to process`
              ));
            }
            chunks.push(c);
          });
          stream.on('end', () => {
            if (settled) return;
            results.push({ name, buffer: Buffer.concat(chunks) });
            if (results.length >= maxEntries) return finish(); // collected enough — stop reading
            zipfile.readEntry();
          });
          stream.on('error', () => { if (!settled) zipfile.readEntry(); });
        });
      });
      zipfile.readEntry();
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
        names.push(entry.fileName);
        if (names.length >= limit) {
          try { zipfile.close(); } catch { /* ignore */ }
          return resolve(names);
        }
        zipfile.readEntry();
      });
      zipfile.on('end', () => resolve(names));
      zipfile.on('error', reject);
    });
  });
}

/**
 * Facebook/Instagram exports mojibake fix: latin1-encoded UTF-8 in JSON strings.
 * Applied conditionally — only when the string shows classic
 * UTF-8-read-as-latin1 artifacts (Ã©, Â , â€™, …) AND the latin1→utf8
 * round-trip is lossless (re-encoding the fixed string as latin1 reproduces
 * the input). Valid UTF-8 like 'Zoë', CJK, or emoji passes through unchanged.
 */
const MOJIBAKE_RE = /[\u00C2\u00C3\u00E2\u00CE\u00CF][\u0080-\u00BF\u0152\u0153\u017D\u017E\u2018\u2019\u201A\u201C\u201D\u201E\u2013\u2014\u2020\u2021\u2022\u2026\u02C6\u02DC\u0160\u0161\u0178\u20AC\u2030\u2039\u203A]/;

function fixFbEncoding(value) {
  if (typeof value !== 'string') return value;
  if (!MOJIBAKE_RE.test(value)) return value;
  try {
    const latin1 = Buffer.from(value, 'latin1');
    const fixed = latin1.toString('utf8');
    // lossless check: decoding must not have hit invalid sequences, and
    // re-encoding the fixed string back to latin1 must reproduce the input
    if (fixed.includes('\uFFFD')) return value;
    if (Buffer.from(fixed, 'utf8').toString('latin1') !== value) return value;
    return fixed;
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
