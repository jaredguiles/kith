# Kith — a personal CRM

Kith ("kith and kin") is a self-hosted **personal** CRM — the people in your
life, their details, interactions, events, notes, media, and an optional
hidden **confidential** layer that is encrypted at rest and invisible unless
enabled.

Functional spec: [`SPEC.md`](SPEC.md). REST API reference: [`API.md`](API.md).
Visual system: [`DESIGN.md`](DESIGN.md) ("The Record").

## Stack

- **Node.js 24** (alpine) + **Express** — REST API + a static vanilla-JS SPA (no build step)
- **MariaDB** (external) — the database is the source of truth
- In-process `worker_threads` import processor (no queue/Redis needed)
- **ffmpeg** for video thumbnails
- **Docker** for deployment

Kith is intentionally lightweight and dependency-light: no frontend build
pipeline, no message broker, no external services required beyond a MariaDB
database. It runs behind any reverse proxy (or none) and stores media on any
mounted filesystem.

## Quick start (development)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
# → http://localhost:8084   (login: admin / changeme, forced password change on first login)
```

The dev compose file spins up a throwaway MariaDB container, so you don't need
a database of your own to try it. Run the tests with:

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

1. Provision a `kith` database and user on your MariaDB server.
2. Set `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, and the three
   required secrets in the container's environment.
3. Point `MEDIA_PATH` at a mounted volume for photos/videos, and set `APP_URL`
   to your public URL.
4. `docker compose up -d --build`.
5. First boot creates the schema and a seed admin (`admin` / `changeme`) — log
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
