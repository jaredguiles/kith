'use strict';

// Integration coverage for the confidential ("spicy") layer: globally
// disabled by default, gated per-user by an active spicy session, gated
// per-share by share_scope === 'full_spicy', and encrypted at rest.

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
  if (adminCookie) await setSpicyEnabled(adminCookie, false);
  await ctx?.close();
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
  // Envelope per lib/crypto.js: base64( versionId(1) || iv(12) || tag(16) || ciphertext ) —
  // decoded length must be at least the fixed header (1 + 12 + 16 = 29 bytes).
  assert.ok(Buffer.from(stored, 'base64').length >= 29, 'stored value must look like a version+iv+tag+ciphertext envelope');
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
