'use strict';

// MariaDB connection pool. Reads DB_* env vars — never hardcode hosts (§2.1).

const fs = require('node:fs');
const mysql = require('mysql2/promise');

let pool = null;

// Build the TLS config for the DB connection.
// - DB_SSL !== 'true'        → no TLS (undefined)
// - DB_SSL=true (default)    → TLS with certificate verification ON
// - DB_SSL_CA=<path>         → verify against that CA bundle (self-signed CAs)
// - DB_SSL_INSECURE=true     → explicit opt-out of verification (logs warning)
function buildSslConfig() {
  if (String(process.env.DB_SSL) !== 'true') return undefined;
  if (String(process.env.DB_SSL_INSECURE) === 'true') {
    console.warn(
      '[db] WARNING: DB_SSL_INSECURE=true — TLS certificate verification is DISABLED. ' +
      'Provide DB_SSL_CA with the server CA cert to enable verification.'
    );
    return { rejectUnauthorized: false };
  }
  if (process.env.DB_SSL_CA) {
    return { ca: fs.readFileSync(process.env.DB_SSL_CA), rejectUnauthorized: true };
  }
  return { rejectUnauthorized: true };
}

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: buildSslConfig(),
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: false,
    dateStrings: true, // return DATE/TIMESTAMP as strings; avoids TZ drift in JSON
    charset: 'utf8mb4_unicode_ci',
  });
  // Log pool-level errors (e.g. a dead pooled connection) instead of letting
  // them surface as an unhandled 'error' event and crash the process. mysql2's
  // PromisePool forwards only a subset of events, so attach to the underlying
  // callback pool (pool.pool) when it is exposed.
  const onPoolError = (err) => {
    console.error('[db] pool error:', err.code || '', err.message);
  };
  if (typeof pool.on === 'function') pool.on('error', onPoolError);
  if (pool.pool && typeof pool.pool.on === 'function') {
    pool.pool.on('error', onPoolError);
  }
  return pool;
}

/** Convenience: run a parameterized query, return rows. */
async function query(sql, params = []) {
  const [rows] = await getPool().execute(sql, params);
  return rows;
}

/** Run work inside a transaction. fn receives a connection with .execute(). */
async function withTransaction(fn) {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { getPool, query, withTransaction };
