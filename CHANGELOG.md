# Changelog

All notable changes to Kith are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/). Releases from v1.8 onward have git tags; earlier versions predate the public repo's tagging and are dated by commit.

## [Unreleased]

### Added
- Bundled MariaDB in `docker-compose.yml` under the `bundled-db` compose profile — on by default via `.env.example` (`COMPOSE_PROFILES=bundled-db`, `DB_HOST=db`), so a fresh install needs nothing but Docker. Set `COMPOSE_PROFILES=` (empty) to use an external MariaDB/MySQL server instead.
- `CHANGELOG.md` and `ROADMAP.md`.

## [1.9.2] — 2026-07-11

### Added
- Complete REST API surface: `PUT /api/relationships/:id`, `PUT /api/interactions/:id`, `PUT /api/timeline/:id`, `PUT /api/messages/:id`, `GET /api/notes/:id`, `GET /api/journal/:id`, `GET /api/media/:id`, `DELETE /api/contacts/:id/spicy`, `DELETE /api/preferences/:key`, `DELETE /api/notifications/:id`, `GET /api/push/subscriptions`, event location add/remove endpoints.
- `API.md` — authoritative API reference covering every route: auth (JWT/PAT/ICS tokens), rate limits, pagination, error and confidential-layer conventions.

### Fixed (post-release patches)
- Blank page and Secure-flagged auth cookie on plain-HTTP (non-TLS) deployments — new `BEHIND_TLS` env var.

## [1.9.1] — 2026-07-11

### Changed
- New palette: petrol teal / crimson with gold decorative accents; new logo and wordmark.

## [1.9] — 2026-07-11

### Added
- Timeline "visited places" bucket list (manual + derived US states/countries) and timeline map.
- Smart groups — groups linked to a tag compute membership automatically.
- Address autocomplete (Photon geocoder typeahead) with confirmed-pin geocoding.
- Immich library browsing: albums, people, tags, folders, asset search and attach.

### Changed
- Theme pass across the app.

### Security
- Full audit remediation round.

## [1.8] — 2026-07-10

### Added
- Journal split from contact timeline: private journal entries (entry/reflection/travel/dream/memory) plus a merged "life feed" (`/api/journal/timeline`).
- Immich integration: per-user instances with encrypted API keys, proxied search/thumbnails, attach-as-media.
- Address history with start/end dates ("moves").

### Fixed
- Geocoding fixes; mobile UI pass.

## [1.7] — 2026-07-09

### Added
- Inclusive identity fields (pronouns, gender identity and related fields).
- Interactive family tree (family-chart) with BFS traversal caps.
- GEDCOM import and export.

## [1.6] — 2026-07-09

### Added
- Surname sorting, deceased status, family page, map marker clustering, avatar color palette.

### Fixed
- Icon and date-row rendering fixes.

## [1.5] — 2026-07-09

### Added
- Expanded relationship types (~70 typed relations with computed inverses).

### Fixed
- Map z-index/stacking, uniform page widths, push delivery fixes; duplicate person shown at a map location.

## [1.4] — 2026-07-08

### Added
- Proactive notifications: stored + derived (birthdays, out-of-touch, due reminders), weekly digest, web push (VAPID).
- Interactions — one-tap touchpoint logging that bumps `last_contacted_at`.
- Messages UI for manual message logging.
- Global command-palette search (MiniSearch fuzzy).
- CardDAV/CalDAV one-way push to any DAV server.
- `DELETE /api/messages/:id` (post-release patch).

## [1.3] — 2026-07-07

### Changed
- "The Record" redesign — warm editorial dossier UI, new design tokens, dark-theme fixes, service-worker auto-update.
- Follow-ups: person-page polish, profile-photo framing fix, removed people rating and accent customization.

## [1.2.2] — 2026-07-07

### Added
- Inline edit-in-place, phone/address formatting, languages picker, middle name, relationship link on create.

## [1.2.1] — 2026-07-07

### Added
- "My profile" self-contact, map style picker, UI polish (user-feedback round).

## [1.2] — 2026-07-07

### Added
- Maps (contact/event geocoding, authenticated tile proxy), CRM depth (important dates, gifts, keep-in-touch), data portability (vCard/CSV export, admin backup), daily-use polish.

## [1.1] — 2026-07-07

### Security
- Production-hardening audit fixes; `DB_SSL_INSECURE` encrypted-but-unverified TLS bridge for self-signed DB certs.

## [1.0] — 2026-07-07

Initial production release. Built in ten phases:

1. Repo & infrastructure scaffold
2. Database layer — full schema, migrations, seed, field crypto (AES-256-GCM)
3. Auth, roles & middleware (JWT sessions, TOTP 2FA, forced password change)
4. Design system & app shell (vanilla-JS SPA, PWA)
5. Contacts core (satellites: emails/phones/addresses/socials)
6. Tags, groups, favorites
7. Events, timeline, notes, reminders
8. Media gallery & video thumbnails (ffmpeg)
9. Confidential profiles, sharing, merge, settings, dashboard, notifications
10. File-based import system with staged review (vCard/CSV/Google/Facebook/Instagram/Twitter), hardening, docs, deploy wiring

[Unreleased]: https://github.com/jaredguiles/kith/compare/v1.9.2...HEAD
[1.9.2]: https://github.com/jaredguiles/kith/compare/v1.9.1...v1.9.2
[1.9.1]: https://github.com/jaredguiles/kith/compare/v1.9...v1.9.1
[1.9]: https://github.com/jaredguiles/kith/compare/v1.8...v1.9
[1.8]: https://github.com/jaredguiles/kith/releases/tag/v1.8
