CREATE DATABASE IF NOT EXISTS kith;
USE kith;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('main_admin', 'admin', 'user') DEFAULT 'user',
  is_active BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
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
);

CREATE TABLE IF NOT EXISTS contact_emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  label VARCHAR(50),
  email VARCHAR(255) NOT NULL,
  is_primary BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS contact_phones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  label VARCHAR(50),
  phone VARCHAR(30) NOT NULL,
  is_primary BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS contact_addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  label VARCHAR(50),
  street VARCHAR(255),
  city VARCHAR(100),
  state VARCHAR(50),
  zip VARCHAR(20),
  country VARCHAR(100),
  is_primary BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS shared_contacts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  shared_by_user_id INT NOT NULL,
  shared_with_user_id INT NOT NULL,
  permissions ENUM('read', 'edit') DEFAULT 'read',
  share_scope VARCHAR(50) DEFAULT 'basic',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (shared_by_user_id) REFERENCES users(id),
  FOREIGN KEY (shared_with_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS spicy_profiles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT UNIQUE NOT NULL,
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
  on_prep BOOLEAN,
  prep_since DATE,
  last_tested_date DATE,
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
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS tags (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7),
  owner_user_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contact_tags (
  contact_id INT NOT NULL,
  tag_id INT NOT NULL,
  PRIMARY KEY (contact_id, tag_id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (tag_id) REFERENCES tags(id)
);

CREATE TABLE IF NOT EXISTS groups (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7),
  icon VARCHAR(50),
  description TEXT,
  owner_user_id INT,
  is_system BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id INT NOT NULL,
  contact_id INT NOT NULL,
  PRIMARY KEY (group_id, contact_id),
  FOREIGN KEY (group_id) REFERENCES groups(id),
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS social_links (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  platform VARCHAR(50),
  url VARCHAR(500),
  username VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);

CREATE TABLE IF NOT EXISTS timeline_entries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  user_id INT NOT NULL,
  entry_type VARCHAR(50),
  title VARCHAR(255),
  content TEXT,
  entry_date DATETIME,
  is_spicy BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS media (
  id INT AUTO_INCREMENT PRIMARY KEY,
  contact_id INT NOT NULL,
  user_id INT NOT NULL,
  filename VARCHAR(255),
  original_filename VARCHAR(255),
  file_path VARCHAR(500),
  file_type VARCHAR(50),
  file_size INT,
  platform VARCHAR(50),
  is_spicy BOOLEAN DEFAULT 0,
  caption TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO settings (key, value) VALUES
  ('media_storage_path', '/media'),
  ('app_name', 'Kith'),
  ('spicy_mode_enabled', 'true');
