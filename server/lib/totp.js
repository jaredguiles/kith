'use strict';

// RFC-6238 TOTP (HMAC-SHA1, 30s step, 6 digits) using node:crypto only.
// Includes inline RFC-4648 base32 encode/decode (no padding on encode).
// verify window is ±1 step to tolerate clock skew.

const crypto = require('node:crypto');

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

/** base32-encode a Buffer (RFC 4648, no padding). */
function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** base32-decode a string to a Buffer. Throws on invalid characters. */
function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** HOTP (RFC 4226): HMAC-SHA1 + dynamic truncation → zero-padded digit string. */
function hotp(keyBuf, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac('sha1', keyBuf).update(msg).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const code =
    ((mac[offset] & 0x7f) << 24) |
    (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) |
    mac[offset + 3];
  return String(code % 10 ** digits).padStart(digits, '0');
}

/** Current TOTP code for a base32 secret (mostly for tests). */
function totpCode(secretBase32, atMs = Date.now()) {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  return hotp(base32Decode(secretBase32), counter);
}

/**
 * Verify a user-supplied 6-digit code against a base32 secret.
 * Checks the current step ±`window` steps. Timing-safe comparison.
 */
function verifyTotp(secretBase32, code, { window = 1, atMs = Date.now() } = {}) {
  const supplied = String(code ?? '').trim();
  if (!new RegExp(`^\\d{${DIGITS}}$`).test(supplied)) return false;
  let key;
  try {
    key = base32Decode(secretBase32);
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const suppliedBuf = Buffer.from(supplied);
  let ok = false;
  for (let w = -window; w <= window; w++) {
    const expected = Buffer.from(hotp(key, counter + w));
    // constant shape: always compare, accumulate result
    if (expected.length === suppliedBuf.length && crypto.timingSafeEqual(expected, suppliedBuf)) ok = true;
  }
  return ok;
}

/** Generate a new random secret (default 20 bytes), returned as base32. */
function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

module.exports = { base32Encode, base32Decode, hotp, totpCode, verifyTotp, generateSecret, STEP_SECONDS, DIGITS };
