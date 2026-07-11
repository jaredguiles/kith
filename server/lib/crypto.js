'use strict';

// AES-256-GCM field encryption helpers for the spicy layer (§7.E, Layer C).
//
// Output format: base64( versionId(1 byte) || iv(12) || authTag(16) || ciphertext )
// The versionId byte enables key rotation later without a data-migration guess.
//
// Key: FIELD_ENCRYPTION_KEY env — 32-byte key, base64-encoded. Never in the DB,
// never committed. Backed up in a secrets manager separately from DB backups.

const crypto = require('node:crypto');

const CURRENT_KEY_VERSION = 1;
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

let keys = null; // { [versionId]: Buffer(32) }

function loadKeys() {
  if (keys) return keys;
  const raw = process.env.FIELD_ENCRYPTION_KEY || '';
  let buf;
  try {
    buf = Buffer.from(raw, 'base64');
  } catch {
    buf = Buffer.alloc(0);
  }
  if (buf.length !== 32) {
    // Fall back to hashing whatever was supplied so dev environments with a
    // non-base64 placeholder still function; production refuses placeholders
    // at boot (server/index.js) so this path never runs in prod with a default.
    buf = crypto.createHash('sha256').update(raw).digest();
  }
  keys = { [CURRENT_KEY_VERSION]: buf };
  return keys;
}

/**
 * Encrypt a plaintext string. Returns the encoded token string.
 * null/undefined/'' pass through unchanged (nothing to protect).
 */
function encryptField(plaintext) {
  if (plaintext === null || plaintext === undefined || plaintext === '') return plaintext;
  const key = loadKeys()[CURRENT_KEY_VERSION];
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from([CURRENT_KEY_VERSION]), iv, tag, ct]).toString('base64');
}

/**
 * Decrypt an encoded token back to plaintext.
 * null/undefined/'' pass through. Throws on tamper/wrong key.
 * Lenient passthrough applies ONLY to values that do not parse as a versioned
 * envelope (legacy cleartext during transitions). Once the version byte and
 * lengths validate as one of our envelopes, an auth-tag failure THROWS —
 * silently returning raw ciphertext would defeat GCM's tamper detection.
 */
function decryptField(token) {
  if (token === null || token === undefined || token === '') return token;
  let buf;
  try {
    buf = Buffer.from(String(token), 'base64');
  } catch {
    return token;
  }
  if (buf.length < 1 + IV_LENGTH + TAG_LENGTH + 1) return token;
  const version = buf[0];
  const key = loadKeys()[version];
  if (!key) return token;
  const iv = buf.subarray(1, 1 + IV_LENGTH);
  const tag = buf.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const ct = buf.subarray(1 + IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/** True if the value parses as one of our encrypted tokens. */
function isEncrypted(value) {
  if (value === null || value === undefined || value === '') return false;
  let buf;
  try {
    buf = Buffer.from(String(value), 'base64');
  } catch {
    return false;
  }
  if (buf.length < 1 + IV_LENGTH + TAG_LENGTH + 1) return false;
  return Boolean(loadKeys()[buf[0]]);
}

module.exports = { encryptField, decryptField, isEncrypted, CURRENT_KEY_VERSION };
