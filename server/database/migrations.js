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
    version: 4,
    name: 'journal-immich-moves-education',
    up: async (query) => {
      const colExists = async (table, col) => {
        const rows = await query(
          `SELECT 1 FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`, [table, col]);
        return rows.length > 0;
      };
      // contacts: hometown + education (schooling/college free text)
      if (!(await colExists('contacts', 'hometown'))) {
        await query("ALTER TABLE contacts ADD COLUMN hometown VARCHAR(255) NULL AFTER place_of_birth");
      }
      if (!(await colExists('contacts', 'education'))) {
        await query("ALTER TABLE contacts ADD COLUMN education VARCHAR(500) NULL AFTER occupation");
      }
      // addresses: residency window → move history ("moved in / moved out";
      // NULL end_date = current home)
      if (!(await colExists('contact_addresses', 'start_date'))) {
        await query('ALTER TABLE contact_addresses ADD COLUMN start_date DATE NULL AFTER is_primary');
      }
      if (!(await colExists('contact_addresses', 'end_date'))) {
        await query('ALTER TABLE contact_addresses ADD COLUMN end_date DATE NULL AFTER start_date');
      }
      // media: Immich-backed assets (file_path becomes nullable; immich rows
      // carry instance + asset id and are proxied, never stored locally)
      await query('ALTER TABLE media_assets MODIFY file_path VARCHAR(500) NULL');
      if (!(await colExists('media_assets', 'immich_instance_id'))) {
        await query('ALTER TABLE media_assets ADD COLUMN immich_instance_id INT NULL AFTER thumbnail_path');
      }
      if (!(await colExists('media_assets', 'immich_asset_id'))) {
        await query('ALTER TABLE media_assets ADD COLUMN immich_asset_id VARCHAR(64) NULL AFTER immich_instance_id');
      }
      // personal diary — distinct from the contact timeline
      await query(`CREATE TABLE IF NOT EXISTS journal_entries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_user_id INT NOT NULL,
        kind VARCHAR(20) NOT NULL DEFAULT 'entry',
        title VARCHAR(255) NULL,
        content TEXT NULL,
        location VARCHAR(255) NULL,
        latitude DECIMAL(10,7) NULL,
        longitude DECIMAL(10,7) NULL,
        event_id INT NULL,
        is_spicy BOOLEAN NOT NULL DEFAULT 0,
        occurred_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        CONSTRAINT fk_journal_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
        CONSTRAINT fk_journal_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
        INDEX idx_journal_owner_occurred (owner_user_id, occurred_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      // City-level lookups are now local-first (exact state/country
      // qualifier matching) — drop remote-sourced cache rows so previously
      // mis-placed "City, ST" locations recompute correctly.
      await query("DELETE FROM geo_cache WHERE source IN ('photon','none')");
      // per-user Immich connections (api_key stored field-encrypted)
      await query(`CREATE TABLE IF NOT EXISTS immich_instances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_user_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        base_url VARCHAR(500) NOT NULL,
        api_key TEXT NOT NULL,
        is_spicy BOOLEAN NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_immich_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
        INDEX idx_immich_owner (owner_user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
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
  {
    version: 5,
    name: 'import-jobs-updated-at',
    up: async (query) => {
      // updated_at powers the stuck-job recovery guard (only requeue jobs
      // whose last state change is old enough — see import/worker.js).
      const rows = await query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'import_jobs' AND COLUMN_NAME = 'updated_at'`
      );
      if (!rows.length) {
        await query(
          'ALTER TABLE import_jobs ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at'
        );
      }
    },
  },
  {
    version: 6,
    name: 'event-locations-visited-places',
    up: async (query) => {
      // Multi-location events (roadtrips): extra stops beyond events.location
      // (which stays the primary). Geo metadata (city/state/country) is parsed
      // from the geocoder label at save time (lib/places.parseGeoLabel) so the
      // Places tab can derive visited states/countries without re-geocoding.
      await query(`CREATE TABLE IF NOT EXISTS event_locations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        event_id INT NOT NULL,
        label VARCHAR(255) NOT NULL,
        latitude DECIMAL(10,7) NULL,
        longitude DECIMAL(10,7) NULL,
        city VARCHAR(100) NULL,
        state VARCHAR(100) NULL,
        state_code VARCHAR(10) NULL,
        country_code VARCHAR(2) NULL,
        geocode_source VARCHAR(20) NULL,
        position INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_evloc_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        INDEX idx_evloc_event (event_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
      // Manual "been there" marks for the Places bucket list (pre-app trips).
      // Derived marks (from event locations) are computed on the fly and never
      // stored — `source` exists so a future backfill could persist them.
      await query(`CREATE TABLE IF NOT EXISTS visited_places (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        kind ENUM('country','us_state') NOT NULL,
        code VARCHAR(10) NOT NULL,
        source ENUM('manual','derived') NOT NULL DEFAULT 'manual',
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_vp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY uq_vp (user_id, kind, code),
        INDEX idx_vp_user (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    },
  },
  {
    version: 7,
    name: 'groups-tag-link-smart-groups',
    up: async (query) => {
      // Smart groups: a group with tag_id set derives its membership from
      // contact_tags (the linked tag IS the membership). Groups without
      // tag_id keep manual group_members semantics.
      const cols = await query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups' AND COLUMN_NAME = 'tag_id'`
      );
      if (!cols.length) {
        await query(
          'ALTER TABLE `groups` ADD COLUMN tag_id INT NULL AFTER is_system, ' +
          'ADD CONSTRAINT fk_groups_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE SET NULL'
        );
      }
      // Link the overlapping system seeds: Family group → Family tag and
      // Shared group → Shared tag. Skips silently when either side is missing
      // (the JOIN simply matches no rows).
      for (const name of ['Family', 'Shared']) {
        await query(
          `UPDATE \`groups\` g JOIN tags t ON t.name = ? AND t.owner_user_id IS NULL
           SET g.tag_id = t.id
           WHERE g.name = ? AND g.is_system = 1 AND g.tag_id IS NULL`,
          [name, name]
        );
      }
      // Backfill: existing members of newly-smart groups that lack the tag
      // get it copied over so nobody loses membership. The old group_members
      // rows for smart groups become inert (reads branch on tag_id and
      // ignore them) — deliberately left in place, harmless.
      await query(
        `INSERT IGNORE INTO contact_tags (contact_id, tag_id)
         SELECT gm.contact_id, g.tag_id FROM group_members gm
         JOIN \`groups\` g ON g.id = gm.group_id
         WHERE g.tag_id IS NOT NULL`
      );
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
