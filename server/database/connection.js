'use strict';

// MariaDB connection pool. Reads DB_* env vars — never hardcode hosts (§2.1).

const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (pool) return pool;
  pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: String(process.env.DB_SSL) === 'true' ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    namedPlaceholders: false,
    dateStrings: true, // return DATE/TIMESTAMP as strings; avoids TZ drift in JSON
    charset: 'utf8mb4_unicode_ci',
  });
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
