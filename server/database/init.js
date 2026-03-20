const pool = require('./connection');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function initDatabase() {
  try {
    console.log('Initializing database...');

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        email VARCHAR(255) NOT NULL UNIQUE,
        display_name VARCHAR(255),
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('main_admin','admin','user') DEFAULT 'user',
        is_active BOOLEAN DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ users table created');

    // Create contacts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_user_id INT NOT NULL,
        display_name VARCHAR(255),
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
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ contacts table created');

    // Create contact_emails table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_emails (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        label VARCHAR(50),
        email VARCHAR(255) NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ contact_emails table created');

    // Create contact_phones table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_phones (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        label VARCHAR(50),
        phone VARCHAR(30) NOT NULL,
        is_primary BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ contact_phones table created');

    // Create contact_addresses table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_addresses (
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
      )
    `);
    console.log('✓ contact_addresses table created');

    // Create shared_contacts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shared_contacts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        shared_by_user_id INT NOT NULL,
        shared_with_user_id INT NOT NULL,
        permissions ENUM('read','edit') DEFAULT 'read',
        share_scope VARCHAR(50) DEFAULT 'basic',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (shared_by_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (shared_with_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ shared_contacts table created');

    // Create spicy_profiles table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS spicy_profiles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
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
      )
    `);
    console.log('✓ spicy_profiles table created');

    // Create tags table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7),
        owner_user_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✓ tags table created');

    // Create contact_tags table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_tags (
        contact_id INT NOT NULL,
        tag_id INT NOT NULL,
        PRIMARY KEY(contact_id, tag_id),
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ contact_tags table created');

    // Create groups table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        color VARCHAR(7),
        icon VARCHAR(50),
        description TEXT,
        owner_user_id INT NULL,
        is_system BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);
    console.log('✓ groups table created');

    // Create group_members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id INT NOT NULL,
        contact_id INT NOT NULL,
        PRIMARY KEY(group_id, contact_id),
        FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ group_members table created');

    // Create social_links table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS social_links (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        platform VARCHAR(50),
        url VARCHAR(500),
        username VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ social_links table created');

    // Create events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_user_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        type VARCHAR(50),
        description TEXT,
        location VARCHAR(255),
        is_spicy BOOLEAN DEFAULT 0,
        starts_at TIMESTAMP,
        ends_at TIMESTAMP NULL,
        status ENUM('upcoming','completed','cancelled') DEFAULT 'upcoming',
        followup_notes TEXT,
        rating TINYINT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ events table created');

    // Create event_contacts table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_contacts (
        event_id INT NOT NULL,
        contact_id INT NOT NULL,
        PRIMARY KEY(event_id, contact_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ event_contacts table created');

    // Create event_media table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS event_media (
        event_id INT NOT NULL,
        media_id INT NOT NULL,
        PRIMARY KEY(event_id, media_id),
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ event_media table created');

    // Create contact_search_index table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_search_index (
        contact_id INT PRIMARY KEY,
        search_text TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FULLTEXT INDEX ft_search_text (search_text),
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ contact_search_index table created');

    // Create timeline_events table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS timeline_events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        event_id INT NULL,
        type VARCHAR(50),
        title VARCHAR(255),
        description TEXT,
        is_spicy BOOLEAN DEFAULT 0,
        occurred_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL
      )
    `);
    console.log('✓ timeline_events table created');

    // Create notes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        content TEXT NOT NULL,
        is_spicy BOOLEAN DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ notes table created');

    // Create reminders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reminders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        owner_user_id INT NOT NULL,
        contact_id INT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        due_at TIMESTAMP NOT NULL,
        completed_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
      )
    `);
    console.log('✓ reminders table created');

    // Create messages table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact_id INT NOT NULL,
        platform VARCHAR(50),
        direction ENUM('in','out'),
        content TEXT,
        is_spicy BOOLEAN DEFAULT 0,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ messages table created');

    // Create media_assets table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS media_assets (
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
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ media_assets table created');

    // Create audit_log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
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
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
      )
    `);
    console.log('✓ audit_log table created');

    // Create contact_field_changelog table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_field_changelog (
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
      )
    `);
    console.log('✓ contact_field_changelog table created');

    // Create import_jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_jobs (
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
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ import_jobs table created');

    // Create import_staging table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS import_staging (
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
      )
    `);
    console.log('✓ import_staging table created');

    // Create app_settings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(100) NOT NULL UNIQUE,
        value TEXT,
        type VARCHAR(20),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('✓ app_settings table created');

    // Create preferences table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS preferences (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        \`key\` VARCHAR(100),
        value TEXT,
        type VARCHAR(20),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE(user_id, \`key\`),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('✓ preferences table created');

    // Seed admin user if no users exist
    const [users] = await pool.query('SELECT COUNT(*) as count FROM users');
    if (users[0].count === 0) {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@kith.local';
      const adminPassword = process.env.ADMIN_PASSWORD || 'changeme';

      const hashedPassword = await bcrypt.hash(adminPassword, 10);

      await pool.query(
        'INSERT INTO users (username, email, display_name, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?)',
        [adminUsername, adminEmail, 'Admin', hashedPassword, 'main_admin', 1]
      );
      console.log('✓ Admin user seeded');
    }

    // Seed default tags if tags table is empty
    const [tags] = await pool.query('SELECT COUNT(*) as count FROM tags');
    if (tags[0].count === 0) {
      const defaultTags = ['Friend', 'Family', 'Work', 'VIP', 'Shared'];
      for (const tagName of defaultTags) {
        await pool.query(
          'INSERT INTO tags (name, owner_user_id) VALUES (?, NULL)',
          [tagName]
        );
      }
      console.log('✓ Default tags seeded');
    }

    // Seed default groups if groups table is empty
    const [groups] = await pool.query('SELECT COUNT(*) as count FROM groups');
    if (groups[0].count === 0) {
      const defaultGroups = [
        { name: 'Close Friends', icon: 'star', color: '#7c5bf5' },
        { name: 'Family', icon: 'home', color: '#50c878' },
        { name: 'Acquaintances', icon: 'users', color: '#5b9cf5' },
        { name: 'Shared', icon: 'link', color: '#f59e0b' }
      ];
      for (const group of defaultGroups) {
        await pool.query(
          'INSERT INTO groups (name, icon, color, is_system) VALUES (?, ?, ?, 1)',
          [group.name, group.icon, group.color]
        );
      }
      console.log('✓ Default groups seeded');
    }

    // Seed default app_settings if empty
    const [settings] = await pool.query('SELECT COUNT(*) as count FROM app_settings');
    if (settings[0].count === 0) {
      const defaultSettings = [
        { key: 'app_name', value: 'Kith', type: 'string' },
        { key: 'app_logo', value: null, type: 'string' },
        { key: 'accent_color', value: null, type: 'string' },
        { key: 'spicy_accent_color', value: null, type: 'string' },
        { key: 'spicy_enabled', value: '1', type: 'boolean' },
        { key: 'media_path', value: '/media', type: 'string' },
        { key: 'max_upload_size', value: '52428800', type: 'number' }
      ];
      for (const setting of defaultSettings) {
        await pool.query(
          'INSERT INTO app_settings (`key`, value, type) VALUES (?, ?, ?)',
          [setting.key, setting.value, setting.type]
        );
      }
      console.log('✓ Default app_settings seeded');
    }

    console.log('✓ Database initialization complete');
  } catch (error) {
    console.error('Database initialization error:', error.message);
    throw error;
  }
}

module.exports = { initDatabase };
