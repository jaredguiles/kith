'use strict';

// Shared harness for the API integration suite (server/test/api/*.test.js).
// Boots the real Express app in-process (server/index.js exports `app` for
// exactly this) against an isolated, throwaway MariaDB instance — NEVER the
// docker-compose.dev.yml `kith-dev-db` (that backs a real running instance;
// see docker-compose.dev.yml's own header). Point this at your own throwaway
// DB via DB_* env vars if the defaults below don't match, e.g.:
//   docker run -d --name kith-test-db -p 33071:3306 \
//     -e MARIADB_ROOT_PASSWORD=test-root -e MARIADB_DATABASE=kith_test \
//     -e MARIADB_USER=kith_test -e MARIADB_PASSWORD=kith-test-password mariadb:11
//   npm run test:integration
//
// NOT a *.test.js file itself, so `node --test server/test/api/*.test.js`
// (and the flat `node --test server/test/*.test.js` glob used by unit tests)
// never tries to run it directly.

// Defaults match the throwaway container command above; override via env if
// you're pointing at a different instance.
process.env.DB_HOST = process.env.DB_HOST || '127.0.0.1';
process.env.DB_PORT = process.env.DB_PORT || '33071';
process.env.DB_USER = process.env.DB_USER || 'kith_test';
process.env.DB_PASSWORD = process.env.DB_PASSWORD || 'kith-test-password';
process.env.DB_NAME = process.env.DB_NAME || 'kith_test';
process.env.DB_SSL = process.env.DB_SSL || 'false';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'kith-integration-test-jwt-secret-not-for-real-use';
process.env.FIELD_ENCRYPTION_KEY = process.env.FIELD_ENCRYPTION_KEY || 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.BEHIND_TLS = process.env.BEHIND_TLS || 'false';
process.env.RATE_LIMIT_PER_MIN = process.env.RATE_LIMIT_PER_MIN || '0';

// Fail fast rather than silently pointing fixture inserts + global-setting
// mutations at a real database because of a stray exported DB_* var in the
// shell (this suite creates users, flips app-wide settings, etc. — never
// safe to run against anything but a disposable DB).
if (!/_test$/.test(process.env.DB_NAME)) {
  throw new Error(
    `Refusing to run the integration suite against DB_NAME="${process.env.DB_NAME}" — ` +
    `expected a name ending in "_test" (e.g. kith_test). This suite mutates data and ` +
    `global settings destructively; point it at a throwaway DB only.`
  );
}

const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { app } = require('../../index');
const { initDatabase } = require('../../database/init');
const { getPool, query } = require('../../database/connection');

const fetch = globalThis.fetch;

/** Boot the real app on an ephemeral port against the test DB. Idempotent
 * schema init (safe to call once per test file / process). */
async function startTestServer() {
  await initDatabase();
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const { port } = server.address();
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    async close() {
      // closeAllConnections: server.close() alone only stops accepting new
      // connections and waits for in-flight ones to finish naturally — an
      // idle keep-alive socket from undici's fetch pool can otherwise leave
      // this hanging.
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await getPool().end();
    },
  };
}

/** Short unique suffix so fixtures never collide across runs/files sharing a DB. */
function unique() {
  return crypto.randomBytes(4).toString('hex');
}

/**
 * Insert a user directly via SQL (bypasses the admin-created-user flow, which
 * forces must_change_password=1 and would require an extra login step per
 * fixture). Returns the plaintext password alongside the row so tests can log
 * in through the real /api/auth/login route.
 */
async function createUser({ role = 'user', password = 'testpass123', mustChangePassword = false } = {}) {
  const suffix = unique();
  const username = `it_${suffix}`;
  const email = `it_${suffix}@example.test`;
  const hash = await bcrypt.hash(password, 10);
  const result = await query(
    `INSERT INTO users (username, email, display_name, password_hash, role, is_active, must_change_password)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [username, email, username, hash, role, mustChangePassword ? 1 : 0]
  );
  await query(
    'INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?)',
    [result.insertId, 'spicy_visible', JSON.stringify(false), 'boolean']
  );
  return { id: result.insertId, username, email, password };
}

/** POST /api/auth/login; returns the `kith_token` Set-Cookie value for
 * subsequent authenticated requests (real cookie-session path, same as the SPA). */
async function login(baseUrl, username, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  if (res.status !== 200) {
    throw new Error(`login failed for ${username}: ${res.status} ${JSON.stringify(body)}`);
  }
  const setCookieAll = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || ''];
  const kithCookie = setCookieAll.find((c) => c.startsWith('kith_token=')) || '';
  const cookie = kithCookie.split(';')[0]; // "kith_token=<jwt>"
  return { cookie, token: body.token, user: body.user };
}

/** Thin fetch wrapper: JSON in, {status, body, headers} out. */
async function api(baseUrl, method, path, { cookie, body, headers = {} } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed = null;
  const text = await res.text();
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = text; }
  }
  return { status: res.status, body: parsed, headers: res.headers };
}

module.exports = { startTestServer, createUser, login, api, unique };
