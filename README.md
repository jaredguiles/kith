# Kith — personal CRM

Kith ("kith and kin") is a self-hosted **personal** CRM — the people in your
life, their details, interactions, events, notes, media, and an optional
hidden **spicy** layer that is encrypted at rest and invisible unless enabled.

Built per the Master Build Plan ([[kith-personal-crm-app]] v1.1). Functional
spec: `SPEC.md` (resynced to v1.8). Visual system: `DESIGN.md` ("The Record",
v1.3+; `BRANDING.md` is a superseded stub kept for logo/name provenance).
Build history: `BUILDLOG.md`.

## Stack

- Node.js 24 (alpine) + Express — REST API + static vanilla-JS SPA (no build step)
- MariaDB (external, the database server VM `db-host:3306`, database `kith`)
- In-process `worker_threads` import processor (no queue/Redis)
- ffmpeg for video thumbnails
- Docker, deployed via the the application server Ansible pipeline

## Environment variables

See `.env.example`. Non-secret config lives in `.env`; secrets come from
a secrets manager (project the application server, path `/kith`, env `prod`) and are rendered
to `.secrets` at deploy time:

| Secret | Purpose |
|---|---|
| `DB_PASSWORD` | MariaDB `kith` user password |
| `JWT_SECRET` | JWT signing key (≥32 chars) |
| `FIELD_ENCRYPTION_KEY` | **32-byte base64** AES-256-GCM key for the spicy layer |

In `NODE_ENV=production` the server **refuses to start** if `JWT_SECRET` or
`FIELD_ENCRYPTION_KEY` is missing, a placeholder, or malformed.

> ⚠️ `FIELD_ENCRYPTION_KEY` must be backed up in a secrets manager (secret storage),
> **separately from DB backups**. Losing it makes all encrypted spicy data
> permanently unrecoverable. DB exports/dumps contain spicy fields as
> ciphertext — restoring them requires the same key.

## Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# → http://localhost:8084  (admin / changeme, forced password change)
```

Uses a throwaway MariaDB container (`kith-dev-db`, localhost:33061). the database server
is production-only — never point dev at it.

Tests (matcher/normalizer/crypto): `npm test`

## First-boot / restore runbook

1. Provision the `kith` database + host-scoped user on the database server MariaDB.
2. Put `DB_PASSWORD`, `JWT_SECRET`, `FIELD_ENCRYPTION_KEY` in a secrets manager → `/kith`.
3. Push to `main` → Ansible pipeline syncs `/opt/kith/`, builds the
   image (`build: .`; kith is in `deploy.build_stacks`), starts the container.
4. Boot creates the schema + seed (`admin` / `admin@example.com` / `changeme`).
5. Log in at https://kith.example.com → **forced password change** → create
   users → enable Spicy in Settings if wanted (ships disabled).
6. Verify: spicy toggle, an import, a media upload, media URL returns 401
   without auth, spicy DB columns are ciphertext.

Restore: recreate the DB from a dump, supply the **same**
`FIELD_ENCRYPTION_KEY`, boot. Media blobs live on the the storage layer mount
(`/srv/kith/media` → `/media`) and are backed up at the the storage layer layer.

## Security model (summary)

- App JWT (httpOnly SameSite=Strict cookie) is the auth boundary; Authentik
  forwardauth wraps the UI shell only (`/api` exempted — D13).
- Server-side spicy gating at three layers; spicy fields AES-256-GCM encrypted
  at rest (§7.E); media served only through authenticated routes.
- LAN + Tailscale only. Never exposed to the public internet.
