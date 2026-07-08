'use strict';

// Idempotent schema creation + seed. Runs on every boot; safe to run repeatedly
// (CREATE TABLE IF NOT EXISTS, seed-if-absent). Schema per SPEC §Database Schema
// with plan §2.1 corrections applied (file-only import sources, no extension
// tokens) and §4.8 indexing requirements.

const bcrypt = require('bcryptjs');
const { query } = require('./connection');
const { runMigrations } = require('./migrations');

// §7.E Layer A: per-table InnoDB encryption (ENCRYPTED=YES) — enabled in
// production via TABLE_ENCRYPTION=true (requires the file_key_management
// plugin on the MariaDB server). Dev DB has no plugin → defaults off.
const TABLE_ENC = String(process.env.TABLE_ENCRYPTION) === 'true' ? ' ENCRYPTED=YES' : '';

// ---------------------------------------------------------------------------
// Table DDL — order matters for FKs.
// ---------------------------------------------------------------------------
const TABLES = [
  // users
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('main_admin','admin','user') NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT 1,
    must_change_password BOOLEAN NOT NULL DEFAULT 0,
    token_version INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contacts
  `CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NULL,
    middle_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    nickname VARCHAR(100) NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(30) NULL,
    birthday DATE NULL,
    age INT NULL,
    sex VARCHAR(30) NULL,
    pronouns VARCHAR(50) NULL,
    orientation VARCHAR(50) NULL,
    relationship_status VARCHAR(50) NULL,
    location VARCHAR(255) NULL,
    photo_url VARCHAR(500) NULL,
    bio TEXT NULL,
    occupation VARCHAR(150) NULL,
    company VARCHAR(150) NULL,
    website VARCHAR(500) NULL,
    zodiac_sign VARCHAR(20) NULL,
    languages VARCHAR(255) NULL,
    ethnicity VARCHAR(100) NULL,
    how_we_met VARCHAR(255) NULL,
    met_date DATE NULL,
    rating TINYINT NOT NULL DEFAULT 0,
    relationship_type VARCHAR(50) NULL,
    is_favorite BOOLEAN NOT NULL DEFAULT 0,
    is_spicy BOOLEAN NOT NULL DEFAULT 0,
    is_anonymous BOOLEAN NOT NULL DEFAULT 0,
    notes_text TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT fk_contacts_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
    INDEX idx_contacts_owner_deleted (owner_user_id, deleted_at),
    INDEX idx_contacts_favorite (is_favorite),
    INDEX idx_contacts_spicy (is_spicy)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contact_emails
  `CREATE TABLE IF NOT EXISTS contact_emails (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    label VARCHAR(50) NULL,
    email VARCHAR(255) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cemails_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_cemails_contact (contact_id),
    INDEX idx_cemails_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contact_phones
  `CREATE TABLE IF NOT EXISTS contact_phones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    label VARCHAR(50) NULL,
    phone VARCHAR(30) NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cphones_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_cphones_contact (contact_id),
    INDEX idx_cphones_phone (phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contact_addresses
  `CREATE TABLE IF NOT EXISTS contact_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    label VARCHAR(50) NULL,
    street VARCHAR(255) NULL,
    city VARCHAR(100) NULL,
    state VARCHAR(100) NULL,
    zip VARCHAR(20) NULL,
    country VARCHAR(100) NULL,
    is_primary BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_caddr_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_caddr_contact (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // shared_contacts
  `CREATE TABLE IF NOT EXISTS shared_contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    shared_by_user_id INT NOT NULL,
    shared_with_user_id INT NOT NULL,
    permissions ENUM('read','edit') NOT NULL DEFAULT 'read',
    share_scope VARCHAR(50) NOT NULL DEFAULT 'basic',
    acknowledged_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_share_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_share_by FOREIGN KEY (shared_by_user_id) REFERENCES users(id),
    CONSTRAINT fk_share_with FOREIGN KEY (shared_with_user_id) REFERENCES users(id),
    UNIQUE KEY uq_share (contact_id, shared_with_user_id),
    INDEX idx_share_with (shared_with_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // spicy_profiles — sensitive fields stored AES-256-GCM encrypted (§7.E Layer C)
  `CREATE TABLE IF NOT EXISTS spicy_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL UNIQUE,
    spicy_type VARCHAR(50) NULL,
    orientation VARCHAR(50) NULL,
    role_preference TEXT NULL,
    positions TEXT NULL,
    kinks TEXT NULL,
    turn_ons TEXT NULL,
    turn_offs TEXT NULL,
    boundaries TEXT NULL,
    safe_word TEXT NULL,
    protection_preference TEXT NULL,
    hiv_status TEXT NULL,
    on_prep TEXT NULL,
    prep_since TEXT NULL,
    last_tested_date TEXT NULL,
    sti_notes TEXT NULL,
    body_type VARCHAR(50) NULL,
    body_notes TEXT NULL,
    endowment TEXT NULL,
    grooming TEXT NULL,
    spicy_rating TEXT NULL,
    chemistry_rating TEXT NULL,
    would_repeat TEXT NULL,
    spicy_notes TEXT NULL,
    last_encounter TEXT NULL,
    encounter_count TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_spicy_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // tags
  `CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NULL,
    owner_user_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tags_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
    INDEX idx_tags_owner (owner_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contact_tags
  `CREATE TABLE IF NOT EXISTS contact_tags (
    contact_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (contact_id, tag_id),
    CONSTRAINT fk_ctags_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_ctags_tag FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    INDEX idx_ctags_contact (contact_id),
    INDEX idx_ctags_tag (tag_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // groups — backticked: GROUPS became reserved in MariaDB 10.3+
  `CREATE TABLE IF NOT EXISTS \`groups\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7) NULL,
    icon VARCHAR(50) NULL,
    description TEXT NULL,
    owner_user_id INT NULL,
    is_system BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_groups_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
    INDEX idx_groups_owner (owner_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // group_members
  `CREATE TABLE IF NOT EXISTS group_members (
    group_id INT NOT NULL,
    contact_id INT NOT NULL,
    PRIMARY KEY (group_id, contact_id),
    CONSTRAINT fk_gm_group FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
    CONSTRAINT fk_gm_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_gm_group (group_id),
    INDEX idx_gm_contact (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // social_links
  `CREATE TABLE IF NOT EXISTS social_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    platform VARCHAR(50) NULL,
    url VARCHAR(500) NULL,
    username VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_social_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_social_contact (contact_id),
    INDEX idx_social_platform_user (platform, username)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // events
  `CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50) NULL,
    description TEXT NULL,
    location VARCHAR(255) NULL,
    is_spicy BOOLEAN NOT NULL DEFAULT 0,
    starts_at TIMESTAMP NULL,
    ends_at TIMESTAMP NULL,
    status ENUM('upcoming','completed','cancelled') NOT NULL DEFAULT 'upcoming',
    followup_notes TEXT NULL,
    rating TINYINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT fk_events_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
    INDEX idx_events_owner_starts (owner_user_id, starts_at, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // event_contacts
  `CREATE TABLE IF NOT EXISTS event_contacts (
    event_id INT NOT NULL,
    contact_id INT NOT NULL,
    PRIMARY KEY (event_id, contact_id),
    CONSTRAINT fk_ec_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_ec_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_ec_event (event_id),
    INDEX idx_ec_contact (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // media_assets (must exist before event_media)
  `CREATE TABLE IF NOT EXISTS media_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NULL,
    owner_user_id INT NOT NULL,
    type VARCHAR(20) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    thumbnail_path VARCHAR(500) NULL,
    caption TEXT NULL,
    is_spicy BOOLEAN NOT NULL DEFAULT 0,
    is_profile_eligible BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT fk_media_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    CONSTRAINT fk_media_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
    INDEX idx_media_contact_spicy_deleted (contact_id, is_spicy, deleted_at),
    INDEX idx_media_owner (owner_user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // event_media
  `CREATE TABLE IF NOT EXISTS event_media (
    event_id INT NOT NULL,
    media_id INT NOT NULL,
    PRIMARY KEY (event_id, media_id),
    CONSTRAINT fk_em_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    CONSTRAINT fk_em_media FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE,
    INDEX idx_em_event (event_id),
    INDEX idx_em_media (media_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contact_search_index — cleartext SFW fields ONLY (§7.E)
  `CREATE TABLE IF NOT EXISTS contact_search_index (
    contact_id INT NOT NULL PRIMARY KEY,
    search_text TEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_csi_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FULLTEXT INDEX ftx_csi_search (search_text)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // timeline_events
  `CREATE TABLE IF NOT EXISTS timeline_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    event_id INT NULL,
    type VARCHAR(50) NULL,
    title VARCHAR(255) NULL,
    description TEXT NULL,
    is_spicy BOOLEAN NOT NULL DEFAULT 0,
    occurred_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT fk_tl_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_tl_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL,
    INDEX idx_tl_contact_occurred (contact_id, occurred_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // notes — content of is_spicy notes is field-encrypted (§7.E)
  `CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    content TEXT NOT NULL,
    is_spicy BOOLEAN NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT fk_notes_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_notes_contact (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // reminders
  `CREATE TABLE IF NOT EXISTS reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    contact_id INT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    due_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    CONSTRAINT fk_rem_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
    CONSTRAINT fk_rem_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    INDEX idx_rem_owner_due (owner_user_id, due_at, completed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // messages — content of is_spicy messages is field-encrypted (§7.E)
  `CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    platform VARCHAR(50) NULL,
    direction ENUM('in','out') NULL,
    content TEXT NULL,
    is_spicy BOOLEAN NOT NULL DEFAULT 0,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_msg_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_msg_contact_sent (contact_id, sent_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // audit_log
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    contact_id INT NULL,
    action VARCHAR(50) NOT NULL,
    entity_type VARCHAR(50) NULL,
    entity_id INT NULL,
    old_values JSON NULL,
    new_values JSON NULL,
    description TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_contact (contact_id),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // import_jobs (before contact_field_changelog which FKs it)
  `CREATE TABLE IF NOT EXISTS import_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    source_platform VARCHAR(50) NOT NULL,
    status ENUM('queued','processing','awaiting_review','complete','error') NOT NULL DEFAULT 'queued',
    filename VARCHAR(255) NULL,
    file_paths JSON NULL,
    column_mapping JSON NULL,
    is_spicy_source BOOLEAN NOT NULL DEFAULT 0,
    total_records INT NOT NULL DEFAULT 0,
    processed_records INT NOT NULL DEFAULT 0,
    new_contacts INT NOT NULL DEFAULT 0,
    merged_contacts INT NOT NULL DEFAULT 0,
    skipped_records INT NOT NULL DEFAULT 0,
    error_message TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    CONSTRAINT fk_ij_user FOREIGN KEY (user_id) REFERENCES users(id),
    INDEX idx_ij_user_status (user_id, status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contact_field_changelog
  `CREATE TABLE IF NOT EXISTS contact_field_changelog (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    user_id INT NULL,
    import_job_id INT NULL,
    source VARCHAR(50) NOT NULL,
    field_name VARCHAR(100) NOT NULL,
    old_value TEXT NULL,
    new_value TEXT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_cfc_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_cfc_job FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE SET NULL,
    INDEX idx_cfc_contact (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // import_staging
  `CREATE TABLE IF NOT EXISTS import_staging (
    id INT AUTO_INCREMENT PRIMARY KEY,
    import_job_id INT NOT NULL,
    source_platform VARCHAR(50) NULL,
    source_id VARCHAR(255) NULL,
    normalized_data JSON NOT NULL,
    suggested_match_contact_id INT NULL,
    match_confidence DECIMAL(3,2) NULL,
    review_status ENUM('pending','approved_new','approved_merge','skipped','error') NOT NULL DEFAULT 'pending',
    error_message TEXT NULL,
    merge_field_decisions JSON NULL,
    final_contact_id INT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_is_job FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
    CONSTRAINT fk_is_match FOREIGN KEY (suggested_match_contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    INDEX idx_is_job_status (import_job_id, review_status)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // app_settings — \`key\` is a MariaDB reserved word; always backtick
  `CREATE TABLE IF NOT EXISTS app_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    \`key\` VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'string',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // preferences (per-user)
  `CREATE TABLE IF NOT EXISTS preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    \`key\` VARCHAR(100) NOT NULL,
    value TEXT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'string',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_prefs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_prefs (user_id, \`key\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // notifications
  `CREATE TABLE IF NOT EXISTS notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NULL,
    link VARCHAR(500) NULL,
    read_at TIMESTAMP NULL,
    dismissed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_notif_user (user_id, dismissed_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // contact_relationships — "X is Y's sibling/partner/coworker" links
  `CREATE TABLE IF NOT EXISTS contact_relationships (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    related_contact_id INT NOT NULL,
    relation_type VARCHAR(50) NOT NULL,
    notes VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_crel_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_crel_related FOREIGN KEY (related_contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    UNIQUE KEY uq_crel (contact_id, related_contact_id, relation_type),
    INDEX idx_crel_related (related_contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // important_dates — anniversaries and other per-contact recurring dates
  `CREATE TABLE IF NOT EXISTS important_dates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    label VARCHAR(100) NOT NULL,
    date DATE NOT NULL,
    recurring BOOLEAN NOT NULL DEFAULT 1,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_idate_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_idate_contact (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // gift_ideas
  `CREATE TABLE IF NOT EXISTS gift_ideas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    notes TEXT NULL,
    url VARCHAR(500) NULL,
    occasion VARCHAR(100) NULL,
    status ENUM('idea','purchased','given') NOT NULL DEFAULT 'idea',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_gift_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_gift_contact (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // api_tokens — personal access tokens (hash stored, never the token)
  `CREATE TABLE IF NOT EXISTS api_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    prefix VARCHAR(16) NOT NULL,
    scopes VARCHAR(100) NOT NULL DEFAULT 'read',
    last_used_at TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    revoked_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_apitok_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_apitok_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // geo_cache — geocode result cache keyed by sha256(normalized query)
  `CREATE TABLE IF NOT EXISTS geo_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    query_hash CHAR(64) NOT NULL UNIQUE,
    query VARCHAR(500) NULL,
    latitude DECIMAL(10,7) NULL,
    longitude DECIMAL(10,7) NULL,
    label VARCHAR(255) NULL,
    source VARCHAR(20) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // interactions — one-tap touchpoint log (distinct from notes/timeline)
  `CREATE TABLE IF NOT EXISTS interactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    owner_user_id INT NOT NULL,
    type ENUM('call','text','met','email','video','gift','social','other') NOT NULL DEFAULT 'other',
    note VARCHAR(500) NULL,
    occurred_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_interactions_contact FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    CONSTRAINT fk_interactions_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
    INDEX idx_interactions_contact_occurred (contact_id, occurred_at),
    INDEX idx_interactions_owner_occurred (owner_user_id, occurred_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,

  // push_subscriptions — Web Push (VAPID) endpoints per user
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    p256dh VARCHAR(255) NOT NULL,
    auth VARCHAR(255) NOT NULL,
    user_agent VARCHAR(255) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP NULL,
    CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_endpoint (endpoint(255)),
    INDEX idx_push_user (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci${TABLE_ENC}`,
];

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------
async function seed() {
  // Main admin — forced password change on first login (§7.15)
  const admins = await query("SELECT id FROM users WHERE role = 'main_admin' LIMIT 1");
  let adminId;
  if (admins.length === 0) {
    const hash = await bcrypt.hash('changeme', 10);
    const res = await query(
      `INSERT INTO users (username, email, display_name, password_hash, role, is_active, must_change_password)
       VALUES ('admin', 'admin@example.com', 'Admin', ?, 'main_admin', 1, 1)`,
      [hash]
    );
    adminId = res.insertId;
    console.log('[seed] created main_admin (admin / changeme, forced change)');
  } else {
    adminId = admins[0].id;
  }

  // Default tags (system-wide: owner_user_id NULL)
  const defaultTags = [
    ['Friend', '#7c5bf5'],
    ['Family', '#50c878'],
    ['Work', '#5b9cf5'],
    ['VIP', '#fbbf24'],
    ['Shared', '#f59e0b'],
  ];
  for (const [name, color] of defaultTags) {
    const rows = await query('SELECT id FROM tags WHERE name = ? AND owner_user_id IS NULL', [name]);
    if (rows.length === 0) await query('INSERT INTO tags (name, color, owner_user_id) VALUES (?, ?, NULL)', [name, color]);
  }

  // Default groups (system)
  const defaultGroups = [
    ['Close Friends', 'star', '#7c5bf5', 'Your inner circle'],
    ['Family', 'home', '#50c878', 'Family members'],
    ['Acquaintances', 'users', '#5b9cf5', 'People you know'],
    ['Shared', 'link', '#f59e0b', 'Contacts shared with you'],
  ];
  for (const [name, icon, color, description] of defaultGroups) {
    const rows = await query('SELECT id FROM `groups` WHERE name = ? AND is_system = 1', [name]);
    if (rows.length === 0) {
      await query(
        'INSERT INTO `groups` (name, icon, color, description, owner_user_id, is_system) VALUES (?, ?, ?, ?, NULL, 1)',
        [name, icon, color, description]
      );
    }
  }

  // Default app settings — spicy_enabled seeds FALSE (deliberate post-setup act)
  const defaultSettings = [
    ['app_name', JSON.stringify('Kith'), 'string'],
    ['app_logo', JSON.stringify(null), 'string'],
    ['accent_color', JSON.stringify('#7c5bf5'), 'color'],
    ['spicy_accent_color', JSON.stringify('#c2394f'), 'color'],
    ['spicy_enabled', JSON.stringify(false), 'boolean'],
    ['spicy_require_pin', JSON.stringify(false), 'boolean'],
    ['spicy_auto_disable_minutes', JSON.stringify(0), 'string'],
    ['relationship_types', JSON.stringify(['Friend', 'Family', 'Coworker', 'Acquaintance', 'Neighbor', 'Other']), 'json'],
    ['media_path', JSON.stringify('/media'), 'string'],
    ['max_upload_size', JSON.stringify(52428800), 'string'],
    ['import_max_upload_size', JSON.stringify(2147483648), 'string'],
  ];
  for (const [key, value, type] of defaultSettings) {
    const rows = await query('SELECT id FROM app_settings WHERE `key` = ?', [key]);
    if (rows.length === 0) await query('INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, ?)', [key, value, type]);
  }

  // Default per-user preference for the admin
  const prefRows = await query('SELECT id FROM preferences WHERE user_id = ? AND `key` = ?', [adminId, 'spicy_visible']);
  if (prefRows.length === 0) {
    await query('INSERT INTO preferences (user_id, `key`, value, type) VALUES (?, ?, ?, ?)', [
      adminId, 'spicy_visible', JSON.stringify(false), 'boolean',
    ]);
  }
}

// ---------------------------------------------------------------------------
// Idempotent column additions for pre-existing databases (CREATE TABLE IF NOT
// EXISTS won't add columns to tables that already exist). Guarded by an
// information_schema check so this is safe to run on every boot.
// ---------------------------------------------------------------------------
async function ensureColumn(table, column, definition) {
  const rows = await query(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (Number(rows[0].n) === 0) {
    await query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`[init] added column ${table}.${column}`);
  }
}

async function ensureColumns() {
  // JWT token-version invalidation (logout / password change kills old tokens)
  await ensureColumn('users', 'token_version', 'INT NOT NULL DEFAULT 0');

  // Geocoding results on addresses
  await ensureColumn('contact_addresses', 'latitude', 'DECIMAL(10,7) NULL');
  await ensureColumn('contact_addresses', 'longitude', 'DECIMAL(10,7) NULL');
  await ensureColumn('contact_addresses', 'geocoded_at', 'TIMESTAMP NULL');
  await ensureColumn('contact_addresses', 'geocode_source', 'VARCHAR(20) NULL');

  // Keep-in-touch cadence
  await ensureColumn('contacts', 'keep_in_touch_days', 'INT NULL');
  await ensureColumn('contacts', 'last_contacted_at', 'TIMESTAMP NULL');

  // Middle name
  await ensureColumn('contacts', 'middle_name', 'VARCHAR(100) NULL');

  // Recurring reminders
  await ensureColumn('reminders', 'recur_rule', "ENUM('daily','weekly','monthly','yearly') NULL");
  await ensureColumn('reminders', 'recur_until', 'DATE NULL');

  // TOTP two-factor
  await ensureColumn('users', 'totp_secret', 'VARCHAR(255) NULL');
  await ensureColumn('users', 'totp_enabled', 'BOOLEAN NOT NULL DEFAULT 0');

  // Document attachments keep their original filename
  await ensureColumn('media_assets', 'original_name', 'VARCHAR(255) NULL');

  // "My profile": each user may link a self-contact (their own contact card).
  // Deliberately NO FK constraint — ensureColumn only adds columns, and an
  // idempotent FK-add would need extra information_schema plumbing for little
  // gain. Code treats a dangling/soft-deleted self_contact_id as "not linked".
  await ensureColumn('users', 'self_contact_id', 'INT NULL');

  // Notification + digest + nudge delivery preferences (per-user).
  await ensureColumn('users', 'notify_email', 'VARCHAR(255) NULL');
  await ensureColumn('users', 'digest_weekly', 'BOOLEAN NOT NULL DEFAULT 1');
  await ensureColumn('users', 'digest_day', 'TINYINT NOT NULL DEFAULT 1');
  await ensureColumn('users', 'nudge_birthdays', 'BOOLEAN NOT NULL DEFAULT 1');
  await ensureColumn('users', 'nudge_reminders', 'BOOLEAN NOT NULL DEFAULT 1');
  await ensureColumn('users', 'nudge_out_of_touch', 'BOOLEAN NOT NULL DEFAULT 1');
  await ensureColumn('users', 'notify_channel', "ENUM('email','push','both','none') NOT NULL DEFAULT 'email'");
}

// ---------------------------------------------------------------------------
async function initDatabase() {
  for (const ddl of TABLES) {
    await query(ddl);
  }
  await ensureColumns();
  await runMigrations();
  await seed();
  console.log('[init] database schema + seed OK');
}

module.exports = { initDatabase };
