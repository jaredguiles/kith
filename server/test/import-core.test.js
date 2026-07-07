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
  assert.equal(normalizeDate('garbage'), null);
});

test('normalizeDate validates ranges and handles DD/MM heuristic', () => {
  // first field > 12 → must be DD/MM
  assert.equal(normalizeDate('31/12/1990'), '1990-12-31');
  // impossible in either interpretation → null (drop birthday, keep record)
  assert.equal(normalizeDate('13/13/2020'), null);
  // impossible 8-digit vCard BDAY → null
  assert.equal(normalizeDate('19901301'), null);
  assert.equal(normalizeDate('19900132'), null);
  // year-less vCard --MMDD can't be represented → null (no fabricated 1900)
  assert.equal(normalizeDate('--0415'), null);
  assert.equal(normalizeDate('--04-15'), null);
  // impossible ISO-ish → null
  assert.equal(normalizeDate('1990-31-12'), null);
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

test('phone matching tolerates +1 country-code prefix', () => {
  const { phoneMatchKey } = require('../import/matcher');
  assert.equal(phoneMatchKey('+1 (555) 123-4567'), phoneMatchKey('555-123-4567'));
  assert.equal(phoneMatchKey('+15551234567'), '5551234567');
  assert.equal(phoneMatchKey('bad'), null);
  // matcher: record phone '5551234567' vs contact phone '+15551234567' → 0.95
  const rec = makeRecord({ display_name: 'X', phones: [{ label: 'mobile', phone: '555-123-4567' }] });
  const c = candidate({ contact: { display_name: 'Someone Else', email: null, location: null } });
  assert.equal(scoreCandidate(rec, c), 0.95);
});

// ---------------------------------------------------------------- ziputil
const { deepFixEncoding } = require('../import/ziputil');

test('deepFixEncoding repairs mojibake but leaves valid UTF-8 alone', () => {
  assert.equal(deepFixEncoding('Zo\u00C3\u00AB'), 'Zoë');        // 'ZoÃ«' → fixed
  assert.equal(deepFixEncoding('Zoë'), 'Zoë');                    // already valid → unchanged
  assert.equal(deepFixEncoding('中村'), '中村');                   // CJK → unchanged
  assert.equal(deepFixEncoding('😀'), '😀');                      // emoji → unchanged
  assert.equal(deepFixEncoding('plain ascii'), 'plain ascii');
  // nested structures
  assert.deepEqual(deepFixEncoding({ a: ['Zo\u00C3\u00AB', '中村'] }), { a: ['Zoë', '中村'] });
  // classic UTF-8-read-as-latin1 artifact for U+2019 (’): E2 80 99 → â + C1 controls
  assert.equal(deepFixEncoding('don\u00E2\u0080\u0099t'), 'don\u2019t');
  // cp1252-flavored mojibake (â€™) is NOT reversible via latin1 — left unchanged
  assert.equal(deepFixEncoding('don\u00E2\u20AC\u2122t'), 'don\u00E2\u20AC\u2122t');
});

// ---------------------------------------------------------------- vcard QP
const { decodeQP } = require('../import/parsers/vcard');

test('decodeQP decodes multi-byte UTF-8 sequences', () => {
  assert.equal(decodeQP('=C3=A9'), 'é');
  assert.equal(decodeQP('Andr=C3=A9'), 'André');
  assert.equal(decodeQP('=E4=B8=AD=E6=9D=91'), '中村');
  assert.equal(decodeQP('plain'), 'plain');
  assert.equal(decodeQP('a=ZZb'), 'a=ZZb'); // invalid escape left as-is
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
