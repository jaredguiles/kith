'use strict';

// Integration coverage for ACL / share-scope behavior: a shared contact is
// visible/editable per its share_scope + permissions, and invisible outside
// of any share at all (existence not leaked — 404, not 403).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, createUser, login, api } = require('./helpers');

let ctx;
let baseUrl;
let owner, ownerCookie;
let recipient, recipientCookie;
let outsider, outsiderCookie;
let contactId;

before(async () => {
  ctx = await startTestServer();
  baseUrl = ctx.baseUrl;

  owner = await createUser({ password: 'owner-pass-123' });
  ({ cookie: ownerCookie } = await login(baseUrl, owner.username, 'owner-pass-123'));

  recipient = await createUser({ password: 'recipient-pass-123' });
  ({ cookie: recipientCookie } = await login(baseUrl, recipient.username, 'recipient-pass-123'));

  outsider = await createUser({ password: 'outsider-pass-123' });
  ({ cookie: outsiderCookie } = await login(baseUrl, outsider.username, 'outsider-pass-123'));

  const created = await api(baseUrl, 'POST', '/api/contacts', {
    cookie: ownerCookie,
    body: { first_name: 'Shared', last_name: 'Person', bio: 'Sensitive bio text', occupation: 'Spy' },
  });
  contactId = created.body.id;
});

after(async () => {
  await ctx?.close();
});

test('an unrelated user (no share) cannot see the contact at all', async () => {
  const res = await api(baseUrl, 'GET', `/api/contacts/${contactId}`, { cookie: outsiderCookie });
  assert.equal(res.status, 404);
});

test('basic-scope, read-only share: recipient sees only identity fields, cannot edit', async () => {
  const share = await api(baseUrl, 'POST', `/api/contacts/${contactId}/share`, {
    cookie: ownerCookie,
    body: { user_id: recipient.id, permissions: 'read', share_scope: 'basic' },
  });
  assert.equal(share.status, 200);

  const read = await api(baseUrl, 'GET', `/api/contacts/${contactId}`, { cookie: recipientCookie });
  assert.equal(read.status, 200);
  assert.equal(read.body.access, 'shared');
  assert.equal(read.body.share_scope, 'basic');
  assert.equal(read.body.contact.first_name, 'Shared');
  // basic scope strips everything outside the identity whitelist
  assert.equal(read.body.contact.bio, undefined);
  assert.equal(read.body.contact.occupation, undefined);

  const write = await api(baseUrl, 'PUT', `/api/contacts/${contactId}`, {
    cookie: recipientCookie,
    body: { occupation: 'Hacked' },
  });
  assert.equal(write.status, 403);
  assert.equal(write.body.error, 'Read-only access to this contact');
});

test('an outsider still cannot see the contact even though it is now shared with someone else', async () => {
  const res = await api(baseUrl, 'GET', `/api/contacts/${contactId}`, { cookie: outsiderCookie });
  assert.equal(res.status, 404);
});

test('full-scope, edit share: recipient sees full fields and can edit', async () => {
  const share = await api(baseUrl, 'POST', `/api/contacts/${contactId}/share`, {
    cookie: ownerCookie,
    body: { user_id: recipient.id, permissions: 'edit', share_scope: 'full' },
  });
  assert.equal(share.status, 200);

  const read = await api(baseUrl, 'GET', `/api/contacts/${contactId}`, { cookie: recipientCookie });
  assert.equal(read.status, 200);
  assert.equal(read.body.share_scope, 'full');
  assert.equal(read.body.contact.bio, 'Sensitive bio text');

  const write = await api(baseUrl, 'PUT', `/api/contacts/${contactId}`, {
    cookie: recipientCookie,
    body: { occupation: 'Double agent' },
  });
  assert.equal(write.status, 200);

  const confirm = await api(baseUrl, 'GET', `/api/contacts/${contactId}`, { cookie: ownerCookie });
  assert.equal(confirm.body.contact.occupation, 'Double agent');
});

test('a shared recipient cannot delete the owner-only contact', async () => {
  const res = await api(baseUrl, 'DELETE', `/api/contacts/${contactId}`, { cookie: recipientCookie });
  assert.equal(res.status, 403);
  assert.equal(res.body.error, 'Only the owner can delete a contact');
});

test('unsharing revokes access entirely', async () => {
  const unshare = await api(baseUrl, 'DELETE', `/api/contacts/${contactId}/share/${recipient.id}`, { cookie: ownerCookie });
  assert.equal(unshare.status, 200);

  const read = await api(baseUrl, 'GET', `/api/contacts/${contactId}`, { cookie: recipientCookie });
  assert.equal(read.status, 404);
});
