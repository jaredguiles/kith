import pool from '../database/connection.js';

export async function updateSearchIndex(contactId) {
  try {
    const connection = await pool.getConnection();

    // Fetch contact and related data
    const [contacts] = await connection.execute(
      'SELECT id, display_name, username, bio, location FROM contacts WHERE id = ?',
      [contactId]
    );

    if (contacts.length === 0) {
      connection.release();
      return;
    }

    const contact = contacts[0];

    // Fetch notes
    const [notes] = await connection.execute(
      'SELECT content FROM notes WHERE contact_id = ? AND deleted_at IS NULL',
      [contactId]
    );

    // Fetch platform usernames
    const [platforms] = await connection.execute(
      'SELECT username FROM platform_profiles WHERE contact_id = ?',
      [contactId]
    );

    // Build search text from all sources
    const searchParts = [
      contact.display_name || '',
      contact.username || '',
      contact.bio || '',
      contact.location || '',
      ...notes.map(n => n.content || ''),
      ...platforms.map(p => p.username || ''),
    ];

    const searchText = searchParts.filter(Boolean).join(' ').toLowerCase();

    // Upsert into search index
    await connection.execute(
      `INSERT INTO contact_search_index (contact_id, search_text, updated_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE search_text = ?, updated_at = NOW()`,
      [contactId, searchText, searchText]
    );

    connection.release();
  } catch (error) {
    console.error('Error updating search index:', error);
  }
}

export async function rebuildAllIndexes() {
  try {
    const connection = await pool.getConnection();

    // Clear existing indexes
    await connection.execute('TRUNCATE TABLE contact_search_index');

    // Fetch all contacts
    const [contacts] = await connection.execute(
      'SELECT id FROM contacts WHERE deleted_at IS NULL'
    );

    connection.release();

    // Rebuild each contact's index
    for (const contact of contacts) {
      await updateSearchIndex(contact.id);
    }

    console.log(`✓ Rebuilt search indexes for ${contacts.length} contacts`);
  } catch (error) {
    console.error('Error rebuilding search indexes:', error);
  }
}
