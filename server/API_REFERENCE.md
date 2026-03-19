# Kith API Reference

Complete API documentation for the Kith Personal CRM backend.

## Request Format

All requests should include:
- `Content-Type: application/json` (for POST/PUT)
- `Authorization: Bearer <token>` (except for `/api/auth/login`, `/api/auth/register`, `/api/health`)

## Response Format

All responses are JSON:
- Success: `{ data }` or `{ object }` or `{ array }`
- Error: `{ error: "message" }`

## Authentication

### POST /api/auth/login
Login with username or email.

**Request:**
```json
{
  "username": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@kith.local",
    "display_name": "Admin User",
    "role": "main_admin"
  }
}
```

### POST /api/auth/register
Create a new user (admin-only after initial setup).

**Request:**
```json
{
  "username": "john",
  "email": "john@example.com",
  "display_name": "John Doe",
  "password": "password123",
  "role": "user"
}
```

**Response (201):**
```json
{
  "user": {
    "id": 2,
    "username": "john",
    "email": "john@example.com",
    "display_name": "John Doe",
    "role": "user"
  }
}
```

### GET /api/auth/me
Get current authenticated user.

**Response (200):**
```json
{
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@kith.local",
    "display_name": "Admin User",
    "role": "main_admin",
    "is_active": 1
  }
}
```

### POST /api/auth/logout
Logout (client removes token).

**Response (200):**
```json
{
  "message": "Logged out successfully"
}
```

## Contacts

### GET /api/contacts
List contacts with search, filtering, and pagination.

**Query Parameters:**
- `search` - Search in display_name, first_name, last_name, email
- `relationship_type` - Filter by type (friend, family, romantic, etc.)
- `group` - Filter by group ID
- `tag` - Filter by tag ID
- `is_favorite` - Filter favorites (true/false)
- `is_spicy` - Filter spicy profiles (true/false)
- `page` - Page number (default: 1)
- `limit` - Results per page (default: 50)

**Example:**
```
GET /api/contacts?search=john&relationship_type=friend&page=1&limit=10
```

**Response (200):**
```json
{
  "contacts": [
    {
      "id": 1,
      "display_name": "John Doe",
      "first_name": "John",
      "last_name": "Doe",
      "email": "john@example.com",
      "phone": "+1234567890",
      "primary_email": "john@example.com",
      "primary_phone": "+1234567890",
      "relationship_type": "friend",
      "is_favorite": true,
      "is_spicy": false,
      "created_at": "2026-03-19T10:00:00Z",
      "updated_at": "2026-03-19T10:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 10,
  "pages": 1
}
```

### POST /api/contacts
Create a new contact.

**Request:**
```json
{
  "display_name": "John Doe",
  "first_name": "John",
  "last_name": "Doe",
  "email": "john@example.com",
  "phone": "+1234567890",
  "birthday": "1990-01-15",
  "location": "San Francisco, CA",
  "relationship_type": "friend",
  "is_favorite": true,
  "is_spicy": false
}
```

**Response (201):**
```json
{
  "contact": {
    "id": 1,
    "owner_user_id": 1,
    "display_name": "John Doe",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "birthday": "1990-01-15",
    "location": "San Francisco, CA",
    "relationship_type": "friend",
    "is_favorite": 1,
    "is_spicy": 0,
    "emails": [],
    "phones": [],
    "addresses": [],
    "social_links": [],
    "tags": [],
    "groups": [],
    "timeline": [],
    "media_count": 0,
    "created_at": "2026-03-19T10:00:00Z",
    "updated_at": "2026-03-19T10:00:00Z",
    "deleted_at": null
  }
}
```

### GET /api/contacts/:id
Get a single contact with all relationships.

**Response (200):**
```json
{
  "contact": {
    "id": 1,
    "owner_user_id": 1,
    "display_name": "John Doe",
    "first_name": "John",
    "last_name": "Doe",
    "email": "john@example.com",
    "phone": "+1234567890",
    "birthday": "1990-01-15",
    "age": 36,
    "sex": "male",
    "pronouns": "he/him",
    "orientation": "straight",
    "relationship_status": "single",
    "location": "San Francisco, CA",
    "bio": "Software engineer",
    "occupation": "Software Engineer",
    "company": "Tech Corp",
    "website": "https://johndoe.com",
    "languages": "English, Spanish",
    "how_we_met": "At a conference",
    "met_date": "2023-06-15",
    "rating": 5,
    "relationship_type": "friend",
    "is_favorite": 1,
    "is_spicy": 0,
    "is_anonymous": 0,
    "notes_text": "Great guy, stay in touch",
    "emails": [
      {
        "id": 1,
        "label": "work",
        "email": "john@techcorp.com",
        "is_primary": 1
      }
    ],
    "phones": [
      {
        "id": 1,
        "label": "mobile",
        "phone": "+1234567890",
        "is_primary": 1
      }
    ],
    "addresses": [
      {
        "id": 1,
        "label": "home",
        "street": "123 Main St",
        "city": "San Francisco",
        "state": "CA",
        "zip": "94102",
        "country": "USA",
        "is_primary": 1
      }
    ],
    "social_links": [
      {
        "id": 1,
        "platform": "LinkedIn",
        "url": "https://linkedin.com/in/johndoe",
        "username": "johndoe"
      }
    ],
    "tags": [
      {
        "id": 1,
        "name": "friends",
        "color": "#FF5733"
      }
    ],
    "groups": [
      {
        "id": 1,
        "name": "Work Colleagues",
        "color": "#3366FF",
        "icon": "briefcase"
      }
    ],
    "timeline": [
      {
        "id": 1,
        "entry_type": "call",
        "title": "Caught up",
        "content": "Had a great catch-up call",
        "entry_date": "2026-03-15T14:00:00Z",
        "is_spicy": 0,
        "created_at": "2026-03-15T14:00:00Z"
      }
    ],
    "media_count": 2,
    "spicy_profile": null,
    "created_at": "2026-03-19T10:00:00Z",
    "updated_at": "2026-03-19T10:00:00Z",
    "deleted_at": null
  }
}
```

### PUT /api/contacts/:id
Update contact fields.

**Request:**
```json
{
  "display_name": "John M. Doe",
  "is_favorite": false,
  "rating": 4
}
```

**Response (200):** Returns updated contact object

### DELETE /api/contacts/:id
Soft delete a contact.

**Response (200):**
```json
{
  "message": "Contact deleted"
}
```

## Contact Sub-Resources

### Emails

**GET /api/contacts/:id/emails**
```json
{
  "emails": [
    {
      "id": 1,
      "label": "work",
      "email": "john@techcorp.com",
      "is_primary": 1
    }
  ]
}
```

**POST /api/contacts/:id/emails**
```json
{
  "label": "personal",
  "email": "john.doe@gmail.com",
  "is_primary": 0
}
```

**DELETE /api/contacts/:id/emails/:emailId**
```json
{
  "message": "Email deleted"
}
```

### Phones

**GET /api/contacts/:id/phones**
```json
{
  "phones": [
    {
      "id": 1,
      "label": "mobile",
      "phone": "+1234567890",
      "is_primary": 1
    }
  ]
}
```

**POST /api/contacts/:id/phones**
```json
{
  "label": "home",
  "phone": "+0987654321",
  "is_primary": 0
}
```

**DELETE /api/contacts/:id/phones/:phoneId**
```json
{
  "message": "Phone deleted"
}
```

### Addresses

**GET /api/contacts/:id/addresses**
```json
{
  "addresses": [
    {
      "id": 1,
      "label": "home",
      "street": "123 Main St",
      "city": "San Francisco",
      "state": "CA",
      "zip": "94102",
      "country": "USA",
      "is_primary": 1
    }
  ]
}
```

**POST /api/contacts/:id/addresses**
```json
{
  "label": "work",
  "street": "456 Tech Blvd",
  "city": "Mountain View",
  "state": "CA",
  "zip": "94043",
  "country": "USA",
  "is_primary": 0
}
```

**DELETE /api/contacts/:id/addresses/:addressId**
```json
{
  "message": "Address deleted"
}
```

### Social Links

**GET /api/contacts/:id/social-links**
```json
{
  "social_links": [
    {
      "id": 1,
      "platform": "LinkedIn",
      "url": "https://linkedin.com/in/johndoe",
      "username": "johndoe"
    }
  ]
}
```

**POST /api/contacts/:id/social-links**
```json
{
  "platform": "Twitter",
  "url": "https://twitter.com/johndoe",
  "username": "johndoe"
}
```

**DELETE /api/contacts/:id/social-links/:linkId**
```json
{
  "message": "Social link deleted"
}
```

### Tags

**GET /api/contacts/:id/tags**
```json
{
  "tags": [
    {
      "id": 1,
      "name": "friends",
      "color": "#FF5733"
    }
  ]
}
```

**POST /api/contacts/:id/tags** - Add tag to contact
```json
{
  "tag_id": 1
}
```

**DELETE /api/contacts/:id/tags/:tagId**
```json
{
  "message": "Tag removed"
}
```

### Groups

**GET /api/contacts/:id/groups**
```json
{
  "groups": [
    {
      "id": 1,
      "name": "Work Colleagues",
      "color": "#3366FF",
      "icon": "briefcase"
    }
  ]
}
```

**POST /api/contacts/:id/groups** - Add contact to group
```json
{
  "group_id": 1
}
```

**DELETE /api/contacts/:id/groups/:groupId**
```json
{
  "message": "Contact removed from group"
}
```

### Timeline

**GET /api/contacts/:id/timeline?page=1&limit=20**
```json
{
  "entries": [
    {
      "id": 1,
      "entry_type": "call",
      "title": "Caught up",
      "content": "Had a great catch-up call",
      "entry_date": "2026-03-15T14:00:00Z",
      "is_spicy": 0,
      "created_at": "2026-03-15T14:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20,
  "pages": 1
}
```

**POST /api/contacts/:id/timeline**
```json
{
  "entry_type": "meetup",
  "title": "Coffee meeting",
  "content": "Met for coffee at the usual place",
  "entry_date": "2026-03-19T15:30:00Z",
  "is_spicy": 0
}
```

**DELETE /api/contacts/:id/timeline/:entryId**
```json
{
  "message": "Timeline entry deleted"
}
```

### Spicy Profile

**GET /api/contacts/:id/spicy** - Get if contact is_spicy=true
```json
{
  "spicy_profile": {
    "id": 1,
    "contact_id": 1,
    "spicy_type": "top",
    "orientation": "gay",
    "role_preference": "top",
    "positions": "...text...",
    "kinks": "...text...",
    "turn_ons": "...text...",
    "turn_offs": "...text...",
    "boundaries": "...text...",
    "safe_word": "pineapple",
    "protection_preference": "always",
    "hiv_status": "negative",
    "on_prep": true,
    "prep_since": "2024-01-01",
    "last_tested_date": "2026-03-01",
    "sti_notes": "All clear",
    "body_type": "athletic",
    "body_notes": "...text...",
    "endowment": "...text...",
    "grooming": "...text...",
    "spicy_rating": 8,
    "chemistry_rating": 9,
    "would_repeat": true,
    "spicy_notes": "...text...",
    "last_encounter": "2026-03-10",
    "encounter_count": 5,
    "created_at": "2026-03-19T10:00:00Z",
    "updated_at": "2026-03-19T10:00:00Z"
  }
}
```

**PUT /api/contacts/:id/spicy** - Upsert spicy profile (requires is_spicy=true)
```json
{
  "spicy_type": "top",
  "orientation": "gay",
  "role_preference": "top",
  "safe_word": "pineapple",
  "protection_preference": "always",
  "spicy_rating": 8,
  "chemistry_rating": 9,
  "would_repeat": true
}
```

### Media

**GET /api/contacts/:id/media**
```json
{
  "media": [
    {
      "id": 1,
      "filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
      "original_filename": "photo.jpg",
      "file_path": "/media/contacts/1/550e8400-e29b-41d4-a716-446655440000.jpg",
      "file_type": "image/jpeg",
      "file_size": 102400,
      "platform": "phone",
      "is_spicy": 0,
      "caption": "Profile picture",
      "created_at": "2026-03-19T10:00:00Z"
    }
  ]
}
```

**POST /api/contacts/:id/media** - Upload media
Form data (multipart/form-data):
- `file` - Binary file (required)
- `caption` - Text caption (optional)
- `platform` - Source (phone, camera, etc., optional)
- `is_spicy` - Boolean (optional)

**DELETE /api/contacts/:id/media/:mediaId**
```json
{
  "message": "Media deleted"
}
```

## Groups

### GET /api/groups
List user's groups.

**Response (200):**
```json
{
  "groups": [
    {
      "id": 1,
      "name": "Work Colleagues",
      "color": "#3366FF",
      "icon": "briefcase",
      "description": "People from my workplace",
      "owner_user_id": 1,
      "is_system": 0,
      "member_count": 5,
      "created_at": "2026-03-19T10:00:00Z"
    }
  ]
}
```

### POST /api/groups
Create a group.

**Request:**
```json
{
  "name": "College Friends",
  "color": "#FF6B6B",
  "icon": "users",
  "description": "Friends from college"
}
```

**Response (201):**
```json
{
  "id": 2,
  "name": "College Friends",
  "color": "#FF6B6B",
  "icon": "users",
  "description": "Friends from college",
  "owner_user_id": 1,
  "is_system": 0,
  "member_count": 0
}
```

### GET /api/groups/:id
Get group with members.

**Response (200):**
```json
{
  "group": {
    "id": 1,
    "name": "Work Colleagues",
    "color": "#3366FF",
    "icon": "briefcase",
    "description": "People from my workplace",
    "owner_user_id": 1,
    "is_system": 0,
    "created_at": "2026-03-19T10:00:00Z",
    "members": [
      {
        "id": 1,
        "display_name": "John Doe",
        "email": "john@example.com",
        "phone": "+1234567890"
      }
    ]
  }
}
```

### PUT /api/groups/:id
Update group.

**Request:**
```json
{
  "name": "Former Colleagues",
  "color": "#4444FF"
}
```

**Response (200):** Returns updated group

### DELETE /api/groups/:id
Delete group (non-system only).

**Response (200):**
```json
{
  "message": "Group deleted"
}
```

## Tags

### GET /api/tags
List user's tags.

**Response (200):**
```json
{
  "tags": [
    {
      "id": 1,
      "name": "close_friends",
      "color": "#FF5733",
      "owner_user_id": 1,
      "usage_count": 12,
      "created_at": "2026-03-19T10:00:00Z"
    }
  ]
}
```

### POST /api/tags
Create a tag.

**Request:**
```json
{
  "name": "keep_in_touch",
  "color": "#33FF57"
}
```

**Response (201):**
```json
{
  "id": 2,
  "name": "keep_in_touch",
  "color": "#33FF57",
  "owner_user_id": 1,
  "usage_count": 0
}
```

### PUT /api/tags/:id
Update tag.

**Request:**
```json
{
  "name": "must_reach_out",
  "color": "#FF3333"
}
```

**Response (200):** Returns updated tag

### DELETE /api/tags/:id
Delete tag.

**Response (200):**
```json
{
  "message": "Tag deleted"
}
```

## Users (Admin Only)

### GET /api/users
List all users.

**Response (200):**
```json
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "email": "admin@kith.local",
      "display_name": "Admin User",
      "role": "main_admin",
      "is_active": 1,
      "created_at": "2026-03-19T10:00:00Z",
      "updated_at": "2026-03-19T10:00:00Z"
    }
  ]
}
```

### POST /api/users
Create user.

**Request:**
```json
{
  "username": "jane",
  "email": "jane@example.com",
  "display_name": "Jane Smith",
  "password": "password123",
  "role": "user"
}
```

**Response (201):**
```json
{
  "id": 2,
  "username": "jane",
  "email": "jane@example.com",
  "display_name": "Jane Smith",
  "role": "user",
  "is_active": 1
}
```

### GET /api/users/:id
Get user.

**Response (200):** User object

### PUT /api/users/:id
Update user.

**Request:**
```json
{
  "display_name": "Jane M. Smith",
  "role": "admin",
  "is_active": 1
}
```

**Response (200):** Updated user

### DELETE /api/users/:id
Deactivate user.

**Response (200):**
```json
{
  "message": "User deactivated"
}
```

## Settings

### GET /api/settings
Get settings (full for admins, public only for users).

**Response (200):**
```json
{
  "settings": {
    "app_name": "Kith",
    "spicy_mode_enabled": "true",
    "media_storage_path": "/media"
  }
}
```

### PUT /api/settings
Update settings (admin-only).

**Request:**
```json
{
  "settings": {
    "app_name": "Kith Pro",
    "spicy_mode_enabled": "false"
  }
}
```

**Response (200):** Updated settings object

## Media

### POST /api/media/upload
Upload media file (multipart/form-data).

**Form Data:**
- `file` - File (required)
- `contact_id` - Contact ID (required)
- `caption` - Caption (optional)
- `platform` - Source (optional)
- `is_spicy` - Boolean (optional)

**Response (201):**
```json
{
  "id": 1,
  "filename": "550e8400-e29b-41d4-a716-446655440000.jpg",
  "original_filename": "photo.jpg",
  "file_path": "/media/550e8400-e29b-41d4-a716-446655440000.jpg",
  "file_type": "image/jpeg",
  "file_size": 102400,
  "platform": "phone",
  "is_spicy": 0,
  "caption": "Profile picture"
}
```

### GET /api/media/:id
Stream/download media file.

**Response (200):** File binary data

### DELETE /api/media/:id
Delete media.

**Response (200):**
```json
{
  "message": "Media deleted"
}
```

## Health

### GET /api/health
Health check.

**Response (200):**
```json
{
  "status": "ok",
  "timestamp": "2026-03-19T10:00:00Z"
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message"
}
```

Common HTTP status codes:
- `200` - OK
- `201` - Created
- `400` - Bad Request (validation, missing fields)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate username/email)
- `500` - Internal Server Error
