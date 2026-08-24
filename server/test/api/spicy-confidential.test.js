'use strict';

// Integration coverage for the confidential ("spicy") layer: globally
// disabled by default, gated per-user by an active spicy session, gated
// per-share by share_scope === 'full_spicy', and encrypted at rest.
//
// ORDER-DEPENDENT: these tests run as a sequence (globally disabled → enabled
// → owner writes → read back → share at 'full' → reshare at 'full_spicy'),
// each building on the previous one's state. node:test runs tests within a
// file sequentially, which is what makes this valid — do NOT add
// `{ concurrency: true }` or run this file with --test-shuffle.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, createUser, login, api } = require('./helpers');
const { query } = require('../../database/connection');

let ctx;
let baseUrl;
let admin, adminCookie;
let owner, ownerCookie;
let outsider, outsiderCookie;
let sharedUser, sharedCookie;
let contactId;

async function setSpicyVisible(cookie, value) {
  const res = await api(baseUrl, 'PUT', '/api/preferences/spicy_visible', { cookie, body: { value, type: 'boolean' } });
  assert.equal(res.status, 200);
}

async function setSpicyEnabled(cookie, value) {
  const res = await api(baseUrl, 'PUT', '/api/settings/spicy_enabled', { cookie, body: { value, type: 'boolean' } });
  assert.equal(res.status, 200);
}

before(async () => {
  ctx = await startTestServer();
  baseUrl = ctx.baseUrl;

  admin = await createUser({ role: 'admin' });
  ({ cookie: adminCookie } = await login(baseUrl, admin.username, admin.password));

  owner = await createUser();
  ({ cookie: ownerCookie } = await login(baseUrl, owner.username, owner.password));

  outsider = await createUser();
  ({ cookie: outsiderCookie } = await login(baseUrl, outsider.username, outsider.password));

  sharedUser = await createUser();
  ({ cookie: sharedCookie } = await login(baseUrl, sharedUser.username, sharedUser.password));

  // app_settings.spicy_enabled is a single global row — force it to the
  // "default" state explicitly rather than relying on a fresh DB seed, so
  // this file is re-runnable against a persistent DB and doesn't depend on
  // test file ordering (restored again in `after`).
  await setSpicyEnabled(adminCookie, false);

  const created = await api(baseUrl, 'POST', '/api/contacts', {
    cookie: ownerCookie,
    body: { first_name: 'Confidential', last_name: 'Contact' },
  });
  contactId = created.body.id;
});

after(async () => {
  // `finally`: if restoring the global setting fails (server error, expired
  // cookie) the assert inside setSpicyEnabled throws — without this the
  // server listener and DB pool would leak and the run would hang on an open
  // handle instead of failing cleanly.
  try {
    if (adminCookie) await setSpicyEnabled(adminCookie, false);
  } finally {
    await ctx?.close();
  }
});

test('spicy endpoints are 403 while the feature is globally disabled (default)', async () => {
  const res = await api(baseUrl, 'GET', `/api/contacts/${contactId}/spicy`, { cookie: ownerCookie });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Spicy features are disabled');
});

test('enabling spicy globally still gates on the requesting user having an active spicy session', async () => {
  const enable = await api(baseUrl, 'PUT', '/api/settings/spicy_enabled', {
    cookie: adminCookie,
    body: { value: true, type: 'boolean' },
  });
  assert.equal(enable.status, 200);

  const res = await api(baseUrl, 'GET', `/api/contacts/${contactId}/spicy`, { cookie: ownerCookie });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Spicy mode is not active');
});

test('owner with an active spicy session can write and read confidential fields (round-trips through encryption)', async () => {
  await setSpicyVisible(ownerCookie, true);

  const put = await api(baseUrl, 'PUT', `/api/contacts/${contactId}/spicy`, {
    cookie: ownerCookie,
    body: { spicy_notes: 'top secret notes', kinks: ['a', 'b'] },
  });
  assert.equal(put.status, 200);

  const get = await api(baseUrl, 'GET', `/api/contacts/${contactId}/spicy`, { cookie: ownerCookie });
  assert.equal(get.status, 200);
  assert.equal(get.body.spicy_profile.spicy_notes, 'top secret notes');
  assert.deepEqual(get.body.spicy_profile.kinks, ['a', 'b']);
});

test('confidential fields are encrypted at rest, not stored as plaintext', async () => {
  const rows = await query('SELECT spicy_notes FROM spicy_profiles WHERE contact_id = ?', [contactId]);
  assert.equal(rows.length, 1);
  const stored = String(rows[0].spicy_notes);
  assert.ok(!stored.includes('top secret'), 'plaintext must not appear in the stored value');
  // Checking only the base64 TEXT is not enough: a regression to
  // "header + base64-of-plaintext" would keep the plaintext out of the
  // encoded string while still storing it verbatim. Decode and check the
  // bytes too, so the assertion can't pass with plaintext in the envelope.
  const decoded = Buffer.from(stored, 'base64');
  assert.ok(!decoded.toString('utf8').includes('top secret'), 'plaintext must not appear in the decoded envelope either');
  // Envelope per lib/crypto.js: base64( versionId(1) || iv(12) || tag(16) || ciphertext ) —
  // decoded length must be at least the fixed header (1 + 12 + 16 = 29 bytes).
  assert.ok(decoded.length >= 29, 'stored value must look like a version+iv+tag+ciphertext envelope');
});

test('a user with no access to the contact cannot see its confidential fields, even with their own spicy session active', async () => {
  await setSpicyVisible(outsiderCookie, true);
  const res = await api(baseUrl, 'GET', `/api/contacts/${contactId}/spicy`, { cookie: outsiderCookie });
  assert.equal(res.status, 404);
});

test('a shared recipient without full_spicy scope cannot see confidential fields', async () => {
  const share = await api(baseUrl, 'POST', `/api/contacts/${contactId}/share`, {
    cookie: ownerCookie,
    body: { user_id: sharedUser.id, permissions: 'read', share_scope: 'full' },
  });
  assert.equal(share.status, 200);
  await setSpicyVisible(sharedCookie, true);

  const res = await api(baseUrl, 'GET', `/api/contacts/${contactId}/spicy`, { cookie: sharedCookie });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Not shared at spicy scope');
});

test('a shared recipient with full_spicy scope can see confidential fields', async () => {
  const reshare = await api(baseUrl, 'POST', `/api/contacts/${contactId}/share`, {
    cookie: ownerCookie,
    body: { user_id: sharedUser.id, permissions: 'read', share_scope: 'full_spicy' },
  });
  assert.equal(reshare.status, 200);

  const res = await api(baseUrl, 'GET', `/api/contacts/${contactId}/spicy`, { cookie: sharedCookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.spicy_profile.spicy_notes, 'top secret notes');
});

test('a full_spicy recipient with read-only permissions still cannot WRITE confidential fields', async () => {
  // Reading at spicy scope (previous test) must not imply writing: share_scope
  // controls WHICH layer is visible, `permissions` controls read-vs-write, and
  // the two are enforced independently. Relies on the read-only full_spicy
  // share established by the previous test.
  const res = await api(baseUrl, 'PUT', `/api/contacts/${contactId}/spicy`, {
    cookie: sharedCookie,
    body: { spicy_notes: 'tampered by a read-only recipient' },
  });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Read-only access to this contact');

  // and the stored value is untouched
  const check = await api(baseUrl, 'GET', `/api/contacts/${contactId}/spicy`, { cookie: ownerCookie });
  assert.equal(check.body.spicy_profile.spicy_notes, 'top secret notes');
});
