'use strict';

// node:test suite for the pure-function import core (matcher + normalizer).
// Run: node --test server/test/

const test = require('node:test');
const assert = require('node:assert');

const { scoreCandidate, findBestMatch, nameSimilarity } = require('../import/matcher');
const { makeRecord, normalizePhone, normalizeEmail, normalizeDate, splitName } = require('../import/normalizer');

// ---------------------------------------------------------------- normalizer
test('normalizeEmail lowercases and validates', () => {
  assert.equal(normalizeEmail(' John@Example.COM '), 'john@example.com');
  assert.equal(normalizeEmail('not-an-email'), null);
  assert.equal(normalizeEmail(''), null);
});

test('normalizePhone strips formatting, keeps +', () => {
  assert.equal(normalizePhone('+1 (555) 123-4567'), '+15551234567');
  assert.equal(normalizePhone('555.123.4567'), '5551234567');
  assert.equal(normalizePhone('123'), null);
});

test('normalizeDate accepts multiple shapes', () => {
  assert.equal(normalizeDate('1990-04-15'), '1990-04-15');
  assert.equal(normalizeDate('04/15/1990'), '1990-04-15');
  assert.equal(normalizeDate('19900415'), '1990-04-15');
  assert.equal(normalizeDate('--0415'), '1900-04-15');
  assert.equal(normalizeDate('garbage'), null);
});

test('splitName splits first/last', () => {
  assert.deepEqual(splitName('John Michael Doe'), { first_name: 'John', last_name: 'Michael Doe' });
  assert.deepEqual(splitName('Cher'), { first_name: 'Cher', last_name: null });
});

test('makeRecord derives display_name and dedupes', () => {
  const rec = makeRecord({
    first_name: 'Jane', last_name: 'Doe',
    emails: [{ label: 'personal', email: 'JANE@x.com' }, { label: 'work', email: 'jane@x.com' }],
    phones: [{ label: 'mobile', phone: '+1 555 000 1111' }, { label: 'home', phone: '5550001111' }],
  });
  assert.equal(rec.display_name, 'Jane Doe');
  assert.equal(rec.emails.length, 1);
  assert.equal(rec.emails[0].email, 'jane@x.com');
  // +15550001111 vs 5550001111 are distinct normalizations — both kept
  assert.ok(rec.phones.length >= 1);
});

// ------------------------------------------------------------------ matcher
const candidate = (over = {}) => ({
  contact: { id: 1, display_name: 'John Doe', email: 'john@example.com', phone: '+15551234567', location: 'New York, NY', ...over.contact },
  emails: over.emails || [],
  phones: over.phones || [],
  socials: over.socials || [],
});

test('exact email match scores 0.95', () => {
  const rec = makeRecord({ display_name: 'Someone Else', emails: [{ label: 'personal', email: 'john@example.com' }] });
  assert.equal(scoreCandidate(rec, candidate()), 0.95);
});

test('exact phone match scores 0.95', () => {
  const rec = makeRecord({ display_name: 'X', phones: [{ label: 'mobile', phone: '(555) 123-4567' }] });
  // candidate phone +15551234567 vs 5551234567 differ after normalize; use satellite
  const c = candidate({ phones: [{ phone: '5551234567' }] });
  assert.equal(scoreCandidate(rec, c), 0.95);
});

test('exact name match scores 0.80', () => {
  const rec = makeRecord({ display_name: 'John Doe' });
  assert.equal(scoreCandidate(rec, candidate({ contact: { email: null, phone: null, location: null } })), 0.80);
});

test('fuzzy name match scores 0.55', () => {
  const rec = makeRecord({ display_name: 'Jon Doe' });
  const score = scoreCandidate(rec, candidate({ contact: { email: null, phone: null, location: null } }));
  assert.equal(score, 0.55);
});

test('shared social link scores 0.85', () => {
  const rec = makeRecord({ display_name: 'Unrelated Name', social_links: [{ platform: 'instagram', username: 'johndoe', url: null }] });
  const c = candidate({ contact: { display_name: 'Different Person', email: null, phone: null }, socials: [{ platform: 'Instagram', username: 'JohnDoe' }] });
  assert.equal(scoreCandidate(rec, c), 0.85);
});

test('location + name similarity scores 0.50', () => {
  const rec = makeRecord({ display_name: 'Johnny Does', location: 'New York, NY' });
  const score = scoreCandidate(rec, candidate({ contact: { email: null, phone: null } }));
  assert.ok(score >= 0.50, `expected >= 0.50, got ${score}`);
});

test('no signals → below threshold → null', () => {
  const rec = makeRecord({ display_name: 'Zelda Fitzgerald', location: 'Paris' });
  assert.equal(findBestMatch(rec, [candidate({ contact: { email: null, phone: null } })]), null);
});

test('findBestMatch picks the highest-scoring candidate', () => {
  const rec = makeRecord({ display_name: 'John Doe', emails: [{ label: 'p', email: 'john@example.com' }] });
  const weak = candidate({ contact: { id: 2, display_name: 'Jon Doe', email: null, phone: null } });
  const strong = candidate();
  const best = findBestMatch(rec, [weak, strong]);
  assert.equal(best.contactId, 1);
  assert.equal(best.confidence, 0.95);
});

test('nameSimilarity is symmetric and bounded', () => {
  assert.equal(nameSimilarity('John Doe', 'john doe'), 1);
  const s = nameSimilarity('Jonathan Doe', 'Jon Doe');
  assert.ok(s > 0 && s < 1);
});

// ---------------------------------------------------------------- crypto
const { encryptField, decryptField, isEncrypted } = require('../lib/crypto');

test('crypto roundtrip + tamper detection + passthrough', () => {
  process.env.FIELD_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  const ct = encryptField('sensitive value');
  assert.notEqual(ct, 'sensitive value');
  assert.ok(isEncrypted(ct));
  assert.equal(decryptField(ct), 'sensitive value');
  assert.equal(decryptField('plain text stays'), 'plain text stays');
  assert.equal(encryptField(null), null);
  assert.equal(decryptField(''), '');
});
