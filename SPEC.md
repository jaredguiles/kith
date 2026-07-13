# Kith — Personal CRM Specification

> **Current as of v1.8.** Ships in the repo as `SPEC.md`. Where this spec conflicts with **`DESIGN.md`** ("The Record" design system, adopted v1.3) on visuals, DESIGN.md wins. The body of this document describes the app as specified through v1.1; the **"Post-v1.1 Features (v1.2–v1.8)"** section below enumerates everything added since — see `BUILDLOG.md` for full per-release detail.

## Overview

Kith is a personal CRM for tracking and recording interactions, conversations, meetups, notes, images, and personal information about people in your life. It is strictly personal — not for business use.

The name "Kith" comes from the Old English word meaning friends, acquaintances, and relations — "kith and kin." The app helps you maintain and nurture your personal relationships.

### Key Differentiator: Spicy Mode

Kith has a hidden layer of intimate/personal data that is concealed by default so the app is SFW when opened. A quiet lock toggle low in the sidebar (the "confidential" control) activates "spicy mode", which shifts the accent/interactive layer from ink-blue to oxblood (surfaces and text unchanged — see DESIGN.md) so it's immediately obvious what mode you're in. Spicy mode can be globally disabled in Settings, which removes the toggle entirely and prevents any spicy content from being viewed or shown.

---

## Post-v1.1 Features (v1.2–v1.8)

The body of this spec describes Kith as built through v1.1. Everything below shipped after — see `BUILDLOG.md` for full per-release detail, and the actual code (`server/routes/`, `server/public/js/`) as the ground truth.

### Maps & geocoding (v1.2, refined v1.6/v1.8)
Self-hosted, addresses never leave your network. Bundled geonames city geocoder (`lib/geo.js`, ~56k cities) + a self-hosted Photon geocoder (komoot Photon, `PHOTON_URL`) for street-level precision; city-level queries resolve local-first (v1.8). Authenticated OSM tile proxy with disk cache; vendored Leaflet. Map page (`routes/geo.js`, `js/map.js`) with contact pins, zoom-adaptive clustering (v1.6), geo search, `?near=` proximity filter; contact-detail mini-map; address auto-geocode + manual locate.

### CRM depth (v1.2, expanded v1.5–v1.7)
- **Relationships** (`routes/relationships.js`): typed contact↔contact links with inverse labels; family types incl. step/adoptive/foster variants (v1.7); categorized UI (Family/Friends/Work/Other) + immediate-family strip (v1.8).
- **Important dates** (`routes/dates.js`), **gift ideas** (`routes/gifts.js`).
- **Keep-in-touch cadence:** `last_contacted_at` touched by notes/messages/interactions/event completion; out-of-touch filter/card/notifications.
- **Interactions** (`routes/interactions.js`, v1.4): one-tap touchpoint log per contact, distinct from notes.
- **Recurring reminders** with spawn-on-complete.
- **Deceased status** (v1.6): `is_deceased` + `date_of_death`; excluded from birthday nudges and out-of-touch flags.

### Family tree & GEDCOM (v1.6–v1.7)
- Family page (`js/familytree.js`, nav 03) on vendored family-chart + d3: pan/zoom generational tree, "Close family" and "Full ancestry" lenses, backed by `GET /api/contacts/:id/family-tree` (BFS over family-typed relationships, access-filtered, 400-person/10-generation cap).
- Inclusive identity fields (v1.7): `gender_identity` (separate from sex-at-birth), `maiden_name`, `place_of_birth`/`place_of_death`, `religion`, `nationality`, `hometown`, `education` (v1.8); expanded gender/pronoun/orientation option lists.
- **GEDCOM 5.5.1 import** (`import/parsers/gedcom.js`) through the standard review/merge pipeline, with relationship creation on finalize; **GEDCOM export** (`GET /api/export/gedcom`).

### Journal & timeline (v1.2, reworked v1.8)
- **Journal** (`routes/journal.js`, `js/journal.js`): true personal diary (owner-scoped even for admins) — kinds entry/reflection/travel/dream/memory, optional geocoded location, optional linked event, spicy entries field-encrypted.
- **Timeline page** (`js/timelinepage.js`, nav 07, v1.8): merged life feed (`GET /api/journal/timeline`) — events once with participants aggregated + journal entries; list view + map view with travel path.

### Calendar & data portability (v1.2)
- **Calendar page** (`routes/calendar.js`): month view of events, projected birthdays, recurring important dates, open reminders.
- **Exports** (`routes/export.js`): vCard 3.0, CSV, GEDCOM, admin JSON backup.
- **ICS feed** (`routes/ics.js`): `GET /api/ics/calendar.ics?token=kith_…` for calendar apps (query-param token auth), plus single-event `.ics`.
- **Personal API tokens** (`routes/tokens.js`): `kith_`-prefixed PATs, sha256-stored, `read`/`read_write` scopes, shown once at creation.
- **Trash** (`routes/trash.js`): 30-day soft-delete recycle bin for contacts/events/media with restore, hard purge, and a daily purge sweeper.
- **Dedupe scan** feeding the existing merge modal; document attachments; bulk operations (tag/group/favorite/export/delete).

### Auth & security additions (v1.1–v1.2)
- **Cookie sessions:** JWT in an httpOnly SameSite=Strict cookie (Bearer fallback for API clients); `token_version` invalidation on password change/reset/deactivation.
- **TOTP 2FA** (`lib/totp.js`, RFC-6238 via node:crypto): encrypted secret, pending-token second login step; Account & security page for all roles.
- Login throttling keyed on real client IP behind the reverse proxy.

### Notifications & PWA (v1.2, v1.4)
- **Proactive notifications** (v1.4): scheduler (`lib/scheduler.js`) for birthday/reminder nudges via email and **Web Push** (`routes/push.js`, VAPID, `web-push`).
- **PWA:** manifest + service worker (`sw.js`, HTTPS-only; API responses never cached), auto-update.

### Sync & integrations (v1.4, v1.8)
- **CardDAV/CalDAV** (`lib/davsync.js`): sync with a companion CardDAV/CalDAV server (e.g. Radicale).
- **Immich proxy** (`routes/immich.js`, v1.8): per-user connections to self-hosted Immich photo servers; API keys field-encrypted and never sent to the browser — all asset/thumbnail/search traffic proxied server-side; photo picker attaches Immich photos to people/events; spicy-flagged instances hide behind the confidential layer.
- **Messages UI + global search** (v1.4): message management (incl. `DELETE /api/messages/:id`), MiniSearch-powered fuzzy client search (`js/search-index.js`), server command-palette search (`routes/search.js`).

### UI/design (v1.2–v1.3, ongoing)
- **Light theme + system preference** (v1.2) — both themes first-class.
- **"The Record" redesign** (v1.3): the paper/ink editorial dossier design system — see `DESIGN.md`. Replaced the dark frosted-glass/purple system; removed instance accent customization, pride-flag avatar overlays, and the flame toggle (now a quiet lock "confidential" control).
- Surname sort, letter-avatar palette, icon-size floor (v1.6); view/edit mode split on the contact page, address residency windows ("moves"), mobile pass (v1.8).

### Schema additions since v1.1 (summary)
New tables include: `notifications`, `contact_relationships`, `important_dates`, `gift_ideas`, `interactions`, `api_tokens`, `push_subscriptions`, `journal_entries`, `immich_instances`, `geo_cache`, plus columns for geocoding, keep-in-touch, deceased/identity/ancestry fields, address residency windows, and TOTP. `server/database/init.js` (fresh installs) and `migrations.js` (001–004) are authoritative.

---

## Tech Stack

- **Backend:** Node.js + Express (serves API + static HTML)
- **Frontend:** Single HTML page with vanilla JS (no React, no build step, no bundler)
- **Database:** MariaDB on a separate database server (`db-host:3306`, database: `kith`) — external to the app container
- **Auth:** JWT (bcryptjs + jsonwebtoken)
- **Deployment:** Docker image built and deployed via your CI/CD to the application server
- **Media storage:** Configurable path (default a mounted media volume), changeable in Settings

---

## Users, Roles & Data Isolation

### Roles

- **Main Admin** — First user, seeded on boot. Full access to everything: all contacts across all users, all settings, user management. Can see all data.
- **Admin** — Can manage settings, see all users' contacts.
- **User** — Standard role. Can only see their own contacts. Cannot access Settings. Has their own isolated contact list — no info shared or exposed to other users.

### Contact Ownership & Sharing

- Every contact belongs to the user who created it (owner_user_id)
- Admins can see all contacts across all users
- Regular users can only see contacts they own OR contacts shared with them
- **Sharing:** A user can share a contact with another user. When sharing, you configure:
  - **Permissions:** read-only or edit
  - **Scope:** basic (name/email/phone/photo only), full (all SFW data including notes, timeline, media), or full_spicy (everything including spicy profile)
  - The contact appears in the recipient's contact list with a "Shared" tag
  - A "Shared" category/group is auto-created for that user
  - The API filters returned data based on the share_scope for that user
- **shared_contacts** table tracks who shared what with whom, with what scope

### Default Seed

- Main admin: username `admin`, email `admin@example.com`, password `changeme` (forced change on first login)

---

## Database Schema

### users
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| username | VARCHAR(50) UNIQUE | |
| email | VARCHAR(255) UNIQUE | |
| display_name | VARCHAR(100) | |
| password_hash | VARCHAR(255) | bcrypt |
| role | ENUM('main_admin', 'admin', 'user') | |
| is_active | BOOLEAN DEFAULT 1 | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### contacts
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| owner_user_id | INT FK → users | Who created/owns this contact |
| display_name | VARCHAR(255) NOT NULL | Auto-built from first+last if not set |
| first_name | VARCHAR(100) | |
| last_name | VARCHAR(100) | |
| nickname | VARCHAR(100) | |
| email | VARCHAR(255) | |
| phone | VARCHAR(30) | |
| birthday | DATE | |
| age | INT | |
| sex | VARCHAR(30) | Male, Female, Intersex, Non-binary, Other, Prefer not to say |
| pronouns | VARCHAR(50) | he/him, she/her, they/them, he/they, she/they, etc. |
| orientation | VARCHAR(50) | Straight, Gay, Lesbian, Bisexual, Pansexual, Queer, Asexual, etc. |
| relationship_status | VARCHAR(50) | Single, In a relationship, Married, Engaged, Divorced, Widowed, Separated, It's complicated, Open relationship, Domestic partnership |
| location | VARCHAR(255) | |
| photo_url | VARCHAR(500) | Profile photo — can be chosen from media gallery |
| bio | TEXT | |
| occupation | VARCHAR(150) | Job title / what they do |
| company | VARCHAR(150) | Where they work |
| website | VARCHAR(500) | Personal URL |
| zodiac_sign | VARCHAR(20) | Aries, Taurus, Gemini, etc. (auto-calculated from birthday too) |
| languages | VARCHAR(255) | Comma-separated: English, Spanish, French, etc. |
| ethnicity | VARCHAR(100) | Optional |
| how_we_met | VARCHAR(255) | Through a friend, app, bar, work, school, online, etc. |
| met_date | DATE | When you first met/connected |
| rating | TINYINT DEFAULT 0 | 1-5 stars |
| relationship_type | VARCHAR(50) | Friend, Family, Coworker, Acquaintance, Neighbor, Other |
| is_favorite | BOOLEAN DEFAULT 0 | Marks contact as a favorite |
| is_spicy | BOOLEAN DEFAULT 0 | Whether contact has spicy content |
| is_anonymous | BOOLEAN DEFAULT 0 | |
| notes_text | TEXT | General notes |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | Soft delete |

### contact_emails
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| label | VARCHAR(50) | personal, work, school, other |
| email | VARCHAR(255) NOT NULL | |
| is_primary | BOOLEAN DEFAULT 0 | |
| created_at | TIMESTAMP | |

### contact_phones
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| label | VARCHAR(50) | mobile, home, work, other |
| phone | VARCHAR(30) NOT NULL | |
| is_primary | BOOLEAN DEFAULT 0 | |
| created_at | TIMESTAMP | |

### contact_addresses
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| label | VARCHAR(50) | home, work, vacation, other |
| street | VARCHAR(255) | |
| city | VARCHAR(100) | |
| state | VARCHAR(100) | |
| zip | VARCHAR(20) | |
| country | VARCHAR(100) | |
| is_primary | BOOLEAN DEFAULT 0 | |
| created_at | TIMESTAMP | |

### shared_contacts
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| shared_by_user_id | INT FK → users | Who shared it |
| shared_with_user_id | INT FK → users | Who it was shared with |
| permissions | ENUM('read', 'edit') DEFAULT 'read' | |
| share_scope | VARCHAR(50) DEFAULT 'basic' | basic (name/email/phone/photo), full (all SFW data incl. notes/timeline/media), full_spicy (everything including spicy) |
| created_at | TIMESTAMP | |

### spicy_profiles
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | One per contact |
| spicy_type | VARCHAR(50) | hookup, fwb, ltr, friend, ex, situationship, one-night, sugar, open |
| orientation | VARCHAR(50) | Mirrors contact orientation but allows spicy-specific override |
| role_preference | VARCHAR(50) | Top, Bottom, Vers, Vers-top, Vers-bottom, Switch, Dom, Sub, etc. |
| positions | TEXT | Preferred positions (freeform or JSON) |
| kinks | TEXT | JSON array of kinks/fetishes |
| turn_ons | TEXT | What they're into |
| turn_offs | TEXT | What they're not into |
| boundaries | TEXT | Hard limits / boundaries |
| safe_word | VARCHAR(100) | |
| protection_preference | VARCHAR(50) | Always, Sometimes, Never, etc. |
| hiv_status | VARCHAR(50) | Negative, Positive-Undetectable, Positive, Unknown |
| on_prep | BOOLEAN NULL | Yes/No/Unknown |
| prep_since | DATE NULL | When they started PrEP |
| last_tested_date | DATE NULL | Last STI/HIV test date |
| sti_notes | TEXT | Any additional STI-related notes |
| body_type | VARCHAR(50) | Slim, Average, Athletic, Muscular, Thick, Dad-bod, etc. |
| body_notes | TEXT | Physical descriptions, tattoos, piercings, etc. |
| endowment | VARCHAR(50) | Size category if relevant |
| grooming | VARCHAR(50) | |
| spicy_rating | TINYINT | 1-5 intimate rating |
| chemistry_rating | TINYINT | 1-5 chemistry/connection rating |
| would_repeat | BOOLEAN | Would you again? |
| spicy_notes | TEXT | Private notes |
| last_encounter | DATE | |
| encounter_count | INT DEFAULT 0 | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### tags
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| name | VARCHAR(100) NOT NULL | |
| color | VARCHAR(7) | Hex color |
| owner_user_id | INT FK → users NULL | NULL = system/global tag |
| created_at | TIMESTAMP | |

### contact_tags
| Column | Type | Notes |
|--------|------|-------|
| contact_id | INT FK | |
| tag_id | INT FK | |
| PRIMARY KEY (contact_id, tag_id) | |

### groups
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| name | VARCHAR(100) NOT NULL | |
| color | VARCHAR(7) | Hex color for the group |
| icon | VARCHAR(50) | Lucide icon name (e.g. "star", "home", "users", "link") |
| description | TEXT | |
| owner_user_id | INT FK → users NULL | NULL = system/global group |
| is_system | BOOLEAN DEFAULT 0 | System groups can't be deleted |
| created_at | TIMESTAMP | |

### group_members
| Column | Type | Notes |
|--------|------|-------|
| group_id | INT FK | |
| contact_id | INT FK | |
| PRIMARY KEY (group_id, contact_id) | |

### social_links
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| platform | VARCHAR(50) | Preset or custom name |
| url | VARCHAR(500) | Full URL or profile link |
| username | VARCHAR(255) | Platform username |
| created_at | TIMESTAMP | |

Preset platforms: Instagram, Twitter/X, LinkedIn, Facebook, TikTok, Snapchat, YouTube, GitHub, Sniffies, Grindr, Scruff, Feeld, Hinge, Tinder, Bumble, Website, Other

### events
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| owner_user_id | INT FK → users | |
| title | VARCHAR(255) NOT NULL | |
| type | VARCHAR(50) | meetup, date, hangout, hookup, party, trip, call, dinner, coffee, workout, other |
| description | TEXT | Details / notes about the event |
| location | VARCHAR(255) | Where |
| is_spicy | BOOLEAN DEFAULT 0 | |
| starts_at | TIMESTAMP | When it starts |
| ends_at | TIMESTAMP NULL | When it ends |
| status | ENUM('upcoming', 'completed', 'cancelled') DEFAULT 'upcoming' | |
| followup_notes | TEXT | How it went (filled in after) |
| rating | TINYINT | 1-5 how good was it |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | |

### event_contacts
| Column | Type | Notes |
|--------|------|-------|
| event_id | INT FK → events | |
| contact_id | INT FK → contacts | |
| PRIMARY KEY (event_id, contact_id) | |

### event_media
| Column | Type | Notes |
|--------|------|-------|
| event_id | INT FK → events | |
| media_id | INT FK → media_assets | |
| PRIMARY KEY (event_id, media_id) | |

### contact_search_index
| Column | Type | Notes |
|--------|------|-------|
| contact_id | INT FK → contacts PK | |
| search_text | TEXT | Concatenated searchable fields: name, email, phone, bio, location, notes, tags, etc. |
| updated_at | TIMESTAMP | |

Full-text index on search_text for fast LIKE or MATCH queries. Rebuilt on contact create/update.

### timeline_events
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| event_id | INT FK → events NULL | Links to an event if applicable |
| type | VARCHAR(50) | note, call, meetup, message_batch, hangout, date, hookup, import, etc. |
| title | VARCHAR(255) | |
| description | TEXT | |
| is_spicy | BOOLEAN DEFAULT 0 | |
| occurred_at | TIMESTAMP | When it happened |
| created_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | |

### notes
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| content | TEXT NOT NULL | |
| is_spicy | BOOLEAN DEFAULT 0 | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | |

### reminders
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| owner_user_id | INT FK → users | |
| contact_id | INT FK → contacts NULL | Optional link to contact |
| title | VARCHAR(255) NOT NULL | |
| description | TEXT | |
| due_at | TIMESTAMP NOT NULL | |
| completed_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | |

### messages
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| platform | VARCHAR(50) | snapchat, sniffies, instagram, etc. |
| direction | ENUM('in', 'out') | |
| content | TEXT | |
| is_spicy | BOOLEAN DEFAULT 0 | |
| sent_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

### media_assets
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts NULL | NULL = not linked to a contact |
| owner_user_id | INT FK → users | |
| type | VARCHAR(20) | photo, video |
| file_path | VARCHAR(500) | Path within configured media directory |
| thumbnail_path | VARCHAR(500) | Auto-generated thumbnail for videos |
| caption | TEXT | |
| is_spicy | BOOLEAN DEFAULT 0 | |
| is_profile_eligible | BOOLEAN DEFAULT 1 | Can be set as a profile picture |
| created_at | TIMESTAMP | |
| deleted_at | TIMESTAMP NULL | |

### audit_log
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| user_id | INT FK → users | Who made the change |
| contact_id | INT FK → contacts NULL | Which contact was affected |
| action | VARCHAR(50) | create, update, delete, merge, share, unshare, import |
| entity_type | VARCHAR(50) | contact, note, event, spicy_profile, tag, group, import_job, etc. |
| entity_id | INT | ID of the affected entity |
| old_values | JSON | Previous values (for updates/merges) |
| new_values | JSON | New values |
| description | TEXT | Human-readable summary |
| created_at | TIMESTAMP | |

### contact_field_changelog
Per-field change history for each contact. Separate from audit_log (which tracks action-level events) — this table allows granular diff views and conflict resolution during imports.

| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| contact_id | INT FK → contacts | |
| user_id | INT FK → users NULL | NULL for automated/import changes |
| import_job_id | INT FK → import_jobs NULL | Set when change originated from an import |
| source | VARCHAR(50) | user_edit, import_facebook, import_instagram, import_twitter, import_google, import_vcard, import_csv, merge |
| field_name | VARCHAR(100) | e.g. bio, location, first_name, email, phone |
| old_value | TEXT NULL | Previous value (NULL if field was empty) |
| new_value | TEXT NULL | New value (NULL if field was cleared) |
| changed_at | TIMESTAMP | |

### import_jobs
Tracks each import attempt (file-based uploads).

| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| user_id | INT FK → users | Who triggered this import |
| source_platform | VARCHAR(50) | facebook, instagram, twitter, google_contacts, vcard, csv |
| status | ENUM('queued', 'processing', 'awaiting_review', 'complete', 'error') DEFAULT 'queued' | |
| filename | VARCHAR(255) NULL | Original filename(s) for file-based imports |
| is_spicy_source | BOOLEAN DEFAULT 0 | Set by the per-import "Treat this import as spicy" toggle |
| total_records | INT DEFAULT 0 | Total profiles parsed |
| processed_records | INT DEFAULT 0 | How many have been reviewed |
| new_contacts | INT DEFAULT 0 | Created as new after review |
| merged_contacts | INT DEFAULT 0 | Merged into existing contacts after review |
| skipped_records | INT DEFAULT 0 | Skipped/dismissed in review |
| error_message | TEXT NULL | Top-level error if job failed |
| created_at | TIMESTAMP | |
| completed_at | TIMESTAMP NULL | |

### import_staging
Holds all parsed/normalized records from an import job, pending data review.

| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| import_job_id | INT FK → import_jobs | |
| source_platform | VARCHAR(50) | |
| source_id | VARCHAR(255) NULL | Platform's own unique ID for this person |
| normalized_data | JSON | Full normalized record (see Normalized Import Format below) |
| suggested_match_contact_id | INT FK → contacts NULL | Auto-suggested match |
| match_confidence | DECIMAL(3,2) NULL | 0.00–1.00 confidence score |
| review_status | ENUM('pending', 'approved_new', 'approved_merge', 'skipped') DEFAULT 'pending' | |
| merge_field_decisions | JSON NULL | For merges: which field values to keep (see Conflict Resolution) |
| final_contact_id | INT FK → contacts NULL | Set after approval |
| reviewed_at | TIMESTAMP NULL | |
| created_at | TIMESTAMP | |

### app_settings
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| `key` | VARCHAR(100) UNIQUE | Use backticks — reserved word |
| value | TEXT | JSON-encoded |
| type | VARCHAR(20) | string, boolean, json, color |
| updated_at | TIMESTAMP | |

### preferences (per-user preferences)
| Column | Type | Notes |
|--------|------|-------|
| id | INT AUTO_INCREMENT PK | |
| user_id | INT FK → users | |
| `key` | VARCHAR(100) | Use backticks — reserved word |
| value | TEXT | JSON-encoded |
| type | VARCHAR(20) | string, boolean, json |
| updated_at | TIMESTAMP | |
| UNIQUE(user_id, `key`) | | |

---

## Settings Page (Admin Only)

### General
- **App Name** — Customizable (default: "Kith")
- **App Logo** — Upload or URL for custom logo displayed in sidebar
- **Default Relationship Types** — Manage the list of relationship type options

### Appearance
- **Theme** — Light / Dark / System (per-user preference, not an admin setting). Colors are fixed design tokens per **DESIGN.md** ("The Record") — the accent-color pickers from the pre-v1.3 design were removed in v1.3.

### Spicy
- **Enable Spicy Features** — Global toggle. When disabled: confidential toggle hidden, spicy_profiles inaccessible, all is_spicy content filtered out at the API level. No spicy content can be viewed or shown anywhere.
- **Require PIN** — Optionally require a PIN to activate spicy mode each session.
- **Auto-disable** — Automatically turn spicy mode off after a set time (15 min, 30 min, 1 hour, never).

### Media
- **Media Storage Path** — Configure where media files are stored on the server filesystem (default: `/media`)
- **Max Upload Size** — Configurable limit

### Users
- **User Management** — Create/edit/deactivate users, assign roles (admin/user)

### Data
- **Import** — Access the import tools (file upload). See Data Import System.
- **Export / Backup** — Full data export
- **Default Tags** — Manage system-wide tags
- **Default Groups** — Manage system-wide groups

---

## Spicy Mode

### Toggle Behavior
- Quiet lock "confidential" control low in the sidebar (only visible if spicy features are enabled in Settings) — deliberately inconspicuous so the app reads SFW at a glance
- **Off (default, SFW):** Normal app color scheme. All spicy content hidden — contacts with spicy data look normal but spicy sections are hidden, spicy notes/media/events filtered out, spicy_profiles not loaded.
- **On (NSFW):** The accent/interactive layer shifts from ink-blue to oxblood across all elements (buttons, active states, focus rings, sidebar top strip) over 600ms; the paper background warms slightly. All spicy content becomes visible (mounted into the DOM — it is absent, not merely hidden, when off). Text and layout are identical to normal mode — see DESIGN.md for the full signal system.
- Per-user preference saved to database.

### Spicy Profile Fields (comprehensive, inclusive of all orientations)
- **Spicy Type:** hookup, fwb, ltr, friend, ex, situationship, one-night, sugar, open, poly, other
- **Role/Position Preference:** Top, Bottom, Vers, Vers-top, Vers-bottom, Switch, Dom, Sub, Power-bottom, Service-top, etc.
- **Positions:** Freeform text or selectable list
- **Kinks:** Tag-style multi-select or freeform (JSON array)
- **Turn-ons / Turn-offs:** Freeform text
- **Boundaries:** Hard limits
- **Safe word:** If applicable
- **Protection:** Always, Sometimes, Never, etc.
- **HIV Status:** Negative, Positive-Undetectable, Positive, Unknown
- **On PrEP:** Yes/No, since when
- **Last Tested Date**
- **STI Notes:** Additional health notes
- **Body type, body notes, endowment, grooming**
- **Spicy Rating** (1-5): Intimate performance
- **Chemistry Rating** (1-5): Connection / vibe
- **Would Repeat:** Boolean
- **Last Encounter Date, Encounter Count**
- **Spicy Notes:** Private freeform

---

## Events / Meetups

Standalone entity that can involve one or more contacts. Supports past and future events.

### Fields
- Title, Type (meetup, date, hangout, hookup, party, trip, call, dinner, coffee, workout, other)
- Description / details / notes
- Location (where)
- Date/time start, optional end time
- Status: upcoming, completed, cancelled
- Is spicy (toggle)
- Linked contacts (multi-select)
- **Post-event:**
  - Follow-up notes (how it went)
  - Rating (1-5)

- **Photos/videos** — Link media assets to the event (via event_media join table)

Events appear in the timeline of linked contacts.

---

## Contact Merge

### Flow
1. On a contact's profile, click "Merge" button
2. Search/select the other contact to merge with
3. Side-by-side comparison shows every field from both contacts (A and B)
4. User picks which value to keep for each field (Name from A, email from B, etc.)
5. Tags, groups, social links, notes, events, media — all merged (union of both)
6. The "losing" contact is soft-deleted, all references re-pointed to the winner
7. Full merge details logged to audit_log (old values from both contacts preserved)
8. Every changed field logged to contact_field_changelog with source = 'merge'

---

## Audit Log

- Every create, update, delete, merge, share, import action is logged to `audit_log`
- Stores: who, when, what entity, old values, new values
- **UI:** Small text link at the bottom of a contact's profile ("View history") opens a modal/popup showing the change log for that contact
- Critical for merge recovery — can look back to see values that weren't chosen
- Audit writes are non-blocking (fire and forget)

---

## Per-Profile Change Log

Each contact maintains a field-level diff history via the `contact_field_changelog` table. This is distinct from the audit_log (which records action events) — the change log shows exactly what changed on each field and from what source.

### What gets logged
- Every field update via manual editing
- Every field update via import (with `import_job_id` and `source` set to the platform)
- Every field update via merge

### UI
- Accessible from the contact profile via a "Change log" link or tab
- Each entry shows: field name, old value → new value, source (e.g. "Imported from Facebook"), timestamp
- Read-only — changes cannot be reverted from this view (use merge/edit to correct)

---

## Data Import System

Kith supports importing contacts and conversation data from multiple sources. All imports flow through a shared pipeline: parse → normalize → stage for review → commit.

### Supported Sources

**File-based uploads (Settings → Data → Import or Contacts page toolbar):**
- Facebook data export (`.zip` containing JSON/HTML)
- Instagram data export (`.zip`)
- Twitter/X data export (`.zip`)
- Google Contacts / Google Takeout (`.vcf` or `.zip`)
- vCard (`.vcf`) — standard contact card format, supports multi-contact files. **Parser must accept vCard 2.1, 3.0, and 4.0** — Google Contacts and Apple export v3.0, not v4.0.
- CSV — with column mapping step

All imports are file-based. There is no live/scraped collection of any kind (no browser extension).

### Import Flow (File Upload)

```
1.  User uploads file(s) via the Import UI (multi-file supported)
2.  Server creates an import_job record (status: queued)
3.  Background worker processes the file:
      a. Parses platform-specific format
      b. Normalizes to the Kith unified format
      c. Runs match detection against existing contacts
      d. Writes each record to import_staging
      e. Sets import_job.status = 'awaiting_review'
4.  App sends a notification: "Facebook import complete — 47 profiles ready for review"
5.  Import progress widget updates to show review is available
6.  User opens Data Review page
7.  User reviews, matches, or skips each record (see Data Review)
8.  User finalizes — contacts created/merged, import_job.status = 'complete'
```

Processing is always non-blocking — the app remains fully usable while imports run.

### Import Progress Widget

A fixed widget in the bottom-right corner of all pages (except login). Appears only when one or more imports are actively processing or awaiting review. Shows:
- Platform name and icon
- Status label (Processing… / Ready for review / Error)
- Progress bar (records processed / total) during processing phase
- "Review now" button when status = awaiting_review
- Dismissed automatically after all imports are finalized or dismissed

### Per-Import Spicy Flagging

The upload form includes a **"Treat this import as spicy" toggle** which sets `is_spicy_source = true` on the import job. This causes:
- All staged contacts to have `is_spicy = true` pre-checked in review
- All imported messages and media to have `is_spicy = true`
- The contact's `is_spicy` flag set to true when the record is committed

### Normalized Import Format

All parsers must produce records conforming to this format before writing to `import_staging.normalized_data`:

```json
{
  "display_name": "John Doe",
  "first_name": "John",
  "last_name": "Doe",
  "nickname": null,
  "emails": [
    { "label": "personal", "email": "john@example.com" }
  ],
  "phones": [
    { "label": "mobile", "phone": "+15551234567" }
  ],
  "birthday": "1990-04-15",
  "location": "New York, NY",
  "bio": "Profile bio text here.",
  "occupation": null,
  "website": null,
  "social_links": [
    { "platform": "instagram", "username": "johndoe", "url": "https://instagram.com/johndoe" }
  ],
  "messages": [
    { "direction": "in", "content": "Hey!", "sent_at": "2024-03-01T14:22:00Z" }
  ],
  "media": [
    { "type": "photo", "source_url": "https://...", "local_path": null, "caption": null, "is_spicy": false }
  ],
  "spicy_data": {
    "body_type": "Athletic",
    "role_preference": "Vers",
    "kinks": ["outdoors"],
    "hiv_status": "Negative",
    "on_prep": true
  }
}
```

`spicy_data` is only present when the import was flagged spicy. `messages` and `media` may be empty arrays. All fields are optional — parsers include what the platform provides.

### Match Detection

When a new import record is staged, the system automatically attempts to find a matching existing contact using a confidence scoring algorithm:

| Signal | Weight |
|--------|--------|
| Exact email match | Very high (0.95) |
| Exact phone match | Very high (0.95) |
| Exact name match | High (0.80) |
| Fuzzy name match | Medium (0.55) |
| Shared social link (same platform + username) | High (0.85) |
| Location match + name similarity | Medium (0.50) |

The highest-scoring existing contact above a 0.50 threshold is set as `suggested_match_contact_id` with the confidence score. Records with no match above threshold have `suggested_match_contact_id = NULL`.

The system auto-suggests — it never auto-commits. All matches require user confirmation in the Data Review page.

---

## Data Review Page

Accessible from the Import Progress Widget or via Settings → Data → Import History. Shows all `import_staging` records with status = 'pending' grouped by import job.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  IMPORT REVIEW                                          │
│  Facebook import · March 18 · 47 profiles              │
│  [Approve All New] [Skip All Unmatched]   [Finalize]   │
├──────────┬──────────────────────────────────────────────┤
│ IMPORTED │  MATCH DECISION                              │
│ PROFILE  │                                              │
│          │  ○ Create as new contact                     │
│ John Doe │  ● Merge into: [John Doe ▼] (87% match)     │
│ @jdoe    │       → Review field conflicts               │
│ NY       │  ○ Skip / dismiss                            │
│          │                                              │
├──────────┴──────────────────────────────────────────────┤
│  ... next record ...                                    │
└─────────────────────────────────────────────────────────┘
```

### Decisions per record

- **Create as new** — Commits the imported data as a brand-new contact.
- **Merge into existing** — Merges into the matched (or user-selected) contact. Opens conflict resolution if fields overlap.
- **Skip** — Dismisses this record. No contact is created or modified. Logged as skipped.

The suggested match is pre-selected if confidence ≥ 0.70. For confidence 0.50–0.69, it's shown as a suggestion but not pre-selected. User can always override and pick a different existing contact via search.

### Conflict Resolution (Merge path)

When merging an imported record into an existing contact, any fields that exist in both the existing contact and the imported record trigger a conflict resolution step:

- Side-by-side view: existing value on left, imported value on right
- For each conflicting field: keep existing / keep imported / write my own (freeform edit)
- Non-conflicting fields from the import (fields that are currently empty on the existing contact) are applied automatically with a summary shown
- Tags, groups, social links, messages, media are always merged additively (union — no conflicts)

Decisions are stored in `import_staging.merge_field_decisions` as JSON before committing. Each committed field change is written to `contact_field_changelog` with `source = 'import_{platform}'`.

### Bulk actions

- **Approve all suggested** — Applies the pre-selected decision for every record without opening conflict review. Safe when confidence is high (e.g. vCard import of your own address book).
- **Skip all pending** — Marks all remaining pending records as skipped.
- Both bulk actions still require the "Finalize" button to actually commit.

---

## Pride Flag Indicators (retired in v1.3)

The original design showed a small circular pride-flag overlay on avatars based on orientation. **"The Record" redesign (v1.3) retired these** — `.av .flag` is `display: none`; identity (pronouns, orientation, gender identity) is conveyed via the record's mono meta line and Particulars section instead. The `prideFlagGradient()` helper remains in `utils.js`/`components.js` but renders nothing under the current stylesheet.

---

## Media Gallery

- Holds photos and videos per contact (or unlinked to any contact)
- Grid view with thumbnails
- Spicy media hidden when spicy mode is off
- **Profile picture selection:** Click a photo in the gallery to set it as the contact's profile picture
- Media paths reference the configured media storage directory (set in Settings)

---

## Favorites

- `is_favorite` boolean on contacts
- Star icon toggle on contact row/profile
- **Favorites section** in sidebar (collapsible, shown above Groups)
- Favorited contacts appear as a quick-access list

---

## UI Design System

### Core Principle: Uniform, Reusable Components

Every page follows the same template structure. Every widget is copy-paste reusable with zero extra styling needed. All styling lives in `style.css` — page `<style>` blocks contain only layout-specific rules (column widths, view toggles, etc.).

### Page Template
```
┌─────────────────────────────────────────────┐
│ SIDEBAR (260px)  │  MAIN CONTENT            │
│                  │  ┌─────────────────────┐  │
│  Logo            │  │ PAGE HEADER         │  │
│  Search          │  │ Title + actions     │  │
│  + New person    │  ├─────────────────────┤  │
│  Nav items       │  │ TOOLBAR             │  │
│  ─────────       │  │ Search/filter/sort  │  │
│  Favorites ▸     │  ├─────────────────────┤  │
│  Groups ▸        │  │ CONTENT AREA        │  │
│  ─────────       │  │ (scrollable)        │  │
│  Settings        │  │                     │  │
│  User + Logout   │  │                     │  │
│                  │  └─────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Mobile (≤768px):** Sidebar collapses into a fixed left drawer toggled by a hamburger button. A `.mob-header` bar (logo + hamburger + user avatar) is always visible at the top of the main content area.

### Reusable Widgets / Components
All built as vanilla JS render functions that return HTML strings. Same class names, same structure everywhere.

- **Modal** — Standard overlay + card. Used for: add/edit contact, add event, merge, audit log, confirmations. All modals use the same `.modal-overlay > .modal > .modal-header + .modal-content + .modal-footer` structure.
- **Tag pill** — `.tag-pill` with color prop. Used everywhere tags appear.
- **Group badge** — `.group-badge` with icon + color. Uniform across sidebar, table, detail.
- **Avatar** — `.av` with size variants (sm/md/lg). Deterministic letter-avatar palette color per person (v1.6); photos cover when set. (The pride-flag overlay slot is retired — see DESIGN.md.)
- **Card** — `.card` container. Used for profile sections, event cards, settings sections.
- **Button** — `.btn` with variants: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-ghost`, `.btn-icon`. Same everywhere.
- **Form controls** — `.form-group > .form-label + input/select/textarea`. Uniform styling.
- **Table** — `.data-table` with `.table-row`, `.table-header`. Sortable, filterable.
- **Feed item** — `.feed-item` for timeline/activity entries.
- **Empty state** — `.empty-state` centered message + optional action button.
- **Star rating** — `.star-rating` component, reusable for both regular and spicy ratings.
- **Toast / notification** — `.toast` for success/error messages.
- **Import progress widget** — `.import-widget` fixed bottom-right corner. Visible across all pages when import is active. Shows platform, progress bar, status, and "Review now" CTA.
- **Popover** — `.popover-wrap > .popover > .popover-item` for filter dropdowns and multi-select menus.
- **Toggle switch** — `.toggle-switch` for boolean settings.

### Layout Utilities
- Flexbox: `.flex`, `.flex-col`, `.flex-center`, `.flex-between`, `.gap-*`
- Grid: `.grid`, `.grid-2`, `.grid-3`, `.grid-4`
- Spacing: `.mt-*`, `.mb-*`, `.p-*`

> For complete design specifications — colors, typography, spacing, iconography, motion, accessibility, spicy mode visual system, and component patterns — see **DESIGN.md** ("The Record").

---

## Home Page (Dashboard)

Clean, uncluttered dashboard with key information at a glance:

- **Upcoming birthdays** — Contacts with birthdays in the next 30 days, with countdown
- **Due reminders** — Reminders due today or overdue, with quick-complete action
- **Upcoming events** — Next 5 events with date, time, linked contacts
- **Recent activity** — Last 10 timeline entries across all contacts (who, what, when)
- **Quick stats** — Total contacts, contacts added this month, events this month, overdue reminders count

Layout: cards in a responsive grid. Nothing cluttered — just the essentials with links to dive deeper.

---

## Notifications Page

- List of actionable items:
  - Overdue reminders
  - Upcoming birthdays (next 7 days)
  - Upcoming events (next 7 days)
  - Shared contacts received (pending acknowledgement)
  - Import complete / awaiting review
- Each notification links to the relevant contact/event/reminder/review page
- Mark as read / dismiss

---

## Sidebar Layout

*(Current — "The Record", v1.3+. See DESIGN.md.)*

- **Top:** "Kith" masthead (Newsreader serif; custom logo image if `app_logo` is set) + mono `PERSONAL RECORD` subline
- **Search:** hairline-underlined search row with ⌘K shortcut hint
- **Button:** full-width ink `NEW RECORD +` button (all roles — every user can add contacts to their own list)
- **Nav items (numbered index):** 01 Home, 02 People, 03 Family, 04 Calendar, 05 Map, 06 Events, 07 Timeline, 08 Journal, 09 Notices (badge count), 10 Settings (admin only)
- **Favorites section:** Collapsible, favorited contacts as record-number + name list
- **Groups section:** Collapsible, each group with dotted-leader member count; gear link to Groups page
- **Bottom:** quiet confidential lock toggle (if spicy enabled), user monogram + name + role (`KEEPER`/`MEMBER`), logout

---

## Default Seed Data

### Default admin user
- username: `admin`, email: `admin@example.com`, password: `changeme`, role: `main_admin` (forced change on first login)

### Default tags
- Friend, Family, Work, VIP, Shared

### Default groups
- Close Friends (icon: `star`, color: #7c5bf5)
- Family (icon: `home`, color: #50c878)
- Acquaintances (icon: `users`, color: #5b9cf5)
- Shared (icon: `link`, color: #f59e0b) — auto-populated when contacts are shared

Icons are Lucide icon names. Rendered as SVG in the UI.

### Default app_settings
- app_name: "Kith"
- spicy_enabled: **false** (enabling spicy is a deliberate post-setup act by the admin)
- spicy_require_pin: false; spicy_auto_disable_minutes: 0
- relationship_types: Friend, Family, Coworker, Acquaintance, Neighbor, Other
- media_path: "/media"
- max_upload_size: 52428800 (50MB — applies to **media** uploads; import file uploads use the separate `IMPORT_MAX_UPLOAD_SIZE`, default 2GB, since platform exports are routinely hundreds of MB)
- `app_logo` is a recognized setting but not seeded (absent = default mark). `accent_color`/`spicy_accent_color` are no longer seeded — instance accent customization was removed post-v1.3; the accent tokens are pinned in DESIGN.md/style.css.

### Default user preferences
- spicy_visible: false

---

## API Endpoints

**See [API.md](API.md) for the complete, current endpoint reference** — every router in `server/routes/` enumerated with methods, full paths, auth/permission notes, and query params. `server/routes/` remains the ground truth; API.md is regenerated from it.

Auth summary:
- Session: httpOnly cookie `kith_token` or `Authorization: Bearer <jwt>` (7-day JWT; TOTP-aware login via `POST /api/auth/login/totp`).
- Personal Access Tokens: `Authorization: Bearer kith_<40 hex>`, scopes `read` (GET/HEAD only) / `read_write`; managed at `/api/tokens` (session auth only).
- ICS special case: `GET /api/ics/calendar.ics?token=kith_…` accepts a read-scoped PAT as a query param.

---

## Infrastructure Files (kept & cleaned)

- `.env` — Deployment config (DB creds, JWT secret, ports, URLs)
- `docker-compose.yml` — Service definition with reverse-proxy labels
- `Dockerfile` — Node.js container build
- `files.json` — CI/CD deploy file list

---

## File Structure

*(Current as of v1.8 — the original v1 layout plus post-v1.1 modules.)*

```
kith/
├── .env
├── .gitignore
├── docker-compose.yml
├── docker-compose.dev.yml
├── Dockerfile
├── files.json
├── package.json
├── SPEC.md                      # This document
├── DESIGN.md                    # "The Record" design system (authoritative on visuals)
├── BRANDING.md                  # Superseded stub — name/logo provenance only
├── BUILDLOG.md                  # Release-by-release build history
├── server/
│   ├── index.js                 # Express app entry point
│   ├── lib/
│   │   ├── crypto.js            # AES-256-GCM field encryption helpers (spicy layer)
│   │   ├── contacts.js          # Search-index rebuild, share-scope filter, touchContact, validation
│   │   ├── audit.js             # Non-blocking audit_log writes
│   │   ├── geo.js               # Geocoding: bundled geonames index + Photon, geo_cache
│   │   ├── notify.js            # Notification + Web Push delivery
│   │   ├── scheduler.js         # Daily jobs: birthday/reminder nudges, trash purge
│   │   ├── davsync.js           # CardDAV/CalDAV (e.g. Radicale) sync
│   │   └── totp.js              # RFC-6238 TOTP (2FA), node:crypto only
│   ├── database/
│   │   ├── connection.js        # MariaDB pool
│   │   ├── init.js              # Auto-create tables + seed data + idempotent column adds
│   │   └── migrations.js        # schema_version table + sequential migration runner
│   ├── middleware/
│   │   └── auth.js              # JWT (cookie or bearer) requireAuth / requireAdmin / PAT acceptance
│   ├── routes/
│   │   ├── auth.js              # Login (+TOTP step), cookie sessions, password change
│   │   ├── users.js
│   │   ├── contacts.js          # Incl. merge, share/spicyVisible helpers, photo, favorite, changelog, family-tree
│   │   ├── satellites.js        # Emails/phones/addresses/socials
│   │   ├── tags.js
│   │   ├── groups.js
│   │   ├── relationships.js     # Typed contact↔contact links (family/friends/work + inverses)
│   │   ├── dates.js             # Important dates
│   │   ├── gifts.js             # Gift ideas
│   │   ├── interactions.js      # One-tap touchpoint log (keep-in-touch cadence)
│   │   ├── spicy.js
│   │   ├── events.js
│   │   ├── timeline.js          # Timeline/notes/reminders/messages routers
│   │   ├── journal.js           # Personal diary + merged life-feed timeline
│   │   ├── calendar.js          # Month-view aggregate
│   │   ├── geo.js               # Geocode search, map pins, authenticated OSM tile proxy
│   │   ├── media.js
│   │   ├── immich.js            # Immich photo-server proxy (multi-instance, keys server-side)
│   │   ├── search.js            # Global command-palette search
│   │   ├── dashboard.js
│   │   ├── notifications.js
│   │   ├── push.js              # Web Push (VAPID) subscriptions
│   │   ├── tokens.js            # Personal API tokens (PATs)
│   │   ├── ics.js               # ICS calendar feed (PAT query auth)
│   │   ├── export.js            # vCard/CSV/GEDCOM/JSON export
│   │   ├── trash.js             # 30-day soft-delete recycle bin
│   │   ├── sharing.js           # Share/unshare + merge
│   │   ├── settings.js
│   │   ├── preferences.js
│   │   └── import.js            # All import routes (upload, jobs, review, finalize)
│   ├── import/
│   │   ├── worker.js            # Background import job processor (worker_threads)
│   │   ├── normalizer.js
│   │   ├── matcher.js
│   │   └── parsers/             # facebook, instagram, twitter, google, vcard, csv, gedcom
│   ├── test/                    # node:test suites (import-core, geo, gedcom)
│   └── public/                  # Static files served by Express
│       ├── index.html           # Single page app shell (+ PWA manifest, service worker sw.js)
│       ├── css/style.css        # All styles — The Record design system + components
│       ├── fonts/               # Self-hosted Newsreader + IBM Plex (record-fonts.css)
│       ├── vendor/              # Vendored Leaflet, d3 + family-chart (loaded on demand)
│       └── js/                  # ES modules:
│           ├── app.js           #   Shell, router, state, auth, theme, confidential toggle
│           ├── api.js           #   Fetch wrapper
│           ├── components.js    #   Reusable UI widget render functions
│           ├── pages.js         #   Shared page-level render helpers
│           ├── contacts.js / inline-edit.js / spicy.js / interactions.js
│           ├── events.js / calendarpage.js / journal.js / timelinepage.js
│           ├── dashboard.js / groups.js / map.js / familytree.js
│           ├── media.js / import.js / settings.js / trashpage.js
│           ├── search-index.js / phonefmt.js / icons.js / utils.js
└── (no mockups directory — the v1 plan's `mockups/v3/` never existed (O7);
     the v1.3 design handoff was promoted to DESIGN.md)
```

---

## Contact Profile / Detail View

When a contact row is clicked in the contacts list, a profile panel opens (slide-in drawer on desktop, full-page on mobile). This is the primary view for all contact data.

### Sections

**Header** — Portrait frame, display name, RECORD №, mono meta line (pronouns, zodiac, location, birth/death dates), status, rating, bracketed tags, star (favorite) toggle. Action buttons: Edit, Merge, Share.

**Info** — All standard fields: full name, nickname, birthday/age, pronouns, sex, orientation, relationship status, occupation/company, website, languages, ethnicity, zodiac sign, how we met / met date, notes.

**Contact** — All emails (labeled), phones (labeled), addresses (labeled). Primary marked with a filled dot.

**Social Links** — Platform icon + username + clickable URL for each linked social account.

**Tags & Groups** — Tag pills (add/remove inline). Group memberships (add/remove inline).

**Timeline** — Chronological feed of all interactions: notes, events, imported message batches, manual entries. Each item shows type icon, title, date, preview. Spicy items hidden when spicy mode off. "Add note" inline at top.

**Media** — Photo/video gallery grid for this contact. Spicy media hidden when spicy mode off. Click to set as profile picture.

**Spicy Profile** *(spicy mode only)* — All spicy_profiles fields rendered as a form/display. Ratings, encounter info, health info, preferences. Full inline edit.

**Change Log** — Field-level diff history. Expandable. Shows field → old value → new value, source, timestamp.

### Actions available from profile
- Edit any field inline or via modal
- Add / remove tags, groups, social links
- Add timeline note
- Link / unlink event
- Upload media
- Set profile photo
- Share contact with another user
- Merge with another contact
- Soft delete (moves to trash)

---

## Groups Page

The Groups page displays all groups the user has access to as a 2-column card grid.

### Group Card
Each card shows: icon + name + description + member count + avatar stack (first 5 members). Card is expandable — clicking the header toggles a member list showing each member's avatar, name, and location. An "Add member" button appears at the bottom of the expanded list. Each member row has a remove (×) button.

### Actions
- **Create group** — Modal with name, icon picker (Lucide icon name), color picker, description.
- **Edit group** — Same modal pre-filled. System groups (Close Friends, Family, etc.) can be renamed but not deleted.
- **Delete group** — Confirmation required. Removes group and all memberships; contacts are not deleted.
- **Add member** — Inline search-as-you-type within the expanded card. Selecting a contact adds them immediately.
- **Remove member** — Per-member × button in expanded view.

---

## Design Reference

The v1 build plan referenced a `mockups/v3/` directory of dark frosted-glass mockups; **those mockups never existed** (build assumption O7 — v1.0 was built from the original BRANDING.md alone). That whole design direction was retired in v1.3.

The current, authoritative visual reference is **`DESIGN.md`** ("The Record"), promoted from the v1.3 design-handoff bundle. The throwaway `.dc.html` reference mocks that accompanied the handoff were deleted after the redesign shipped; `server/public/css/style.css` is the single implementation of the design system.

Notes that remain true regardless of design direction:
- One consistent filter pattern app-wide: pills for primary status filters (Upcoming / Past / All), a popover for type/category filters.
- Mobile: sidebar drawer + mobile header bar per the spec behavior (a dedicated mobile pass shipped in v1.8).

---

## Docker / Deployment

### Container Architecture

Kith runs as a **single Docker container** (Node.js + Express) on the application server. The MariaDB database is external — hosted on a separate database server at a fixed address. There is no database container in the compose file.

```
┌──────────────────────────────┐     ┌──────────────────┐
│  kith container              │────▶│  MariaDB         │
│  node:24-alpine              │     │  database server │
│  Express API + static files  │     │  db-host         │
│  Import worker (in-process)  │     │  port 3306       │
└──────────────┬───────────────┘     └──────────────────┘
               │ volume mount
               ▼
        media volume
```

### docker-compose.yml

```yaml
services:
  kith:
    image: registry.example.com/kith:latest
    restart: unless-stopped
    ports:
      - "8084:3000"
    environment:
      - NODE_ENV=production
      - DB_HOST=${DB_HOST}
      - DB_PORT=${DB_PORT}
      - DB_USER=${DB_USER}
      - DB_PASSWORD=${DB_PASSWORD}
      - DB_NAME=${DB_NAME}
      - DB_SSL=true
      - JWT_SECRET=${JWT_SECRET}
      - FIELD_ENCRYPTION_KEY=${FIELD_ENCRYPTION_KEY}
      - MEDIA_PATH=/media
      - MAX_UPLOAD_SIZE=52428800
      - IMPORT_MAX_UPLOAD_SIZE=2147483648
    volumes:
      - /path/to/media:/media                # Media volume mount (host path → container)
      - /opt/kith/uploads:/app/uploads   # Temp import-upload staging
    labels:
      # Example reverse-proxy labels (shown for Traefik; adapt to your reverse proxy)
      - "traefik.enable=true"
      - "traefik.http.routers.kith.rule=Host(`kith.example.com`)"
      - "traefik.http.routers.kith.entrypoints=websecure"
```

> Exposure: because Kith holds sensitive personal data, deploy it on a private network (LAN/VPN) rather than exposing it to the public internet. Terminate TLS at your reverse proxy.

### Dockerfile

```dockerfile
FROM node:24-alpine

# FFmpeg for video thumbnail generation
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 3000
CMD ["node", "server/index.js"]
```

### Import Worker (in-process)

The background import worker runs **inside the same Node.js process** as Express — no separate container, no Redis, no Bull queue. Implementation uses `worker_threads` to keep the import processing off the main event loop:

```
Main thread (Express):  enqueues job → writes import_job (status: queued) → returns job_id
Worker thread:          polls for queued jobs every 5s → processes → updates status
```

This keeps the Docker setup to a single container with zero additional services.

### npm Packages

All packages are well-established, actively maintained, and available on npm with no native build dependencies (except `fluent-ffmpeg` which wraps the system FFmpeg binary):

| Purpose | Package |
|---------|---------|
| HTTP server | `express` |
| Database | `mysql2` (MariaDB-compatible) |
| Auth | `jsonwebtoken`, `bcryptjs` |
| File uploads | `multer` |
| ZIP extraction (export parsing) | `yauzl` (streaming — platform exports can be multi-GB; never load archives fully into memory. Validate entry paths against zip-slip) |
| vCard parsing | `vcard4` (must handle vCard 2.1/3.0/4.0 input) |
| CSV parsing | `csv-parse` |
| Video thumbnails | `fluent-ffmpeg` |
| Security headers | `helmet` (CSP, X-Content-Type-Options, frame protections) |
| Request body parsing | `express.json()` (built-in) |
| Environment variables | `dotenv` |

> Note: no `cors` package — Kith is a same-origin SPA; CORS middleware is unnecessary and default-open if misconfigured. The previously listed `vcard4-parser` does not exist on npm; `vcard4` is the maintained RFC 6350 library.

No ORM — raw SQL with `mysql2` for full control and no magic.

### Environment Variables (.env)

```
DB_HOST=db-host
DB_PORT=3306
DB_USER=kith
DB_PASSWORD=changeme
DB_NAME=kith
DB_SSL=true
JWT_SECRET=changeme-use-a-real-secret
FIELD_ENCRYPTION_KEY=changeme-32-byte-base64-key
PORT=3000
MEDIA_PATH=/media
MAX_UPLOAD_SIZE=52428800
IMPORT_MAX_UPLOAD_SIZE=2147483648
```

In `NODE_ENV=production` the server must **refuse to start** if `JWT_SECRET` or `FIELD_ENCRYPTION_KEY` is missing or still a `changeme` placeholder.

---

## Technical Notes

- No React, no Vite, no build step. Vanilla HTML + JS served from `server/public/`
- The `key` column in preferences/app_settings is a MariaDB reserved word — always use backticks in SQL
- JS template literals conflict with SQL backticks — use escaped backticks or regular strings
- `display_name` is auto-built from `first_name + last_name` if not explicitly provided
- All deletes are soft deletes (set `deleted_at`)
- Media paths reference the configured storage directory (set in Settings — default `/media` maps to the media volume mount)
- Spicy mode availability is gated at the API level by the `spicy_enabled` app setting — when disabled, spicy endpoints return 403 and all queries filter out is_spicy content
- Audit log writes and change log writes are non-blocking (fire and forget) to avoid slowing down user actions
- CSS custom properties (variables) power the color scheme — toggling spicy mode swaps only the accent tokens on the app element; surfaces/text/structure are unchanged
- Import jobs are processed asynchronously via a `worker_threads` worker in the same Node process — the main Express thread enqueues the job and returns immediately
- Match detection runs on every import_staging insert — confidence scoring is rule-based only (no ML)
- All import_staging records are retained after finalization for audit purposes
- Video thumbnail generation uses `fluent-ffmpeg` + the system FFmpeg binary (installed in Docker image via `apk add ffmpeg`) — extracts frame at 1s into the video, saves as JPEG alongside the video file
- All users can create and manage their own contacts. Admins additionally can view all users' contacts. Only admins can access Settings.
- **XSS / output encoding (mandatory):** UI widgets are functions returning HTML strings, and much of the data is third-party (imported names/bios). Every interpolated value MUST pass through a shared `esc()` HTML-escaping helper — no unsanitized `innerHTML` of user or imported data, ever. Enforce with a strict Content-Security-Policy via `helmet`.
- **Media serving (mandatory):** media files are NEVER served statically. All media is served through authenticated routes that enforce ownership/share-scope and the spicy gate, with path-traversal guards and no directory listing. Media blobs themselves are stored unencrypted on the media volume (accepted residual risk); spicy *captions* are field-encrypted.
- **First boot:** the seeded `admin`/`changeme` account is forced to change its password on first login (all other routes blocked until done). `spicy_enabled` seeds as false.
