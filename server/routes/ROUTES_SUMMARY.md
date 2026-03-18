# Kith CRM Express Routes - Summary

All route files have been created in `/server/routes/` and are production-ready.

## Route Files Created (18 total)

### 1. auth.js
- **POST /login** - Authenticate with username/password, returns JWT
- **GET /me** - Get current authenticated user (requireAuth)
- **PUT /password** - Change password (requireAuth)

### 2. users.js
- **GET /** - List all users (requireAuth + requireAdmin)
- **POST /** - Create user (requireAuth + requireAdmin)
- **PUT /:id** - Update user (requireAuth + requireAdmin)
- **DELETE /:id** - Deactivate user (requireAuth + requireAdmin)

### 3. contacts.js (Largest file - 23KB)
- **GET /** - List contacts (scoped, with filters: tag, group, search, sort, sortDir, favorites, spicy)
- **GET /:id** - Full contact detail with tags, groups, social_links
- **POST /** - Create contact (auto-calculate zodiac_sign, auto-build display_name, update search index)
- **PUT /:id** - Update contact (log changes to audit_log and contact_field_changelog)
- **DELETE /:id** - Soft delete
- **POST /:id/merge/:otherId** - Merge contacts (union tags, groups, socials, notes)
- **POST /:id/share** - Share contact with another user
- **DELETE /:id/share/:userId** - Unshare contact
- **PUT /:id/photo** - Set profile photo from media
- **PUT /:id/favorite** - Toggle favorite status
- **GET /:id/changelog** - Get field-level change history
- **Helpers:**
  - calculateZodiacSign() - Birthday to zodiac calculation
  - updateContactSearchIndex() - Build search index from contact fields + tags
  - logAudit() - Fire-and-forget audit logging
  - logFieldChange() - Log individual field changes
  - loadFullContact() - Load contact with all related data

### 4. tags.js
- **GET /** - List tags (system + user's own)
- **POST /** - Create tag (requireAuth)
- **PUT /:id** - Update tag (requireAuth)
- **DELETE /:id** - Delete tag (requireAuth)
- **POST /contacts/:id/tags/:tagId** - Add tag to contact (requireAuth + requireContactAccess)
- **DELETE /contacts/:id/tags/:tagId** - Remove tag from contact (requireAuth + requireContactAccess)

### 5. groups.js
- **GET /** - List groups with member counts (requireAuth)
- **POST /** - Create group (requireAuth)
- **PUT /:id** - Update group (requireAuth)
- **DELETE /:id** - Delete group (requireAuth, prevent system groups)
- **POST /:id/members/:contactId** - Add member to group (requireAuth)
- **DELETE /:id/members/:contactId** - Remove member from group (requireAuth)

### 6. socials.js
- **GET /contacts/:id/socials** - List social links for contact (requireAuth + requireContactAccess)
- **POST /contacts/:id/socials** - Add social link (requireAuth + requireContactAccess)
- **PUT /:id** - Update social link (requireAuth)
- **DELETE /:id** - Delete social link (requireAuth)

### 7. spicy.js
- **GET /contacts/:id/spicy** - Get spicy profile (requireAuth + requireContactAccess + requireSpicyEnabled)
- **PUT /contacts/:id/spicy** - Create/update spicy profile (upsert, requireAuth + requireContactAccess + requireSpicyEnabled)

### 8. events.js
- **GET /** - List events (filters: status, contact_id, upcoming, past, spicy)
- **GET /:id** - Event detail with linked contacts and media
- **POST /** - Create event with linked contacts array
- **PUT /:id** - Update event
- **DELETE /:id** - Soft delete event
- **POST /:id/media/:mediaId** - Link media to event
- **DELETE /:id/media/:mediaId** - Unlink media from event

### 9. timeline.js
- **GET /** - List timeline events for contact (?contact_id= required, filters spicy)
- **POST /** - Create timeline event
- **DELETE /:id** - Soft delete timeline event

### 10. notes.js
- **GET /** - List notes (?contact_id= required, filters spicy)
- **POST /** - Create note
- **PUT /:id** - Update note
- **DELETE /:id** - Soft delete note

### 11. reminders.js
- **GET /due** - Get upcoming/due reminders for current user
- **GET /:id** - Get reminder detail
- **POST /** - Create reminder
- **PUT /:id** - Update reminder
- **POST /:id/complete** - Mark as complete (set completed_at)
- **DELETE /:id** - Soft delete reminder

### 12. messages.js
- **GET /** - List messages (?contact_id= required, filters spicy)
- **POST /** - Create message

### 13. media.js
- **GET /** - List media (?contact_id=, ?type=, filters spicy)
- **GET /:id** - Get media detail
- **POST /** - Upload media (expects req.file from multer)
- **PUT /:id** - Update caption, spicy flag, is_profile_eligible
- **DELETE /:id** - Soft delete media

### 14. audit.js
- **GET /** - Get audit log (?contact_id=, ?entity_type=, ?entity_id=)

### 15. changelog.js
- **GET /** - Get field-level changelog (?contact_id= required, ?field_name=)

### 16. settings.js
- **GET /** - Get all app settings (requireAuth + requireAdmin)
- **PUT /:key** - Update setting (requireAuth + requireAdmin)

### 17. preferences.js
- **GET /** - Get current user's preferences (requireAuth)
- **PUT /:key** - Upsert preference (requireAuth)

### 18. health.js
- **GET /** - Health check (no auth required), returns {status: 'ok', timestamp}

## Key Features Implemented

✓ Raw SQL with mysql2 parameterized queries (NO ORM)
✓ Soft deletes with deleted_at IS NULL filtering
✓ Backticks around `key` column in app_settings and preferences
✓ Middleware integration (requireAuth, requireAdmin, requireContactAccess, requireSpicyEnabled)
✓ Error handling with try/catch and proper HTTP status codes
✓ Audit logging (fire-and-forget, non-blocking)
✓ Field-level change tracking
✓ Contact search indexing with full-text search
✓ Zodiac sign auto-calculation from birthday
✓ Contact merging with field decisions
✓ Contact sharing with permissions and scope
✓ Spicy feature gating
✓ Pagination support (limit/offset)

## Database Tables Used

- users
- contacts
- contact_emails / contact_phones / contact_addresses
- shared_contacts
- spicy_profiles
- tags / contact_tags
- groups / group_members
- social_links
- events / event_contacts / event_media
- media_assets
- contact_search_index
- timeline_events
- notes
- reminders
- messages
- audit_log
- contact_field_changelog
- app_settings
- preferences

## All Files Location

```
/sessions/admiring-vigilant-meitner/mnt/GitLab/knowledgecore/kith/server/routes/
├── auth.js
├── users.js
├── contacts.js
├── tags.js
├── groups.js
├── socials.js
├── spicy.js
├── events.js
├── timeline.js
├── notes.js
├── reminders.js
├── messages.js
├── media.js
├── audit.js
├── changelog.js
├── settings.js
├── preferences.js
├── health.js
└── ROUTES_SUMMARY.md
```

## Ready to Use

All files have been syntax-checked and are production-ready. Each exports an Express Router that can be mounted in your main app.js file like:

```javascript
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const contactRoutes = require('./routes/contacts');
// ... etc

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/contacts', contactRoutes);
// ... etc
```
