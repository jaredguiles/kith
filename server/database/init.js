const pool = require('./connection');
const bcrypt = require('bcryptjs');

const TABLES = [
  // 1. users
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('main_admin','admin','user') NOT NULL DEFAULT 'user',
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 2. contacts
  `CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    nickname VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(30),
    birthday DATE,
    age INT,
    sex VARCHAR(30),
    pronouns VARCHAR(50),
    orientation VARCHAR(50),
    relationship_status VARCHAR(50),
    location VARCHAR(255),
    photo_url VARCHAR(500),
    bio TEXT,
    occupation VARCHAR(150),
    company VARCHAR(150),
    website VARCHAR(500),
    zodiac_sign VARCHAR(20),
    languages VARCHAR(255),
    ethnicity VARCHAR(100),
    how_we_met VARCHAR(255),
    met_date DATE,
    rating TINYINT DEFAULT 0,
    relationship_type VARCHAR(50),
    is_favorite BOOLEAN DEFAULT 0,
    is_spicy BOOLEAN DEFAULT 0,
    is_anonymous BOOLEAN DEFAULT 0,
    notes_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 3. contact_emails
  `CREATE TABLE IF NOT EXISTS contact_emails (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    label VARCHAR(50),
    email VARCHAR(255) NOT NULL,
    is_primary BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 4. contact_phones
  `CREATE TABLE IF NOT EXISTS contact_phones (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    label VARCHAR(50),
    phone VARCHAR(30) NOT NULL,
    is_primary BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 5. contact_addresses
  `CREATE TABLE IF NOT EXISTS contact_addresses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    label VARCHAR(50),
    street VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    zip VARCHAR(20),
    country VARCHAR(100),
    is_primary BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 6. shared_contacts
  `CREATE TABLE IF NOT EXISTS shared_contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    shared_by_user_id INT NOT NULL,
    shared_with_user_id INT NOT NULL,
    permissions ENUM('read','edit') DEFAULT 'read',
    share_scope VARCHAR(50) DEFAULT 'basic',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (shared_by_user_id) REFERENCES users(id),
    FOREIGN KEY (shared_with_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 7. spicy_profiles
  `CREATE TABLE IF NOT EXISTS spicy_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL UNIQUE,
    spicy_type VARCHAR(50),
    orientation VARCHAR(50),
    role_preference VARCHAR(50),
    positions TEXT,
    kinks TEXT,
    turn_ons TEXT,
    turn_offs TEXT,
    boundaries TEXT,
    safe_word VARCHAR(100),
    protection_preference VARCHAR(50),
    hiv_status VARCHAR(50),
    on_prep BOOLEAN NULL,
    prep_since DATE NULL,
    last_tested_date DATE NULL,
    sti_notes TEXT,
    body_type VARCHAR(50),
    body_notes TEXT,
    endowment VARCHAR(50),
    grooming VARCHAR(50),
    spicy_rating TINYINT,
    chemistry_rating TINYINT,
    would_repeat BOOLEAN,
    spicy_notes TEXT,
    last_encounter DATE,
    encounter_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 8. tags
  `CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7),
    owner_user_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 9. contact_tags
  `CREATE TABLE IF NOT EXISTS contact_tags (
    contact_id INT NOT NULL,
    tag_id INT NOT NULL,
    PRIMARY KEY (contact_id, tag_id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 10. groups (backtick name to be safe, though 'groups' is allowed in MariaDB)
  `CREATE TABLE IF NOT EXISTS \`groups\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    color VARCHAR(7),
    icon VARCHAR(50),
    description TEXT,
    owner_user_id INT NULL,
    is_system BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 11. group_members
  `CREATE TABLE IF NOT EXISTS group_members (
    group_id INT NOT NULL,
    contact_id INT NOT NULL,
    PRIMARY KEY (group_id, contact_id),
    FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 12. social_links
  `CREATE TABLE IF NOT EXISTS social_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    platform VARCHAR(50),
    url VARCHAR(500),
    username VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 13. events
  `CREATE TABLE IF NOT EXISTS events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    type VARCHAR(50),
    description TEXT,
    location VARCHAR(255),
    is_spicy BOOLEAN DEFAULT 0,
    starts_at TIMESTAMP NULL,
    ends_at TIMESTAMP NULL,
    status ENUM('upcoming','completed','cancelled') DEFAULT 'upcoming',
    followup_notes TEXT,
    rating TINYINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 14. event_contacts
  `CREATE TABLE IF NOT EXISTS event_contacts (
    event_id INT NOT NULL,
    contact_id INT NOT NULL,
    PRIMARY KEY (event_id, contact_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 15. media_assets (created before event_media which references it)
  `CREATE TABLE IF NOT EXISTS media_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NULL,
    owner_user_id INT NOT NULL,
    type VARCHAR(20),
    file_path VARCHAR(500),
    thumbnail_path VARCHAR(500),
    caption TEXT,
    is_spicy BOOLEAN DEFAULT 0,
    is_profile_eligible BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 16. event_media
  `CREATE TABLE IF NOT EXISTS event_media (
    event_id INT NOT NULL,
    media_id INT NOT NULL,
    PRIMARY KEY (event_id, media_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (media_id) REFERENCES media_assets(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 17. contact_search_index
  `CREATE TABLE IF NOT EXISTS contact_search_index (
    contact_id INT PRIMARY KEY,
    search_text TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FULLTEXT INDEX idx_search_text (search_text)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 18. timeline_events
  `CREATE TABLE IF NOT EXISTS timeline_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    event_id INT NULL,
    type VARCHAR(50),
    title VARCHAR(255),
    description TEXT,
    is_spicy BOOLEAN DEFAULT 0,
    occurred_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 19. notes
  `CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    content TEXT NOT NULL,
    is_spicy BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 20. reminders
  `CREATE TABLE IF NOT EXISTS reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    owner_user_id INT NOT NULL,
    contact_id INT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (owner_user_id) REFERENCES users(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 21. messages
  `CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    platform VARCHAR(50),
    direction ENUM('in','out') NOT NULL,
    content TEXT,
    is_spicy BOOLEAN DEFAULT 0,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 22. audit_log
  `CREATE TABLE IF NOT EXISTS audit_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    contact_id INT NULL,
    action VARCHAR(50),
    entity_type VARCHAR(50),
    entity_id INT,
    old_values JSON,
    new_values JSON,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 23. contact_field_changelog
  `CREATE TABLE IF NOT EXISTS contact_field_changelog (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    user_id INT NULL,
    import_job_id INT NULL,
    source VARCHAR(50),
    field_name VARCHAR(100),
    old_value TEXT NULL,
    new_value TEXT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 24. import_jobs
  `CREATE TABLE IF NOT EXISTS import_jobs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    source_platform VARCHAR(50),
    status ENUM('queued','processing','awaiting_review','complete','error') DEFAULT 'queued',
    filename VARCHAR(255) NULL,
    is_spicy_source BOOLEAN DEFAULT 0,
    total_records INT DEFAULT 0,
    processed_records INT DEFAULT 0,
    new_contacts INT DEFAULT 0,
    merged_contacts INT DEFAULT 0,
    skipped_records INT DEFAULT 0,
    error_message TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 25. import_staging
  `CREATE TABLE IF NOT EXISTS import_staging (
    id INT AUTO_INCREMENT PRIMARY KEY,
    import_job_id INT NOT NULL,
    source_platform VARCHAR(50),
    source_id VARCHAR(255) NULL,
    normalized_data JSON,
    suggested_match_contact_id INT NULL,
    match_confidence DECIMAL(3,2) NULL,
    review_status ENUM('pending','approved_new','approved_merge','skipped') DEFAULT 'pending',
    merge_field_decisions JSON NULL,
    final_contact_id INT NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY (suggested_match_contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
    FOREIGN KEY (final_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 26. app_settings
  `CREATE TABLE IF NOT EXISTS app_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    \`key\` VARCHAR(100) NOT NULL UNIQUE,
    value TEXT,
    type VARCHAR(20),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // 27. preferences
  `CREATE TABLE IF NOT EXISTS preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    \`key\` VARCHAR(100) NOT NULL,
    value TEXT,
    type VARCHAR(20),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_user_key (user_id, \`key\`),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
];

// Add FK from contact_field_changelog to import_jobs after both tables exist
const ALTER_STATEMENTS = [
  `ALTER TABLE contact_field_changelog
   ADD CONSTRAINT fk_changelog_import_job
   FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE SET NULL`
];

async function initDatabase() {
  let conn;
  try {
    conn = await pool.getConnection();
    console.log('[DB] Connected to MariaDB');

    // Create tables in order
    for (let i = 0; i < TABLES.length; i++) {
      await conn.query(TABLES[i]);
    }
    console.log('[DB] All tables created/verified');

    // Run ALTER statements (ignore errors if constraints already exist)
    for (const stmt of ALTER_STATEMENTS) {
      try {
        await conn.query(stmt);
      } catch (err) {
        // Ignore duplicate key/constraint errors
        if (!err.message.includes('Duplicate') && !err.message.includes('already exists')) {
          // Only log non-duplicate errors for debugging
        }
      }
    }

    // Seed default admin user if no users exist
    const [users] = await conn.query('SELECT COUNT(*) as count FROM users');
    if (users[0].count === 0) {
      const hash = await bcrypt.hash('changeme', 12);
      await conn.query(
        'INSERT INTO users (username, email, display_name, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        ['admin', 'admin@example.com', 'Admin', hash, 'main_admin']
      );
      console.log('[DB] Default admin user created (admin / changeme)');
    }

    // Seed default tags if none exist
    const [tags] = await conn.query('SELECT COUNT(*) as count FROM tags');
    if (tags[0].count === 0) {
      const defaultTags = [
        ['Friend', '#50c878'],
        ['Family', '#5b9cf5'],
        ['Work', '#f59e0b'],
        ['VIP', '#7c5bf5'],
        ['Shared', '#ec4899']
      ];
      for (const [name, color] of defaultTags) {
        await conn.query(
          'INSERT INTO tags (name, color, owner_user_id) VALUES (?, ?, NULL)',
          [name, color]
        );
      }
      console.log('[DB] Default tags created');
    }

    // Seed default groups if none exist
    const [groups] = await conn.query('SELECT COUNT(*) as count FROM `groups`');
    if (groups[0].count === 0) {
      const defaultGroups = [
        ['Close Friends', '#7c5bf5', 'star', 'Your closest people'],
        ['Family', '#50c878', 'home', 'Family members'],
        ['Acquaintances', '#5b9cf5', 'users', 'People you know casually'],
        ['Shared', '#f59e0b', 'link', 'Auto-populated when contacts are shared']
      ];
      for (const [name, color, icon, description] of defaultGroups) {
        await conn.query(
          'INSERT INTO `groups` (name, color, icon, description, owner_user_id, is_system) VALUES (?, ?, ?, ?, NULL, 1)',
          [name, color, icon, description]
        );
      }
      console.log('[DB] Default groups created');
    }

    // Seed default app_settings if none exist
    const [settings] = await conn.query('SELECT COUNT(*) as count FROM app_settings');
    if (settings[0].count === 0) {
      const defaults = [
        ['app_name', '"Kith"', 'string'],
        ['app_logo', 'null', 'string'],
        ['accent_color', '"#7c5bf5"', 'color'],
        ['spicy_accent_color', '"#e84393"', 'color'],
        ['spicy_enabled', 'true', 'boolean'],
        ['spicy_pin', 'null', 'string'],
        ['spicy_auto_disable', '"never"', 'string'],
        ['media_path', '"/media"', 'string'],
        ['max_upload_size', '52428800', 'string'],
        ['extension_api_token', 'null', 'string'],
        ['extension_allowed_platforms', '["sniffies","snapchat"]', 'json']
      ];
      for (const [key, value, type] of defaults) {
        await conn.query(
          'INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, ?)',
          [key, value, type]
        );
      }
      console.log('[DB] Default app settings created');
    }

    console.log('[DB] Database initialization complete');
  } catch (err) {
    console.error('[DB] Initialization error:', err.message);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { initDatabase };
