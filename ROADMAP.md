# Kith — Roadmap

_Last audited 2026-07-14 against v1.9.2. History lives in [`CHANGELOG.md`](CHANGELOG.md); current behavior in [`SPEC.md`](SPEC.md)._

---

## Current state (audit summary)

### Healthy

- **Security posture**: JWT + PAT auth boundary, TOTP 2FA, forced password change, AES-256-GCM field encryption for the confidential layer, magic-byte upload validation, authenticated media serving, rate limiting, boot-refusal on placeholder secrets. `npm audit`: **0 vulnerabilities**.
- **Tests**: 60/60 passing (matcher, geo, relationships, import core, GEDCOM) on the native Node test runner — no test framework dependency.
- **API**: complete REST surface as of v1.9.2, fully documented in [`API.md`](API.md).
- **Docker**: pinned `node:24-alpine`, non-root user, healthcheck, `no-new-privileges`, and (new) a bundled-MariaDB compose profile so first run needs nothing but Docker.

### Known debt / upgrades needed

| Item | Priority | Detail |
|---|---|---|
| `fluent-ffmpeg` 2.1.3 | Medium | Upstream is unmaintained (deprecated on npm). Only used for video thumbnails — replace with direct `ffmpeg` child-process spawns (the image already ships the ffmpeg binary). Small, contained change. |
| CI coverage | Low | ✅ ESLint (flat config) adopted and all findings fixed; lint + test run in CI (`.gitlab-ci.yml` on the maintainer's mirror). Remaining: a GitHub Actions workflow so public PRs get the same checks. |
| No API integration tests | Medium | Route handlers are only covered indirectly. A supertest-style pass over auth, contacts CRUD, share scopes, and confidential-layer gating would lock in the security semantics that matter most. |
| No frontend tests | Medium | The SPA has zero coverage. Highest-value start: a Playwright smoke suite against `docker-compose.dev.yml` (login → create contact → add note → search). |
| No OpenAPI spec | Low | `API.md` is hand-written and will drift. Maintain `openapi.yaml` → free Swagger UI, client generation, contract tests. |
| Bundled-DB backups | Medium | `GET /api/export/backup` exists (admin JSON dump), but there's no scheduled dump example for the bundled-DB path. Document a `mariadb-dump` cron/sidecar recipe. |
| `web-push` 3.x | Low | Old release line; works today. Watch for a 4.x. |
| Node 24 LTS | Info | Node 24 enters LTS Oct 2026 — revisit the pin then. |

### Minor rough edges

- Rate limiting is in-memory per-process (by design — single process); document that it resets on restart.
- DB pool size is fixed at 10 — expose as `DB_POOL_SIZE` for larger installs.
- Timezone assumptions of `dateStrings: true` should be spelled out in `SPEC.md` for API consumers.

---

## Planned releases

### v2.0 — Foundation hardening (next)

The "boring" release that makes everything after it cheaper.

- [ ] Replace `fluent-ffmpeg` with direct ffmpeg spawn
- [x] Adopt a linter (ESLint flat config) + lint/test CI
- [ ] GitHub Actions workflow so public PRs get the same lint + test checks
- [ ] API integration test suite (auth, ACL/share scopes, confidential gating, contacts CRUD)
- [ ] Playwright smoke suite for the SPA
- [ ] OpenAPI spec (`openapi.yaml`)
- [ ] Bundled-DB backup runbook + example dump cron
- [ ] `DB_POOL_SIZE` env knob
- [x] Publish a prebuilt image (GHCR) on tagged releases (`.github/workflows/release.yml`)

### v2.1 — Sync & interop

Kith becomes a better citizen among other tools.

- [ ] Two-way CardDAV (currently one-way push) — or at minimum, import-on-change from the DAV side through the staged-review pipeline
- [ ] CalDAV inbound: subscribe to external calendars for event correlation
- [ ] Webhooks on contact/event/reminder mutations (n8n / Home Assistant friendly)
- [ ] More importers: LinkedIn export, WhatsApp chat export (message history → messages log)
- [ ] Per-group iCal feeds (`/api/ics/groups/:id.ics`)

### v2.2 — Intelligence & recall

The CRM starts working for you instead of just recording.

- [ ] "On this day" — resurface past events/journal entries/photos on the dashboard
- [ ] Relationship health score: keep-in-touch cadence + interaction frequency feeding the out-of-touch model
- [ ] Smart reminders: suggest reach-outs from patterns (birthday approaching + long silence)
- [ ] Server-side full-text search extended to notes/journal/messages (confidential filtering preserved)
- [ ] Optional local-LLM hooks (self-hosted only, off by default): note summarization, "catch me up on Alice before dinner"

### v2.3 — Mobile & capture

Lower the friction of getting data in.

- [ ] PWA share-sheet target: share a photo/text into Kith → quick interaction/note against a contact
- [ ] Offline-first contact viewing (service-worker cache of list + detail shells)
- [ ] One-tap quick-capture interaction logging from the home screen
- [ ] Voice-note attachment type (audio media kind + transcript field)

### v3.0 — Multi-household / federation (speculative)

Only if real demand appears — the single-household design is a feature.

- [ ] Invite-based household spaces with per-space encryption keys
- [ ] Selective contact-card exchange between Kith instances (signed vCard exchange)
- [ ] Read-only "memorial" archive mode for deceased contacts

---

## Non-goals

- Public SaaS / multi-tenant hosting
- Social-network scraping or automated enrichment from third-party trackers
- Native mobile apps (the PWA remains the strategy)
- ORM adoption — raw SQL stays
