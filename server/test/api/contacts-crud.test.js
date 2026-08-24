'use strict';

// Integration coverage for core contacts CRUD against the real HTTP routes.

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startTestServer, createUser, login, api } = require('./helpers');
const { query } = require('../../database/connection');

let ctx;
let baseUrl;
let owner;
let ownerCookie;

before(async () => {
  ctx = await startTestServer();
  baseUrl = ctx.baseUrl;
  owner = await createUser({ password: 'owner-pass-123' });
  ({ cookie: ownerCookie } = await login(baseUrl, owner.username, 'owner-pass-123'));
});

after(async () => {
  await ctx?.close();
});

test('create a contact', async () => {
  const res = await api(baseUrl, 'POST', '/api/contacts', {
    cookie: ownerCookie,
    body: { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@example.test' },
  });
  assert.equal(res.status, 201);
  assert.ok(Number.isInteger(res.body.id));
});

test('read a created contact back by id', async () => {
  const created = await api(baseUrl, 'POST', '/api/contacts', {
    cookie: ownerCookie,
    body: { first_name: 'Grace', last_name: 'Hopper' },
  });
  const id = created.body.id;

  const res = await api(baseUrl, 'GET', `/api/contacts/${id}`, { cookie: ownerCookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.contact.first_name, 'Grace');
  assert.equal(res.body.contact.last_name, 'Hopper');
  assert.equal(res.body.contact.display_name, 'Grace Hopper');
  assert.equal(res.body.access, 'owner');
});

test('update a contact', async () => {
  const created = await api(baseUrl, 'POST', '/api/contacts', {
    cookie: ownerCookie,
    body: { first_name: 'Katherine', last_name: 'Johnson' },
  });
  const id = created.body.id;

  const update = await api(baseUrl, 'PUT', `/api/contacts/${id}`, {
    cookie: ownerCookie,
    body: { occupation: 'Mathematician' },
  });
  assert.equal(update.status, 200);

  const after1 = await api(baseUrl, 'GET', `/api/contacts/${id}`, { cookie: ownerCookie });
  assert.equal(after1.body.contact.occupation, 'Mathematician');
});

test('delete (soft) a contact removes it from subsequent access', async () => {
  const created = await api(baseUrl, 'POST', '/api/contacts', {
    cookie: ownerCookie,
    body: { first_name: 'Margaret', last_name: 'Hamilton' },
  });
  const id = created.body.id;

  const del = await api(baseUrl, 'DELETE', `/api/contacts/${id}`, { cookie: ownerCookie });
  assert.equal(del.status, 200);

  const after1 = await api(baseUrl, 'GET', `/api/contacts/${id}`, { cookie: ownerCookie });
  assert.equal(after1.status, 404);

  // confirm it's a soft delete (deleted_at stamped), not a row removal
  const rows = await query('SELECT deleted_at FROM contacts WHERE id = ?', [id]);
  assert.equal(rows.length, 1, 'row must still exist after a "delete"');
  assert.ok(rows[0].deleted_at, 'deleted_at must be stamped');
});

test('a contact owned by someone else is not visible or editable (404, existence not leaked)', async () => {
  const stranger = await createUser({ password: 'stranger-pass-123' });
  const { cookie: strangerCookie } = await login(baseUrl, stranger.username, 'stranger-pass-123');

  const created = await api(baseUrl, 'POST', '/api/contacts', {
    cookie: ownerCookie,
    body: { first_name: 'Private', last_name: 'Contact' },
  });
  const id = created.body.id;

  const read = await api(baseUrl, 'GET', `/api/contacts/${id}`, { cookie: strangerCookie });
  assert.equal(read.status, 404);

  const write = await api(baseUrl, 'PUT', `/api/contacts/${id}`, { cookie: strangerCookie, body: { occupation: 'Nope' } });
  assert.equal(write.status, 404);
});

test('creating a contact requires authentication', async () => {
  const res = await api(baseUrl, 'POST', '/api/contacts', { body: { first_name: 'No', last_name: 'Auth' } });
  assert.equal(res.status, 401);
});
