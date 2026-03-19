import mariadb from 'mariadb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = mariadb.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kith',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
});

export async function query(sql, params = []) {
  let conn;
  try {
    conn = await pool.getConnection();
    if (Array.isArray(params) && params.length > 0) {
      return await conn.query(sql, params);
    }
    return await conn.query(sql);
  } finally {
    if (conn) conn.release();
  }
}

export async function initDb() {
  const initSqlPath = path.join(__dirname, '..', 'init.sql');
  const sql = fs.readFileSync(initSqlPath, 'utf-8');

  const statements = sql
    .split(';')
    .map(stmt => stmt.trim())
    .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

  // Use a no-database connection for CREATE DATABASE + USE — the pool's
  // database option would reject the connection if the DB doesn't exist yet.
  const bootstrapPool = mariadb.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    connectionLimit: 1,
  });

  let conn;
  try {
    conn = await bootstrapPool.getConnection();

    for (const stmt of statements) {
      try {
        await conn.query(stmt);
      } catch (err) {
        // Ignore "table already exists" style warnings during repeat startups
        if (err.code !== 'ER_TABLE_EXISTS_ERROR' && err.errno !== 1050) {
          console.error('Error executing statement:', stmt.substring(0, 100), err.message);
          throw err;
        }
      }
    }
    console.log('Database initialized successfully');
  } finally {
    if (conn) conn.release();
    await bootstrapPool.end();
  }
}

export async function getPool() {
  return pool;
}

export default pool;
