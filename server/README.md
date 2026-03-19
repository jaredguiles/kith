# Kith Backend Server

A complete personal CRM (Contact Relationship Manager) backend built with Node.js, Express, and MariaDB.

## Architecture

- **Runtime**: Node.js 22 (ESM modules)
- **Framework**: Express 4
- **Database**: MariaDB 3.3
- **Authentication**: JWT (jsonwebtoken + bcryptjs)
- **File Uploads**: Multer
- **Static Files**: Express serves built React frontend + API

## Project Structure

```
server/
├── src/
│   ├── index.js                 # Main Express entry point
│   ├── db.js                    # MariaDB connection pool & initialization
│   ├── middleware/
│   │   └── auth.js              # JWT authentication & authorization
│   └── routes/
│       ├── auth.js              # Login, register, me, logout
│       ├── contacts.js          # Full contact CRUD + sub-resources
│       ├── groups.js            # Group management
│       ├── tags.js              # Tag management
│       ├── users.js             # User administration (admin only)
│       ├── settings.js          # App settings
│       ├── media.js             # File upload & serving
│       └── health.js            # Health check endpoint
├── init.sql                     # Database schema & initialization
├── package.json                 # Dependencies
└── public/                      # Built React frontend (static files)
```

## Setup & Installation

### Prerequisites

- Node.js 22+
- MariaDB 10.5+ (external, at `DB_HOST:3306`)
- npm or yarn

### Install Dependencies

```bash
npm install
```

### Environment Variables

Create a `.env` file or set these environment variables:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=kith

# Server
PORT=3000
JWT_SECRET=your-secret-key-here

# Initial Admin User (created on first login if no users exist)
ADMIN_USERNAME=admin
ADMIN_EMAIL=admin@kith.local
ADMIN_PASSWORD=changeme
```

### Database Initialization

The database is automatically initialized on server startup:
1. Creates `kith` database if it doesn't exist
2. Creates all tables with proper relationships
3. Inserts default settings
4. **Does NOT** create the admin user (done at runtime)

### Running the Server

**Development** (with auto-reload):
```bash
npm run dev
```

**Production**:
```bash
npm start
```

The server will:
1. Test database connection
2. Run database initialization
3. Listen on port 3000 (or `PORT` env var)

## API Endpoints

### Authentication (`/api/auth`)

- `POST /login` - Login with username/email + password, returns JWT token
- `POST /register` - Create new user (admin-only after first user exists)
- `GET /me` - Get current user info (requires auth)
- `POST /logout` - Logout (client-side token removal)

### Contacts (`/api/contacts`)

Full CRUD with ownership & sharing support:

- `GET /contacts` - List contacts (search, filter, pagination)
- `POST /contacts` - Create contact
- `GET /contacts/:id` - Get single contact with all related data
- `PUT /contacts/:id` - Update contact
- `DELETE /contacts/:id` - Soft delete contact

**Contact Sub-Resources:**

- `GET /contacts/:id/emails` - List emails
- `POST /contacts/:id/emails` - Add email
- `DELETE /contacts/:id/emails/:emailId` - Delete email

- `GET /contacts/:id/phones` - List phones
- `POST /contacts/:id/phones` - Add phone
- `DELETE /contacts/:id/phones/:phoneId` - Delete phone

- `GET /contacts/:id/addresses` - List addresses
- `POST /contacts/:id/addresses` - Add address
- `DELETE /contacts/:id/addresses/:addressId` - Delete address

- `GET /contacts/:id/social-links` - List social links
- `POST /contacts/:id/social-links` - Add social link
- `DELETE /contacts/:id/social-links/:linkId` - Delete social link

- `GET /contacts/:id/tags` - List tags
- `POST /contacts/:id/tags` - Add tag to contact
- `DELETE /contacts/:id/tags/:tagId` - Remove tag from contact

- `GET /contacts/:id/groups` - List groups
- `POST /contacts/:id/groups` - Add contact to group
- `DELETE /contacts/:id/groups/:groupId` - Remove contact from group

- `GET /contacts/:id/timeline` - List timeline entries (paginated)
- `POST /contacts/:id/timeline` - Create timeline entry
- `DELETE /contacts/:id/timeline/:entryId` - Delete timeline entry

- `GET /contacts/:id/spicy` - Get spicy profile
- `PUT /contacts/:id/spicy` - Upsert spicy profile

- `GET /contacts/:id/media` - List media
- `POST /contacts/:id/media` - Upload media (multipart/form-data)
- `DELETE /contacts/:id/media/:mediaId` - Delete media

### Groups (`/api/groups`)

- `GET /groups` - List user's groups
- `POST /groups` - Create group
- `GET /groups/:id` - Get group with members
- `PUT /groups/:id` - Update group
- `DELETE /groups/:id` - Delete group (non-system only)

### Tags (`/api/tags`)

- `GET /tags` - List user's tags
- `POST /tags` - Create tag
- `PUT /tags/:id` - Update tag
- `DELETE /tags/:id` - Delete tag

### Users (`/api/users`) - Admin Only

- `GET /users` - List all users
- `POST /users` - Create user
- `GET /users/:id` - Get user
- `PUT /users/:id` - Update user (role, is_active, display_name)
- `DELETE /users/:id` - Deactivate user

### Settings (`/api/settings`)

- `GET /settings` - Get settings (full for admins, public only for users)
- `PUT /settings` - Update settings (admin-only)

### Media (`/api/media`)

- `POST /upload` - Upload file (multipart/form-data), returns media info
- `GET /:id` - Stream/download media file
- `DELETE /:id` - Delete media

### Health (`/api/health`)

- `GET /health` - Health check, returns `{ status: 'ok', timestamp }`

## Authentication

All endpoints except `/api/auth/login`, `/api/auth/register`, and `/api/health` require a valid JWT token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens expire in 7 days. The JWT payload includes:
- `id` - User ID
- `username` - Username
- `role` - User role (main_admin, admin, user)
- `display_name` - Display name

## Access Control

### User Roles

- **main_admin**: Full system access, can create other admins
- **admin**: Can manage users and see all contacts
- **user**: Can manage only their own contacts and shared contacts

### Contact Access

- Users see only:
  - Their own contacts (owner_user_id)
  - Contacts shared with them
- Admins see all contacts
- Updates/deletes require ownership
- Contact sharing is handled via `shared_contacts` table

### Resource Ownership

- Groups, Tags, and Contacts are user-specific
- System groups (is_system=1) are available to all users
- Timeline entries are created by the user who created them
- Media is associated with both contact and uploader

## Database Schema

### Core Tables

- **users** - User accounts with roles and authentication
- **contacts** - Contact information with detailed fields
- **contact_emails** - Multiple emails per contact
- **contact_phones** - Multiple phones per contact
- **contact_addresses** - Multiple addresses per contact
- **social_links** - Social media profiles
- **spicy_profiles** - Optional extended intimate details
- **timeline_entries** - Interaction history
- **media** - Uploaded files and media

### Organization Tables

- **tags** - Custom tags for organization
- **contact_tags** - Many-to-many contact-tag mapping
- **groups** - Contact groups
- **group_members** - Many-to-many group-contact mapping

### Administration Tables

- **shared_contacts** - Contact sharing permissions
- **settings** - Application settings

All timestamps use `TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP` for automatic tracking.

## File Storage

Media files are stored at `/media` inside the container:
- Uploaded files via `/api/contacts/:id/media` go to `/media/contacts/{contactId}/`
- Files uploaded via `/api/media/upload` go to `/media/`
- Container mounts `/media` as a persistent volume

## Error Handling

All endpoints return consistent error responses:

```json
{ "error": "Error message" }
```

Common HTTP Status Codes:
- `200` - Success
- `201` - Created
- `400` - Bad request (missing fields, validation)
- `401` - Unauthorized (missing/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `409` - Conflict (duplicate username/email)
- `500` - Internal server error

## Development Notes

### ESM Modules

All files use ES6 `import`/`export` syntax. Package.json has `"type": "module"`.

### Database Queries

The `query()` helper in `db.js` handles parameter binding for SQL injection prevention:

```javascript
const results = await query('SELECT * FROM users WHERE id = ?', [userId]);
```

### Authentication Middleware

Import and use the auth middleware on protected routes:

```javascript
import { authenticate, requireAdmin } from '../middleware/auth.js';

router.get('/admin-only', authenticate, requireAdmin, handler);
```

### File Uploads

Multer is configured for contacts and media endpoints with:
- File size limit: 50MB
- Auto-creates directories as needed
- Generates UUIDs for filenames to prevent collisions

## Deployment

The server is designed to run in a single Docker container:
1. Serves both API (`/api/*`) and static frontend files
2. Non-API routes serve `public/index.html` (SPA fallback)
3. External MariaDB at `DB_HOST:3306`
4. `/media` volume for persistent file storage

Example Docker setup:
```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY server .
RUN npm install --production
EXPOSE 3000
VOLUME ["/media"]
CMD ["npm", "start"]
```

## Security Considerations

- JWT tokens expire in 7 days
- Passwords hashed with bcryptjs (10 rounds)
- SQL injection prevention via parameterized queries
- CORS enabled for cross-origin requests
- Role-based access control (RBAC) on all admin endpoints
- Soft deletes for contacts (not permanently removed)
- File uploads validated by type and size

## Troubleshooting

### Database Connection Failed

Check environment variables:
```bash
echo $DB_HOST $DB_PORT $DB_USER
```

Ensure MariaDB is running and accessible:
```bash
mysql -h $DB_HOST -u $DB_USER -p
```

### JWT Token Invalid

Ensure `JWT_SECRET` is consistent across restarts. In production, set it explicitly:
```env
JWT_SECRET=your-production-secret-key
```

### Port Already in Use

Change the port:
```bash
PORT=3001 npm start
```

### Database Initialization Errors

Check `init.sql` for syntax errors or existing tables. The script uses `CREATE TABLE IF NOT EXISTS` to avoid conflicts.

## License

Proprietary - Kith Personal CRM
