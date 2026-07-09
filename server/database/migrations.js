'use strict';

// schema_version table + trivial sequential migration runner.
// v1 ships migration 001 (= the full schema, applied by init.js). Every post-v1
// schema change is a numbered migration registered in MIGRATIONS below.

const { query } = require('./connection');

// Registered migrations: { version, name, up(conn|query) }.
// Migration 001 is the full v1 schema — created by init.js's ensureSchema(),
// so its `up` is a no-op marker recorded after ensureSchema succeeds.
const MIGRATIONS = [
  { version: 1, name: 'v1-full-schema', up: async () => { /* applied by init.js ensureSchema() */ } },
  {
    version: 2,
    name: 'contacts-deceased-status',
    up: async (query) => {
      // Alive/deceased status so people who have passed can stay in the
      // record (family/ancestry) without polluting birthday nudges etc.
      const cols = await query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts'
           AND COLUMN_NAME IN ('is_deceased', 'date_of_death')`
      );
      const have = new Set(cols.map((c) => c.COLUMN_NAME));
      if (!have.has('is_deceased')) {
        await query('ALTER TABLE contacts ADD COLUMN is_deceased BOOLEAN NOT NULL DEFAULT 0 AFTER birthday');
      }
      if (!have.has('date_of_death')) {
        await query('ALTER TABLE contacts ADD COLUMN date_of_death DATE NULL AFTER is_deceased');
      }
    },
  },
  {
    version: 3,
    name: 'contacts-identity-genealogy-fields',
    up: async (query) => {
      // Inclusive identity + genealogy metadata. gender_identity is separate
      // from `sex` (assigned at birth) so transitions are representable —
      // changes to it are recorded in the per-field change log like any edit.
      const want = {
        gender_identity: "ADD COLUMN gender_identity VARCHAR(50) NULL AFTER sex",
        maiden_name: "ADD COLUMN maiden_name VARCHAR(100) NULL AFTER nickname",
        place_of_birth: "ADD COLUMN place_of_birth VARCHAR(255) NULL AFTER birthday",
        place_of_death: "ADD COLUMN place_of_death VARCHAR(255) NULL AFTER date_of_death",
        religion: "ADD COLUMN religion VARCHAR(100) NULL AFTER ethnicity",
        nationality: "ADD COLUMN nationality VARCHAR(100) NULL AFTER religion",
      };
      const cols = await query(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contacts'
           AND COLUMN_NAME IN (${Object.keys(want).map((c) => `'${c}'`).join(',')})`
      );
      const have = new Set(cols.map((c) => c.COLUMN_NAME));
      for (const [col, ddl] of Object.entries(want)) {
        if (!have.has(col)) await query(`ALTER TABLE contacts ${ddl}`);
      }
    },
  },
];

async function ensureVersionTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INT NOT NULL PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function currentVersion() {
  const rows = await query('SELECT COALESCE(MAX(version), 0) AS v FROM schema_version');
  return rows[0].v;
}

async function runMigrations() {
  await ensureVersionTable();
  const current = await currentVersion();
  const pending = MIGRATIONS.filter((m) => m.version > current).sort((a, b) => a.version - b.version);
  for (const m of pending) {
    console.log(`[migrate] applying ${m.version} — ${m.name}`);
    await m.up(query);
    await query('INSERT INTO schema_version (version, name) VALUES (?, ?)', [m.version, m.name]);
  }
  return { from: current, to: await currentVersion() };
}

module.exports = { runMigrations, MIGRATIONS };
