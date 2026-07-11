# Kith REST API Reference

Authoritative endpoint reference, generated from `server/routes/` + `server/index.js`.
For architecture and data-model details see `SPEC.md`.

---

## Overview

**Base URL:** `https://kith.example.com/api` (all paths below are relative to the host root).
`/api` is exempt from the Authentik SSO edge via a dedicated higher-priority Traefik router
(`kith-api`, `PathPrefix(/api)`, priority 100) — the app's own JWT/PAT auth is the API boundary;
Authentik forwardauth wraps only the UI shell.

### Authentication

| Method | How | Notes |
|---|---|---|
| **Session (JWT)** | httpOnly cookie `kith_token` (set on login) or `Authorization: Bearer <jwt>` | 7-day expiry; `SameSite=Strict`; invalidated by password change / admin reset / deactivation (token-version bump). With TOTP enabled, login returns `{ totp_required, pending_token }` to exchange at `POST /api/auth/login/totp`. |
| **Personal Access Token (PAT)** | `Authorization: Bearer kith_<40 hex>` | Scopes: `read` (GET/HEAD only) or `read_write`. Managed at `/api/tokens` (session auth only — PATs cannot mint/revoke PATs). PATs are blocked from all `/api/auth/*` except `GET /api/auth/me`. Admin routes additionally require the token's user to be an admin. |
| **ICS query token** | `GET /api/ics/calendar.ics?token=kith_…` | The one endpoint accepting a PAT as a query param (calendar apps can't send headers). **`read`-scoped tokens only** — a `read_write` token is rejected (401) to limit query-string leak blast radius. |

Users with `must_change_password` set are blocked from everything except
`PUT /api/auth/password`, `GET /api/auth/me`, and `POST /api/auth/logout` (403, code `MUST_CHANGE_PASSWORD`).

### curl quickstart

Create a token in the UI (Settings → API tokens) or via a logged-in session, then:

```bash
# list contacts (read scope is enough)
curl -H "Authorization: Bearer kith_<40hex>" \
  "https://kith.example.com/api/contacts?limit=10&sort=updated&sortDir=desc"

# log an interaction (requires a read_write token)
curl -X POST -H "Authorization: Bearer kith_<40hex>" -H "Content-Type: application/json" \
  -d '{"type":"call","note":"caught up"}' \
  "https://kith.example.com/api/contacts/42/interactions"
```

### Rate limits

In-memory sliding window per client IP (`server/middleware/ratelimit.js`), applied to `/api` only:

- `/api/*`: `RATE_LIMIT_PER_MIN` requests/min (default **600**; `0` disables limiting entirely)
- `/api/auth/*`: `RATE_LIMIT_AUTH_PER_MIN` requests/min (default **30**)

Exceeding a budget returns `429 {"error":"Too many requests — slow down"}` with a `Retry-After` header.
Login and TOTP additionally have a per-IP+username throttle (5 failures → 15 min lockout), and the
spicy-PIN verify has its own per-user throttle (5 failures → 15 min).

### Errors

All errors are JSON: `{ "error": "<message>" }`. Conventions:

- `400` validation, `401` unauthenticated/expired, `403` forbidden (permission/scope/spicy gate), `404` not found (also used instead of 403 to avoid leaking existence), `409` conflict/duplicate, `413` payload too large (JSON body limit 1 MB), `429` rate limited, `502` upstream (Immich/tiles) unavailable.
- Unknown `/api` paths → `404 {"error":"Not found"}`. Unhandled errors → `500 {"error":"Something went wrong"}` (stack traces never leak). Malformed JSON body → `400 {"error":"Invalid JSON body"}`.

### Pagination

Where supported, list endpoints take `?page=` (1-based) and `?limit=` query params and return
`{ …, total, page, limit }`. Defaults/caps vary per endpoint (noted below). Endpoints without
`page/limit` use fixed `LIMIT` caps (noted where relevant).

### Spicy-layer semantics

Content flagged `is_spicy` belongs to the confidential layer. It is visible only when the layer is on
**server-side**: global setting `spicy_enabled` AND the user's `spicy_visible` preference AND (if set)
the `spicy_auto_disable_minutes` window since activation. When off:

- Spicy items are **absent** from lists/feeds/search/dashboard/calendar/exports, and individual spicy rows **404** (never 403 — existence isn't leaked).
- The `is_spicy` flag on contacts is reported as `0`; setting `is_spicy: true` on create/update is silently downgraded.
- `/api/contacts/:id/spicy` is the exception: it returns **403** ("Spicy features are disabled" / "Spicy mode is not active").
- Spicy note/message/timeline/journal content, media captions and all spicy-profile fields are AES-256-GCM encrypted at rest; the API transparently decrypts when the layer is on.
- Shared contacts see spicy content only at `full_spicy` share scope (and only while the *viewer's* spicy mode is active).

### Share scopes (recurring auth note)

Contacts can be shared with `permissions` `read`|`edit` and `share_scope` `basic`|`full`|`full_spicy`.
`basic` exposes only name/email/phone/photo — sub-resources (notes, timeline, addresses, socials,
media, changelog, interactions…) return 403/empty for basic-scope viewers. Write endpoints on shared
contacts require `permissions: 'edit'` (else 403 "Read-only access"). Admins see everything
(spicy still gated by their own spicy mode).

---

## Endpoints

Mount prefixes resolved from `server/index.js`. `🔒A` = admin-only, `🔒O` = owner-only (no shared access), `🌶` = spicy-gated.

### Health

| Method | Path | Description |
|---|---|---|
| GET | `/api/health` | Unauthenticated deep health check (DB ping). 200 `{status:'ok',db:'up'}` or 503. |

### Auth (`/api/auth`) — PATs blocked except GET /me

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Body `{username, password}` (username or email). Returns `{token, user}` + cookie, or `{totp_required, pending_token}` when 2FA is on. Throttled. |
| POST | `/api/auth/login/totp` | Exchange `{pending_token, code}` for a real session. Pending token lives 5 min. |
| GET | `/api/auth/me` | Current user (id, role, `totp_enabled`, `self_contact_id`, `must_change_password`). |
| PUT | `/api/auth/password` | `{current_password, new_password}` (≥8 chars). Bumps token_version (kills other sessions), re-issues this one. |
| POST | `/api/auth/logout` | Clears the session cookie. |
| POST | `/api/auth/totp/setup` | Generate a new (disabled) TOTP secret → `{secret_base32, otpauth_url}`. |
| POST | `/api/auth/totp/enable` | `{code}` — verify against stored secret, then enable 2FA. |
| POST | `/api/auth/totp/disable` | `{code}` — requires a valid current code. |

### Users (`/api/users`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/users/directory` | Any authenticated user: active users, minimal fields (id, username, display_name) — for the share picker. |
| PUT | `/api/users/me` | Update own `{display_name?, email?}`. 409 on duplicate email. |
| POST | `/api/users/me/self-contact` | Idempotent create-or-return of the user's own contact card → `{contact_id, created}`. |
| PUT | `/api/users/me/self-contact` | `{contact_id}` links an owned contact as self-contact; `{contact_id: null}` clears. |
| GET | `/api/users` | 🔒A List all users. |
| POST | `/api/users` | 🔒A Create `{username, email, password, display_name?, role?}` (role `admin` requires main_admin). New user gets `must_change_password=1`. |
| PUT | `/api/users/:id` | 🔒A Update email/display_name/role/is_active/password. main_admin only editable by self; regular admins cannot modify other admins; role changes are main_admin-only. Password reset/deactivation kills sessions. |
| DELETE | `/api/users/:id` | 🔒A Deactivate (soft; never main_admin, not self; admins only deactivatable by main_admin). |

### Contacts (`/api/contacts`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts` | Paginated list (`page`, `limit` default 50 max 200). Filters: `tag`, `group`, `search` (fulltext + prefix), `favorites=1`, `filter=out_of_touch`, `near=lat,lng`+`radius_km` (default 50). Sort: `sort=name\|created\|updated\|rating\|location\|birthday\|last_contacted_at`, `sortDir`. Scope: own + shared-in (admins: all); basic-scope rows field-filtered. Returns `{contacts, total, page, limit}`. |
| GET | `/api/contacts/duplicates` | Pairwise dedupe scan of own contacts (matcher scoring, cap 500 contacts) → `{pairs:[{a,b,score,reason}]}`. |
| POST | `/api/contacts/bulk` | `{ids (≤200), action, tag_id?, group_id?}` — action ∈ add_tag/remove_tag/add_group/remove_group/delete/favorite/unfavorite. Owner/admin per id; shared-in skipped → `{done, skipped}`. |
| GET | `/api/contacts/:id` | Full detail + emails/phones/addresses/socials/tags/groups + `access`/`permissions`/`share_scope`. Basic scope strips addresses/socials/tags/groups. |
| POST | `/api/contacts` | Create; any of the contact fields (`first_name`, `last_name`, `birthday` YYYY-MM-DD, `rating` 0–5, `keep_in_touch_days`, flags…). `display_name` auto-built; zodiac auto-derived. → `{id}` 201. |
| PUT | `/api/contacts/:id` | Partial update (edit permission required). Same validation as create. |
| DELETE | `/api/contacts/:id` | 🔒O Soft delete (→ trash, 30-day retention). Shared-in editors cannot delete. |
| PUT | `/api/contacts/:id/favorite` | 🔒O Toggle (or set via `{is_favorite}`). |
| PUT | `/api/contacts/:id/photo` | `{media_id}` sets profile photo (must be own, profile-eligible photo); `{media_id: null/absent}` clears. |
| GET | `/api/contacts/:id/changelog` | Field-level change history (max 500). 403 for basic-scope shares. |

### Contact satellites — emails / phones / addresses / socials

List/add mounted at `/api/contacts/:id/<kind>` (mergeParams); item ops at `/api/<kind>/:itemId`.
Kinds: `emails` (`label, email*, is_primary`), `phones` (`label, phone*, is_primary`),
`addresses` (`label, street, city, state, zip, country, is_primary, start_date, end_date` + optional
`verified_lat`/`verified_lng` confirmed-pick pin), `socials` (`platform, url, username`).

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts/:id/{emails\|phones\|addresses\|socials}` | List for a contact. Basic-scope shares get `[]` for addresses/socials. |
| POST | `/api/contacts/:id/{emails\|phones\|addresses\|socials}` | Add (edit permission). `is_primary` demotes existing primaries. New/changed addresses are geocoded (user pin wins, else async best-effort). |
| GET | `/api/{emails\|phones\|addresses\|socials}/:itemId` | Single item; read access mirrors the list (basic scope 404s addresses/socials). |
| PUT | `/api/{emails\|phones\|addresses\|socials}/:itemId` | Update (edit permission). Address text change → re-geocode. |
| DELETE | `/api/{emails\|phones\|addresses\|socials}/:itemId` | Hard delete (edit permission). |
| POST | `/api/addresses/:itemId/geocode` | Manual awaited re-geocode → `{latitude, longitude, label, source}` or 404. |

### Tags (`/api/tags` + contact attach)

| Method | Path | Description |
|---|---|---|
| GET | `/api/tags` | System tags + own, with `usage_count`. |
| POST | `/api/tags` | `{name, color? (#hex), system?}` — `system:true` (admin) creates an ownerless system tag. 409 on duplicate name. |
| PUT | `/api/tags/:id` | Rename/recolor. System tags admin-only. |
| DELETE | `/api/tags/:id` | Delete; smart groups linked to the tag fall back to manual with membership snapshotted. |
| POST | `/api/contacts/:id/tags/:tagId` | Attach tag to contact (edit permission). |
| DELETE | `/api/contacts/:id/tags/:tagId` | Detach. |

### Groups (`/api/groups`)

System groups are renamable (admin) but not deletable. A group with `tag_id` set is a **smart group**:
membership = contacts carrying the linked tag; member add/remove writes the tag instead.

| Method | Path | Description |
|---|---|---|
| GET | `/api/groups` | System + own groups with member counts (counts scoped to visible contacts). |
| GET | `/api/groups/:id` | Single group with tag link + member count. |
| GET | `/api/groups/:id/members` | Members (scoped to contacts the user can see). |
| POST | `/api/groups` | `{name, color?, icon?, description?, system? (admin), tag_id?}` — `tag_id` makes it a smart group. |
| PUT | `/api/groups/:id` | Update fields / link-unlink `tag_id` (null → manual group). System groups admin-only. |
| DELETE | `/api/groups/:id` | Delete (never system groups). Linked tag untouched. |
| POST | `/api/groups/:id/members/:contactId` | Add member (smart group: adds the linked tag). Edit permission on the contact required. |
| DELETE | `/api/groups/:id/members/:contactId` | Remove member (smart group: removes the linked tag). |

### Relationships (mounted at `/api`)

Stored as a single directed row; the reverse direction is computed via an inverse-type map at read time.

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts/:id/relationships` | Both directions with `display_label` and `inverse` flag. |
| POST | `/api/contacts/:id/relationships` | `{related_contact_id, relation_type, notes?}` — ~70 types (parent/child/sibling/spouse/…/friend/colleague/other). Both contacts must be accessible. 409 on duplicate in either direction. |
| GET | `/api/contacts/:id/family-tree` | BFS over family-typed edges → `{root, people, edges (parent/partner/sibling, normalized), truncated}`. Caps: 400 people / depth 10; access-filtered. |
| PUT | `/api/relationships/:id` | **New.** Change `relation_type` / `related_contact_id` / `notes`. Editable from either side (owner/edit-share of either contact). Duplicate check as POST. |
| DELETE | `/api/relationships/:id` | Remove; either side's owner (or admin). |

### Important dates (mounted at `/api`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts/:id/dates` | List (label, date, recurring). |
| POST | `/api/contacts/:id/dates` | `{label*, date* (YYYY-MM-DD), recurring? (default true)}` (edit permission). |
| PUT | `/api/dates/:id` | Partial update (edit permission via parent contact). |
| DELETE | `/api/dates/:id` | Hard delete. |

### Gifts (mounted at `/api`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts/:id/gifts` | Gift ideas ordered idea → purchased → given. |
| POST | `/api/contacts/:id/gifts` | `{title*, notes?, url? (http/s), occasion?}` (edit permission). |
| PUT | `/api/gifts/:id` | Partial update incl. `status` ∈ idea/purchased/given. |
| DELETE | `/api/gifts/:id` | Hard delete. |

### Interactions (mounted at `/api`)

One-tap touchpoint log; recording bumps the contact's `last_contacted_at` (never backwards).

| Method | Path | Description |
|---|---|---|
| POST | `/api/contacts/:id/interactions` | `{type ∈ call/text/met/email/video/gift/social/other, note? (≤500), occurred_at?}` (edit permission). |
| GET | `/api/contacts/:id/interactions` | Newest first; `?limit=` (default 50, max 200). 403 for basic-scope shares. |
| PUT | `/api/interactions/:id` | **New.** Update type/note/occurred_at. Owner of the interaction (or admin) only. |
| DELETE | `/api/interactions/:id` | Owner (or admin) only. |

### Events (`/api/events`) — owner-scoped 🌶

| Method | Path | Description |
|---|---|---|
| GET | `/api/events` | Own events (admin: all), spicy filtered. Query: `status`, `type`, `contact_id`, `upcoming=1`, `past=1`. Max 500; linked contacts included. |
| GET | `/api/events/:id` | Detail + linked contacts, media (spicy-filtered), and `locations` stops. |
| POST | `/api/events` | `{title*, starts_at*, type?, description?, location?, ends_at?, status?, is_spicy?, contact_ids?, locations?}` — `locations` = extra stops (≤20, geocoded). |
| PUT | `/api/events/:id` | Partial update incl. `followup_notes`, `rating` (1–5), `contact_ids` (full replace), `locations` (full replace when present). |
| DELETE | `/api/events/:id` | Soft delete (→ trash). |
| POST | `/api/events/:id/complete` | Mark completed (`followup_notes?`, `rating?`); touches all linked contacts' `last_contacted_at`. |
| POST | `/api/events/:id/locations` | **New.** `{label}` — append one geocoded stop (≤20 total) without a full replace-all PUT. |
| DELETE | `/api/events/:id/locations/:locId` | **New.** Remove one stop. |
| POST | `/api/events/:id/media/:mediaId` | Link own media to the event. |
| DELETE | `/api/events/:id/media/:mediaId` | Unlink. |

### Timeline / Notes / Messages (routes/timeline.js — three distinct resources¹)

¹ `routes/timeline.js` exports four routers: **timeline** (`timeline_events` manual entries + the
aggregated per-contact feed), **notes**, **messages**, and **reminders** (below). Contact timeline
≠ the journal "life feed" (`/api/journal/timeline`).

**Timeline** (`/api/timeline`) — spicy entries field-encrypted:

| Method | Path | Description |
|---|---|---|
| GET | `/api/timeline?contact_id=` | Aggregated feed for a contact: manual entries + notes + linked events + daily message batches, newest first (cap 200). 403 for basic scope; spicy filtered. |
| POST | `/api/timeline` | Manual entry `{contact_id*, type?, title?, description?, is_spicy?, occurred_at?}` (edit permission). Touches `last_contacted_at`. |
| PUT | `/api/timeline/:id` | **New.** Edit a manual entry (title/description/type/is_spicy/occurred_at); content re-encrypted to match spicy state. Spicy entries 404 when spicy off. |
| DELETE | `/api/timeline/:id` | Soft delete (manual entries only). |

**Notes** (`/api/notes`) — spicy content field-encrypted:

| Method | Path | Description |
|---|---|---|
| GET | `/api/notes?contact_id=` | Per contact; `page`/`limit` (default 100, max 500). 403 basic scope; spicy filtered. |
| POST | `/api/notes` | `{contact_id*, content*, is_spicy?}` (edit permission). |
| GET | `/api/notes/:id` | **New.** Single note; read scoping mirrors the list (spicy note 404s when spicy off). |
| PUT | `/api/notes/:id` | `{content*, is_spicy?}` (edit permission). |
| DELETE | `/api/notes/:id` | Soft delete. |

**Messages** (`/api/messages`) — spicy content field-encrypted:

| Method | Path | Description |
|---|---|---|
| GET | `/api/messages?contact_id=` | Per contact, newest first (cap 500). 403 basic scope; spicy filtered. |
| POST | `/api/messages` | Manual log `{contact_id*, platform?, direction? in/out, content?, is_spicy?, sent_at?}` (edit permission). Touches `last_contacted_at`. |
| PUT | `/api/messages/:id` | **New.** Edit content/platform/direction/sent_at/is_spicy; content re-encrypted to match spicy state. |
| DELETE | `/api/messages/:id` | Hard delete (edit permission). |

### Reminders (`/api/reminders`) — owner-scoped

| Method | Path | Description |
|---|---|---|
| GET | `/api/reminders/due` | All open reminders, due-date ascending (cap 200), with contact names. |
| POST | `/api/reminders` | `{title*, due_at*, description?, contact_id?, recur_rule? ∈ daily/weekly/monthly/yearly, recur_until?}`. |
| PUT | `/api/reminders/:id` | Partial update. |
| POST | `/api/reminders/:id/complete` | Complete; recurring reminders spawn the next occurrence → `{ok, next_due_at?}`. |
| DELETE | `/api/reminders/:id` | Soft delete. |

### Visited places & timeline map (`/api/timeline/...`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/timeline/map` | All located events as map pins (primary `location` via geo_cache + `event_locations` stops). Owner-scoped, spicy filtered. |
| GET | `/api/timeline/places` | Places bucket list → `{us_states, countries, us_state_total}`; each `{code, source: manual\|derived\|both}` (derived from event geo metadata). |
| POST | `/api/timeline/places` | `{kind ∈ country/us_state, code}` — manual "been there" mark (country accepts name or ISO-2). |
| DELETE | `/api/timeline/places/:kind/:code` | Remove a manual mark (derived marks can't be unchecked). |

### Journal (`/api/journal`) — strictly private (never shared, admins included) 🌶

| Method | Path | Description |
|---|---|---|
| GET | `/api/journal` | Own entries; `page`/`limit` (default 30, max 100), `kind ∈ entry/reflection/travel/dream/memory`. Spicy entries field-encrypted + filtered. |
| POST | `/api/journal` | `{kind?, title?, content*², location? (geocoded), event_id? (own event), is_spicy?, occurred_at?}`. ² travel entries may substitute a location for content. |
| GET | `/api/journal/timeline` | Merged "life feed": journal entries + own events (participants aggregated). `page`/`limit` (default 50, max 200), `kind=journal\|event`, `sub=`, `located=1`. Event coords lazily geocoded via cache. |
| GET | `/api/journal/:id` | **New.** Single entry (registered after `/timeline` so it can't shadow it). |
| PUT | `/api/journal/:id` | Merge-style partial update; location change re-geocodes. |
| DELETE | `/api/journal/:id` | Soft delete. |

### Calendar (`/api/calendar`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/calendar?month=YYYY-MM` | Month aggregate: own events (spicy filtered), birthdays + recurring important dates projected into the month (Feb-29 clamped), open reminders. |

### ICS feeds (`/api/ics`) — mounted before other routers so query-token auth works

| Method | Path | Description |
|---|---|---|
| GET | `/api/ics/calendar.ics?token=kith_…` | RFC 5545 feed: non-spicy events, birthdays (yearly RRULE), important dates, open reminders. **Read-scoped PAT via query param only**; spicy events always excluded. |
| GET | `/api/ics/events/:id.ics` | Session-auth'd single-event download (owner/admin). |

### Search (`/api/search`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/search?q=` | Command-palette search: contacts (own + shared-in), events, notes (non-spicy only, with snippet), groups. Max 8 per category. |

### Geo (`/api/geo`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/geo/search?q=` | Geocode one query → `{lat, lng, label, source}` or 404. |
| GET | `/api/geo/suggest?q=&limit=` | Typeahead candidates (local geonames + Photon); limit default 8, max 15. Always 200. |
| GET | `/api/geo/contacts` | Map pins for accessible contacts: geocoded addresses + free-text locations (cached, capped lookups). Address pins require full/full_spicy share scope. |
| GET | `/api/geo/styles` | Whitelisted tile styles (osm/light/dark/voyager/topo) + attribution. |
| GET | `/api/geo/tiles/:style/:z/:x/:y.png` | Authenticated tile proxy with on-disk cache (browser cache 7 d). |
| GET | `/api/geo/tiles/:z/:x/:y.png` | Legacy alias → `osm` style. |

### Dashboard (mounted at `/api`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/dashboard` | Aggregates: birthdays ≤30 d, due reminders, upcoming events, recent activity (timeline+notes+interactions), stats, out-of-touch contacts, upcoming important dates. Spicy filtered. |

### Spicy profiles (`/api/contacts/:id/spicy`) 🌶 — 403 (not 404) when gated

All content-bearing fields AES-256-GCM encrypted at rest. Shared contacts require `full_spicy` scope.

| Method | Path | Description |
|---|---|---|
| GET | `/api/contacts/:id/spicy` | Profile or `{spicy_profile: null}`. 403 when spicy disabled globally or session mode inactive. |
| PUT | `/api/contacts/:id/spicy` | Create/update (edit permission); marks the contact `is_spicy`. Fields: role/positions/kinks/health/ratings/notes etc. |
| DELETE | `/api/contacts/:id/spicy` | **New.** Remove the profile row entirely (404 if none). |

### Sharing, merge, audit, changelog (routes/sharing.js)

| Method | Path | Description |
|---|---|---|
| POST | `/api/contacts/:id/share` | 🔒O `{user_id, permissions: read\|edit, share_scope: basic\|full\|full_spicy}` — upserts; tags contact "Shared"; notifies recipient. |
| GET | `/api/contacts/:id/share` | 🔒O Current shares. |
| DELETE | `/api/contacts/:id/share/:userId` | 🔒O Unshare. |
| POST | `/api/contacts/:id/merge/:otherId` | Merge `:otherId` (loser) into `:id` (winner); both must be owned. Body `{field_choices: {field: 'a'\|'b'\|custom}}`. Satellites unioned; loser soft-deleted. |
| GET | `/api/audit-log?contact_id=` | Audit history for an accessible contact (basic scope 403). `?entity_type=&entity_id=` and the unfiltered listing are 🔒A. Cap 200. |
| GET | `/api/changelog?contact_id=` | Field-level change history (cap 500; basic scope 403). |

### Preferences (`/api/preferences`) — per-user

| Method | Path | Description |
|---|---|---|
| GET | `/api/preferences` | All own prefs (+ `spicy_pin_set`); enforces spicy auto-disable server-side; `theme` sanitized to dark/light/system. |
| PUT | `/api/preferences/:key` | Upsert `{value, type?}` (key `[a-z0-9_]{1,100}`). `spicy_visible=true` stamps `spicy_activated_at` for the auto-disable window. `spicy_pin_hash` refused. |
| DELETE | `/api/preferences/:key` | **New.** Reset a pref by deleting the row. Protected keys refused (400): `spicy_pin_hash`, `spicy_visible`, `spicy_activated_at`. |
| POST | `/api/preferences/spicy-pin` | `{pin}` (4–8 digits) set/change; `{pin: null}` clears. |
| POST | `/api/preferences/spicy-pin/verify` | Verify `{pin}` → `{ok}` (or `{ok, noPin: true}`). Throttled: 5 failures → 15 min. |

### Settings (`/api/settings`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/settings/public` | Any user: non-sensitive subset (app_name, accents, spicy_enabled/require_pin/auto_disable, upload sizes…). |
| GET | `/api/settings` | 🔒A Full settings map. |
| PUT | `/api/settings/:key` | 🔒A Upsert a known key (`{value, type?}`); colors and `spicy_enabled` validated. |

### Notifications (`/api/notifications`)

Stored rows (shares, imports) + derived items computed at read time (overdue reminders,
birthdays/events/important dates ≤7 d, out-of-touch). Derived items have string ids and can't be dismissed.

| Method | Path | Description |
|---|---|---|
| GET | `/api/notifications` | Stored (undismissed, cap 100) + derived. |
| GET | `/api/notifications/count` | Unread **stored** count (badge). |
| POST | `/api/notifications/:id/read` | Mark read. |
| POST | `/api/notifications/:id/dismiss` | Dismiss. |
| DELETE | `/api/notifications/:id` | **New.** Hard-delete one's own stored notification (404 if not yours). |
| GET | `/api/notifications/prefs` | notify_email/channel, digest, nudge toggles. |
| PUT | `/api/notifications/prefs` | Update those (`notify_channel ∈ email/push/both/none`, `digest_day` 0–6, booleans). |
| POST | `/api/notifications/test-digest` | Send the weekly digest to the current user now (never 500s). |

### Push (`/api/push`) — Web Push / VAPID

| Method | Path | Description |
|---|---|---|
| GET | `/api/push/key` | VAPID public key. |
| POST | `/api/push/subscribe` | `{subscription: {endpoint, keys: {p256dh, auth}}, user_agent?}` — upsert on endpoint. |
| GET | `/api/push/subscriptions` | **New.** Own subscriptions (endpoint domain + truncated preview; keys never returned). |
| POST | `/api/push/unsubscribe` | `{endpoint}` — remove own subscription. |
| POST | `/api/push/test` | Send a test push to the current user. |

### API tokens (`/api/tokens`) — session auth only (PATs get 403)

| Method | Path | Description |
|---|---|---|
| POST | `/api/tokens` | `{name*, scopes? read (default)\|read_write, expires_days? (1–3650)}` → full `kith_…` token returned **exactly once**. |
| GET | `/api/tokens` | Own tokens (name, prefix, scopes, last_used_at, expires/revoked) — never hashes. |
| DELETE | `/api/tokens/:id` | Revoke (soft). |

### Import (`/api/import`)

| Method | Path | Description |
|---|---|---|
| POST | `/api/import/upload` | multipart: `files[]` (≤20; .zip/.vcf/.vcard/.csv/.json/.ged, magic-byte checked, up to `IMPORT_MAX_UPLOAD_SIZE` default 2 GB), `source_platform ∈ facebook/instagram/twitter/google_contacts/vcard/csv/gedcom`, `is_spicy_source?`, `column_mapping?` → `{import_job_id}` (async processing). |
| POST | `/api/import/csv` | Legacy CSV: with `peek=true` returns `{headers, auto_map}` for the mapping UI; otherwise queues a job with `column_mapping`. |
| GET | `/api/import/jobs` | Own jobs with status/progress counts (cap 50). |
| GET | `/api/import/jobs/:id` | One job. |
| DELETE | `/api/import/jobs/:id` | Cancel: delete staged rows + files. |
| GET | `/api/import/review?job_id=` | Staged records awaiting review (cap 500) with match suggestions; spicy payloads decrypted per-row. |
| PUT | `/api/import/review/:id` | Decision `{review_status ∈ pending/approved_new/approved_merge/skipped, suggested_match_contact_id?, merge_field_decisions?}`. |
| POST | `/api/import/jobs/:id/finalize` | Commit reviewed decisions: create/merge contacts, write changelogs, complete the job. |

### Export (`/api/export`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/export/vcf?ids=1,2,3 \| ?all=1` | vCard 3.0 (owned contacts only; admins any; max 1000 ids). |
| GET | `/api/export/csv?ids= \| ?all=1` | CSV (RFC 4180 quoting), primary email/phone resolved. |
| GET | `/api/export/gedcom?ids= \| ?all=1` | GEDCOM 5.5.1 — family-typed relationships among the set become FAM units. |
| GET | `/api/export/backup` | 🔒A Full JSON dump of all tables (password/TOTP/`*_hash` redacted; `import_staging` excluded; spicy fields as ciphertext). |

### Trash (`/api/trash`) — 30-day retention

| Method | Path | Description |
|---|---|---|
| GET | `/api/trash` | Own soft-deleted contacts/events/media within the window (admin: all). |
| POST | `/api/trash/restore` | `{type ∈ contact/event/media, id}` — un-delete. |
| DELETE | `/api/trash/purge` | `{type, id}` — hard delete now (media blobs unlinked). Expired items auto-purge daily at 03:00. |

### Immich proxy (`/api/immich`) — per-user instances, API keys stored encrypted server-side 🌶

Spicy-flagged instances are invisible (404) when spicy mode is off. Upstream failures → 502.

| Method | Path | Description |
|---|---|---|
| GET | `/api/immich/instances` | Own instances (never returns api_key). |
| POST | `/api/immich/instances` | `{name*, base_url*, api_key*, is_spicy?}` — SSRF-checked + connection-verified before save. |
| PUT | `/api/immich/instances/:id` | Update; re-verifies when base_url/api_key change. |
| DELETE | `/api/immich/instances/:id` | Remove; attached media rows soft-deleted. |
| POST | `/api/immich/:id/search` | `{query?, album_id?, person_id?, tag_id?, page?, size? (≤100)}` — proxied metadata search. |
| GET | `/api/immich/:id/albums` | Albums (id, name, count). |
| GET | `/api/immich/:id/people?page=` | Named people (paginated). |
| GET | `/api/immich/:id/people/:personId/thumbnail` | Face-crop thumbnail (proxied binary). |
| GET | `/api/immich/:id/tags` | Tags (flat, hierarchical path). |
| GET | `/api/immich/:id/folders` | Unique folder paths (404 if unsupported upstream). |
| GET | `/api/immich/:id/folder?path=` | Assets in one folder. |
| GET | `/api/immich/:id/assets/:assetId/thumbnail?size=thumbnail\|preview` | Proxied thumbnail. |
| GET | `/api/immich/:id/assets/:assetId/original` | Proxied original bytes. |

Attaching an Immich asset as Kith media: `POST /api/media/immich` (see Media).

### Media (`/api/media`) — authenticated file serving, never static 🌶

Uploads: images (jpeg/png/gif/webp), videos (mp4/mov/webm/mkv — thumbnail auto-generated),
documents (pdf/txt/md/doc/docx/xls/xlsx/csv/zip). Magic-byte verified; max `MAX_UPLOAD_SIZE`
(default 50 MB), ≤10 files. Spicy captions field-encrypted; fs paths / Immich ids never exposed.

| Method | Path | Description |
|---|---|---|
| GET | `/api/media` | Own media (or a contact's via `?contact_id=`, share-scope aware). Filters `type=photo\|video\|document`, `spicy=0\|1` (only meaningful with spicy on). Cap 500. |
| POST | `/api/media` | multipart `files[]` + `contact_id?`, `caption?`, `is_spicy?` → `{ids}` 201. |
| POST | `/api/media/immich` | `{instance_id*, asset_id*, contact_id?, caption?}` — attach an Immich asset as a media row (spicy inherited from the instance). |
| GET | `/api/media/:id` | **New.** Metadata for one row (same ACL as `/file`; list shape). |
| GET | `/api/media/:id/file` | Authenticated bytes (documents download with original filename; Immich rows proxied). |
| GET | `/api/media/:id/thumbnail` | Thumbnail (video thumb / Immich preview / image itself). |
| PUT | `/api/media/:id` | 🔒O Caption, `is_spicy`, `contact_id` re-link, `is_profile_eligible`. |
| DELETE | `/api/media/:id` | 🔒O Soft delete (→ trash). |

---

## Route-file coverage checklist

Every file in `server/routes/` and its mount (from `server/index.js`):

| File | Mount | Covered |
|---|---|---|
| auth.js | `/api/auth` | ✅ Auth |
| users.js | `/api/users` | ✅ Users |
| contacts.js | `/api/contacts` | ✅ Contacts |
| satellites.js | `/api/contacts/:id` (mergeParams) + `/api` | ✅ Satellites |
| tags.js | `/api/tags` + `/api/contacts/:id/tags` (mergeParams) | ✅ Tags |
| groups.js | `/api/groups` | ✅ Groups |
| relationships.js | `/api` | ✅ Relationships |
| dates.js | `/api` | ✅ Important dates |
| gifts.js | `/api` | ✅ Gifts |
| interactions.js | `/api` | ✅ Interactions |
| events.js | `/api/events` | ✅ Events |
| timeline.js | `/api/timeline`, `/api/notes`, `/api/reminders`, `/api/messages` | ✅ Timeline/Notes/Messages/Reminders/Places |
| journal.js | `/api/journal` | ✅ Journal |
| calendar.js | `/api/calendar` | ✅ Calendar |
| ics.js | `/api/ics` | ✅ ICS |
| search.js | `/api/search` | ✅ Search |
| geo.js | `/api/geo` | ✅ Geo |
| dashboard.js | `/api` | ✅ Dashboard |
| spicy.js | `/api/contacts/:id/spicy` (mergeParams) | ✅ Spicy |
| sharing.js | `/api/contacts/:id/share`, `/api/contacts/:id/merge`, `/api/audit-log`, `/api/changelog` | ✅ Sharing/Merge/Audit/Changelog |
| preferences.js | `/api/preferences` | ✅ Preferences |
| settings.js | `/api/settings` | ✅ Settings |
| notifications.js | `/api/notifications` | ✅ Notifications |
| push.js | `/api/push` | ✅ Push |
| tokens.js | `/api/tokens` | ✅ Tokens |
| import.js | `/api/import` | ✅ Import |
| export.js | `/api/export` | ✅ Export |
| trash.js | `/api/trash` | ✅ Trash |
| immich.js | `/api/immich` | ✅ Immich proxy |
| media.js | `/api/media` | ✅ Media |
