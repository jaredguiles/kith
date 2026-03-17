import pool from './connection.js';
import bcrypt from 'bcryptjs';

const SCHEMA_STATEMENTS = [
  // Contacts table
  `CREATE TABLE IF NOT EXISTS contacts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    display_name VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    phone VARCHAR(30),
    birthday DATE NULL,
    age INT,
    location VARCHAR(255),
    photo_url VARCHAR(500),
    rating TINYINT DEFAULT 0,
    is_me BOOLEAN DEFAULT 0,
    is_anonymous BOOLEAN DEFAULT 0,
    is_spicy BOOLEAN DEFAULT 0,
    notes_text TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_display_name (display_name),
    INDEX idx_is_me (is_me),
    INDEX idx_birthday (birthday),
    INDEX idx_created_at (created_at),
    INDEX idx_deleted_at (deleted_at),
    FULLTEXT INDEX ft_contacts (display_name, first_name, last_name, email, phone)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Platform profiles
  `CREATE TABLE IF NOT EXISTS platform_profiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    platform VARCHAR(100) NOT NULL,
    platform_user_id VARCHAR(255),
    username VARCHAR(255),
    profile_url VARCHAR(500),
    bio TEXT,
    verified BOOLEAN DEFAULT 0,
    follower_count INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_platform (contact_id, platform),
    INDEX idx_platform (platform),
    INDEX idx_contact_id (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Platform-specific preferences
  `CREATE TABLE IF NOT EXISTS platform_preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    platform VARCHAR(100) NOT NULL,
    \`key\` VARCHAR(255) NOT NULL,
    value JSON,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_preference (contact_id, platform, \`key\`),
    INDEX idx_contact_platform (contact_id, platform)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Timeline events
  `CREATE TABLE IF NOT EXISTS timeline_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    title VARCHAR(255),
    description TEXT,
    is_spicy BOOLEAN DEFAULT 0,
    occurred_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    INDEX idx_contact_id (contact_id),
    INDEX idx_event_type (event_type),
    INDEX idx_occurred_at (occurred_at),
    INDEX idx_deleted_at (deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Messages
  `CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    timeline_event_id INT,
    sender VARCHAR(100) NOT NULL,
    content LONGTEXT NOT NULL,
    message_type VARCHAR(50) DEFAULT 'text',
    is_spicy BOOLEAN DEFAULT 0,
    platform VARCHAR(100),
    message_timestamp TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (timeline_event_id) REFERENCES timeline_events(id) ON DELETE SET NULL,
    INDEX idx_contact_id (contact_id),
    INDEX idx_timeline_event_id (timeline_event_id),
    INDEX idx_platform (platform),
    INDEX idx_created_at (created_at),
    FULLTEXT INDEX ft_content (content)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Notes
  `CREATE TABLE IF NOT EXISTS notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    timeline_event_id INT,
    content LONGTEXT NOT NULL,
    is_spicy BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (timeline_event_id) REFERENCES timeline_events(id) ON DELETE SET NULL,
    INDEX idx_contact_id (contact_id),
    INDEX idx_timeline_event_id (timeline_event_id),
    INDEX idx_created_at (created_at),
    FULLTEXT INDEX ft_content (content)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Media assets
  `CREATE TABLE IF NOT EXISTS media_assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    timeline_event_id INT,
    file_url VARCHAR(500) NOT NULL,
    media_type VARCHAR(50) DEFAULT 'image',
    is_spicy BOOLEAN DEFAULT 0,
    platform VARCHAR(100),
    captured_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (timeline_event_id) REFERENCES timeline_events(id) ON DELETE SET NULL,
    UNIQUE KEY unique_file (contact_id, file_url),
    INDEX idx_contact_id (contact_id),
    INDEX idx_timeline_event_id (timeline_event_id),
    INDEX idx_media_type (media_type),
    INDEX idx_deleted_at (deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Reminders
  `CREATE TABLE IF NOT EXISTS reminders (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    timeline_event_id INT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP NULL,
    last_notified_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (timeline_event_id) REFERENCES timeline_events(id) ON DELETE SET NULL,
    INDEX idx_contact_id (contact_id),
    INDEX idx_due_at (due_at),
    INDEX idx_completed_at (completed_at),
    INDEX idx_deleted_at (deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Tags
  `CREATE TABLE IF NOT EXISTS tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#cccccc',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Contact tags
  `CREATE TABLE IF NOT EXISTS contact_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL,
    tag_id INT NOT NULL,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE,
    UNIQUE KEY unique_contact_tag (contact_id, tag_id),
    INDEX idx_tag_id (tag_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Groups
  `CREATE TABLE IF NOT EXISTS \`groups\` (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    color VARCHAR(20) DEFAULT '#7c5bf5',
    icon VARCHAR(50) DEFAULT 'users',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL,
    INDEX idx_name (name),
    INDEX idx_deleted_at (deleted_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Group members
  `CREATE TABLE IF NOT EXISTS group_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    contact_id INT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES \`groups\`(id) ON DELETE CASCADE,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_member (group_id, contact_id),
    INDEX idx_contact_id (contact_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Contact search index
  `CREATE TABLE IF NOT EXISTS contact_search_index (
    id INT AUTO_INCREMENT PRIMARY KEY,
    contact_id INT NOT NULL UNIQUE,
    search_text LONGTEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FULLTEXT INDEX ft_search (search_text)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Users
  `CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
    is_active BOOLEAN DEFAULT 1,
    last_login_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_username (username),
    INDEX idx_email (email),
    INDEX idx_role (role)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

  // Global preferences
  `CREATE TABLE IF NOT EXISTS preferences (
    id INT AUTO_INCREMENT PRIMARY KEY,
    \`key\` VARCHAR(255) NOT NULL UNIQUE,
    value JSON,
    type VARCHAR(50) DEFAULT 'string',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_key (\`key\`)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const SEED_STATEMENTS = [
  `INSERT IGNORE INTO tags (name, color) VALUES
    ('Regular', '#6b7280'),
    ('Favorite', '#f59e0b'),
    ('VIP', '#7c5bf5'),
    ('Blocked', '#ef4444'),
    ('New', '#50c878')`,

  `INSERT IGNORE INTO \`groups\` (name, description, color, icon) VALUES
    ('Friends', 'Close friends and trusted contacts', '#5b9cf5', 'users'),
    ('Hookups', 'Casual hookups and encounters', '#f59e0b', 'flame'),
    ('Dating', 'People you are dating or interested in', '#ec4899', 'heart'),
    ('Acquaintances', 'People you have met but are not close to', '#6b7280', 'user')`,

  `INSERT IGNORE INTO preferences (\`key\`, value, type) VALUES
    ('app_name', '"Kith"', 'string'),
    ('theme', '"dark"', 'string'),
    ('reminder_check_interval', '5', 'number'),
    ('spicy_visible', '"false"', 'boolean')`,
];

export async function initializeDatabase() {
  const connection = await pool.getConnection();

  try {
    // Check if tables already exist
    const [tables] = await connection.execute(
      `SELECT COUNT(*) as count FROM information_schema.tables
       WHERE table_schema = ? AND table_name = 'contacts'`,
      [process.env.DB_NAME || 'kith']
    );

    if (tables[0].count > 0) {
      // Tables exist, but ensure users table exists (migration for existing installs)
      const [usersTable] = await connection.execute(
        `SELECT COUNT(*) as count FROM information_schema.tables
         WHERE table_schema = ? AND table_name = 'users'`,
        [process.env.DB_NAME || 'kith']
      );
      if (usersTable[0].count === 0) {
        console.log('⟳ Adding users table to existing database...');
        await connection.execute(`CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(100) NOT NULL UNIQUE,
          email VARCHAR(255) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          display_name VARCHAR(255),
          role ENUM('admin', 'member') NOT NULL DEFAULT 'member',
          is_active BOOLEAN DEFAULT 1,
          last_login_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_username (username),
          INDEX idx_email (email),
          INDEX idx_role (role)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
        await seedAdmin(connection);
        console.log('✓ Users table created');
      }
      console.log('✓ Database tables already exist');
      connection.release();
      return;
    }

    console.log('⟳ Initializing database schema...');

    for (const statement of SCHEMA_STATEMENTS) {
      await connection.execute(statement);
    }
    console.log('✓ Created all tables');

    for (const statement of SEED_STATEMENTS) {
      await connection.execute(statement);
    }
    console.log('✓ Inserted seed data');

    await seedAdmin(connection);

  } finally {
    connection.release();
  }
}

async function seedAdmin(connection) {
  const [existing] = await connection.execute(
    'SELECT COUNT(*) as count FROM users WHERE role = ?', ['admin']
  );
  if (existing[0].count === 0) {
    const hash = await bcrypt.hash('changeme', 12);
    await connection.execute(
      'INSERT INTO users (username, email, password_hash, display_name, role) VALUES (?, ?, ?, ?, ?)',
      ['admin', 'admin@example.com', hash, 'Admin', 'admin']
    );
    console.log('✓ Default admin created (username: admin, password: changeme)');
  }
}
