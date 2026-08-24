'use strict';

// Integration coverage for auth: login success/failure, protected-route
// rejection when unauthenticated, and cookie session behavior against the
// real HTTP routes (server/index.js `app`, real DB — see helpers.js).

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { startTestServer, createUser, login, api } = require('./helpers');

let ctx;
let baseUrl;

before(async () => {
  ctx = await startTestServer();
  baseUrl = ctx.baseUrl;
});

after(async () => {
  await ctx?.close();
});

test('login with valid credentials succeeds and returns a session cookie', async () => {
  const user = await createUser({ password: 'correct-horse-battery' });
  const { cookie, user: sessionUser } = await login(baseUrl, user.username, 'correct-horse-battery');
  assert.ok(cookie.startsWith('kith_token='), 'expected a kith_token cookie');
  assert.equal(sessionUser.username, user.username);
});

test('login with wrong password is rejected', async () => {
  const user = await createUser({ password: 'correct-horse-battery' });
  const res = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { username: user.username, password: 'definitely-wrong' },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
});

test('login with unknown username is rejected the same way (no user enumeration)', async () => {
  const res = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { username: 'no-such-user-ever', password: 'whatever123' },
  });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials');
});

test('login with missing fields is a 400, not a 500', async () => {
  const res = await api(baseUrl, 'POST', '/api/auth/login', { body: { username: 'x' } });
  assert.equal(res.status, 400);
});

test('a protected route rejects an unauthenticated request', async () => {
  const res = await api(baseUrl, 'GET', '/api/contacts');
  assert.equal(res.status, 401);
});

test('a protected route rejects a malformed session cookie', async () => {
  const res = await api(baseUrl, 'GET', '/api/contacts', { cookie: 'kith_token=not-a-real-jwt' });
  assert.equal(res.status, 401);
});

test('a protected route rejects a well-formed JWT signed with the wrong secret', async () => {
  // A malformed string only proves the parser rejects garbage. This proves
  // signature verification itself is enforced, not just shape-checking.
  const forged = jwt.sign({ sub: 1, username: 'admin', role: 'main_admin', tv: 0 }, 'not-the-real-jwt-secret', {
    expiresIn: '7d',
  });
  const res = await api(baseUrl, 'GET', '/api/contacts', { cookie: `kith_token=${forged}` });
  assert.equal(res.status, 401);
});

test('the session cookie is HttpOnly and SameSite=Strict', async () => {
  const user = await createUser({ password: 'correct-horse-battery' });
  const res = await api(baseUrl, 'POST', '/api/auth/login', {
    body: { username: user.username, password: 'correct-horse-battery' },
  });
  const setCookie = res.headers.get('set-cookie') || '';
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);
});

test('a protected route accepts a valid session cookie', async () => {
  const user = await createUser({ password: 'correct-horse-battery' });
  const { cookie } = await login(baseUrl, user.username, 'correct-horse-battery');
  const res = await api(baseUrl, 'GET', '/api/contacts', { cookie });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.contacts));
});

test('GET /api/auth/me reflects the authenticated user', async () => {
  const user = await createUser({ password: 'correct-horse-battery' });
  const { cookie } = await login(baseUrl, user.username, 'correct-horse-battery');
  const res = await api(baseUrl, 'GET', '/api/auth/me', { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.username, user.username);
  assert.equal(res.body.user.must_change_password, false);
});

test('logout clears the session cookie', async () => {
  const user = await createUser({ password: 'correct-horse-battery' });
  const { cookie } = await login(baseUrl, user.username, 'correct-horse-battery');
  const res = await api(baseUrl, 'POST', '/api/auth/logout', { cookie });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie') || '';
  assert.match(setCookie, /kith_token=;/);
  assert.match(setCookie, /Max-Age=0/);

  // Pin the actual (intentional) behavior: sessions are stateless JWTs with
  // no server-side revocation list — logout only clears the cookie on the
  // client that receives this response. The token itself remains valid
  // until it expires or token_version is bumped (password change/admin
  // reset — see middleware/auth.js). If this ever changes to real
  // server-side revocation, this assertion should flip to 401.
  const stillWorks = await api(baseUrl, 'GET', '/api/auth/me', { cookie });
  assert.equal(stillWorks.status, 200);
});

test('a forced password-change account is blocked from unrelated routes until it changes its password', async () => {
  const user = await createUser({ password: 'changeme123', mustChangePassword: true });
  const { cookie } = await login(baseUrl, user.username, 'changeme123');
  const blocked = await api(baseUrl, 'GET', '/api/contacts', { cookie });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, 'MUST_CHANGE_PASSWORD');

  const allowed = await api(baseUrl, 'GET', '/api/auth/me', { cookie });
  assert.equal(allowed.status, 200);
});
