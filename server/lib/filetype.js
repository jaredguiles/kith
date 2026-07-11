'use strict';

// Magic-byte content sniffing for uploads (audit S5). Client-supplied
// mimetypes/extensions are trivially spoofable — the first bytes of the file
// are the only thing worth trusting. Pure functions, no dependencies.
//
// Covered: images (jpeg/png/gif/webp/heic), video (mp4/mov/webm/mkv), zip.
// sniffBuffer() needs at least the first 32 bytes; pass more when available.

/** Read a big-endian uint32 at offset (0 when out of range). */
function be32(buf, off) {
  if (off + 4 > buf.length) return 0;
  return buf.readUInt32BE(off);
}

function ascii(buf, off, len) {
  if (off + len > buf.length) return '';
  return buf.toString('latin1', off, off + len);
}

// ISO-BMFF (ftyp) brands: image vs video containers share the same layout.
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heif', 'mif1', 'msf1']);
const QT_BRANDS = new Set(['qt  ']);

/**
 * Sniff a buffer's content type from magic bytes.
 * @param {Buffer} buf first bytes of the file (>= 32 recommended)
 * @returns {{ mime: string, kind: 'image'|'video'|'archive' } | null}
 */
function sniffBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 4) return null;

  // --- images ---
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: 'image/jpeg', kind: 'image' };
  }
  if (buf.length >= 8 && be32(buf, 0) === 0x89504e47 && be32(buf, 4) === 0x0d0a1a0a) {
    return { mime: 'image/png', kind: 'image' };
  }
  const g = ascii(buf, 0, 6);
  if (g === 'GIF87a' || g === 'GIF89a') {
    return { mime: 'image/gif', kind: 'image' };
  }
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') {
    return { mime: 'image/webp', kind: 'image' };
  }

  // --- ISO-BMFF (ftyp): heic images, mp4/mov video ---
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    if (HEIC_BRANDS.has(brand)) return { mime: 'image/heic', kind: 'image' };
    if (QT_BRANDS.has(brand)) return { mime: 'video/quicktime', kind: 'video' };
    return { mime: 'video/mp4', kind: 'video' };
  }

  // --- EBML (webm/mkv) — DocType string sits inside the first bytes ---
  if (be32(buf, 0) === 0x1a45dfa3) {
    const head = ascii(buf, 0, Math.min(buf.length, 64));
    if (head.includes('webm')) return { mime: 'video/webm', kind: 'video' };
    return { mime: 'video/x-matroska', kind: 'video' };
  }

  // --- zip (PK\x03\x04, empty PK\x05\x06, spanned PK\x07\x08) ---
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) {
    return { mime: 'application/zip', kind: 'archive' };
  }

  return null;
}

// Declared mimetypes that are interchangeable with a sniffed one: mp4/mov are
// both ISO-BMFF (brand detection is best-effort), webm is a matroska subset.
const COMPATIBLE = {
  'video/mp4': new Set(['video/mp4', 'video/quicktime']),
  'video/quicktime': new Set(['video/mp4', 'video/quicktime']),
  'video/webm': new Set(['video/webm', 'video/x-matroska']),
  'video/x-matroska': new Set(['video/webm', 'video/x-matroska']),
};

/**
 * Does the sniffed content type match the client-declared mimetype?
 * Images require an exact mime match; video containers allow family matches.
 * @param {string} declaredMime client-supplied mimetype
 * @param {{mime: string, kind: string} | null} sniffed sniffBuffer() result
 * @returns {boolean}
 */
function matchesDeclared(declaredMime, sniffed) {
  if (!sniffed) return false;
  if (sniffed.mime === declaredMime) return true;
  const compat = COMPATIBLE[declaredMime];
  return Boolean(compat && compat.has(sniffed.mime));
}

module.exports = { sniffBuffer, matchesDeclared };
