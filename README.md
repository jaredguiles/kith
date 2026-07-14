# Kith — a personal CRM

Kith ("kith and kin") is a self-hosted **personal** CRM — the people in your
life, their details, interactions, events, notes, media, and an optional
hidden **confidential** layer that is encrypted at rest and invisible unless
enabled.

Functional spec: [`SPEC.md`](SPEC.md). REST API reference: [`API.md`](API.md).
Visual system: [`DESIGN.md`](DESIGN.md) ("The Record").
Release history: [`CHANGELOG.md`](CHANGELOG.md). What's next: [`ROADMAP.md`](ROADMAP.md).

## Stack

- **Node.js 24** (alpine) + **Express** — REST API + a static vanilla-JS SPA (no build step)
- **MariaDB** — bundled container by default, or bring your own server; the database is the source of truth
- In-process `worker_threads` import processor (no queue/Redis needed)
- **ffmpeg** for video thumbnails
- **Docker** for deployment

Kith is intentionally lightweight and dependency-light: no frontend build
pipeline, no message broker, no external services required. It runs behind any
reverse proxy (or none) and stores media on any mounted filesystem.

## Quick start

```bash
git clone https://github.com/jaredguiles/kith && cd kith
cp .env.example .env    # set DB_PASSWORD, JWT_SECRET, FIELD_ENCRYPTION_KEY
docker compose up -d --build
# → http://localhost:8084   (login: admin / changeme, forced password change on first login)
```

The shipped `docker-compose.yml` includes a MariaDB container under the
`bundled-db` compose profile, which `.env.example` enables by default
(`COMPOSE_PROFILES=bundled-db`, `DB_HOST=db`). Data persists in the
`kith_db_data` named volume; the database is never exposed on the host.

**Using your own database instead:** set `COMPOSE_PROFILES=` (empty) in `.env`
and point `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` at any
MariaDB or MySQL server, with `DB_SSL=true` (plus `DB_SSL_CA` for a private CA,
or `DB_SSL_INSECURE=true` for self-signed certs — encrypted but unverified).

## Development

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# → http://localhost:8084   (login: admin / changeme, forced password change on first login)
```

The dev compose file spins up a throwaway MariaDB container with fixed dev
credentials, separate from the production `bundled-db` profile. Run the tests
with:

```bash
npm test
```

## Configuration

All configuration is via environment variables — copy
[`.env.example`](.env.example) to `.env` and fill it in. Nothing is hardcoded to
a particular host, domain, or storage path, so Kith runs anywhere.

**Required secrets** (the server refuses to start in `NODE_ENV=production` if
any is missing, a placeholder, or malformed):

| Variable | Purpose |
|---|---|
| `DB_PASSWORD` | MariaDB user password |
| `JWT_SECRET` | JWT signing key (≥ 32 chars) |
| `FIELD_ENCRYPTION_KEY` | **32-byte base64** AES-256-GCM key for the confidential layer — generate with `openssl rand -base64 32` |

> ⚠️ **Back up `FIELD_ENCRYPTION_KEY` separately from your database backups.**
> Losing it makes all encrypted confidential data permanently unrecoverable.
> Database dumps store confidential fields as ciphertext — restoring them
> requires the *same* key.

Store secrets however you like (a `.env` file, Docker/compose secrets, or a
secrets manager). They are read from the process environment at boot.

## Production deployment

1. Copy `.env.example` to `.env` and set the three required secrets. Keep the
   default bundled database, or set `COMPOSE_PROFILES=` and point the `DB_*`
   vars at your own MariaDB server (provision a `kith` database + user first).
2. Point the media volume at a mounted filesystem for photos/videos, and set
   `APP_URL` to your public URL.
3. `docker compose up -d --build`.
4. First boot creates the schema and a seed admin (`admin` / `changeme`) — log
   in, change the password, create users, and enable the confidential layer in
   Settings if you want it (it ships disabled).

Kith serves its own SPA and API on a single port; put it behind whatever
reverse proxy / TLS terminator you prefer, or expose it directly on a trusted
network. Its own JWT is the auth boundary, so an external SSO layer is optional.

**Restore:** recreate the database from a dump, supply the **same**
`FIELD_ENCRYPTION_KEY`, and boot. Media lives on the `MEDIA_PATH` volume — back
that up at the storage layer.

## Optional integrations

Kith works fully standalone. A few features light up if you provide the
matching configuration (all optional, all off by default):

- **Self-hosted geocoding** — point `PHOTON_URL` at a [Photon](https://github.com/komoot/photon)
  instance to geocode addresses/events for the map. Without it, the map uses the
  bundled city-level dataset.
- **CardDAV/CalDAV push** — one-way sync of contacts + calendar to any DAV
  server (set `DAV_URL` / `DAV_USER` / `DAV_PASS`, enable with `DAV_SYNC_ENABLED`).
- **Immich** — browse and attach photos from an [Immich](https://immich.app)
  instance instead of uploading local files.
- **Email/notifications** — direct SMTP, or POST to a webhook for digests/nudges.

## Security model (summary)

- The app's JWT (an httpOnly, `SameSite=Strict` cookie) is the auth boundary.
- The confidential layer is server-side gated at multiple levels; confidential
  fields are AES-256-GCM encrypted at rest, and media is served only through
  authenticated routes.
- Set `BEHIND_TLS=false` when serving over plain HTTP (e.g. a LAN/IP-only
  instance) so cookies and CSP don't force HTTPS.

## License

See [`LICENSE`](LICENSE).
